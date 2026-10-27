use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::{hash_types::{HashOut},poseidon::PoseidonHash},iop::witness::{PartialWitness,WitnessWrite}};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{dpn::{proving_session::DPNProvingSessionCompactMethodCall,sd_key::SDKeyTransactionInfo},qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user::PsyUserLeaf,user_contract_state::SignContext}};
use psy_config::{PSY_NETWORK_MAGIC,network_constants::DEFAULT_CALLER_CONTRACT_ID_U64};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_template_u124_markets::market_key::{compute_tx_stack_hash,SDKeyCircuitGadget};
use psy_template_u124_markets::batch_policy::{build,expected_calls};
use serde_json::Value;
use std::fs;
    fn info(contract: u64, method: u32, inputs: &[u64]) -> SDKeyTransactionInfo<F> {
        DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(
            F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64),
            F::from_canonical_u64(contract),
            F::from_canonical_u64(method as u64),
            &inputs
                .iter()
                .copied()
                .map(F::from_canonical_u64)
                .collect::<Vec<_>>(),
        )
        .into()
    }

    fn prove_stacks(
        gadget: &SDKeyCircuitGadget,
        logical: &[SDKeyTransactionInfo<F>],
        actual: &[SDKeyTransactionInfo<F>],
        inputs: Vec<u64>,
        attack: usize,
    ) -> Result<()> {
        let user_leaf = PsyUserLeaf::<F> {
            user_id: F::from_canonical_u64(123),
            ..Default::default()
        };
        let mut end_user_leaf = user_leaf;
        end_user_leaf.nonce = F::from_canonical_u64(if attack==2{2}else{1});
        if attack==4 {end_user_leaf.user_state_tree_root=QHashOut(HashOut{elements:[F::from_canonical_u64(7);4]});}
        let mut signed=actual.to_vec();if attack==1 {signed[0]=info(999,1,&[888]);}
        let sig_data = PsyUserProvingSessionSignatureDataCompact {
            start_user_leaf_hash: user_leaf.qfhash::<PoseidonHash>(),
            end_user_leaf_hash: end_user_leaf.qfhash::<PoseidonHash>(),
            checkpoint_leaf_hash: QHashOut(HashOut::ZERO),
            tx_stack_hash: compute_tx_stack_hash(&signed),
            tx_count: F::from_canonical_u64(if attack==3{actual.len() as u64-1}else{actual.len() as u64}),
        };
        let sig_hash = sig_data
            .get_sig_action_for_user::<PoseidonHash>(
                PSY_NETWORK_MAGIC,
                F::from_canonical_u64(123),
                end_user_leaf.nonce,
                SignContext::new(QHashOut(HashOut::ZERO), user_leaf),
            )
            .get_qhash::<PoseidonHash>();
        let mut witness = PartialWitness::<F>::new();
        gadget.session_context.start_user_leaf.set_witness(&mut witness,&user_leaf)?;
        witness.set_hash_target(
            gadget.private_key,
            HashOut {
                elements: [F::ONE; 4],
            },
        )?;
        witness.set_hash_target(gadget.sig_hash, sig_hash.0)?;
        witness.set_hash_target(
            gadget.session_context.start_user_leaf_hash,
            if attack==7 {HashOut{elements:[F::from_canonical_u64(7);4]}}else{user_leaf.qfhash::<PoseidonHash>().0},
        )?;
        witness.set_hash_target(gadget.session_context.checkpoint_leaf_hash, if attack==8 {HashOut{elements:[F::from_canonical_u64(7);4]}}else{HashOut::ZERO})?;
        witness.set_hash_target(
            gadget.session_context.sign_context.checkpoint_tree_root,
            HashOut::ZERO,
        )?;
        gadget
            .session_context
            .sign_context
            .user_leaf
            .set_witness(&mut witness, &user_leaf)?;
        witness.set_target(gadget.session_context.nonce, F::ONE)?;
        witness.set_target(gadget.checkpoint_id, if attack==5 {F::ONE}else{F::ZERO})?;
        witness.set_target(gadget.user_id, F::from_canonical_u64(if attack==6 {124}else{123}))?;
        witness.set_target_arr(&gadget.circuit_inputs, &inputs.iter().copied().map(F::from_canonical_u64).collect::<Vec<_>>())?;
        witness.set_hash_target(
            gadget.tx_introspection.tx_stack_hash,
            compute_tx_stack_hash(actual).0,
        )?;
        witness.set_target(gadget.tx_introspection.tx_count, F::from_canonical_u64(actual.len() as u64))?;
        for (slot, actual) in gadget
            .tx_introspection
            .tx_info_slots
            .iter()
            .zip(logical.iter())
        {
            witness.set_target(slot.contract_id, actual.contract_id)?;
            witness.set_target(slot.method_id, actual.method_id)?;
            witness.set_target(slot.caller_contract_id, actual.caller_contract_id)?;
            witness.set_target(slot.inputs_length, actual.inputs_length)?;
            witness.set_hash_target(slot.inputs_hash, actual.inputs_hash.0)?;
        }
        let circuit = gadget.circuit_data.as_ref().expect("built circuit");
        let proof = circuit.prove(witness)?;
        circuit.verify(proof)?;
        Ok(())
    }



