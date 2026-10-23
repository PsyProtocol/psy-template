//! Experimental application key: retain all 40 canonical logical slots, but
//! authenticate only non-noop calls in the *actual* UPS stack. The base policy
//! binds every logical slot; its noops are not actual state transitions.
//! This is a new circuit/fingerprint and requires a new isolated vault.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::{hash_types::HashOut,poseidon::PoseidonHash},plonk::{circuit_builder::CircuitBuilder}};
use psy_client_data::dpn::sd_key::SDKeyConfig;
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use psy_config::{PSY_NETWORK_MAGIC,network_constants::DEFERRED_CALL_MAGIC};
use psy_network_circuit::{gadgets::qdata::user_contract_state::SignContextGadget,ups::gadgets::ups_signature_data::PsyUserProvingSessionSignatureDataCompactGadget};
use psy_ups_circuit::signature::sd_key::{SDKeyCircuitGadget,SDKeySessionContextTargets,SDKeyTransactionIntrospectionGadget,SDKeyTransactionInfoTargets,get_zk_public_key_param};
use serde_json::Value;

pub(crate) fn validate(spec:&Value)->Result<()>{
 crate::batch_policy::validate(spec)?;
 let mut descriptors=vec![&spec["begin"],&spec["finish"],&spec["burn"],&spec["expire"]];descriptors.extend(spec["commit"].as_array().unwrap());
 for op in spec["operations"].as_array().unwrap(){descriptors.extend(op["calls"].as_array().unwrap());}
 for call in descriptors{if call["contract_id"]==spec["noop"]["contract_id"]&&call["method_id"]==spec["noop"]["method_id"]{ensure!(call["method_name"]==spec["noop"]["method_name"]&&call["inputs"]==spec["noop"]["inputs"],"ambiguous noop identity");}}
 Ok(())
}
pub fn build(spec:&Value)->Result<SDKeyCircuitGadget>{validate(spec)?;crate::batch_policy::build_with_profile(spec,true)}
pub fn calls(spec:&Value,fields:&[u64])->Result<Vec<Value>>{
 let logical=crate::batch_policy::expected_calls(spec,fields)?;
 Ok(logical.into_iter().filter(|c|c["contract_id"]!=spec["noop"]["contract_id"]||c["method_name"]!=spec["noop"]["method_name"]).collect())
}

pub(crate) fn add_virtual_to(b:&mut CircuitBuilder<F,2>,cfg:&SDKeyConfig,spec:&Value)->Result<SDKeyCircuitGadget>{
 ensure!(cfg.num_introspectable_transactions==40&&!cfg.can_read_state&&!cfg.requires_secp256k1&&cfg.num_secp256k1_slots==0,"compact profile supports stack-only key");
 ensure!(spec["noop"]["inputs"].as_array().is_some_and(|a|a.is_empty())&&spec["noop"]["method_name"]=="noop","canonical zero-input noop required");
 let private_key=b.add_virtual_hash();let sig_hash=b.add_virtual_hash();let checkpoint_id=b.add_virtual_target();let user_id=b.add_virtual_target();
 let circuit_inputs=b.add_virtual_targets(crate::batch_policy::WIDTH);
 let tx_stack_hash=b.add_virtual_hash();let tx_count=b.add_virtual_target();let mut slots=Vec::new();
 let magic=b.constant(F::from_noncanonical_u64(DEFERRED_CALL_MAGIC));
 let noop_cid=b.constant(F::from_canonical_u64(spec["noop"]["contract_id"].as_u64().unwrap()));
 let noop_mid=b.constant(F::from_canonical_u64(spec["noop"]["method_id"].as_u64().unwrap()));
 let mut running=b.constant_hash(HashOut::ZERO);let mut count=b.zero();
 for _ in 0..40{
  let contract_id=b.add_virtual_target();let method_id=b.add_virtual_target();let caller_contract_id=b.add_virtual_target();let inputs_length=b.add_virtual_target();let inputs_hash=b.add_virtual_hash();
  let tx_hash=b.hash_n_to_hash_no_pad::<PoseidonHash>(vec![magic,caller_contract_id,contract_id,method_id,inputs_length,inputs_hash.elements[0],inputs_hash.elements[1],inputs_hash.elements[2],inputs_hash.elements[3]]);
  let cid=b.is_equal(contract_id,noop_cid);let mid=b.is_equal(method_id,noop_mid);let skip=b.and(cid,mid);let active=b.not(skip);
  // The base policy below binds the skipped slot's complete identity, caller,
  // zero arity and canonical input hash. No witness-selected arbitrary skip.
  let next=b.hash_two_to_one::<PoseidonHash>(running,tx_hash);
  running=plonky2::hash::hash_types::HashOutTarget{elements:std::array::from_fn(|i|b.select(active,next.elements[i],running.elements[i]))};
  count=b.add(count,active.target);
  slots.push(SDKeyTransactionInfoTargets{contract_id,method_id,caller_contract_id,inputs_length,inputs_hash,tx_hash});
 }
 b.connect_hashes(running,tx_stack_hash);b.connect(count,tx_count);
 let session_context=SDKeySessionContextTargets{start_user_leaf_hash:b.add_virtual_hash(),checkpoint_leaf_hash:b.add_virtual_hash(),sign_context:SignContextGadget::add_virtual_to(b),nonce:b.add_virtual_target()};
 let mut end=session_context.sign_context.user_leaf;end.nonce=session_context.nonce;
 let end_hash=end.to_hash::<PoseidonHash,F,2>(b);
 let data=PsyUserProvingSessionSignatureDataCompactGadget::new_from_known(session_context.start_user_leaf_hash,end_hash,session_context.checkpoint_leaf_hash,tx_stack_hash,tx_count);
 let expected=data.get_sig_action_with_user_info::<PoseidonHash,F,2>(b,PSY_NETWORK_MAGIC,user_id,session_context.nonce,&session_context.sign_context).sig_action_hash;
 b.connect_hashes(sig_hash,expected);b.connect(user_id,session_context.sign_context.user_leaf.user_id);b.connect(checkpoint_id,session_context.sign_context.user_leaf.last_checkpoint_id);
 let param=get_zk_public_key_param(b,&private_key);let public=b.hash_two_to_one::<PoseidonHash>(sig_hash,param);b.register_public_inputs(&public.elements);
 Ok(SDKeyCircuitGadget{config:cfg.clone(),tx_introspection:SDKeyTransactionIntrospectionGadget{tx_info_slots:slots,tx_stack_hash,tx_count},state_reader:None,secp256k1:None,circuit_inputs,private_key,sig_hash,session_context,checkpoint_id,user_id,circuit_data:None,minifier_chain:None})
}
