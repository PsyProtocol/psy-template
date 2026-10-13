//! Signature digest binding: a permitted introspection stack cannot authorize
//! a different actual UPS payload. Local synthetic session; no chain mutation.
use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::{hash_types::HashOut,poseidon::PoseidonHash},iop::witness::{PartialWitness,WitnessWrite}};
use psy_template_amm_sdkey::build_amm_sd_key_circuit;
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{dpn::{proving_session::DPNProvingSessionCompactMethodCall,sd_key::SDKeyTransactionInfo},qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user::PsyUserLeaf,user_contract_state::SignContext}};
use psy_config::{PSY_NETWORK_MAGIC,network_constants::DEFAULT_CALLER_CONTRACT_ID_U64};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_ups_circuit::signature::sd_key::compute_tx_stack_hash;
fn info(c:u64,m:u32,input:&[u64])->SDKeyTransactionInfo<F>{DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64),F::from_canonical_u64(c),F::from_canonical_u64(m as u64),&input.iter().copied().map(F::from_canonical_u64).collect::<Vec<_>>()).into()}
#[test]
fn large_refund_cannot_sign_redirected_stack_wrong_count_nonce_or_end_state()->Result<()>{
 let gadget=build_amm_sd_key_circuit(2000)?;
 let amount=50_000_000_000;
 let abi:serde_json::Value=serde_json::from_str(include_str!("../../contract/target-pusdt-verified/abi.json"))?;
 let id=|name:&str|abi["contract"]["methods"].as_array().unwrap().iter().find(|m|m["name"]==name).unwrap()["method_id"].as_u64().unwrap() as u32;
 let calls=vec![info(2000,id("refund_unclaimed"),&[456,0,amount]),info(0,2_293_029_357,&[456]),info(0,354_447_671,&[456,amount]),info(2000,id("noop"),&[]),info(2000,id("noop"),&[]),info(0,2_923_993_647,&[1_000_010_000])];
 let user=PsyUserLeaf::<F>{user_id:F::from_canonical_u64(123),..Default::default()};
 for attack in 0..5 {
  let mut signed_calls=calls.clone();if attack==1 {signed_calls[2]=info(0,354_447_671,&[789,amount]);}
  let mut end=user;end.nonce=F::from_canonical_u64(if attack==2 {2}else{1});
  if attack==4 {end.user_state_tree_root=QHashOut(HashOut{elements:[F::from_canonical_u64(7);4]});}
  let signature=PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:user.qfhash::<PoseidonHash>(),end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:QHashOut(HashOut::ZERO),tx_stack_hash:compute_tx_stack_hash(&signed_calls),tx_count:F::from_canonical_u64(if attack==3 {5}else{6})};
  let digest=signature.get_sig_action_for_user::<PoseidonHash>(PSY_NETWORK_MAGIC,F::from_canonical_u64(123),end.nonce,SignContext::new(QHashOut(HashOut::ZERO),user)).get_qhash::<PoseidonHash>();
  let mut pw=PartialWitness::new();pw.set_hash_target(gadget.private_key,HashOut{elements:[F::ONE;4]})?;pw.set_hash_target(gadget.sig_hash,digest.0)?;
  pw.set_hash_target(gadget.session_context.start_user_leaf_hash,user.qfhash::<PoseidonHash>().0)?;pw.set_hash_target(gadget.session_context.checkpoint_leaf_hash,HashOut::ZERO)?;pw.set_hash_target(gadget.session_context.sign_context.checkpoint_tree_root,HashOut::ZERO)?;gadget.session_context.sign_context.user_leaf.set_witness(&mut pw,&user)?;pw.set_target(gadget.session_context.nonce,F::ONE)?;
  pw.set_target(gadget.checkpoint_id,F::ZERO)?;pw.set_target(gadget.user_id,F::from_canonical_u64(123))?;
  pw.set_target_arr(&gadget.circuit_inputs,&[3,456,amount,0,0,0,1_000_010_000].map(F::from_canonical_u64))?;
  pw.set_hash_target(gadget.tx_introspection.tx_stack_hash,compute_tx_stack_hash(&calls).0)?;pw.set_target(gadget.tx_introspection.tx_count,F::from_canonical_u64(6))?;
  for (slot,call) in gadget.tx_introspection.tx_info_slots.iter().zip(&calls){pw.set_target(slot.contract_id,call.contract_id)?;pw.set_target(slot.method_id,call.method_id)?;pw.set_target(slot.caller_contract_id,call.caller_contract_id)?;pw.set_target(slot.inputs_length,call.inputs_length)?;pw.set_hash_target(slot.inputs_hash,call.inputs_hash.0)?;}
  let circuit=gadget.circuit_data.as_ref().unwrap();let proof=circuit.prove(pw);
  if attack==0 {circuit.verify(proof?)?;} else {assert!(proof.is_err(),"digest attack {attack} accepted");}
 }
 Ok(())
}