fn prove_digest(gadget:&SDKeyCircuitGadget,calls:&[SDKeyTransactionInfo<F>],inputs:Vec<u64>,attack:usize)->Result<()>{prove_stacks(gadget,calls,calls,inputs,attack)}

fn canonical_operation(op:&Value)->Vec<u64>{let mut v=vec![0;13];v[0]=op["branch"].as_u64().unwrap();for c in op["calls"].as_array().unwrap(){for a in c["inputs"].as_array().unwrap(){if let Some(i)=a["witness"].as_u64(){v[i as usize]=100+i;}}}v}
fn calls(spec:&Value,f:&[u64])->Result<Vec<SDKeyTransactionInfo<F>>>{let all=spec["branches"].as_array().unwrap().iter().flat_map(|b|b["calls"].as_array().unwrap()).chain(std::iter::once(&spec["noop"])).chain(std::iter::once(&spec["expire"])).collect::<Vec<_>>();expected_calls(spec,f)?.iter().map(|c|{let d=all.iter().find(|d|d["contract_id"]==c["contract_id"]&&d["method_name"]==c["method_name"]).unwrap();Ok(info(c["contract_id"].as_u64().unwrap(),d["method_id"].as_u64().unwrap()as u32,&c["inputs"].as_array().unwrap().iter().map(|x|x.as_u64().unwrap()).collect::<Vec<_>>()))}).collect()}
#[test]
fn four_batch_keys_prove_every_operation_and_reject_stack_substitution()->Result<()>{let root=std::env::var("BATCH_BUILD")?;
 for market in["amm","orderbook","bondingcurve","nftmarket"]{let spec:Value=serde_json::from_slice(&fs::read(format!("{root}/{market}/policy.json"))?)?;let g=build(&spec)?;let ops=spec["operations"].as_array().unwrap();let mut samples=vec![];
  let mut commit=vec![0;74];commit[0]=1;commit[1]=1;commit[2]=2;commit[3]=120;commit[4]=300;commit[5]=200;commit[6]=201;commit[9]=1;commit[10]=2;commit[73]=1_000_000_000;samples.push(commit);
  let mut expire=vec![0;74];expire[0]=3;expire[1]=1;expire[73]=1_000_000_000;samples.push(expire);
  let trading=ops.iter().filter(|o|o["maintenance"]==false).collect::<Vec<_>>();for group in trading.chunks(4){let mut v=vec![0;74];v[0]=2;v[1]=1;v[13..17].copy_from_slice(&[1u64<<63,17,3,4]);v[73]=1_000_000_000;for(i,o)in group.iter().enumerate(){v[21+i*13..34+i*13].copy_from_slice(&canonical_operation(o));}samples.push(v);}
  for o in ops.iter().filter(|o|o["maintenance"]==true){let mut v=vec![0;74];v[0]=4;v[21..34].copy_from_slice(&canonical_operation(o));v[73]=1_000_000_000;samples.push(v);}
  for v in &samples{prove_digest(&g,&calls(&spec,v)?,v.clone(),0)?;}
  let v=samples[2].clone();let normal=calls(&spec,&v)?;
  for slot in[0,1,2,8,9,10,19,28,37,38,39]{let mut bad=normal.clone();bad[slot]=info(999,1,&[888]);assert!(prove_digest(&g,&bad,v.clone(),0).is_err(),"accepted slot {slot}");}
  for attack in 1..=4{assert!(prove_digest(&g,&normal,v.clone(),attack).is_err());}
  let mut reordered=normal.clone();reordered.swap(1,2);assert!(prove_digest(&g,&reordered,v.clone(),0).is_err());
  let mut unused=v.clone();unused[2]=1;assert!(expected_calls(&spec,&unused).is_err());assert!(prove_digest(&g,&normal,unused,0).is_err());
  let mut extra=normal.clone();extra.push(info(1000,1082945337,&[]));assert!(prove_digest(&g,&extra,v.clone(),0).is_err());
  let mut caller=normal.clone();caller[1].caller_contract_id=F::from_canonical_u64(999);assert!(prove_digest(&g,&caller,v.clone(),0).is_err());
  let mut fee=v.clone();fee[73]=1_000_101_000;assert!(expected_calls(&spec,&fee).is_err());assert!(prove_digest(&g,&normal,fee,0).is_err());
  println!("BATCH_KEY {market}: {} positive stacks; stack, caller, hash, length, header, and fee attacks rejected",samples.len());
 }Ok(())}

