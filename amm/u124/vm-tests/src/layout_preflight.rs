//! Initial deployment verification only. No update request or broadcast path.
use anyhow::{ensure,Result};
use std::{collections::HashMap,sync::{Mutex,OnceLock}};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}},plonk::config::PoseidonGoldilocksConfig as C};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::qblock::cmds::deploy_contract::{QBCDeployContract,QBCDeployContractV2};
use psy_compiler::output::serialize::{CompilationArtifact,ContractOutput};
use psy_prover::session::{gen_contract_deploy_and_circuits_for_functions,compile_bridge::build_layout_aware_deploy_command};
use psy_plonky2_circuits::{coordinator::state_layout_helper::CanonicalLayoutProofVerifier,utils::proof_serialization::deserialize_plonky2_proof};
use psy_core::constants::protocol::{STATE_LAYOUT_TREE_HEIGHT,STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT,STATE_LAYOUT_MAX_AGGREGATION_DEPTH};
use parth_common::memory_stores::simple_merkle_tree::SimpleMerkleTree;
use parth_core::pgoldilocks::QHashOut as LayoutHash;
fn verifier()->&'static CanonicalLayoutProofVerifier<C,2>{
 static V:OnceLock<CanonicalLayoutProofVerifier<C,2>>=OnceLock::new();
 V.get_or_init(||CanonicalLayoutProofVerifier::<C,2>::new(STATE_LAYOUT_TREE_HEIGHT-STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT,STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT,STATE_LAYOUT_MAX_AGGREGATION_DEPTH))
}
fn expected_code(a:&CompilationArtifact,deployer:u64)->Result<QBCDeployContract<F>>{
 // Circuit fingerprints, code and function whitelists depend on the immutable
 // artifact and compiled network configuration, never on its eventual owner.
 // The opt-in cache holds a zero-owner template; every returned request is rebound.
 // Default owner-v1 preserves the accepted path while memory is investigated.
 // This process-local cache cannot share state, witnesses or old layout proofs.
 static CACHE:OnceLock<Mutex<HashMap<String,QBCDeployContract<F>>>>=OnceLock::new();let cache=CACHE.get_or_init(||Mutex::new(HashMap::new()));
 let mode=std::env::var("PSY_INITIAL_CODE_CACHE").unwrap_or_else(|_|"owner-v1".into());
 ensure!(["owner-v1","artifact-template-v1"].contains(&mode.as_str()),"unknown initial code cache profile");
 let template_mode=mode=="artifact-template-v1";
 let resource_owner=if template_mode{0}else{deployer};
 let key=serde_json::to_string(&(&mode,psy_config::PSY_NETWORK_MAGIC,resource_owner,a.state_tree_height,&a.circuit_definitions))?;
 if let Some(mut c)=cache.lock().map_err(|_|anyhow::anyhow!("code cache poisoned"))?.get(&key).cloned(){c.deployer=deployer;return Ok(c);}
 let (_,template)=gen_contract_deploy_and_circuits_for_functions::<C,2>(resource_owner,a.state_tree_height as u8,&a.circuit_definitions)?;
 let mut locked=cache.lock().map_err(|_|anyhow::anyhow!("code cache poisoned"))?;if locked.len()>=8{locked.clear();}locked.insert(key,template.clone());
 let mut bound=template;bound.deployer=deployer;Ok(bound)
}
pub fn verify_abi_layout(abi_json:&str)->Result<()>{
 psy_data::v1::qdata::contract::canonical_layout_manifest_from_compiler_abi_json::<parth_core::pgoldilocks::PoseidonHasher,F,LayoutHash<F>>(abi_json,STATE_LAYOUT_TREE_HEIGHT,psy_data::v1::qdata::contract::CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT)?;Ok(())
}
pub fn prepare_initial(a:CompilationArtifact,deployer:u64)->Result<QBCDeployContractV2<F>>{
 ensure!(deployer>0&&deployer<(1u64<<32),"explicit bounded deployment user ID required");
 ensure!([30,31].contains(&a.state_tree_height),"NFT/U124 deployment height required");
 verify_abi_layout(&serde_json::to_string(&a.abi)?)?;
 let base=expected_code(&a,deployer)?;
 build_layout_aware_deploy_command(&ContractOutput{contract_code:base.code_definition.clone(),circuit_definitions:a.circuit_definitions,abi:a.abi},base)
}
pub fn verify_initial(a:&CompilationArtifact,c:&QBCDeployContractV2<F>,deployer:u64)->Result<serde_json::Value>{
 ensure!(deployer>0&&deployer<(1u64<<32),"explicit bounded deployment user ID required");
 c.validate_shape()?;ensure!([30,31].contains(&a.state_tree_height),"NFT/U124 deployment height required");
 ensure!(c.deploy_contract.deployer==deployer,"deployer binding mismatch");
 ensure!(c.deploy_contract.code_definition.state_tree_height==a.state_tree_height,"candidate height differs");
 let manifest=psy_data::v1::qdata::contract::canonical_layout_manifest_from_compiler_abi_json::<parth_core::pgoldilocks::PoseidonHasher,F,LayoutHash<F>>(&serde_json::to_string(&a.abi)?,STATE_LAYOUT_TREE_HEIGHT,psy_data::v1::qdata::contract::CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT)?;
 let layout=&manifest.layout.contract_layout;
 ensure!(c.state_layout_root.0.elements==layout.state_layout_root.0.elements,"request root does not match ABI");
 ensure!(c.state_layout_field_count==layout.state_layout_field_count&&c.state_layout_slot_count==layout.state_layout_slot_count,"request counts do not match ABI");
 let v=verifier();
 ensure!(c.canonical_layout_verifier_fingerprint.0.elements==v.fingerprint().0.elements,"unexpected verifier");v.verify_serialized_proof(&c.canonical_layout_proof)?;
 let proof=deserialize_plonky2_proof::<C,2>(&c.canonical_layout_proof)?;let p=&proof.public_inputs;
 ensure!(p.len()==19,"invalid PI shape");let empty=SimpleMerkleTree::<plonky2::hash::poseidon::PoseidonHash,LayoutHash<F>>::new(STATE_LAYOUT_TREE_HEIGHT as u8).get_root();
 ensure!(p[0]==F::ZERO&&p[1].to_canonical_u64()==c.layout_protocol_version as u64,"not an initial deploy proof");
 ensure!(p[2..6]==empty.0.elements&&p[6]==F::ZERO&&p[7]==F::ZERO,"old endpoint must be empty/zero fields/zero slots");
 ensure!(p[8..12]==c.state_layout_root.0.elements,"proof new root differs from request");
 ensure!(p[12].to_canonical_u64()==c.state_layout_field_count&&p[13].to_canonical_u64()==c.state_layout_slot_count&&p[14].to_canonical_u64()==c.state_layout_field_count,"proof counts differ from request");
 let expected=expected_code(a,deployer)?;
 ensure!(expected==c.deploy_contract,"code/whitelist does not match reviewed artifact");
 Ok(serde_json::json!({"initialLayoutVerified":true,"publicEndpointsBound":true,"expectedDeployer":deployer.to_string(),"stateTreeHeight":a.state_tree_height,"oldFieldCount":0,"oldSlotCount":0,"newFieldCount":c.state_layout_field_count,"newSlotCount":c.state_layout_slot_count,"codeRoot":c.deploy_contract.code_root.to_string(),"layoutRoot":c.state_layout_root.to_string(),"proofBytes":c.canonical_layout_proof.len(),"verifierFingerprint":c.canonical_layout_verifier_fingerprint.to_string(),"fullUpsVerified":false,"submitted":false}))
}

