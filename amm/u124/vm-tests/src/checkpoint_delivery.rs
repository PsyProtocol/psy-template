//! Public release handoff, not runtime attestation, finality or transaction admission.
use anyhow::{ensure,Result};
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
use std::{fs,io::{Read,Write},path::Path};
use crate::checkpoint_evidence::{self as evidence,CheckpointOpening,PublicCheckpointRecord};

pub const SDK:&str="c92880c8b6e2c8d392f19368bc8801a2584fd427";
pub const CLIENT:&str="b280d714a8f0930c61962c885374ea63ea63d274";
pub const BACKEND:&str="736572e9dd3ca93566471cf5a2a1cb67a13fe01d";
pub fn digest(b:&[u8])->String{format!("{:x}",Sha256::digest(b))}
fn hex(s:&str,n:usize)->bool{s.len()==n&&s.bytes().all(|c|c.is_ascii_digit()||(b'a'..=b'f').contains(&c))}
#[derive(Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct FileRef{pub file:String,pub sha256:String}
#[derive(Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Release{pub sdk_commit:String,pub client_commit:String,pub backend_commit:String}
#[derive(Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct RuntimeClaim{pub binary_sha256:String,pub build_manifest_sha256:String,pub snapshot_id:String,pub chain_instance_claim:String,pub exporter:String}
#[derive(Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Resources{pub verifier:FileRef,pub common:FileRef}
#[derive(Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Entry{pub checkpoint_id:u64,pub record:FileRef,pub opening:FileRef}
#[derive(Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Delivery{pub schema:u32,pub kind:String,pub release:Release,pub runtime_claim:RuntimeClaim,pub resources:Resources,pub boundary_prior_chain_hash:String,pub checkpoints:[Entry;2]}

