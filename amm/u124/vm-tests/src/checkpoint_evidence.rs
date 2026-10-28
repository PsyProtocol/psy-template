//! Source-fixed checkpoint proof inspection, NOT canonical-history/finality or
//! network-domain authentication. RPC assertions never install verifier keys.
use anyhow::{ensure,Result,Context};
use bincode::Options;
use parth_core::{pgoldilocks::{QHashOut as Q,PoseidonHasher},crypto::hash::merkle_proof::MerkleProofCore};
use plonky2::{field::goldilocks_field::GoldilocksField as F,plonk::{circuit_data::VerifierCircuitData,config::PoseidonGoldilocksConfig as C,proof::ProofWithPublicInputs}};
use psy_core::job::job_id::ProvingJobCircuitType as Kind;
use psy_data::protocol::checkpoint_transition_hash::{CheckpointStateHashTransition,CheckpointStateTransitionPublicInputs};
use psy_plonky2_circuits::{generated::{cached_circuit_library::get_cached_circuit_library,cached_common_data::get_cached_common_data_library},proof_minifier::pm_core::get_circuit_fingerprint_generic,coordinator::circuits::checkpoint_state_transition_genesis::QEDCheckpointStateTransitionGenesisCircuit};
use serde::{Serialize,Deserialize};
use std::sync::OnceLock;
type Proof=ProofWithPublicInputs<F,C,2>;
struct FixedResources{genesis:VerifierCircuitData<F,C,2>,transition:VerifierCircuitData<F,C,2>,genesis_fingerprint:Q<F>,transition_fingerprint:Q<F>,constructed_genesis_fingerprint:Q<F>,constructed_genesis_degree:usize,cache_matches_constructed_genesis:bool}
static RESOURCES:OnceLock<Result<FixedResources,String>>=OnceLock::new();
fn build()->Result<FixedResources>{
 let keys=get_cached_circuit_library::<F>();let common=get_cached_common_data_library::<C,2>();
 let get=|kind|->Result<(VerifierCircuitData<F,C,2>,Q<F>)>{let info=keys.info_map.get(&kind).ok_or_else(||anyhow::anyhow!("fixed checkpoint key missing"))?;let verifier_only=info.verifier_data.to_verifier_data::<C,2>();let actual=Q(get_circuit_fingerprint_generic(&verifier_only));ensure!(actual==info.fingerprint,"fixed cached key fingerprint mismatch");let data=common.get_common_circuit_data_ref(kind)?.clone();ensure!(data.num_public_inputs==4,"checkpoint proofs require four cumulative public inputs");Ok((VerifierCircuitData{verifier_only,common:data},actual))};
 let(genesis,genesis_fingerprint)=get(Kind::GenesisBlockCheckpointStateTransition)?;let(transition,transition_fingerprint)=get(Kind::GenerateRollupStateTransitionProof)?;
 // Audit the same frozen source constructor without proving or adopting its key.
 // A cache/source mismatch is a release failure, never a key-selection fallback.
 let constructed=QEDCheckpointStateTransitionGenesisCircuit::<C,2>::new();let cache_matches_constructed_genesis=genesis.verifier_only==constructed.circuit_data.verifier_only&&genesis.common==constructed.circuit_data.common&&genesis_fingerprint==constructed.fingerprint;
 Ok(FixedResources{genesis,transition,genesis_fingerprint,transition_fingerprint,constructed_genesis_fingerprint:constructed.fingerprint,constructed_genesis_degree:constructed.circuit_data.common.degree_bits(),cache_matches_constructed_genesis})
}
fn resources()->Result<&'static FixedResources>{RESOURCES.get_or_init(||build().map_err(|e|e.to_string())).as_ref().map_err(|e|anyhow::anyhow!("fixed checkpoint resources unavailable: {e}"))}
#[derive(Clone,Serialize,Deserialize)]#[serde(deny_unknown_fields)]
pub struct CheckpointOpening{pub schema:u32,pub checkpoint_id:u64,pub checkpoint_root:Q<F>,pub checkpoint_leaf_hash:Q<F>,pub checkpoint_path:MerkleProofCore<Q<F>>}
pub fn decode_proof(bytes:&[u8])->Result<Proof>{ensure!(bytes.len()<=2000000,"checkpoint proof size limit");Ok(bincode::DefaultOptions::new().with_fixint_encoding().with_limit(2000000).reject_trailing_bytes().deserialize(bytes)?)}
fn statement(opening:&CheckpointOpening,fingerprint:Q<F>)->CheckpointStateTransitionPublicInputs<Q<F>>{CheckpointStateTransitionPublicInputs{checkpoint_transition:CheckpointStateHashTransition{old_checkpoint_tree_root:Q::default(),new_checkpoint_tree_root:opening.checkpoint_root,old_checkpoint_leaf_hash:Q::default(),new_checkpoint_leaf_hash:opening.checkpoint_leaf_hash},genesis_checkpoint_state_transition_hash:Q::default(),checkpoint_state_transition_circuit_fingerprint:fingerprint}}
fn public_hash(proof:&Proof)->Result<Q<F>>{ensure!(proof.public_inputs.len()==4,"exact checkpoint public input width");Ok(Q(plonky2::hash::hash_types::HashOut{elements:proof.public_inputs.as_slice().try_into().unwrap()}))}
pub fn inspect(opening:&CheckpointOpening,proof:Proof,previous:Option<Proof>)->Result<serde_json::Value>{
 crate::live_guard::require_compiled_verifier_domain()?;
 ensure!(opening.schema==1&&opening.checkpoint_id<=u32::MAX as u64,"checkpoint opening version/id");
 let p=&opening.checkpoint_path;ensure!(p.siblings.len()==32&&p.index==opening.checkpoint_id&&p.root==opening.checkpoint_root&&p.value==opening.checkpoint_leaf_hash&&p.verify::<PoseidonHasher>(),"checkpoint root/leaf/index membership");
 let r=resources()?;ensure!(r.cache_matches_constructed_genesis,"frozen checkpoint cache differs from constructed genesis resources; release not qualified, no key fallback");let actual=public_hash(&proof)?;
 let expected=if opening.checkpoint_id==0{ensure!(previous.is_none(),"genesis has no predecessor input");r.genesis.verify(proof).context("genesis proof under frozen resources")?;statement(opening,r.genesis_fingerprint).get_chain_0_from_genesis_leaf::<PoseidonHasher>(&r.genesis_fingerprint)}else{
  let previous=previous.ok_or_else(||anyhow::anyhow!("verified predecessor proof required"))?;let prior=public_hash(&previous)?;if opening.checkpoint_id==1{r.genesis.verify(previous).context("genesis predecessor proof under frozen resources")?;}else{r.transition.verify(previous).context("predecessor transition proof under frozen resources")?;}
  r.transition.verify(proof).context("current transition proof under frozen resources")?;statement(opening,r.transition_fingerprint).get_chain_hash_from_previous::<PoseidonHasher>(&prior)
 };
 ensure!(actual==expected,"verified proof PI does not open to this checkpoint root/leaf and predecessor");
 Ok(serde_json::json!({"schema":1,"scope":"source-fixed proof validity and conditional root/leaf opening; no canonical history, instance, finality or randomness authentication","checkpointId":opening.checkpoint_id,"checkpointRoot":opening.checkpoint_root.to_string(),"checkpointLeafHash":opening.checkpoint_leaf_hash.to_string(),"verifiedProofPublicInputs":actual.to_string(),"checkpointCircuitProofVerified":true,"rootAndLeafOpeningVerified":true,"predecessorProofVerified":opening.checkpoint_id>0,"declaredCheckpointMembershipVerified":true,"numericPredecessorAdjacencyVerified":false,"latestPositionVerified":false,"historyPrefixAnchored":false,"genesisFingerprint":r.genesis_fingerprint.to_string(),"transitionFingerprint":r.transition_fingerprint.to_string(),"canonicalGenesisVerified":false,"chainDomainAuthenticated":false,"finalityVerified":false,"qualifiedSource":false,"causalSealVerified":false,"randomAuthorization":false,"financialOperations":0,"proofsGenerated":0,"broadcast":false}))
}
pub fn resource_inventory()->Result<serde_json::Value>{let r=resources()?;Ok(serde_json::json!({"genesisFingerprint":r.genesis_fingerprint.to_string(),"transitionFingerprint":r.transition_fingerprint.to_string(),"genesisDegreeBits":r.genesis.common.degree_bits(),"transitionDegreeBits":r.transition.common.degree_bits(),"constructedGenesisFingerprint":r.constructed_genesis_fingerprint.to_string(),"constructedGenesisDegreeBits":r.constructed_genesis_degree,"cacheMatchesConstructedGenesis":r.cache_matches_constructed_genesis,"transitionSourceConstructionChecked":false,"publicInputCount":4,"source":"frozen cached key/common libraries compared with frozen genesis constructor; no replacement keys adopted","finalityVerified":false,"randomAuthorization":false}))}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn frozen_resources_have_checked_fingerprints_and_exact_cumulative_width()->Result<()>{let r=resource_inventory()?;ensure!(r["publicInputCount"]==4&&r["finalityVerified"]==false,"resource scope");Ok(())}
 #[test]fn legacy_single_step_hash_is_not_the_cumulative_checkpoint_pi(){let q=Q::from_values(1,2,3,4);let o=CheckpointOpening{schema:1,checkpoint_id:2,checkpoint_root:q,checkpoint_leaf_hash:Q::from_values(5,6,7,8),checkpoint_path:MerkleProofCore::new_from_params::<PoseidonHasher>(2,q,vec![q;32])};let s=statement(&o,q);assert_ne!(s.get_public_inputs_hash_no_rewards_tag::<PoseidonHasher>(),s.get_chain_hash_from_previous::<PoseidonHasher>(&q));}
 #[test]fn trailing_or_oversized_proof_bytes_reject(){assert!(decode_proof(&vec![0;2000001]).is_err());assert!(decode_proof(&[]).is_err());}
 #[test]#[ignore="read captured public proofs independently; no proof generation or network"]
 fn captured_transition_proof_compatibility()->Result<()>{
  use sha2::{Digest,Sha256};use std::{fs,path::PathBuf,io::Write};
  let input=PathBuf::from(std::env::var("CHECKPOINT_CAPTURE_INPUT")?);let output=std::env::var("CHECKPOINT_CAPTURE_REPORT")?;let r=resources()?;let mut rows=vec![];
  for label in ["previous-proof","current-proof"]{let bytes=fs::read(input.join(format!("{label}.bin")))?;let proof=decode_proof(&bytes)?;let pi=public_hash(&proof)?.to_string();let outcome=r.transition.verify(proof);rows.push(serde_json::json!({"label":label,"proofSha256":format!("{:x}",Sha256::digest(&bytes)),"publicInputHash":pi,"verifiedUnderFrozenTransitionResources":outcome.is_ok(),"error":outcome.err().map(|e|format!("{e:#}"))}));}
  let all=rows.iter().all(|v|v["verifiedUnderFrozenTransitionResources"]==true);let report=serde_json::json!({"schema":1,"scope":"independent fixed-key verification of two captured proofs; no finality or chain-invalidity conclusion","proofs":rows,"allMatched":all,"resources":resource_inventory()?,"financialOperations":0,"proofsGenerated":0,"finalityVerified":false,"randomAuthorization":false});let mut file=fs::OpenOptions::new().write(true).create_new(true).open(output)?;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.sync_all()?;ensure!(all,"captured proof/resource compatibility failed; report preserved, no key fallback");Ok(())
 }
}
