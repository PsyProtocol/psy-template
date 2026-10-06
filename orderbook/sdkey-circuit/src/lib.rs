//! Whole-transaction authorization for the public PSY/pUSDT orderbook escrow.

use anyhow::Result;
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::{hash_types::HashOutTarget, poseidon::PoseidonHash},
    iop::target::{BoolTarget, Target},
    plonk::{circuit_builder::CircuitBuilder, circuit_data::CircuitConfig},
};
use psy_client_data::dpn::sd_key::SDKeyConfig;
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use psy_config::network_constants::{DEFAULT_CALLER_CONTRACT_ID_U64, MAX_CONTRACT_STATE_TREE_HEIGHT};
use psy_ups_circuit::signature::sd_key::{SDKeyCircuitGadget, SDKeyTransactionInfoTargets};

const NOOP: u32 = 1_137_470_087;
const MATCH: u32 = 756_590_181;
const CANCEL_PSY: u32 = 2_639_550_737;
const CANCEL_USDT: u32 = 1_889_565_739;
const CLAIM: u32 = 2_293_029_357;
const TRANSFER: u32 = 354_447_671;
const BURN: u32 = 2_923_993_647;
const FEE_ESCROW: u64 = 1_000_100_000;

#[derive(Clone, Copy)]
struct ExpectedCall {
    contract_id: Target,
    method_id: Target,
    caller_contract_id: Target,
    inputs_length: Target,
    inputs_hash: HashOutTarget,
}

fn call(builder: &mut CircuitBuilder<F, 2>, contract_id: u64, method_id: u32, inputs: Vec<Target>) -> ExpectedCall {
    ExpectedCall {
        contract_id: builder.constant(F::from_canonical_u64(contract_id)),
        method_id: builder.constant(F::from_canonical_u64(method_id as u64)),
        caller_contract_id: builder.constant(F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64)),
        inputs_length: builder.constant(F::from_canonical_u64(inputs.len() as u64)),
        inputs_hash: builder.safe_hash_fixed_length::<PoseidonHash>(&inputs),
    }
}

fn guarded_equal(builder: &mut CircuitBuilder<F, 2>, when: BoolTarget, actual: Target, expected: Target) {
    let difference = builder.sub(actual, expected);
    let gated = builder.mul(when.target, difference);
    let zero = builder.zero();
    builder.connect(gated, zero);
}

fn match_call(builder: &mut CircuitBuilder<F, 2>, when: BoolTarget, actual: &SDKeyTransactionInfoTargets, expected: &ExpectedCall) {
    guarded_equal(builder, when, actual.contract_id, expected.contract_id);
    guarded_equal(builder, when, actual.method_id, expected.method_id);
    guarded_equal(builder, when, actual.caller_contract_id, expected.caller_contract_id);
    guarded_equal(builder, when, actual.inputs_length, expected.inputs_length);
    for (a, e) in actual.inputs_hash.elements.iter().zip(expected.inputs_hash.elements.iter()) {
        guarded_equal(builder, when, *a, *e);
    }
}

fn branch_calls(builder: &mut CircuitBuilder<F, 2>, contract_id: u64, branch: u64, fields: &[Target]) -> Vec<ExpectedCall> {
    let psy_seller = fields[1];
    let usdt_seller = fields[2];
    let amount_psy = fields[3];
    let amount_usdt = fields[4];
    let psy_nonce = fields[5];
    let usdt_nonce = fields[6];
    let fee = fields[7];
    let fee_escrow = builder.constant(F::from_canonical_u64(FEE_ESCROW));
    let psy_to_usdt_seller = builder.add(amount_psy, fee_escrow);

    let mut calls = match branch {
        1 => vec![
            call(builder, contract_id, MATCH, vec![psy_seller, usdt_seller, amount_psy, amount_usdt, psy_nonce, usdt_nonce]),
            call(builder, 0, CLAIM, vec![psy_seller]),
            call(builder, 0, CLAIM, vec![usdt_seller]),
            call(builder, 4, CLAIM, vec![usdt_seller]),
            call(builder, 0, TRANSFER, vec![usdt_seller, psy_to_usdt_seller]),
            call(builder, 4, TRANSFER, vec![psy_seller, amount_usdt]),
        ],
        2 => vec![
            call(builder, contract_id, CANCEL_PSY, vec![psy_seller, amount_psy, psy_nonce]),
            call(builder, 0, CLAIM, vec![psy_seller]),
            call(builder, 0, TRANSFER, vec![psy_seller, amount_psy]),
        ],
        3 => vec![
            call(builder, contract_id, CANCEL_USDT, vec![psy_seller, amount_psy, psy_nonce]),
            call(builder, 0, CLAIM, vec![psy_seller]),
            call(builder, 4, CLAIM, vec![psy_seller]),
            call(builder, 4, TRANSFER, vec![psy_seller, amount_psy]),
        ],
        _ => unreachable!(),
    };
    while calls.len() < 6 {
        calls.push(call(builder, contract_id, NOOP, vec![]));
    }
    calls.push(call(builder, 0, BURN, vec![fee]));
    calls
}

