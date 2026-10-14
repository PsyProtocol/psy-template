use anyhow::Result;
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::{hash_types::HashOut, poseidon::PoseidonHash},
    iop::witness::{PartialWitness, WitnessWrite},
};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{
    dpn::{proving_session::DPNProvingSessionCompactMethodCall, sd_key::SDKeyTransactionInfo},
    qdata::{
        ups_signature::PsyUserProvingSessionSignatureDataCompact, user::PsyUserLeaf,
        user_contract_state::SignContext,
    },
};
use psy_config::{network_constants::DEFAULT_CALLER_CONTRACT_ID_U64, PSY_NETWORK_MAGIC};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_template_token_wide_private::test_policy::{build, TestPolicy};
use psy_ups_circuit::signature::sd_key::{compute_tx_stack_hash, SDKeyCircuitGadget};
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
    inputs: [u64; 154],
    attack: usize,
) -> Result<()> {
    let user_leaf = PsyUserLeaf::<F> {
        user_id: F::from_canonical_u64(123),
        ..Default::default()
    };
    let mut end_user_leaf = user_leaf;
    end_user_leaf.nonce = F::from_canonical_u64(if attack == 2 { 2 } else { 1 });
    if attack == 4 {
        end_user_leaf.user_state_tree_root = QHashOut(HashOut {
            elements: [F::from_canonical_u64(7); 4],
        });
    }
    let mut signed = calls.to_vec();
    if attack == 1 {
        signed[0] = info(999, 1, &[888]);
    }
    let sig_data = PsyUserProvingSessionSignatureDataCompact {
        start_user_leaf_hash: user_leaf.qfhash::<PoseidonHash>(),
        end_user_leaf_hash: end_user_leaf.qfhash::<PoseidonHash>(),
        checkpoint_leaf_hash: QHashOut(HashOut::ZERO),
        tx_stack_hash: compute_tx_stack_hash(&signed),
        tx_count: F::from_canonical_u64(if attack == 3 {
            calls.len() as u64 - 1
        } else {
            calls.len() as u64
        }),
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
    witness.set_target(
        gadget.tx_introspection.tx_count,
        F::from_canonical_u64(calls.len() as u64),
    )?;
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

#[test]
fn public_test_policy_binds_all_calls_and_cannot_transfer_native_psy() -> Result<()> {
    let spec = TestPolicy {
        token_id: 42,
        issuer: 5,
        role: 1,
        native_claim: 100,
        ft_claim: 101,
        private_transfer: 102,
        private_claim: 103,
        public_transfer: 104,
    };
    let g = build(&spec)?;
    for (branch, cid, mid, length) in [
        (1, 0, 100, 1),
        (2, 42, 101, 1),
        (3, 42, 102, 14),
        (4, 42, 103, 151),
        (5, 42, 104, 3),
    ] {
        let mut args: Vec<u64> = (1..=length).collect();
        if branch == 5 {
            args[0] = 5;
        }
        let calls = vec![info(cid, mid, &args), info(0, 2923993647, &[1000000000])];
        let mut witness = [0; 154];
        witness[0] = branch;
        witness[1..1 + args.len()].copy_from_slice(&args);
        witness[152] = 1000000000;
        witness[153] = 1;
        prove_digest(&g, &calls, witness, 0)?;
        for attack in 1..=4 {
            assert!(prove_digest(&g, &calls, witness, attack).is_err());
        }
        let mut wrong = calls.clone();
        wrong[1] = info(0, 2923993647, &[1000100001]);
        assert!(prove_digest(&g, &wrong, witness, 0).is_err());
        let mut wrong = calls.clone();
        wrong[0] = info(0, 999, &[777, 123]);
        assert!(prove_digest(&g, &wrong, witness, 0).is_err());
    }
    Ok(())
}

#[test]
fn receiver_identity_has_a_distinct_enforced_fee_cap() -> Result<()> {
    let sender = TestPolicy {
        token_id: 42,
        issuer: 5,
        role: 1,
        native_claim: 100,
        ft_claim: 101,
        private_transfer: 102,
        private_claim: 103,
        public_transfer: 104,
    };
    let receiver = TestPolicy {
        role: 2,
        ..sender.clone()
    };
    let a = build(&sender)?;
    let b = build(&receiver)?;
    assert_ne!(a.get_fingerprint(), b.get_fingerprint());
    let mut witness = [0; 154];
    witness[0] = 1;
    witness[1] = 456;
    witness[153] = 2;
    for fee in [1_000_000_000, 1_000_099_000, 1_000_100_000] {
        witness[152] = fee;
        let calls = [info(0, 100, &[456]), info(0, 2923993647, &[fee])];
        assert_eq!(
            prove_digest(&b, &calls, witness, 0).is_ok(),
            fee <= 1_000_099_000
        );
    }
    Ok(())
}
