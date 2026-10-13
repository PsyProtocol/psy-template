use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::{hash_types::{HashOut},poseidon::PoseidonHash},iop::witness::{PartialWitness,WitnessWrite}};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{dpn::{proving_session::DPNProvingSessionCompactMethodCall,sd_key::SDKeyTransactionInfo},qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user::PsyUserLeaf,user_contract_state::SignContext}};
use psy_config::{PSY_NETWORK_MAGIC,network_constants::DEFAULT_CALLER_CONTRACT_ID_U64};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_ups_circuit::signature::sd_key::{compute_tx_stack_hash,SDKeyCircuitGadget};
use psy_template_u124_markets::policy::build_policy;
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

    fn prove_digest(
        gadget: &SDKeyCircuitGadget,
        calls: &[SDKeyTransactionInfo<F>],
        inputs: [u64; 13],
        attack: usize,
    ) -> Result<()> {
        let user_leaf = PsyUserLeaf::<F> {
            user_id: F::from_canonical_u64(123),
            ..Default::default()
        };
        let mut end_user_leaf = user_leaf;
        end_user_leaf.nonce = F::from_canonical_u64(if attack==2{2}else{1});
        if attack==4 {end_user_leaf.user_state_tree_root=QHashOut(HashOut{elements:[F::from_canonical_u64(7);4]});}
        let mut signed=calls.to_vec();if attack==1 {signed[0]=info(999,1,&[888]);}
        let sig_data = PsyUserProvingSessionSignatureDataCompact {
            start_user_leaf_hash: user_leaf.qfhash::<PoseidonHash>(),
            end_user_leaf_hash: end_user_leaf.qfhash::<PoseidonHash>(),
            checkpoint_leaf_hash: QHashOut(HashOut::ZERO),
            tx_stack_hash: compute_tx_stack_hash(&signed),
            tx_count: F::from_canonical_u64(if attack==3{8}else{9}),
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
        witness.set_hash_target(
            gadget.private_key,
            HashOut {
                elements: [F::ONE; 4],
            },
        )?;
        witness.set_hash_target(gadget.sig_hash, sig_hash.0)?;
        witness.set_hash_target(
            gadget.session_context.start_user_leaf_hash,
            user_leaf.qfhash::<PoseidonHash>().0,
        )?;
        witness.set_hash_target(gadget.session_context.checkpoint_leaf_hash, HashOut::ZERO)?;
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
        witness.set_target(gadget.checkpoint_id, F::ZERO)?;
        witness.set_target(gadget.user_id, F::from_canonical_u64(123))?;
        witness.set_target_arr(&gadget.circuit_inputs, &inputs.map(F::from_canonical_u64))?;
        witness.set_hash_target(
            gadget.tx_introspection.tx_stack_hash,
            compute_tx_stack_hash(calls).0,
        )?;
        witness.set_target(gadget.tx_introspection.tx_count, F::from_canonical_u64(9))?;
        for (slot, actual) in gadget
            .tx_introspection
            .tx_info_slots
            .iter()
            .zip(calls.iter())
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


fn prove_operation(g:&SDKeyCircuitGadget,c:&[SDKeyTransactionInfo<F>],i:[u64;13])->Result<()>{prove_digest(g,c,i,0)}

fn infos(sample:&Value)->Vec<SDKeyTransactionInfo<F>>{sample["calls"].as_array().unwrap().iter().map(|c|info(c["contract_id"].as_u64().unwrap(),c["method_id"].as_u64().unwrap()as u32,&c["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>())).collect()}
#[test]
fn all_three_sdkeys_bind_every_branch_payer_high_limb_assets_and_fee()->Result<()>{let root=std::env::var("U124_BUILD")?;
 for market in["amm","orderbook","bondingcurve"]{let spec:Value=serde_json::from_slice(&fs::read(format!("{root}/{market}/policy.json"))?)?;let samples:Value=serde_json::from_slice(&fs::read(format!("{root}/{market}/policy-samples.json"))?)?;let gadget=build_policy(&spec)?;
  for sample in samples.as_array().unwrap(){let fields:[u64;13]=sample["fields"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>().try_into().unwrap();prove_operation(&gadget,&infos(sample),fields)?;}
  let sample=samples.as_array().unwrap().iter().find(|s|s["calls"].as_array().unwrap().iter().any(|c|c["inputs"].as_array().unwrap().len()==3)).unwrap();let fields:[u64;13]=sample["fields"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>().try_into().unwrap();
  let transfer=sample["calls"].as_array().unwrap().iter().position(|c|c["inputs"].as_array().unwrap().len()==3).unwrap();
  for mutation in 0..4{let mut bad=sample.clone();match mutation{0=>bad["calls"][transfer]["inputs"][0]=999.into(),1=>{let high=bad["calls"][transfer]["inputs"][2].as_u64().unwrap();bad["calls"][transfer]["inputs"][2]=(high+1).into();},2=>bad["calls"][transfer]["contract_id"]=0.into(),_=>bad["calls"].as_array_mut().unwrap().swap(1,transfer)}assert!(prove_operation(&gadget,&infos(&bad),fields).is_err(),"{market} accepted malicious mutation {mutation}");}
  let mut bad=sample.clone();let mut inputs=fields;inputs[12]=1_000_101_000;bad["calls"][8]["inputs"][0]=inputs[12].into();assert!(prove_operation(&gadget,&infos(&bad),inputs).is_err());inputs=fields;inputs[0]=99;assert!(prove_operation(&gadget,&infos(sample),inputs).is_err());for attack in 1..=4 {assert!(prove_digest(&gadget,&infos(sample),fields,attack).is_err(),"{market} accepted forged digest {attack}");}println!("{market}: {} valid branches and ten adversarial proofs checked",samples.as_array().unwrap().len());
 }Ok(())}

#[test]
#[ignore = "requires explicit U124_BOOTSTRAP_PROOF fixture"]
fn curve_bootstrap_binds_seed_recipient_method_minimum_deadline_nonce_and_fee_donor()->Result<()> {
 let root=std::env::var("U124_BOOTSTRAP_PROOF")?;
 let spec:Value=serde_json::from_slice(&fs::read(format!("{root}/policy.json"))?)?;
 let sample:Value=serde_json::from_slice(&fs::read(format!("{root}/sample.json"))?)?;
 let fields:[u64;13]=sample["fields"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>().try_into().unwrap();
 let gadget=build_policy(&spec)?;
 prove_operation(&gadget,&infos(&sample),fields)?;
 // Each attack changes exactly one call in the same authorized branch.
 for (slot,input) in [(2,0),(3,0),(4,0),(5,0),(5,1),(6,0),(6,5),(6,7),(6,8)] {
  let mut bad=sample.clone();let old=bad["calls"][slot]["inputs"][input].as_u64().unwrap();
  bad["calls"][slot]["inputs"][input]=(old+1).into();
  assert!(prove_operation(&gadget,&infos(&bad),fields).is_err(),"bootstrap accepted modified call {slot} input {input}");
 }
 let mut bad=sample.clone();bad["calls"][6]["method_id"]=0.into();
 assert!(prove_operation(&gadget,&infos(&bad),fields).is_err(),"bootstrap accepted alternate AMM method");
 println!("bootstrap: full SD-key proof verified; ten recipient/method/fee/minimum/deadline/nonce mutations rejected");
 Ok(())
}

#[test]
#[ignore = "requires explicit U124_SANDBOX_PROOF"]
fn public_acceptance_payer_only_funds_fixed_markets_and_returns_to_fixed_funders()->Result<()> {
 let root=std::env::var("U124_SANDBOX_PROOF")?;
 let spec:Value=serde_json::from_slice(&fs::read(format!("{root}/policy.json"))?)?;
 let samples:Value=serde_json::from_slice(&fs::read(format!("{root}/policy-samples.json"))?)?;
 let gadget=build_policy(&spec)?;
 for sample in samples.as_array().unwrap(){let fields:[u64;13]=sample["fields"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>().try_into().unwrap();prove_operation(&gadget,&infos(sample),fields)?;}
 let sample=samples.as_array().unwrap().last().unwrap();
 let fields:[u64;13]=sample["fields"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>().try_into().unwrap();
 for slot in [1,2,3]{let mut bad=sample.clone();bad["calls"][slot]["inputs"][0]=999.into();assert!(prove_operation(&gadget,&infos(&bad),fields).is_err(),"sandbox accepted redirected return {slot}");}
 Ok(())
}
