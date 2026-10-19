//! Exact whole-stack SD-key authorization for U124 markets and NFT Marketplace.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::poseidon::PoseidonHash,iop::target::{BoolTarget,Target},plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig}};
use psy_client_data::dpn::sd_key::SDKeyConfig;
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use psy_config::network_constants::{DEFAULT_CALLER_CONTRACT_ID_U64,MAX_CONTRACT_STATE_TREE_HEIGHT};
use psy_ups_circuit::signature::sd_key::{SDKeyCircuitGadget,SDKeyTransactionInfoTargets};
use serde_json::Value;
fn eq(b:&mut CircuitBuilder<F,2>,when:BoolTarget,a:Target,e:Target){let difference=b.sub(a,e);let gated=b.mul(when.target,difference);let zero=b.zero();b.connect(gated,zero);}
/// Reject malformed or noncanonical policy JSON before allocating targets.
/// The registered fingerprint still authenticates the exact accepted policy.
pub fn validate_policy_spec(spec: &Value) -> Result<()> {
 let count=spec["tx_count"].as_u64().unwrap_or(0);
 let market=spec["market"].as_str().unwrap_or("");
 ensure!(spec["version"]==1 && spec["witness_length"]==13,"unsupported policy version or witness length");
 ensure!((count==9 && ["amm","orderbook","bondingcurve","bounded_test_payer"].contains(&market)) || (count==10 && market=="nftmarket"),"unsupported policy market or call count");
 let branches=spec["branches"].as_array().ok_or_else(||anyhow::anyhow!("branches must be an array"))?;
 ensure!(!branches.is_empty() && branches.len()<=64,"invalid branch count");
 for (index,branch) in branches.iter().enumerate() {
  ensure!(branch["branch"].as_u64()==Some(index as u64+1),"branch IDs must be sequential and unique");
  let calls=branch["calls"].as_array().ok_or_else(||anyhow::anyhow!("branch calls must be an array"))?;
  ensure!(calls.len()==count as usize,"exact call count required");
  for call in calls {
   ensure!(call["contract_id"].as_u64().is_some_and(|id|id<16777216),"contract ID out of range");
   ensure!(call["method_id"].as_u64().is_some_and(|id|id<=u32::MAX as u64),"method ID out of range");
   let inputs=call["inputs"].as_array().ok_or_else(||anyhow::anyhow!("call inputs must be an array"))?;
   ensure!(inputs.len()<=128,"too many policy inputs");
   for input in inputs {
    let object=input.as_object().ok_or_else(||anyhow::anyhow!("input descriptor must be an object"))?;
    ensure!(object.len()==1,"input must have exactly one binding");
    if let Some(w)=object.get("witness") {ensure!(w.as_u64().is_some_and(|i|i<13),"witness index out of range");}
    else {
     let value=object.get("constant").and_then(Value::as_str).ok_or_else(||anyhow::anyhow!("decimal constant required"))?;
     ensure!(!value.is_empty() && value.bytes().all(|b|b.is_ascii_digit()) && (value=="0" || !value.starts_with('0')),"noncanonical decimal constant");
     let n=value.parse::<u64>()?;
     ensure!(n<18446744069414584321,"constant exceeds Goldilocks field");
    }
   }
  }
 }
 Ok(())
}

