//! Whole-UPS authorization for a public, fixed-inventory bonding-curve vault.

use anyhow::{ensure, Result};
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
use serde::Deserialize;

const NOOP: u32 = 2_951_605_435;
const INITIALIZE: u32 = 1_996_267_418;
const SETTLE_BUY: u32 = 3_583_663_012;
const SETTLE_SELL: u32 = 2_429_520_966;
const REFUND_BUY: u32 = 2_197_256_516;
const REFUND_SELL: u32 = 2_075_928_923;
const GRADUATE: u32 = 2_694_209_370;
const PSY_CLAIM: u32 = 2_293_029_357;
const PSY_TRANSFER: u32 = 354_447_671;
const TOKEN_CLAIM: u32 = 2_394_033_944;
const TOKEN_TRANSFER: u32 = 194_520_553;
const PSY_BURN: u32 = 2_923_993_647;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchConfig {
    pub token_id: u64,
    pub issuer_id: u64,
    pub target_id: u64,
    pub max_lots: u64,
    pub liquidity_lots: u64,
    pub lot_size: u64,
    pub base_price: u64,
    pub step_price: u64,
    pub threshold_lots: u64,
}

impl LaunchConfig {
    pub fn validate(&self, contract_id: u64) -> Result<()> {
        ensure!(
            contract_id >= 5 && self.token_id >= 5 && self.token_id != contract_id,
            "invalid contract IDs"
        );
        ensure!(
            self.issuer_id > 0 && self.issuer_id < 16_777_216,
            "invalid issuer"
        );
        ensure!(
            self.target_id > 0 && self.target_id < 16_777_216 && self.target_id != self.issuer_id,
            "invalid target"
        );
        ensure!(
            self.max_lots > 0 && self.max_lots <= 1_000_000,
            "invalid sale cap"
        );
        ensure!(
            self.liquidity_lots > 0 && self.liquidity_lots <= 1_000_000,
            "invalid liquidity lots"
        );
        ensure!(
            self.lot_size > 0 && self.lot_size <= 1_000_000_000,
            "invalid lot size"
        );
        ensure!(
            self.base_price > 0 && self.base_price <= 1_000_000_000,
            "invalid base price"
        );
        ensure!(
            self.step_price > 0 && self.step_price <= 10_000,
            "invalid step price"
        );
        ensure!(
            self.threshold_lots > 0 && self.threshold_lots <= self.max_lots,
            "invalid threshold"
        );
        Ok(())
    }
}

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

fn constant(builder: &mut CircuitBuilder<F, 2>, value: u64) -> Target {
    builder.constant(F::from_canonical_u64(value))
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
    for (actual_hash, expected_hash) in actual
        .inputs_hash
        .elements
        .iter()
        .zip(expected.inputs_hash.elements.iter())
    {
        guarded_equal(builder, when, *actual_hash, *expected_hash);
    }
}

