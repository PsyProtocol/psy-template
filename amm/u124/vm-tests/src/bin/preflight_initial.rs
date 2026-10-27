//! Offline deploy preflight: verify the proof AND bind its public endpoints.
//! Uses public deployer hashes only; no RPC calls or broadcast code.
use anyhow::{ensure, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}},plonk::config::PoseidonGoldilocksConfig as C};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::qblock::cmds::deploy_contract::QBCDeployContractV2;
use psy_compiler::output::serialize::{CompilationArtifact,ContractOutput};
use psy_prover::session::{gen_contract_deploy_and_circuits_for_functions,compile_bridge::build_layout_aware_deploy_command};
use psy_plonky2_circuits::{coordinator::state_layout_helper::CanonicalLayoutProofVerifier,utils::proof_serialization::{deserialize_plonky2_proof,serialize_plonky2_proof}};
use psy_core::constants::protocol::{STATE_LAYOUT_TREE_HEIGHT,STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT,STATE_LAYOUT_MAX_AGGREGATION_DEPTH};
use parth_common::memory_stores::simple_merkle_tree::SimpleMerkleTree;
use parth_core::pgoldilocks::QHashOut as LayoutHash;
use std::{env,fs,io::Write};
fn write_new(path:&str,value:&impl serde::Serialize)->Result<()>{let mut f=fs::OpenOptions::new().write(true).create_new(true).open(path)?;f.write_all(&serde_json::to_vec(value)?)?;f.sync_all()?;Ok(())}
fn check(a:&CompilationArtifact,c:&QBCDeployContractV2<F>)->Result<serde_json::Value>{
 c.validate_shape()?;
 ensure!(a.state_tree_height==31 && c.deploy_contract.code_definition.state_tree_height==31,"candidate height differs");
 let abi=serde_json::to_string(&a.abi)?;
 let manifest=psy_data::v1::qdata::contract::canonical_layout_manifest_from_compiler_abi_json::<parth_core::pgoldilocks::PoseidonHasher,F,LayoutHash<F>>(&abi,STATE_LAYOUT_TREE_HEIGHT,psy_data::v1::qdata::contract::CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT)?;
 let layout=&manifest.layout.contract_layout;
 ensure!(c.state_layout_root.0.elements==layout.state_layout_root.0.elements,"request root does not match ABI");
 ensure!(c.state_layout_field_count==layout.state_layout_field_count && c.state_layout_slot_count==layout.state_layout_slot_count,"request counts do not match ABI");
 let verifier=CanonicalLayoutProofVerifier::<C,2>::new(STATE_LAYOUT_TREE_HEIGHT-STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT,STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT,STATE_LAYOUT_MAX_AGGREGATION_DEPTH);
 ensure!(c.canonical_layout_verifier_fingerprint.0.elements==verifier.fingerprint().0.elements,"unexpected verifier");
 verifier.verify_serialized_proof(&c.canonical_layout_proof)?;
 let proof=deserialize_plonky2_proof::<C,2>(&c.canonical_layout_proof)?;let p=&proof.public_inputs;
 ensure!(p.len()==19,"invalid PI shape");
 let empty=SimpleMerkleTree::<plonky2::hash::poseidon::PoseidonHash,LayoutHash<F>>::new(STATE_LAYOUT_TREE_HEIGHT as u8).get_root();
 ensure!(p[0]==F::ZERO && p[1].to_canonical_u64()==c.layout_protocol_version as u64,"not an initial deploy proof");
 ensure!(p[2..6]==empty.0.elements && p[6]==F::ZERO && p[7]==F::ZERO,"old endpoint must be empty/zero fields/zero slots");
 ensure!(p[8..12]==c.state_layout_root.0.elements,"proof new root differs from request");
 ensure!(p[12].to_canonical_u64()==c.state_layout_field_count && p[13].to_canonical_u64()==c.state_layout_slot_count && p[14].to_canonical_u64()==c.state_layout_field_count,"proof counts differ from request");
 let(_,expected)=gen_contract_deploy_and_circuits_for_functions::<C,2>(c.deploy_contract.deployer,31,&a.circuit_definitions)?;
 ensure!(expected==c.deploy_contract,"code/whitelist does not match reviewed artifact");
 Ok(serde_json::json!({"initialLayoutVerified":true,"publicEndpointsBound":true,"oldFieldCount":0,"oldSlotCount":0,"newFieldCount":c.state_layout_field_count,"newSlotCount":c.state_layout_slot_count,"codeRoot":c.deploy_contract.code_root.to_string(),"layoutRoot":c.state_layout_root.to_string(),"proofBytes":c.canonical_layout_proof.len(),"verifierFingerprint":c.canonical_layout_verifier_fingerprint.to_string(),"fullUpsVerified":false,"submitted":false}))
}
fn main()->Result<()>{let args:Vec<String>=env::args().collect();ensure!(args.len()==5,"usage: preflight_initial prepare|verify <artifact> <deployer-user-id|prepared-request> <fresh-output>");let a:CompilationArtifact=serde_json::from_slice(&fs::read(&args[2])?)?;ensure!(a.state_tree_height==31,"requires reviewed U124 artifact");match args[1].as_str(){"prepare"=>{let deployer=args[3].parse::<u64>()?;let(_,base)=gen_contract_deploy_and_circuits_for_functions::<C,2>(deployer,31,&a.circuit_definitions)?;let o=ContractOutput{contract_code:base.code_definition.clone(),circuit_definitions:a.circuit_definitions,abi:a.abi};let c=build_layout_aware_deploy_command(&o,base)?;write_new(&args[4],&c)?;println!("prepared fresh initial layout proof; NOT submitted");},"verify"=>{let c:QBCDeployContractV2<F>=serde_json::from_slice(&fs::read(&args[3])?)?;let result=check(&a,&c)?;
 let mut wrong_count=c.clone();wrong_count.state_layout_field_count+=1;ensure!(check(&a,&wrong_count).is_err(),"accepted mutated count");
 let mut wrong_root=c.clone();wrong_root.state_layout_root.0.elements[0]+=F::ONE;ensure!(check(&a,&wrong_root).is_err(),"accepted mutated root");
 let mut wrong_proof=c.clone();let mut proof=deserialize_plonky2_proof::<C,2>(&wrong_proof.canonical_layout_proof)?;proof.public_inputs[6]=F::from_canonical_u64(14);wrong_proof.canonical_layout_proof=serialize_plonky2_proof::<C,2>(&proof)?;ensure!(check(&a,&wrong_proof).is_err(),"accepted mutated proof");
 write_new(&args[4],&result)?;println!("verified initial endpoint, request, ABI and code identity; rejected three mutations");},_=>anyhow::bail!("unknown mode")};Ok(())}