/// Inputs: branch, PSY seller/seller, pUSDT seller/zero, PSY amount/sell
/// amount, pUSDT amount/zero, PSY nonce/nonce, pUSDT nonce/zero, fee burn.
/// The contract guard authenticates order state, cumulative payments, and
/// price crossing; this circuit binds the exact token calls and recipients.
pub fn build_orderbook_sd_key_circuit(contract_id: u64) -> Result<SDKeyCircuitGadget> {
    let config = SDKeyConfig {
        num_introspectable_transactions: 7,
        can_read_state: false,
        contract_state_tree_height: MAX_CONTRACT_STATE_TREE_HEIGHT,
        requires_secp256k1: false,
        num_secp256k1_slots: 0,
    };
    let mut builder = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
    let mut gadget = SDKeyCircuitGadget::add_virtual_to(&mut builder, &config, 8);
    let fields = gadget.circuit_inputs.clone();
    let mut valid_branch = builder._false();
    for branch in 1..=3 {
        let branch_constant = builder.constant(F::from_canonical_u64(branch));
        let selected = builder.is_equal(fields[0], branch_constant);
        valid_branch = builder.or(valid_branch, selected);
        let expected = branch_calls(&mut builder, contract_id, branch, &fields);
        for (actual, expected) in gadget.tx_introspection.tx_info_slots.iter().zip(expected.iter()) {
            match_call(&mut builder, selected, actual, expected);
        }
    }
    builder.assert_one(valid_branch.target);

    let mut valid_fee = builder._false();
    for slots in 0..=100_u64 {
        let value = builder.constant(F::from_canonical_u64(1_000_000_000 + slots * 1_000));
        let selected = builder.is_equal(fields[7], value);
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
    fn method_ids_match_compiled_orderbook_abi() -> Result<()> {
        let abi: serde_json::Value = serde_json::from_str(include_str!("../../contract/target/abi.json"))?;
        let methods = abi["contract"]["methods"].as_array().expect("ABI methods");
        for (name, id) in [("noop", NOOP), ("match_orders", MATCH), ("cancel_psy_order", CANCEL_PSY), ("cancel_usdt_order", CANCEL_USDT)] {
            let actual = methods.iter().find(|method| method["name"] == name).expect("method exists");
            assert_eq!(actual["method_id"].as_u64(), Some(id as u64), "{name} method ID changed");
        }
        Ok(())
    }

    fn info(contract: u64, method: u32, inputs: &[u64]) -> SDKeyTransactionInfo<F> {
        DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(
            F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64),
            F::from_canonical_u64(contract),
            F::from_canonical_u64(method as u64),
            &inputs.iter().copied().map(F::from_canonical_u64).collect::<Vec<_>>(),
        ).into()
    }

    fn prove_operation(gadget: &SDKeyCircuitGadget, calls: &[SDKeyTransactionInfo<F>], inputs: [u64; 8]) -> Result<()> {
        let user_leaf = PsyUserLeaf::<F> { user_id: F::from_canonical_u64(123), ..Default::default() };
        let mut end_user_leaf = user_leaf;
        end_user_leaf.nonce = F::ONE;
        let sig_data = PsyUserProvingSessionSignatureDataCompact {
            start_user_leaf_hash: user_leaf.qfhash::<PoseidonHash>(),
            end_user_leaf_hash: end_user_leaf.qfhash::<PoseidonHash>(),
            checkpoint_leaf_hash: QHashOut(HashOut::ZERO),
            tx_stack_hash: compute_tx_stack_hash(calls),
            tx_count: F::from_canonical_u64(7),
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
        witness.set_hash_target(gadget.private_key, HashOut { elements: [F::from_canonical_u64(2); 4] })?;
        witness.set_hash_target(gadget.sig_hash, sig_hash.0)?;
        witness.set_hash_target(gadget.session_context.start_user_leaf_hash, user_leaf.qfhash::<PoseidonHash>().0)?;
        witness.set_hash_target(gadget.session_context.checkpoint_leaf_hash, HashOut::ZERO)?;
        witness.set_hash_target(gadget.session_context.sign_context.checkpoint_tree_root, HashOut::ZERO)?;
        gadget.session_context.sign_context.user_leaf.set_witness(&mut witness, &user_leaf)?;
        witness.set_target(gadget.session_context.nonce, F::ONE)?;
        witness.set_target(gadget.checkpoint_id, F::ZERO)?;
        witness.set_target(gadget.user_id, F::from_canonical_u64(123))?;
        witness.set_target_arr(&gadget.circuit_inputs, &inputs.map(F::from_canonical_u64))?;
        witness.set_hash_target(gadget.tx_introspection.tx_stack_hash, compute_tx_stack_hash(calls).0)?;
        witness.set_target(gadget.tx_introspection.tx_count, F::from_canonical_u64(7))?;
        for (slot, actual) in gadget.tx_introspection.tx_info_slots.iter().zip(calls.iter()) {
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
    fn match_and_refund_proofs_bind_both_original_sellers() -> Result<()> {
        let gadget = build_orderbook_sd_key_circuit(62)?;
        let fee = 1_000_010_000;
        let matched = vec![
            info(62, MATCH, &[456, 789, 1_000, 1_200, 1, 2]),
            info(0, CLAIM, &[456]),
            info(0, CLAIM, &[789]),
            info(4, CLAIM, &[789]),
            info(0, TRANSFER, &[789, 1_000 + FEE_ESCROW]),
            info(4, TRANSFER, &[456, 1_200]),
            info(0, BURN, &[fee]),
        ];
        let match_inputs = [1, 456, 789, 1_000, 1_200, 1, 2, fee];
        prove_operation(&gadget, &matched, match_inputs)?;
        let mut stolen = matched.clone();
        stolen[5] = info(4, TRANSFER, &[999, 1_200]);
        assert!(prove_operation(&gadget, &stolen, match_inputs).is_err());
        let mut inflated = matched.clone();
        inflated[4] = info(0, TRANSFER, &[789, 1_001 + FEE_ESCROW]);
        assert!(prove_operation(&gadget, &inflated, match_inputs).is_err());

        let refund_psy = vec![
            info(62, CANCEL_PSY, &[456, 1_000, 1]),
            info(0, CLAIM, &[456]),
            info(0, TRANSFER, &[456, 1_000]),
            info(62, NOOP, &[]), info(62, NOOP, &[]), info(62, NOOP, &[]),
            info(0, BURN, &[fee]),
        ];
        prove_operation(&gadget, &refund_psy, [2, 456, 0, 1_000, 0, 1, 0, fee])?;
        let refund_usdt = vec![
            info(62, CANCEL_USDT, &[789, 1_200, 2]),
            info(0, CLAIM, &[789]),
            info(4, CLAIM, &[789]),
            info(4, TRANSFER, &[789, 1_200]),
            info(62, NOOP, &[]), info(62, NOOP, &[]),
            info(0, BURN, &[fee]),
        ];
        prove_operation(&gadget, &refund_usdt, [3, 789, 0, 1_200, 0, 2, 0, fee])?;
        Ok(())
    }
}
