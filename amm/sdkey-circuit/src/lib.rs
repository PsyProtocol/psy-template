//! AMM SD-key circuit. The generic wallet CLI only exposes an allowlist policy;
//! `pool_wallet` installs this custom circuit through the public wallet API.

use anyhow::Result;
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::{hash_types::HashOutTarget, poseidon::PoseidonHash},
    iop::target::{BoolTarget, Target},
    plonk::{circuit_builder::CircuitBuilder, circuit_data::CircuitConfig},
};
use psy_client_data::dpn::sd_key::SDKeyConfig;
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use psy_config::network_constants::{
    DEFAULT_CALLER_CONTRACT_ID_U64, MAX_CONTRACT_STATE_TREE_HEIGHT,
};
use psy_ups_circuit::signature::sd_key::{SDKeyCircuitGadget, SDKeyTransactionInfoTargets};

const NOOP: u32 = 4_004_276_495;
const SWAP: u32 = 1_634_808_186;
const REFUND_SWAP: u32 = 3_616_818_099;
const ADD: u32 = 2_000_651_428;
const REFUND_ADD: u32 = 1_328_436_134;
const REMOVE: u32 = 998_060_542;
const CANCEL_REMOVE: u32 = 3_910_193_554;
const CLAIM: u32 = 2_293_029_357;
const TRANSFER: u32 = 354_447_671;
const BURN: u32 = 2_923_993_647;
const GUTA_FEE: u64 = 1_000_000_000;
const DA_FEE: u64 = 1_000;
const MAX_DA_SLOTS: u64 = 100;

#[derive(Clone, Copy)]
struct ExpectedCall {
    contract_id: Target,
    method_id: Target,
    caller_contract_id: Target,
    inputs_length: Target,
    inputs_hash: HashOutTarget,
}

fn call(
    builder: &mut CircuitBuilder<F, 2>,
    contract_id: u64,
    method_id: u32,
    inputs: Vec<Target>,
) -> ExpectedCall {
    ExpectedCall {
        contract_id: builder.constant(F::from_canonical_u64(contract_id)),
        method_id: builder.constant(F::from_canonical_u64(method_id as u64)),
        caller_contract_id: builder.constant(F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64)),
        inputs_length: builder.constant(F::from_canonical_u64(inputs.len() as u64)),
        inputs_hash: builder.safe_hash_fixed_length::<PoseidonHash>(&inputs),
    }
}

fn guarded_equal(
    builder: &mut CircuitBuilder<F, 2>,
    when: BoolTarget,
    actual: Target,
    expected: Target,
) {
    let difference = builder.sub(actual, expected);
    let gated = builder.mul(when.target, difference);
    let zero = builder.zero();
    builder.connect(gated, zero);
}

fn match_call(
    builder: &mut CircuitBuilder<F, 2>,
    when: BoolTarget,
    actual: &SDKeyTransactionInfoTargets,
    expected: &ExpectedCall,
) {
    guarded_equal(builder, when, actual.contract_id, expected.contract_id);
    guarded_equal(builder, when, actual.method_id, expected.method_id);
    guarded_equal(
        builder,
        when,
        actual.caller_contract_id,
        expected.caller_contract_id,
    );
    guarded_equal(builder, when, actual.inputs_length, expected.inputs_length);
    for (a, e) in actual
        .inputs_hash
        .elements
        .iter()
        .zip(expected.inputs_hash.elements.iter())
    {
        guarded_equal(builder, when, *a, *e);
    }
}

