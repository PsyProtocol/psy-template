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
fn expected_code(a:&CompilationArtifact,deployer:QHashOut<F>)->Result<QBCDeployContract<F>>{
 static CACHE:OnceLock<Mutex<HashMap<String,QBCDeployContract<F>>>>=OnceLock::new();let cache=CACHE.get_or_init(||Mutex::new(HashMap::new()));
 let key=serde_json::to_string(&(deployer,a.state_tree_height,&a.circuit_definitions))?;
 if let Some(c)=cache.lock().map_err(|_|anyhow::anyhow!("code cache poisoned"))?.get(&key).cloned(){return Ok(c);}
 let (_,c)=gen_contract_deploy_and_circuits_for_functions::<C,2>(deployer,a.state_tree_height as u8,&a.circuit_definitions)?;
 let mut locked=cache.lock().map_err(|_|anyhow::anyhow!("code cache poisoned"))?;if locked.len()>=8{locked.clear();}locked.insert(key,c.clone());Ok(c)
}
pub fn verify_abi_layout(abi_json:&str)->Result<()>{
 psy_data::v1::qdata::contract::canonical_layout_manifest_from_compiler_abi_json::<parth_core::pgoldilocks::PoseidonHasher,F,LayoutHash<F>>(abi_json,STATE_LAYOUT_TREE_HEIGHT,psy_data::v1::qdata::contract::CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT)?;Ok(())
}
pub fn prepare_initial(a:CompilationArtifact,deployer:QHashOut<F>)->Result<QBCDeployContractV2<F>>{
 ensure!([30,31].contains(&a.state_tree_height),"NFT/U124 deployment height required");
 verify_abi_layout(&serde_json::to_string(&a.abi)?)?;
 let base=expected_code(&a,deployer)?;
 build_layout_aware_deploy_command(&ContractOutput{contract_code:base.code_definition.clone(),circuit_definitions:a.circuit_definitions,abi:a.abi},base)
}
pub fn verify_initial(a:&CompilationArtifact,c:&QBCDeployContractV2<F>,deployer:QHashOut<F>)->Result<serde_json::Value>{
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