/// Read a single confined regular file, checking identity across open/read. A
/// reviewed digest binds the bytes even if an operator mutates the directory.
pub fn read_regular(path:&Path,limit:usize)->Result<Vec<u8>>{
 use std::os::unix::fs::MetadataExt;
 let before=fs::symlink_metadata(path)?;ensure!(before.is_file()&&before.len()<=limit as u64,"bounded regular public file required");
 let file=fs::File::open(path)?;let opened=file.metadata()?;
 ensure!(before.dev()==opened.dev()&&before.ino()==opened.ino(),"public file changed during open");
 let mut bytes=Vec::new();file.take(limit as u64+1).read_to_end(&mut bytes)?;
 let after=fs::symlink_metadata(path)?;
 ensure!(after.is_file()&&opened.dev()==after.dev()&&opened.ino()==after.ino()&&bytes.len()<=limit,"public file changed or exceeds limit");Ok(bytes)
}
fn member(root:&Path,r:&FileRef,limit:usize)->Result<Vec<u8>>{
 ensure!(!r.file.is_empty()&&r.file.len()<=96&&r.file!="."&&r.file!=".."&&r.file.bytes().all(|b|b.is_ascii_alphanumeric()||b"._-".contains(&b)),"delivery members must be confined basenames");
 ensure!(hex(&r.sha256,64),"canonical member SHA256 required");let bytes=read_regular(&root.join(&r.file),limit)?;
 ensure!(digest(&bytes)==r.sha256,"delivery member digest mismatch");Ok(bytes)
}
// SDK record types are intentionally reused, but their serde derives ignore
// unknown fields. Reject anything outside their explicit public serialization.
fn same_shape(input:&Value,projection:&Value)->Result<()>{
 match(input,projection){
  (Value::Object(a),Value::Object(b))=>{ensure!(a.len()==b.len()&&a.keys().all(|k|b.contains_key(k)),"unexpected or missing public record field");for(k,v)in a{same_shape(v,&b[k])?;}},
  (Value::Array(a),Value::Array(b))=>{ensure!(a.len()==b.len(),"public array shape differs");for(x,y)in a.iter().zip(b){same_shape(x,y)?;}},
  _=>ensure!(input==projection,"noncanonical public scalar"),
 };Ok(())
}
fn public_record(bytes:&[u8])->Result<PublicCheckpointRecord>{
 let value:Value=serde_json::from_slice(bytes).map_err(|_|anyhow::anyhow!("invalid public record JSON"))?;
 let record:PublicCheckpointRecord=serde_json::from_value(value.clone()).map_err(|_|anyhow::anyhow!("invalid frozen public database record type"))?;
 same_shape(&value,&serde_json::to_value(&record)?)?;
 // The exporter must use the frozen native type's compact serde_json bytes.
 // Exact round-trip rejects duplicate keys, hidden fields and ambiguous encodings.
 ensure!(serde_json::to_vec(&record)?==bytes,"canonical compact frozen public record serialization required");
 ensure!(record.zk_proof.len()<=2000000,"bounded public record proof");Ok(record)
}
pub fn denied()->Value{json!({"schema":1,"inspectionPassed":false,"runtimeIdentityAuthenticated":false,"snapshotProvenanceAuthenticated":false,"chainDomainAuthenticated":false,"historyPrefixAnchored":false,"finalityVerified":false,"causalSealVerified":false,"qualifiedSource":false,"randomAuthorization":false,"broadcast":false,"financialOperations":0,"proofsGenerated":0})}
pub fn verify(root:&Path,manifest_sha256:&str)->Result<Value>{
 ensure!(hex(manifest_sha256,64),"reviewed manifest SHA256 required");
 ensure!(fs::symlink_metadata(root)?.is_dir(),"delivery root must be a real directory");let root=root.canonicalize()?;
 let bytes=read_regular(&root.join("delivery.json"),32768)?;ensure!(digest(&bytes)==manifest_sha256,"reviewed delivery manifest differs");
 let d:Delivery=serde_json::from_slice(&bytes).map_err(|_|anyhow::anyhow!("invalid strict delivery manifest"))?;
 ensure!(d.schema==1&&d.kind=="checkpoint-runtime-delivery-v1","versioned runtime delivery required; RPC observations are insufficient");
 ensure!(d.release.sdk_commit==SDK&&d.release.client_commit==CLIENT&&d.release.backend_commit==BACKEND,"delivered release differs from frozen approval; no dependency or key fallback");
 ensure!(hex(&d.runtime_claim.binary_sha256,64)&&hex(&d.runtime_claim.build_manifest_sha256,64),"public runtime/build digests required");
 for text in [&d.runtime_claim.snapshot_id,&d.runtime_claim.chain_instance_claim,&d.runtime_claim.exporter]{ensure!(!text.is_empty()&&text.len()<=256&&text.bytes().all(|b|(32..127).contains(&b)),"bounded public runtime claims required");}
 let(vk,common,inventory)=evidence::reference_resources()?;
 ensure!(member(&root,&d.resources.verifier,2000000)?==vk&&member(&root,&d.resources.common,2000000)?==common,"runtime resources differ from approved immutable resources; never install foreign verifier");
 let mut records=Vec::new();let mut openings=Vec::new();let mut proof_hashes=Vec::new();
 for entry in &d.checkpoints{
  let record=public_record(&member(&root,&entry.record,16000000)?)?;
  let opening:CheckpointOpening=serde_json::from_slice(&member(&root,&entry.opening,131072)?).map_err(|_|anyhow::anyhow!("invalid public checkpoint opening"))?;
  ensure!(opening.checkpoint_id==entry.checkpoint_id,"manifest/opening checkpoint differs");
  proof_hashes.push(digest(&record.zk_proof));records.push(record);openings.push(opening);
 }
 let boundary=d.boundary_prior_chain_hash.parse()?;
 let mut result=evidence::inspect_runtime_pair(&openings.try_into().map_err(|_|anyhow::anyhow!("exactly two openings"))?,&records.try_into().map_err(|_|anyhow::anyhow!("exactly two records"))?,boundary)?;
 result["inspectionPassed"]=true.into();result["deliveryManifestSha256"]=manifest_sha256.into();result["resources"]=inventory;
 result["runtimeClaim"]=serde_json::to_value(&d.runtime_claim)?;result["proofSha256"]=json!(proof_hashes);
 result["scope"]="Conditional fixed-resource proof/record consistency only; claims do not authenticate running services, canonical history, finality, or seed release timing".into();
 Ok(result)
}
fn save(path:&Path,bytes:&[u8])->Result<()>{let mut f=fs::OpenOptions::new().create_new(true).write(true).open(path)?;f.write_all(bytes)?;f.sync_all()?;Ok(())}
pub fn export(root:&Path)->Result<Value>{
 // Build first, then claim a fresh directory; a partial export is never replaced.
 let(vk,common,inventory)=evidence::reference_resources()?;fs::create_dir(root)?;
 save(&root.join("transition-verifier.bin"),&vk)?;save(&root.join("transition-common.bin"),&common)?;
 let report=json!({"schema":1,"kind":"local-fixed-checkpoint-reference-v1","release":{"sdkCommit":SDK,"clientCommit":CLIENT,"backendCommit":BACKEND},"resources":{"verifier":{"file":"transition-verifier.bin","sha256":digest(&vk)},"common":{"file":"transition-common.bin","sha256":digest(&common)}},"inventory":inventory,"runtimeIdentityAuthenticated":false,"finalityVerified":false,"randomAuthorization":false,"financialOperations":0,"proofsGenerated":0,"broadcast":false});
 save(&root.join("reference.json"),&serde_json::to_vec_pretty(&report)?)?;fs::File::open(root)?.sync_all()?;Ok(report)
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn public_projection_rejects_extra_fields_and_noncanonical_values(){assert!(same_shape(&json!({"a":1,"private_key":"do-not-export"}),&json!({"a":1})).is_err());assert!(same_shape(&json!([1.0]),&json!([1])).is_err());assert!(same_shape(&json!({"a":[1]}),&json!({"a":[1]})).is_ok());}
 #[test]fn every_delivery_result_stays_nonfinancial(){let r=denied();for key in ["broadcast","qualifiedSource","randomAuthorization","finalityVerified","chainDomainAuthenticated","runtimeIdentityAuthenticated"]{assert_eq!(r[key],false);}}
 #[test]fn strict_manifest_cannot_be_an_rpc_observation(){assert!(serde_json::from_value::<Delivery>(json!({"schema":1,"random_seed":"untrusted"})).is_err());}
 #[test]fn sha256_is_exact_and_canonical(){assert_eq!(digest(b"abc"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");assert!(!hex(&"A".repeat(64),64));}
 #[test]fn confined_reader_rejects_substitution_escape_and_symlink()->Result<()>{
  use std::os::unix::fs::symlink;
  let root=std::env::temp_dir().join(format!("checkpoint-public-reader-{}",std::process::id()));fs::create_dir(&root)?;
  let check=(||->Result<()>{save(&root.join("public.bin"),b"public")?;symlink("public.bin",root.join("link.bin"))?;
   let r=|name:&str,sha:&str|FileRef{file:name.into(),sha256:sha.into()};let good=digest(b"public");
   assert_eq!(member(&root,&r("public.bin",&good),6)?,b"public");
   for name in ["../public.bin","/public.bin","link.bin",".",".."]{assert!(member(&root,&r(name,&good),100).is_err());}
   assert!(member(&root,&r("public.bin",&digest(b"other")),100).is_err());assert!(member(&root,&r("public.bin",&good),5).is_err());Ok(())
  })();fs::remove_dir_all(&root)?;check
 }
 fn public_fixture_record()->Result<PublicCheckpointRecord>{
  let zero="0".repeat(64);let roots=["contract_tree_root","deposit_tree_root","user_tree_root","withdrawal_tree_root","user_registration_tree_root","validator_tree_root"].into_iter().map(|k|(k.into(),json!(zero))).collect::<serde_json::Map<_,_>>();
  let stats=json!({"guta_fees_collected":0,"da_fees_collected":0,"user_ops_processed":0,"total_transactions":0,"slots_modified":0,"pm_jobs_completed":{"deploy_contracts_completed":0,"register_users_completed":0,"gutas_completed":0},"block_time":0,"random_seed":zero,"pm_rewards_commitment":{"register_users_root":zero,"gutas_root":zero,"deploy_contracts_root":zero},"da_challenges_claimed":[0,0,0,0,0,0,0,0,0,0,0,0,0,0]});
  let value=json!({"info":{"state_transition":{"checkpoint_transition":{"old_checkpoint_tree_root":zero,"new_checkpoint_tree_root":zero,"old_checkpoint_leaf_hash":zero,"new_checkpoint_leaf_hash":zero},"genesis_checkpoint_state_transition_hash":zero,"checkpoint_state_transition_circuit_fingerprint":zero},"checkpoint_leaf":{"global_state_roots":roots,"stats":stats}},"circuit_type":32,"zk_proof":[]});
  Ok(serde_json::from_value(value)?)
 }
 #[test]fn only_canonical_public_native_records_pass_projection()->Result<()>{
  let record=public_fixture_record()?;let canonical=serde_json::to_vec(&record)?;assert!(public_record(&canonical).is_ok());
  let mut extra=serde_json::to_value(&record)?;extra["signingWitness"]=json!("test-only sentinel, never projected");assert!(public_record(&serde_json::to_vec(&extra)?).is_err());
  let duplicate=format!("{{\"circuit_type\":32,{}",&String::from_utf8(canonical)?[1..]);assert!(public_record(duplicate.as_bytes()).is_err());
  assert!(public_record(&serde_json::to_vec_pretty(&record)?).is_err());Ok(())
 }
 #[test]#[ignore="saved public rejected proof only; no proof generation, runtime bundle or network"]
 fn coherent_test_claims_still_require_actual_fixed_resource_proof_verification()->Result<()>{
  use parth_core::{pgoldilocks::{QHashOut as Q,PoseidonHasher},crypto::hash::{traits::QFieldHashable,merkle_proof::{MerkleProofCore,compute_root_merkle_proof_generic}}};
  use plonky2::field::goldilocks_field::GoldilocksField as F;
  let path=std::env::var("CHECKPOINT_DELIVERY_TEST_PROOF")?;let bytes=read_regular(Path::new(&path),2000000)?;
  ensure!(digest(&bytes)=="caf28f81044ec8a7ae1bb842f4225ca2e0c9fe2dc55cf9707f08940292712f9e","exact original public negative control required");
  let proof=evidence::decode_proof(&bytes)?;let(_,_,inventory)=evidence::reference_resources()?;
  let fp:Q<F>=inventory["transitionFingerprint"].as_str().unwrap().parse()?;
  let mut records=[public_fixture_record()?,public_fixture_record()?];let mut openings=Vec::new();let boundary=Q::<F>::default();let mut prior=boundary;let mut last_leaf=Q::default();
  for i in 0..2{
   let cp=2+i as u64;let record=&mut records[i];let leaf=record.info.checkpoint_leaf.qfhash::<PoseidonHasher>();
   let mut siblings=vec![Q::default();32];if i==1{siblings[0]=last_leaf;}
   let path=MerkleProofCore::new_from_params::<PoseidonHasher>(cp,leaf,siblings);
   let state=&mut record.info.state_transition;state.checkpoint_state_transition_circuit_fingerprint=fp;
   state.checkpoint_transition.old_checkpoint_tree_root=compute_root_merkle_proof_generic::<_,PoseidonHasher>(Q::default(),cp,&path.siblings);
   state.checkpoint_transition.new_checkpoint_tree_root=path.root;state.checkpoint_transition.old_checkpoint_leaf_hash=last_leaf;state.checkpoint_transition.new_checkpoint_leaf_hash=leaf;
   let pi=state.get_chain_hash_from_previous::<PoseidonHasher>(&prior);let mut altered=proof.clone();altered.public_inputs=pi.0.elements.to_vec();record.zk_proof=bincode::serialize(&altered)?;
   openings.push(CheckpointOpening{schema:1,checkpoint_id:cp,checkpoint_root:path.root,checkpoint_leaf_hash:leaf,checkpoint_path:path});prior=pi;last_leaf=leaf;
  }
  let openings:[CheckpointOpening;2]=openings.try_into().map_err(|_|anyhow::anyhow!("pair"))?;
  let error=evidence::inspect_runtime_pair(&openings,&records,boundary).unwrap_err();
  ensure!(format!("{error:#}").contains("predecessor transition proof under frozen resources"),"coherent test claims must reach real cryptographic rejection");
  let mut wrong=records.clone();wrong[1].circuit_type=40;assert!(evidence::inspect_runtime_pair(&openings,&wrong,boundary).unwrap_err().to_string().contains("circuit kind"));
  let mut wrong=records.clone();wrong[1].info.state_transition.checkpoint_state_transition_circuit_fingerprint=Q::default();assert!(evidence::inspect_runtime_pair(&openings,&wrong,boundary).unwrap_err().to_string().contains("fingerprint"));
  let mut wrong=openings.clone();wrong[1].checkpoint_id=4;assert!(evidence::inspect_runtime_pair(&wrong,&records,boundary).is_err());
  let mut wrong=records.clone();wrong[1].info.state_transition.checkpoint_transition.old_checkpoint_leaf_hash=Q::default();assert!(evidence::inspect_runtime_pair(&openings,&wrong,boundary).unwrap_err().to_string().contains("consistent transition pair"));
  Ok(())
 }
}