#[cfg(test)] mod reuse_measurement {
 use super::*;use std::{fs,io::Write,time::Instant};use serde_json::json;
 #[test]
 #[ignore = "real artifact; two complete initial layout proofs; fresh output only"]
 fn two_deployer_initial_layout_requests() -> Result<()> {
  let artifact=std::env::var("LAYOUT_REUSE_ARTIFACT")?;let output=std::env::var("LAYOUT_REUSE_OUT")?;fs::create_dir(&output)?;
  let bytes=fs::read(&artifact)?;let a:CompilationArtifact=serde_json::from_slice(&bytes)?;let mut rows=vec![];
  for index in 1..=2u64 {
   let owner=index;let began=Instant::now();
   let request=prepare_initial(a.clone(),owner)?;let prepared_ms=began.elapsed().as_secs_f64()*1000.;let verified=Instant::now();
   let report=verify_initial(&a,&request,owner)?;let verify_ms=verified.elapsed().as_secs_f64()*1000.;
   let other=index+40;
   ensure!(verify_initial(&a,&request,other).is_err(),"wrong expected owner accepted");
   let mut changed=request.clone();changed.deploy_contract.deployer=other;ensure!(verify_initial(&a,&changed,owner).is_err(),"mutated request owner accepted");
   let mut changed=request.clone();changed.deploy_contract.code_definition.functions[0].num_inputs+=1;ensure!(verify_initial(&a,&changed,owner).is_err(),"mutated code accepted");
   let mut changed=request.clone();changed.state_layout_field_count+=1;ensure!(verify_initial(&a,&changed,owner).is_err(),"mutated count accepted");
   let mut changed=request.clone();changed.state_layout_root.0.elements[0]+=F::ONE;ensure!(verify_initial(&a,&changed,owner).is_err(),"mutated layout root accepted");
   let mut changed=request.clone();changed.canonical_layout_proof[0]^=1;ensure!(verify_initial(&a,&changed,owner).is_err(),"mutated layout proof accepted");
   let mut file=fs::OpenOptions::new().create_new(true).write(true).open(format!("{output}/owner-{index}-request.json"))?;file.write_all(&serde_json::to_vec(&request)?)?;file.sync_all()?;
   let row=json!({"ownerIndex":index,"owner":owner.to_string(),"prepareMilliseconds":prepared_ms,"verifyMilliseconds":verify_ms,"wholeCaseMilliseconds":began.elapsed().as_secs_f64()*1000.,"initialLayoutProofVerified":true,"rejected":["expected-owner","request-owner","code","count","root","proof"],"report":report});println!("LAYOUT_REUSE {row}");rows.push(row);
  }
  let mut file=fs::OpenOptions::new().create_new(true).write(true).open(format!("{output}/REPORT.json"))?;file.write_all(&serde_json::to_vec_pretty(&json!({"schema":1,"rows":rows,"financialOperations":0,"scope":"Two sequential owners, real compiled artifact and complete canonical initial-layout proofs. Not a full UPS, live deployment, chain acceptance or TPS; host load not controlled."}))?)?;file.sync_all()?;Ok(())
 }
}

