//! Read captured public RPC envelopes using the unchanged selected SDK types.
//! No network client, key, registration, deployment or submission path.
use anyhow::{ensure, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::PrimeField64},hash::poseidon::PoseidonHash};
use psy_client_data::qdata::contract::{PsyContractLeaf,ContractCodeDefinition};
use psy_client_data::qblock::cmds::deploy_contract::get_code_root_by_code_hashes;
use psy_vm::dpn::contract::{cfc_code_definition_to_dapen_fc,hash_dpn_function};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{fs,io::Write,collections::BTreeSet};
fn envelope(bytes:&[u8])->Result<Value>{let r:Value=serde_json::from_slice(bytes)?;ensure!(r["jsonrpc"]=="2.0"&&r["id"]==1&&r.get("error").is_none()&&r.get("result").is_some(),"successful exact RPC envelope required");Ok(r["result"].clone())}
fn leaf_check(v:Value)->Value {match serde_json::from_value::<PsyContractLeaf<F>>(v){Ok(leaf)=>json!({"ok":true,"codeRoot":leaf.code_root.to_string(),"stateTreeHeight":leaf.state_tree_height.to_canonical_u64()}),Err(e)=>json!({"ok":false,"error":e.to_string(),"expectedDeployer":"selected SDK numeric deployer user ID; public-key hashes are not owners"})}}
fn main()->Result<()>{
 let a=std::env::args().collect::<Vec<_>>();ensure!(a.len()==4,"PUBLIC_NATIVE_LEAF_ENVELOPE PUBLIC_NATIVE_CODE_ENVELOPE FRESH_REPORT");
 let leaf_bytes=fs::read(&a[1])?;let code_bytes=fs::read(&a[2])?;let leaf=envelope(&leaf_bytes)?;let code=envelope(&code_bytes)?;
 let schema=leaf_check(leaf.clone());let mut methods=vec![];let mut hashes=vec![];let mut errors=vec![];
 match serde_json::from_value::<ContractCodeDefinition>(code){Ok(c)=>{
  if c.state_tree_height!=32{errors.push("native state height differs from 32".to_string());}
  let mut ids=BTreeSet::new();for def in &c.functions{if !ids.insert(def.method_id){errors.push("duplicate native method ID".into());}
   match cfc_code_definition_to_dapen_fc(def){Ok(d)=>{if d.method_id!=def.method_id||d.circuit_inputs.len()!=def.num_inputs as usize||d.circuit_outputs.len()!=def.num_outputs as usize {errors.push("native function metadata/bytecode mismatch".into());}hashes.push(hash_dpn_function::<F>(&d));methods.push(json!({"name":d.name,"methodId":d.method_id,"inputs":def.num_inputs,"outputs":def.num_outputs}));},Err(e)=>errors.push(format!("native bytecode decode: {e}"))}
  }
 },Err(e)=>errors.push(format!("native code schema: {e}"))}
 let root=if errors.is_empty(){Some(get_code_root_by_code_hashes::<F,PoseidonHash>(&hashes,15).to_string())}else{None};
 let root_matches=root.as_deref()==leaf["code_root"].as_str();
 for(name,inputs)in [("transfer",2),("claim",1),("burn",1)]{if !methods.iter().any(|m|m["name"]==name&&m["inputs"]==inputs&&m["outputs"]==0){errors.push(format!("required native signature missing: {name}/{inputs}"));}}
 let burn_id=psy_config::network_constants::TOKEN_BURN_METHOD_ID;
 let automatic_burn_supported=methods.iter().any(|m|m["methodId"]==burn_id&&m["inputs"]==1&&m["outputs"]==0);
 if !automatic_burn_supported{errors.push(format!("SDK automatic fee-burn method ID {burn_id} is absent"));}
 let compatible=schema["ok"]==true&&root_matches&&errors.is_empty();
 let report=json!({"schema":1,"nativeLeafEnvelopeSha256":format!("{:x}",Sha256::digest(&leaf_bytes)),"nativeCodeEnvelopeSha256":format!("{:x}",Sha256::digest(&code_bytes)),"nativeLeafSchema":schema,"nativeCodeErrors":errors,"nativeMethods":methods,"sdkRecomputedNativeCodeRoot":root,"rpcNativeCodeRoot":leaf["code_root"],"nativeCodeRootMatches":root_matches,"sdkAutomaticBurnMethodId":burn_id,"sdkAutomaticBurnSupported":automatic_burn_supported,"necessaryCompatibilityChecksPassed":compatible,"financialReady":false,"endcapKeyAndCompleteFreshUpsVerified":false,"upgradeAuthorizationVerified":false,"networkRequests":0,"financialOperations":0,"scope":"Exact frozen SDK type/bytecode decoding of captured public observations; necessary checks only. No schema conversion, dependency change or live acceptance."});
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&a[3])?;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.write_all(b"\n")?;file.sync_all()?;
 println!("{}",json!({"necessaryCompatibilityChecksPassed":compatible,"financialReady":false}));ensure!(compatible,"captured native protocol incompatible with selected SDK; report preserved; do not submit");Ok(())
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn selected_sdk_leaf_accepts_its_exact_serialized_schema(){let value=serde_json::to_value(PsyContractLeaf::<F>::default()).unwrap();assert_eq!(leaf_check(value)["ok"],true);}
 #[test]fn hash_owner_is_not_coerced_to_a_numeric_user_id(){let mut value=serde_json::to_value(PsyContractLeaf::<F>::default()).unwrap();value["deployer"]=json!("0".repeat(64));assert_eq!(leaf_check(value)["ok"],false);}
 #[test]fn rpc_errors_or_wrong_envelope_are_not_results(){for v in [json!({"jsonrpc":"2.0","id":1,"error":{"code":-1}}),json!({"jsonrpc":"2.0","id":2,"result":{}})]{assert!(envelope(&serde_json::to_vec(&v).unwrap()).is_err());}}
}