// Inputs: branch, actor, lots (or graduation token amount), PSY quote,
// order nonce, measured automatic PSY burn.
fn branch_calls(
    builder: &mut CircuitBuilder<F, 2>,
    contract_id: u64,
    cfg: LaunchConfig,
    branch: u64,
    fields: &[Target],
) -> Vec<ExpectedCall> {
    let actor = fields[1];
    let lots = fields[2];
    let psy_amount = fields[3];
    let nonce = fields[4];
    let fee = fields[5];
    let lot_size = constant(builder, cfg.lot_size);
    let token_amount = builder.mul(lots, lot_size);
    let issuer = constant(builder, cfg.issuer_id);
    let target = constant(builder, cfg.target_id);

    let mut calls = match branch {
        1 => {
            let inputs = [
                cfg.token_id,
                cfg.issuer_id,
                cfg.target_id,
                cfg.max_lots,
                cfg.liquidity_lots,
                cfg.lot_size,
                cfg.base_price,
                cfg.step_price,
                cfg.threshold_lots,
            ]
            .iter()
            .map(|value| constant(builder, *value))
            .collect();
            vec![
                call(builder, contract_id, INITIALIZE, inputs),
                call(builder, cfg.token_id, TOKEN_CLAIM, vec![issuer]),
                call(builder, 0, PSY_CLAIM, vec![issuer]),
            ]
        }
        2 => vec![
            call(
                builder,
                contract_id,
                SETTLE_BUY,
                vec![actor, lots, psy_amount, nonce],
            ),
            call(builder, 0, PSY_CLAIM, vec![actor]),
            call(
                builder,
                cfg.token_id,
                TOKEN_TRANSFER,
                vec![actor, token_amount],
            ),
        ],
        3 => vec![
            call(
                builder,
                contract_id,
                SETTLE_SELL,
                vec![actor, lots, psy_amount, nonce],
            ),
            call(builder, cfg.token_id, TOKEN_CLAIM, vec![actor]),
            call(builder, 0, PSY_CLAIM, vec![actor]),
            call(builder, 0, PSY_TRANSFER, vec![actor, psy_amount]),
        ],
        4 => vec![
            call(
                builder,
                contract_id,
                REFUND_BUY,
                vec![actor, lots, psy_amount, nonce],
            ),
            call(builder, 0, PSY_CLAIM, vec![actor]),
            call(builder, 0, PSY_TRANSFER, vec![actor, psy_amount]),
        ],
        5 => vec![
            call(builder, contract_id, REFUND_SELL, vec![actor, lots, nonce]),
            call(builder, cfg.token_id, TOKEN_CLAIM, vec![actor]),
            call(builder, 0, PSY_CLAIM, vec![actor]),
            call(
                builder,
                cfg.token_id,
                TOKEN_TRANSFER,
                vec![actor, token_amount],
            ),
        ],
        6 => vec![
            call(
                builder,
                contract_id,
                GRADUATE,
                vec![target, psy_amount, lots],
            ),
            call(builder, 0, PSY_CLAIM, vec![issuer]),
            call(builder, 0, PSY_TRANSFER, vec![target, psy_amount]),
            call(builder, cfg.token_id, TOKEN_TRANSFER, vec![target, lots]),
        ],
        _ => unreachable!(),
    };
    while calls.len() < 6 {
        calls.push(call(builder, contract_id, NOOP, vec![]));
    }
    calls.push(call(builder, 0, PSY_BURN, vec![fee]));
    calls
}