pub fn build_policy(spec:&Value)->Result<SDKeyCircuitGadget>{
 validate_policy_spec(spec)?;
 let count=spec["tx_count"].as_u64().unwrap_or(0);
 ensure!(spec["version"]==1 && (count==9||(count==10&&spec["market"]=="nftmarket")) && spec["witness_length"]==13,"unsupported policy");
 let config=SDKeyConfig{num_introspectable_transactions:count as u32,can_read_state:false,contract_state_tree_height:MAX_CONTRACT_STATE_TREE_HEIGHT,requires_secp256k1:false,num_secp256k1_slots:0};
 let mut b=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());let mut g=SDKeyCircuitGadget::add_virtual_to(&mut b,&config,13);let fields=g.circuit_inputs.clone();let count=b.constant(F::from_canonical_u64(count));b.connect(g.tx_introspection.tx_count,count);
 let mut valid=b._false();let branches=spec["branches"].as_array().ok_or_else(||anyhow::anyhow!("branches"))?;
 ensure!(!branches.is_empty(),"empty policy");
 for (i,branch) in branches.iter().enumerate(){ensure!(branch["branch"].as_u64()==Some(i as u64+1),"branch order");let id=b.constant(F::from_canonical_u64(i as u64+1));let selected=b.is_equal(fields[0],id);valid=b.or(valid,selected);let calls=branch["calls"].as_array().unwrap();ensure!(calls.len()==config.num_introspectable_transactions as usize,"exact call count required");
  for (actual,call) in g.tx_introspection.tx_info_slots.iter().zip(calls){let cid=b.constant(F::from_canonical_u64(call["contract_id"].as_u64().unwrap()));let method=b.constant(F::from_canonical_u64(call["method_id"].as_u64().unwrap()));let caller=b.constant(F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64));let mut inputs=Vec::new();for input in call["inputs"].as_array().unwrap(){if let Some(index)=input["witness"].as_u64(){ensure!(index<13,"witness index");inputs.push(fields[index as usize]);}else{inputs.push(b.constant(F::from_canonical_u64(input["constant"].as_str().unwrap().parse()?)));}}let length=b.constant(F::from_canonical_u64(inputs.len()as u64));let hash=b.safe_hash_fixed_length::<PoseidonHash>(&inputs);
   let a:&SDKeyTransactionInfoTargets=actual;eq(&mut b,selected,a.contract_id,cid);eq(&mut b,selected,a.method_id,method);eq(&mut b,selected,a.caller_contract_id,caller);eq(&mut b,selected,a.inputs_length,length);for(x,y)in a.inputs_hash.elements.iter().zip(hash.elements){eq(&mut b,selected,*x,y);}
  }
 }
 b.assert_one(valid.target);let mut valid_fee=b._false();for slots in 0..=100{let fee=b.constant(F::from_canonical_u64(1_000_000_000+slots*1000));let selected=b.is_equal(fields[12],fee);valid_fee=b.or(valid_fee,selected);}b.assert_one(valid_fee.target);g.build_circuit(b)?;Ok(g)
}


#[cfg(test)] mod validation_tests {
 use super::*;use serde_json::json;
 fn policy()->Value {json!({"version":1,"market":"amm","witness_length":13,"tx_count":9,"branches":[{"branch":1,"calls":vec![json!({"contract_id":42,"method_id":1,"inputs":[{"witness":1},{"constant":"0"}]} );9]}]})}
 #[test] fn malformed_policy_fails_without_panicking_or_allocating_a_circuit() {
  assert!(validate_policy_spec(&policy()).is_ok());
  let mut attacks=vec![Value::Null];
  for field in ["branches","tx_count","witness_length"] {let mut p=policy();p[field]=Value::Null;attacks.push(p);}
  for (field,value) in [("contract_id",json!(16777216u64)),("method_id",json!(4294967296u64)),("inputs",json!(null))] {let mut p=policy();p["branches"][0]["calls"][0][field]=value;attacks.push(p);}
  for input in [json!({"witness":13}),json!({"witness":-1}),json!({"constant":"18446744069414584321"}),json!({"constant":"-1"}),json!({"constant":"01"}),json!({"constant":1}),json!({"witness":1,"constant":"1"}),json!({})] {let mut p=policy();p["branches"][0]["calls"][0]["inputs"][0]=input;attacks.push(p);}
  for p in attacks {let result=std::panic::catch_unwind(||build_policy(&p));assert!(result.is_ok(),"malformed policy panicked");assert!(result.unwrap().is_err(),"malformed policy accepted");}
 }
}