// New-key operation: positive compact seven-call binding plus cryptographic
// constraint failures. No coordinator or network admission is implied.
#[test]
fn compact_bulk_four_binds_stack_and_session_and_rejects_mutations()->Result<()>{
 let root=std::env::var("BATCH_BUILD")?;
 for market in ["amm","orderbook","bondingcurve","nftmarket"]{
  let spec:Value=serde_json::from_slice(&fs::read(format!("{root}/{market}/policy.json"))?)?;
  let g=psy_template_u124_markets::batch_compact::build(&spec)?;
  let op=spec["operations"].as_array().unwrap().iter().find(|op|op["name"]=="admit_entries_4").ok_or_else(||anyhow::anyhow!("explicit bulk policy required"))?;
  let mut v=vec![0;74];v[0]=4;v[21]=op["branch"].as_u64().unwrap();v[22]=300;v[73]=1_000_000_000;
  for i in 0..4 {v[23+2*i]=200+i as u64;v[24+2*i]=1;}
  let logical=calls(&spec,&v)?;let noop_cid=F::from_canonical_u64(spec["noop"]["contract_id"].as_u64().unwrap());let noop_mid=F::from_canonical_u64(spec["noop"]["method_id"].as_u64().unwrap());
  let actual=logical.iter().filter(|c|c.contract_id!=noop_cid||c.method_id!=noop_mid).copied().collect::<Vec<_>>();assert_eq!(actual.len(),7);prove_stacks(&g,&logical,&actual,v.clone(),0)?;
  for attack in 1..=8{assert!(prove_stacks(&g,&logical,&actual,v.clone(),attack).is_err(),"session/hash mutation {market}/{attack}");}
  for slot in [0,1,2,3,6,7,19,37,38,39]{let mut bad=logical.clone();bad[slot]=info(999,1,&[888]);assert!(prove_stacks(&g,&bad,&actual,v.clone(),0).is_err(),"logical slot {market}/{slot}");}
  let mut skipped=logical.clone();let slot=skipped.iter().position(|c|c.contract_id==noop_cid&&c.method_id==noop_mid).unwrap();skipped[slot].caller_contract_id=F::from_canonical_u64(999);assert!(prove_stacks(&g,&skipped,&actual,v.clone(),0).is_err(),"noncanonical skipped caller");
  let mut missing=actual.clone();missing.remove(3);assert!(prove_stacks(&g,&logical,&missing,v.clone(),0).is_err());
  let mut reordered=actual.clone();reordered.swap(2,3);assert!(prove_stacks(&g,&logical,&reordered,v.clone(),0).is_err());
  let mut duplicate=actual.clone();duplicate[3]=duplicate[2];assert!(prove_stacks(&g,&logical,&duplicate,v.clone(),0).is_err());
  let mut extra=actual.clone();extra.push(info(spec["noop"]["contract_id"].as_u64().unwrap(),spec["noop"]["method_id"].as_u64().unwrap()as u32,&[]));assert!(prove_stacks(&g,&logical,&extra,v.clone(),0).is_err());
  let mut padding=v.clone();padding[31]=1;assert!(prove_stacks(&g,&logical,&actual,padding,0).is_err());
  let mut fee=v.clone();fee[73]=1_000_101_000;assert!(prove_stacks(&g,&logical,&actual,fee,0).is_err());
  println!("COMPACT_BULK_KEY {market}: 7-call positive; signed stack/hash/count, nonce/user/checkpoints/end-state, every active/skipped slot, noncanonical caller, omission/reorder/duplicate/extra, padding and fee mutations rejected");
 }Ok(())
}