#[cfg(test)] mod preserved_reuse {
 use super::*;use std::{fs,io::Write};use serde_json::json;
 #[test] #[ignore="preserved public initial requests; complete verification under both profiles"]
 fn complete_requests_remain_owner_bound_in_both_profiles()->Result<()>{
  let artifact=std::env::var("LAYOUT_REUSE_ARTIFACT")?;let input=std::env::var("LAYOUT_PRESERVED_INPUT")?;let output=std::env::var("LAYOUT_PRESERVED_REPORT")?;
  let a:CompilationArtifact=serde_json::from_slice(&fs::read(artifact)?)?;let mut rows=vec![];
  for mode in ["owner-v1","artifact-template-v1"]{std::env::set_var("PSY_INITIAL_CODE_CACHE",mode);for index in 1..=2u64{
   let owner=index;let request:QBCDeployContractV2<F>=serde_json::from_slice(&fs::read(format!("{input}/owner-{index}-request.json"))?)?;
   let report=verify_initial(&a,&request,owner)?;ensure!(verify_initial(&a,&request,0).is_err(),"wrong owner accepted");rows.push(json!({"profile":mode,"ownerIndex":index,"completeInitialLayoutVerified":true,"wrongOwnerRejected":true,"report":report}));
  }}
  std::env::set_var("PSY_INITIAL_CODE_CACHE","unknown-profile");let owner=1;let request:QBCDeployContractV2<F>=serde_json::from_slice(&fs::read(format!("{input}/owner-1-request.json"))?)?;ensure!(verify_initial(&a,&request,owner).is_err(),"unknown cache profile accepted");
  let mut f=fs::OpenOptions::new().write(true).create_new(true).open(output)?;f.write_all(&serde_json::to_vec_pretty(&json!({"rows":rows,"unknownProfileRejected":true,"rpcCalls":0,"financialOperations":0,"scope":"verify preserved public static initial-layout proofs; not transaction state-proof reuse or live acceptance"}))?)?;f.sync_all()?;Ok(())
 }
}