pub fn build_curve_sd_key_circuit(
    contract_id: u64,
    cfg: LaunchConfig,
) -> Result<SDKeyCircuitGadget> {
    cfg.validate(contract_id)?;
    let config = SDKeyConfig {
        num_introspectable_transactions: 7,
        can_read_state: false,
        contract_state_tree_height: MAX_CONTRACT_STATE_TREE_HEIGHT,
        requires_secp256k1: false,
        num_secp256k1_slots: 0,
    };
    let mut builder = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
    let mut gadget = SDKeyCircuitGadget::add_virtual_to(&mut builder, &config, 6);
    let fields = gadget.circuit_inputs.clone();
    let mut valid_branch = builder._false();
    for branch in 1..=6 {
        let branch_constant = constant(&mut builder, branch);
        let selected = builder.is_equal(fields[0], branch_constant);
        valid_branch = builder.or(valid_branch, selected);
        let expected = branch_calls(&mut builder, contract_id, cfg, branch, &fields);
        for (actual, required) in gadget
            .tx_introspection
            .tx_info_slots
            .iter()
            .zip(expected.iter())
        {
            match_call(&mut builder, selected, actual, required);
        }
    }
    builder.assert_one(valid_branch.target);
    let mut valid_fee = builder._false();
    for slots in 0..=100_u64 {
        let fee_constant = constant(&mut builder, 1_000_000_000 + slots * 1_000);
        let selected = builder.is_equal(fields[5], fee_constant);
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
    fn method_ids_match_compiled_curve_abi() -> Result<()> {
        let abi: serde_json::Value =
            serde_json::from_str(include_str!("../../contract/target/abi.json"))?;
        let methods = abi["contract"]["methods"].as_array().expect("ABI methods");
        for (name, id) in [
            ("noop", NOOP),
            ("initialize", INITIALIZE),
            ("settle_buy", SETTLE_BUY),
            ("settle_sell", SETTLE_SELL),
            ("refund_buy", REFUND_BUY),
            ("refund_sell", REFUND_SELL),
            ("graduate", GRADUATE),
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

    #[test]
    fn launch_config_rejects_unsafe_bounds() {
        let mut cfg = LaunchConfig {
            token_id: 65,
            issuer_id: 123,
            target_id: 456,
            max_lots: 10_000,
            liquidity_lots: 1_000,
            lot_size: 1_000_000_000,
            base_price: 1_000_000_000,
            step_price: 1_000,
            threshold_lots: 8_000,
        };
        assert!(cfg.validate(66).is_ok());
        cfg.step_price = 10_001;
        assert!(cfg.validate(66).is_err());
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

    fn prove_operation(
        gadget: &SDKeyCircuitGadget,
        calls: &[SDKeyTransactionInfo<F>],
        inputs: [u64; 6],
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
            tx_count: F::from_canonical_u64(calls.len() as u64),
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
                elements: [F::from_canonical_u64(3); 4],
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
    fn vault_policy_binds_recipient_amount_and_graduation_target() -> Result<()> {
        let cfg = LaunchConfig {
            token_id: 65,
            issuer_id: 456,
            target_id: 789,
            max_lots: 10_000,
            liquidity_lots: 1_000,
            lot_size: 1_000_000_000,
            base_price: 1_000_000_000,
            step_price: 1_000,
            threshold_lots: 8_000,
        };
        let gadget = build_curve_sd_key_circuit(66, cfg)?;
        let fee = 1_000_010_000;
        let initialize = vec![
            info(
                66,
                INITIALIZE,
                &[
                    65,
                    456,
                    789,
                    10_000,
                    1_000,
                    1_000_000_000,
                    1_000_000_000,
                    1_000,
                    8_000,
                ],
            ),
            info(65, TOKEN_CLAIM, &[456]),
            info(0, PSY_CLAIM, &[456]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(0, PSY_BURN, &[fee]),
        ];
        prove_operation(&gadget, &initialize, [1, 0, 0, 0, 0, fee])?;
        let mut wrong_configuration = initialize.clone();
        wrong_configuration[0] = info(
            66,
            INITIALIZE,
            &[
                65,
                456,
                999,
                10_000,
                1_000,
                1_000_000_000,
                1_000_000_000,
                1_000,
                8_000,
            ],
        );
        assert!(prove_operation(&gadget, &wrong_configuration, [1, 0, 0, 0, 0, fee]).is_err());
        let buy = vec![
            info(66, SETTLE_BUY, &[111, 2, 2_000_011_000, 1]),
            info(0, PSY_CLAIM, &[111]),
            info(65, TOKEN_TRANSFER, &[111, 2_000_000_000]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(0, PSY_BURN, &[fee]),
        ];
        let buy_inputs = [2, 111, 2, 2_000_011_000, 1, fee];
        prove_operation(&gadget, &buy, buy_inputs)?;
        // A public key must never authorize an extra drain hidden before or
        // after the reviewed seven-call transaction stack.
        let mut extra_call = buy.clone();
        extra_call.insert(0, info(0, PSY_TRANSFER, &[999, 1]));
        assert!(prove_operation(&gadget, &extra_call, buy_inputs).is_err());
        assert!(prove_operation(&gadget, &buy[..6], buy_inputs).is_err());
        let mut wrong_token = buy.clone();
        wrong_token[2] = info(49, TOKEN_TRANSFER, &[111, 2_000_000_000]);
        assert!(prove_operation(&gadget, &wrong_token, buy_inputs).is_err());
        let mut swapped = buy.clone();
        swapped.swap(1, 2);
        assert!(prove_operation(&gadget, &swapped, buy_inputs).is_err());
        let mut changed_nonce = buy.clone();
        changed_nonce[0] = info(66, SETTLE_BUY, &[111, 2, 2_000_011_000, 2]);
        assert!(prove_operation(&gadget, &changed_nonce, buy_inputs).is_err());
        let mut excessive_fee = buy.clone();
        excessive_fee[6] = info(0, PSY_BURN, &[1_000_101_000]);
        let mut excessive_fee_inputs = buy_inputs;
        excessive_fee_inputs[5] = 1_000_101_000;
        assert!(prove_operation(&gadget, &excessive_fee, excessive_fee_inputs).is_err());
        let sell = vec![
            info(66, SETTLE_SELL, &[111, 2, 2_000_011_000, 2]),
            info(65, TOKEN_CLAIM, &[111]),
            info(0, PSY_CLAIM, &[111]),
            info(0, PSY_TRANSFER, &[111, 2_000_011_000]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(0, PSY_BURN, &[fee]),
        ];
        let sell_inputs = [3, 111, 2, 2_000_011_000, 2, fee];
        prove_operation(&gadget, &sell, sell_inputs)?;
        let mut redirected_sell = sell.clone();
        redirected_sell[3] = info(0, PSY_TRANSFER, &[999, 2_000_011_000]);
        assert!(prove_operation(&gadget, &redirected_sell, sell_inputs).is_err());
        let mut redirected = buy.clone();
        redirected[2] = info(65, TOKEN_TRANSFER, &[999, 2_000_000_000]);
        assert!(prove_operation(&gadget, &redirected, buy_inputs).is_err());
        let mut inflated = buy.clone();
        inflated[2] = info(65, TOKEN_TRANSFER, &[111, 2_000_000_001]);
        assert!(prove_operation(&gadget, &inflated, buy_inputs).is_err());
        let refund_buy = vec![
            info(66, REFUND_BUY, &[111, 2, 2_000_011_000, 1]),
            info(0, PSY_CLAIM, &[111]),
            info(0, PSY_TRANSFER, &[111, 2_000_011_000]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(0, PSY_BURN, &[fee]),
        ];
        let refund_buy_inputs = [4, 111, 2, 2_000_011_000, 1, fee];
        prove_operation(&gadget, &refund_buy, refund_buy_inputs)?;
        let mut diverted_refund = refund_buy.clone();
        diverted_refund[2] = info(0, PSY_TRANSFER, &[999, 2_000_011_000]);
        assert!(prove_operation(&gadget, &diverted_refund, refund_buy_inputs).is_err());
        let refund_sell = vec![
            info(66, REFUND_SELL, &[111, 2, 1]),
            info(65, TOKEN_CLAIM, &[111]),
            info(0, PSY_CLAIM, &[111]),
            info(65, TOKEN_TRANSFER, &[111, 2_000_000_000]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(0, PSY_BURN, &[fee]),
        ];
        prove_operation(&gadget, &refund_sell, [5, 111, 2, 0, 1, fee])?;
        let graduate = vec![
            info(66, GRADUATE, &[789, 100_000_000_000, 1_000_000_000_000]),
            info(0, PSY_CLAIM, &[456]),
            info(0, PSY_TRANSFER, &[789, 100_000_000_000]),
            info(65, TOKEN_TRANSFER, &[789, 1_000_000_000_000]),
            info(66, NOOP, &[]),
            info(66, NOOP, &[]),
            info(0, PSY_BURN, &[fee]),
        ];
        let graduation_inputs = [6, 0, 1_000_000_000_000, 100_000_000_000, 0, fee];
        prove_operation(&gadget, &graduate, graduation_inputs)?;
        let mut stolen = graduate.clone();
        stolen[2] = info(0, PSY_TRANSFER, &[999, 100_000_000_000]);
        assert!(prove_operation(&gadget, &stolen, graduation_inputs).is_err());
        Ok(())
    }
}
