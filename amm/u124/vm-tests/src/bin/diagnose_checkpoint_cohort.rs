//! Two named, embedded UNAPPROVED source cohorts for diagnosis only. This binary
//! cannot sign, broadcast, install resources or qualify a running release.
use anyhow::{ensure,Result};
use parth_core::{pgoldilocks::{QHashOut as Q,PoseidonHasher},crypto::hash::traits::QFieldHashable};
use plonky2::{field::goldilocks_field::GoldilocksField as F,hash::merkle_tree::MerkleCap,plonk::{config::PoseidonGoldilocksConfig as C,circuit_data::{VerifierOnlyCircuitData,VerifierCircuitData}}};
use psy_core::job::job_id::ProvingJobCircuitType as Kind;
use psy_data::{protocol::checkpoint_transition_hash::{CheckpointStateHashTransition,CheckpointStateTransitionPublicInputs},v1::qdata::checkpoint::PQEDCheckpointLeaf};
use psy_plonky2_circuits::{generated::{cached_circuit_library::get_cached_circuit_library,cached_common_data::get_cached_common_data_library},proof_minifier::pm_core::get_circuit_fingerprint_generic};
use psy_template_u124_markets::{checkpoint_delivery::{digest,read_regular},checkpoint_evidence::{decode_proof,CheckpointOpening}};
use serde::Deserialize;use serde_json::{json,Value};use std::{fs,io::Write,path::Path};
fn fixture(name:&str)->Result<(&'static [u8],&'static str,&'static str)>{
 match name{
  "local-head-5b7f4e1e"=>Ok((include_bytes!("../fixtures/checkpoint-comparison-5b7f4e1e.json"),"0f11f142d55cc97f215b9bb297eb38404d1d598b1c8e7b89dadf1537f75869fe","5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6")),
  "cached-mainnet-beta-f786b599"=>Ok((include_bytes!("../fixtures/checkpoint-comparison-f786b599.json"),"f6be4c8d27ddbd5713aa37187a6f3c01b8227454e002c1b11ead4dbb15e3c31c","f786b599e08add77c7f28889d9e004aab716ba31")),
  _=>anyhow::bail!("only explicitly source-labelled embedded diagnostic cohorts allowed; no external verifier input"),
 }
}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Verifier{constants_sigmas_cap:Vec<Q<F>>,circuit_digest:Q<F>}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Entry{circuit_type:u32,fingerprint:Q<F>,verifier_data:Verifier}
#[derive(Deserialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Fixture{schema:u32,source_revision:String,source_path:String,source_sha256:String,common_debug_sha256:String,entry:Entry,approved:bool,runtime_identity_authenticated:bool}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Observed{opening:CheckpointOpening,leaf:PQEDCheckpointLeaf<F,Q<F>>}
fn pi(proof:&plonky2::plonk::proof::ProofWithPublicInputs<F,C,2>)->Result<Q<F>>{
 ensure!(proof.public_inputs.len()==4,"exact cumulative PI width required");Ok(Q(plonky2::hash::hash_types::HashOut{elements:proof.public_inputs.as_slice().try_into().unwrap()}))
}
fn run(a:&[String])->Result<Value>{
 psy_template_u124_markets::live_guard::require_compiled_verifier_domain()?;
 let(raw,fixture_sha,revision)=fixture(&a[0])?;
 ensure!(digest(raw)==fixture_sha,"embedded comparison source pin differs");let fixture:Fixture=serde_json::from_slice(raw)?;
 ensure!(fixture.schema==1&&!fixture.approved&&!fixture.runtime_identity_authenticated&&fixture.source_revision==revision,"diagnostic fixture is not a release approval");
 ensure!(fixture.entry.circuit_type==32&&fixture.entry.verifier_data.constants_sigmas_cap.len()==16,"one explicitly named comparison kind/cap only");
 let comparison=VerifierOnlyCircuitData::<C,2>{constants_sigmas_cap:MerkleCap(fixture.entry.verifier_data.constants_sigmas_cap.iter().map(|q|q.0).collect()),circuit_digest:fixture.entry.verifier_data.circuit_digest.0};
 ensure!(Q(get_circuit_fingerprint_generic(&comparison))==fixture.entry.fingerprint,"comparison fingerprint must recompute");
 let keys=get_cached_circuit_library::<F>();let common_library=get_cached_common_data_library::<C,2>();let common=common_library.get_common_circuit_data_ref(Kind::GenerateRollupStateTransitionProof)?;
 ensure!(digest(format!("CDV1_{common:?}").as_bytes())==fixture.common_debug_sha256,"comparison common shape differs; do not load other common data");
 let approved=&keys.info_map[&Kind::GenerateRollupStateTransitionProof];ensure!(approved.fingerprint!=fixture.entry.fingerprint,"cohorts must be explicitly distinct");
 let mut rows=Vec::new();let mut proofs=Vec::new();
 for path in &a[1..3]{
  let bytes=read_regular(Path::new(path),2000000)?;let proof=decode_proof(&bytes)?;
  let fixed=VerifierCircuitData{verifier_only:approved.verifier_data.to_verifier_data::<C,2>(),common:common.clone()}.verify(proof.clone());
  let named=VerifierCircuitData{verifier_only:comparison.clone(),common:common.clone()}.verify(proof.clone());
  rows.push(json!({"proofSha256":digest(&bytes),"bytes":bytes.len(),"publicInputs":pi(&proof)?.to_string(),"approvedResourceProofVerified":fixed.is_ok(),"approvedResourceError":fixed.err().map(|e|format!("{e:#}")),"unapprovedNamedComparisonProofVerified":named.is_ok(),"unapprovedNamedComparisonError":named.err().map(|e|format!("{e:#}"))}));proofs.push(proof);
 }
 let relation=if a[3]=="-"{Value::Null}else{
  let raw=read_regular(Path::new(&a[3]),131072)?;let observed:Observed=serde_json::from_slice(&raw)?;let o=&observed.opening;let p=&o.checkpoint_path;
  ensure!(o.schema==1&&o.checkpoint_id>1&&o.checkpoint_id<=u32::MAX as u64&&p.index==o.checkpoint_id&&p.siblings.len()==32&&p.root==o.checkpoint_root&&p.value==o.checkpoint_leaf_hash&&p.verify::<PoseidonHasher>()&&observed.leaf.qfhash::<PoseidonHasher>()==o.checkpoint_leaf_hash,"observed leaf/membership coherence required; not authenticated finality");
  let statement=|fp|CheckpointStateTransitionPublicInputs{checkpoint_transition:CheckpointStateHashTransition{old_checkpoint_tree_root:Q::default(),new_checkpoint_tree_root:o.checkpoint_root,old_checkpoint_leaf_hash:Q::default(),new_checkpoint_leaf_hash:o.checkpoint_leaf_hash},genesis_checkpoint_state_transition_hash:Q::default(),checkpoint_state_transition_circuit_fingerprint:fp};
  let prior=pi(&proofs[0])?;let actual=pi(&proofs[1])?;let fixed=statement(approved.fingerprint).get_chain_hash_from_previous::<PoseidonHasher>(&prior);let named=statement(fixture.entry.fingerprint).get_chain_hash_from_previous::<PoseidonHasher>(&prior);
  json!({"scope":"conditional observed pair correspondence, not authenticated instance/history/finality","checkpointId":o.checkpoint_id,"openingSha256":digest(&raw),"observedMembershipInternallyConsistent":true,"approvedExpectedPublicInputs":fixed.to_string(),"unapprovedNamedExpectedPublicInputs":named.to_string(),"actualPublicInputs":actual.to_string(),"approvedRelationMatches":fixed==actual,"unapprovedNamedRelationMatches":named==actual})
 };
 Ok(json!({"schema":1,"kind":"unapproved-source-cohort-diagnostic-v1","scope":"single source-labelled comparison only; never adopt comparison resources or authorize transactions","comparisonCohort":a[0],"fixtureSha256":fixture_sha,"comparisonSource":{"revision":fixture.source_revision,"path":fixture.source_path,"sha256":fixture.source_sha256,"runtimeIdentityAuthenticated":false},"approvedFingerprint":approved.fingerprint.to_string(),"unapprovedComparisonFingerprint":fixture.entry.fingerprint.to_string(),"commonBincodeSha256":digest(&bincode::serialize(common)?),"commonDebugSha256":fixture.common_debug_sha256,"proofs":rows,"observedRelation":relation,"approvedReleaseCompatible":rows.iter().all(|r|r["approvedResourceProofVerified"]==true),"comparisonResourcesInstalled":false,"runtimeIdentityAuthenticated":false,"chainDomainAuthenticated":false,"finalityVerified":false,"historyPrefixAnchored":false,"qualifiedSource":false,"causalSealVerified":false,"randomAuthorization":false,"financialOperations":0,"proofsGenerated":0,"broadcast":false}))
}
fn main()->Result<()>{
 let a=std::env::args().collect::<Vec<_>>();ensure!(a.len()==6,"NAMED_COHORT PREVIOUS_PROOF CURRENT_PROOF OBSERVED_OPENING_OR_DASH FRESH_REPORT");
 let mut file=fs::OpenOptions::new().create_new(true).write(true).open(&a[5])?;let result=run(&a[1..]);
 let report=match &result{Ok(v)=>v.clone(),Err(e)=>json!({"schema":1,"kind":"unapproved-source-cohort-diagnostic-v1","diagnosticCompleted":false,"error":format!("{e:#}"),"approvedReleaseCompatible":false,"comparisonResourcesInstalled":false,"runtimeIdentityAuthenticated":false,"finalityVerified":false,"qualifiedSource":false,"randomAuthorization":false,"financialOperations":0,"proofsGenerated":0,"broadcast":false})};
 file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.write_all(b"\n")?;file.sync_all()?;result.map(|_|())
}
#[cfg(test)]mod tests{
 use super::*;
 use plonky2::{field::types::{Field,PrimeField64},hash::poseidon::Poseidon};
 #[test]fn fixed_reference_poseidon_vectors_match_on_this_machine(){
  // Known answers from the frozen backend's independent reference-vector tests.
  // No random input, proof generation, network or alternate implementation.
  let rows=[([0u64;12],[0x3c18a9786cb0b359,0xc4055e3364a246c3,0x7953db0ab48808f4,0xc71603f33a1144ca,0xd7709673896996dc,0x46a84e87642f44ed,0xd032648251ee0b3c,0x1c687363b207df62,0xdf8565563e8045fe,0x40f5b37ff4254dae,0xd070f637b431067c,0x1792b1c4342109d7]),
   ([0,1,2,3,4,5,6,7,8,9,10,11],[0xd64e1e3efc5b8e9e,0x53666633020aaa47,0xd40285597c6a8825,0x613a4f81e81231d2,0x414754bfebd051f0,0xcb1f8980294a023f,0x6eb2a9e4d54a9d0f,0x1902bc3af467e056,0xf045d5eafdc6021f,0xe4150f77caaa3be5,0xc9bfd01d39b50cce,0x5c0a27fcb0e1459b])];
  for(input,expected)in rows{assert_eq!(F::poseidon(input.map(F::from_canonical_u64)).map(|n|n.to_canonical_u64()),expected);}
 }
 #[test]fn field_boundary_add_and_mul_match_integer_reference(){
  const P:u64=0xffffffff00000001;let values=[0,1,2,1<<32,(1<<32)-1,P-2,P-1];
  for a in values{for b in values{let x=F::from_canonical_u64(a);let y=F::from_canonical_u64(b);assert_eq!((x+y).to_canonical_u64(),((a as u128+b as u128)%P as u128)as u64);assert_eq!((x*y).to_canonical_u64(),((a as u128*b as u128)%P as u128)as u64);}}
 }
 #[test]fn finite_source_fixtures_are_pinned_and_unapproved()->Result<()>{
  for name in ["local-head-5b7f4e1e","cached-mainnet-beta-f786b599"]{
   let(raw,sha,revision)=fixture(name)?;assert_eq!(digest(raw),sha);let f:Fixture=serde_json::from_slice(raw)?;
   assert_eq!(f.source_revision,revision);assert!(!f.approved&&!f.runtime_identity_authenticated);assert_eq!(f.entry.circuit_type,32);
   let vk=VerifierOnlyCircuitData::<C,2>{constants_sigmas_cap:MerkleCap(f.entry.verifier_data.constants_sigmas_cap.iter().map(|q|q.0).collect()),circuit_digest:f.entry.verifier_data.circuit_digest.0};assert_eq!(Q(get_circuit_fingerprint_generic(&vk)),f.entry.fingerprint);
  }assert!(fixture("/external/verifier").is_err());Ok(())
 }
}