fn branch_calls(
    builder: &mut CircuitBuilder<F, 2>,
    pool_contract_id: u64,
    branch: u64,
    fields: &[Target],
) -> Vec<ExpectedCall> {
    let payer = fields[1];
    let x = fields[2];
    let y = fields[3];
    let z = fields[4];
    let nonce = fields[5];
    let fee = fields[6];
    let psy = builder.zero();
    let usdt = builder.constant(F::from_canonical_u64(4));
    let mut calls = match branch {
        1 => vec![
            call(
                builder,
                pool_contract_id,
                SWAP,
                vec![payer, psy, x, y, nonce],
            ),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 4, TRANSFER, vec![payer, y]),
        ],
        2 => vec![
            call(
                builder,
                pool_contract_id,
                SWAP,
                vec![payer, usdt, x, y, nonce],
            ),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 4, CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, y]),
        ],
        3 => vec![
            call(builder, pool_contract_id, REFUND_SWAP, vec![payer, psy, x]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, x]),
        ],
        4 => vec![
            call(builder, pool_contract_id, REFUND_SWAP, vec![payer, usdt, x]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 4, CLAIM, vec![payer]),
            call(builder, 4, TRANSFER, vec![payer, x]),
        ],
        5 => vec![
            call(builder, pool_contract_id, ADD, vec![payer, x, y, z, nonce]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 4, CLAIM, vec![payer]),
        ],
        6 => vec![
            call(
                builder,
                pool_contract_id,
                REMOVE,
                vec![payer, x, y, z, nonce],
            ),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, y]),
            call(builder, 4, TRANSFER, vec![payer, z]),
        ],
        7 => vec![
            call(builder, pool_contract_id, REFUND_ADD, vec![payer, x, psy]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, x]),
        ],
        8 => vec![
            call(builder, pool_contract_id, REFUND_ADD, vec![payer, psy, y]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 4, CLAIM, vec![payer]),
            call(builder, 4, TRANSFER, vec![payer, y]),
        ],
        9 => vec![
            call(builder, pool_contract_id, REFUND_ADD, vec![payer, x, y]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 4, CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, x]),
            call(builder, 4, TRANSFER, vec![payer, y]),
        ],
        10 => vec![
            call(builder, pool_contract_id, CANCEL_REMOVE, vec![payer, nonce]),
            call(builder, 0, CLAIM, vec![payer]),
        ],
        _ => unreachable!(),
    };
    while calls.len() < 5 {
        calls.push(call(builder, pool_contract_id, NOOP, vec![]));
    }
    calls.push(call(builder, 0, BURN, vec![fee]));
    calls
}

/// Witness inputs: branch (1..10), payer, x, y, z, nonce, fee burn.
/// The guard method authenticates order state and the exact unpaid token delta.
pub fn build_amm_sd_key_circuit(pool_contract_id: u64) -> Result<SDKeyCircuitGadget> {
    let config = SDKeyConfig {
        num_introspectable_transactions: 6,
        can_read_state: false,
        contract_state_tree_height: MAX_CONTRACT_STATE_TREE_HEIGHT,
        requires_secp256k1: false,
        num_secp256k1_slots: 0,
    };
    let mut builder = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
    let mut gadget = SDKeyCircuitGadget::add_virtual_to(&mut builder, &config, 7);
    let fields = gadget.circuit_inputs.clone();
    let mut valid_branch = builder._false();
    for branch in 1..=10 {
        let branch_constant = builder.constant(F::from_canonical_u64(branch));
        let selected = builder.is_equal(fields[0], branch_constant);
        valid_branch = builder.or(valid_branch, selected);
        let expected = branch_calls(&mut builder, pool_contract_id, branch, &fields);
        for (actual, expected) in gadget
            .tx_introspection
            .tx_info_slots
            .iter()
            .zip(expected.iter())
        {
            match_call(&mut builder, selected, actual, expected);
        }
    }
    builder.assert_one(valid_branch.target);

    // The prover cannot turn the automatic network burn into a reserve drain:
    // it must be a GUTA base fee plus at most 100 DA slots, each at 1000 units.
    let mut valid_fee = builder._false();
    for slots in 0..=MAX_DA_SLOTS {
        let fee = builder.constant(F::from_canonical_u64(GUTA_FEE + slots * DA_FEE));
        let selected = builder.is_equal(fields[6], fee);
        valid_fee = builder.or(valid_fee, selected);
    }
    builder.assert_one(valid_fee.target);
    gadget.build_circuit(builder)?;
    Ok(gadget)
}

