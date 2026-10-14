//! Exact whole-stack SD-key authorization for U124 markets and NFT Marketplace.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::poseidon::PoseidonHash,iop::target::{BoolTarget,Target},plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig}};
use psy_client_data::dpn::sd_key::SDKeyConfig;
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use psy_config::network_constants::{DEFAULT_CALLER_CONTRACT_ID_U64,MAX_CONTRACT_STATE_TREE_HEIGHT};
use psy_ups_circuit::signature::sd_key::{SDKeyCircuitGadget,SDKeyTransactionInfoTargets};
use serde_json::Value;
fn eq(b:&mut CircuitBuilder<F,2>,when:BoolTarget,a:Target,e:Target){let difference=b.sub(a,e);let gated=b.mul(when.target,difference);let zero=b.zero();b.connect(gated,zero);}
pub fn build_policy(spec:&Value)->Result<SDKeyCircuitGadget>{
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
