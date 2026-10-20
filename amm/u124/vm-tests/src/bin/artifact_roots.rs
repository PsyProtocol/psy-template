//! Offline code identity inspection. No proving, RPC, wallet or broadcast.
use anyhow::{ensure,Context,Result};
use plonky2::{field::goldilocks_field::GoldilocksField as F,hash::poseidon::PoseidonHash};
use psy_client_data::qblock::cmds::deploy_contract::get_code_root_by_code_hashes;
use psy_vm::dpn::{contract::{hash_dpn_function,cfc_code_definition_to_dapen_fc},vm::def::DPNFunctionCircuitDefinition};
use psy_client_data::qdata::contract::ContractCodeDefinition;
use psy_config::network_constants::{CONTRACT_FUNCTION_TREE_HEIGHT,VM_TYPE_STANRDARD_DAPEN_V1};
use sha2::{Digest,Sha256};
use std::{collections::BTreeSet,env,fs};
fn main()->Result<()>{
 let a:Vec<_>=env::args().collect();ensure!(a.len()==2,"artifact_roots <compilation_artifact.json>");
 let bytes=fs::read(&a[1])?;let value:serde_json::Value=serde_json::from_slice(&bytes)?;
 let height=value["state_tree_height"].as_u64().context("state height")?;ensure!((1..=63).contains(&height),"state height range");
 let (format,defs):(&str,Vec<DPNFunctionCircuitDefinition>)=if let Some(defs)=value.get("circuit_definitions"){("compilation-artifact",serde_json::from_value(defs.clone())?)}else{
  let code:ContractCodeDefinition=serde_json::from_value(value)?;let mut defs=vec![];for f in code.functions{ensure!(f.vm_type==VM_TYPE_STANRDARD_DAPEN_V1,"unsupported VM type");let d=cfc_code_definition_to_dapen_fc(&f)?;ensure!(f.method_id==d.method_id&&f.num_inputs as usize==d.circuit_inputs.len()&&f.num_outputs as usize==d.circuit_outputs.len(),"code envelope differs from encoded function");defs.push(d);}("contract-code-definition",defs)
 };
 // The code-hash tree has half the capacity of the protocol's 16-level
 // function whitelist tree (fingerprint/arity leaves are stored in pairs).
 const CODE_HEIGHT:u8=CONTRACT_FUNCTION_TREE_HEIGHT-1;ensure!(!defs.is_empty()&&defs.len()<=1usize<<CODE_HEIGHT,"function count");
 ensure!(defs.iter().map(|d|d.method_id).collect::<BTreeSet<_>>().len()==defs.len(),"duplicate method ID");
 ensure!(defs.iter().map(|d|&d.name).collect::<BTreeSet<_>>().len()==defs.len(),"duplicate method name");
 let code_root=get_code_root_by_code_hashes::<F,PoseidonHash>(&defs.iter().map(hash_dpn_function::<F>).collect::<Vec<_>>(),CODE_HEIGHT);
 println!("{}",serde_json::json!({"artifactSha256":format!("{:x}",Sha256::digest(bytes)),"stateTreeHeight":height,"codeTreeHeight":CODE_HEIGHT,"format":format,"functions":defs.iter().map(|d|serde_json::json!({"name":d.name,"methodId":d.method_id,"inputCount":d.circuit_inputs.len(),"outputCount":d.circuit_outputs.len(),"codeHash":hash_dpn_function::<F>(d).to_string()})).collect::<Vec<_>>(),"functionCount":defs.len(),"codeRoot":code_root.to_string(),"scope":"offline code identity only; whitelist and UPS not verified","fullUpsVerified":false,"broadcast":false}));Ok(())
}