#[cfg(test)]
mod tests {
    use super::*;
    use plonky2::{
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
    use psy_config::PSY_NETWORK_MAGIC;
    use psy_crypto::hash::traits::qhashable::QFieldHashable;
    use psy_ups_circuit::signature::sd_key::compute_tx_stack_hash;

    #[test]
    fn method_ids_match_compiled_amm_abi() -> Result<()> {
        let abi: serde_json::Value =
            serde_json::from_str(include_str!("../../contract/target-pusdt-verified/abi.json"))?;
        let methods = abi["contract"]["methods"].as_array().expect("ABI methods");
        for (name, id) in [
            ("noop", NOOP),
            ("swap", SWAP),
            ("refund_unclaimed", REFUND_SWAP),
            ("add_liquidity", ADD),
            ("refund_add_unclaimed", REFUND_ADD),
            ("remove_liquidity", REMOVE),
            ("cancel_remove", CANCEL_REMOVE),
        ] {
            let actual = methods
                .iter()
                .find(|method| method["name"] == name)
                .expect("method exists");
            assert_eq!(
                actual["method_id"].as_u64(),
                Some(id as u64),
                "{name} method ID changed"
            );
        }
        Ok(())
    }

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

    fn refund_calls(recipient: u64) -> Vec<SDKeyTransactionInfo<F>> {
        vec![
            info(12, REFUND_SWAP, &[456, 0, 1_000]),
            info(0, CLAIM, &[456]),
            info(0, TRANSFER, &[recipient, 1_000]),
            info(12, NOOP, &[]),
            info(12, NOOP, &[]),
            info(0, BURN, &[1_000_010_000]),
        ]
    }

    fn usdt_swap_calls() -> Vec<SDKeyTransactionInfo<F>> {
        vec![
            info(12, SWAP, &[456, 4, 50, 1_000, 2]),
            info(0, CLAIM, &[456]),
            info(4, CLAIM, &[456]),
            info(0, TRANSFER, &[456, 1_000]),
            info(12, NOOP, &[]),
            info(0, BURN, &[1_000_010_000]),
        ]
    }

    fn lp_refund_calls() -> Vec<SDKeyTransactionInfo<F>> {
        vec![
            info(12, REFUND_ADD, &[456, 1_000, 2_000]),
            info(0, CLAIM, &[456]),
            info(4, CLAIM, &[456]),
            info(0, TRANSFER, &[456, 1_000]),
            info(4, TRANSFER, &[456, 2_000]),
            info(0, BURN, &[1_000_010_000]),
        ]
    }

    fn prove_operation(
        gadget: &SDKeyCircuitGadget,
        calls: &[SDKeyTransactionInfo<F>],
        inputs: [u64; 7],
    ) -> Result<()> {
        let user_leaf = PsyUserLeaf::<F> {
            user_id: F::from_canonical_u64(123),
            ..Default::default()
        };
        let mut end_user_leaf = user_leaf;
        end_user_leaf.nonce = F::ONE;
        let sig_data = PsyUserProvingSessionSignatureDataCompact {
            start_user_leaf_hash: user_leaf.qfhash::<PoseidonHash>(),
            end_user_leaf_hash: end_user_leaf.qfhash::<PoseidonHash>(),
            checkpoint_leaf_hash: QHashOut(HashOut::ZERO),
            tx_stack_hash: compute_tx_stack_hash(calls),
            tx_count: F::from_canonical_u64(6),
        };
        let sig_hash = sig_data
            .get_sig_action_for_user::<PoseidonHash>(
                PSY_NETWORK_MAGIC,
                F::from_canonical_u64(123),
                F::ONE,
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
        witness.set_target(gadget.tx_introspection.tx_count, F::from_canonical_u64(6))?;
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
    fn refund_proof_is_bound_to_original_payer() -> Result<()> {
        let gadget = build_amm_sd_key_circuit(12)?;
        let refund_inputs = [3, 456, 1_000, 0, 0, 0, 1_000_010_000];
        prove_operation(&gadget, &refund_calls(456), refund_inputs)?;
        assert!(prove_operation(&gadget, &refund_calls(789), refund_inputs).is_err());
        let mut extra_transfer = refund_calls(456);
        extra_transfer[3] = info(0, TRANSFER, &[789, 1]);
        assert!(prove_operation(&gadget, &extra_transfer, refund_inputs).is_err());
        let mut excessive_burn = refund_calls(456);
        excessive_burn[5] = info(0, BURN, &[1_000_101_000]);
        let mut excessive_inputs = refund_inputs;
        excessive_inputs[6] = 1_000_101_000;
        assert!(prove_operation(&gadget, &excessive_burn, excessive_inputs).is_err());

        prove_operation(
            &gadget,
            &usdt_swap_calls(),
            [2, 456, 50, 1_000, 0, 2, 1_000_010_000],
        )?;
        prove_operation(
            &gadget,
            &lp_refund_calls(),
            [9, 456, 1_000, 2_000, 0, 0, 1_000_010_000],
        )?;
        let cancelled = vec![
            info(12, CANCEL_REMOVE, &[456, 3]),
            info(0, CLAIM, &[456]),
            info(12, NOOP, &[]),
            info(12, NOOP, &[]),
            info(12, NOOP, &[]),
            info(0, BURN, &[1_000_010_000]),
        ];
        let cancel_inputs = [10, 456, 0, 0, 0, 3, 1_000_010_000];
        prove_operation(&gadget, &cancelled, cancel_inputs)?;
        let mut draining = cancelled.clone();
        draining[2] = info(0, TRANSFER, &[789, 1]);
        assert!(prove_operation(&gadget, &draining, cancel_inputs).is_err());
        let mut wrong_nonce = cancelled;
        wrong_nonce[0] = info(12, CANCEL_REMOVE, &[456, 4]);
        assert!(prove_operation(&gadget, &wrong_nonce, cancel_inputs).is_err());
        Ok(())
    }
}
