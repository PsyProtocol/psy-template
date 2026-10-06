//! Graduation-seeded launch-token AMM SD-key circuit. The generic wallet CLI only exposes an allowlist policy;
//! `pool_wallet` installs this custom circuit through the public wallet API.

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

const NOOP: u32 = 1499483837;
const SWAP: u32 = 4230098023;
const REFUND_SWAP: u32 = 1185054902;
const ADD: u32 = 1453373496;
const REFUND_ADD: u32 = 3335569690;
const REMOVE: u32 = 3594394861;
const TOKEN_CLAIM: u32 = 2_394_033_944;
const TOKEN_TRANSFER: u32 = 194_520_553;
const SEED: u32 = 2466270263;
const CANCEL_REMOVE: u32 = 1684093108;
const CLAIM: u32 = 2_293_029_357;
const TRANSFER: u32 = 354_447_671;
const BURN: u32 = 2_923_993_647;
const GUTA_FEE: u64 = 1_000_000_000;
const DA_FEE: u64 = 1_000;
const MAX_DA_SLOTS: u64 = 100;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolConfig {
    pub token_id: u64,
    pub curve_contract_id: u64,
    pub curve_vault_id: u64,
    pub issuer_id: u64,
    pub psy_unit: u64,
    pub token_unit: u64,
}
impl PoolConfig {
    pub fn validate(&self, pool: u64) -> Result<()> {
        ensure!(
            pool >= 5
                && self.token_id >= 5
                && self.curve_contract_id >= 5
                && pool != self.token_id
                && pool != self.curve_contract_id
                && self.token_id != self.curve_contract_id,
            "invalid contracts"
        );
        ensure!(
            self.issuer_id > 0
                && self.issuer_id < 16_777_216
                && self.curve_vault_id > 0
                && self.curve_vault_id < 16_777_216
                && self.issuer_id != self.curve_vault_id,
            "invalid users"
        );
        ensure!(
            self.psy_unit > 0
                && self.psy_unit <= 100_000_000
                && self.token_unit > 0
                && self.token_unit <= 100_000_000,
            "invalid trading units"
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
    cfg: PoolConfig,
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
    let usdt = builder.constant(F::from_canonical_u64(cfg.token_id));
    let px = builder.mul_const(F::from_canonical_u64(cfg.psy_unit), x);
    let py = builder.mul_const(F::from_canonical_u64(cfg.psy_unit), y);
    let tx = builder.mul_const(F::from_canonical_u64(cfg.token_unit), x);
    let ty = builder.mul_const(F::from_canonical_u64(cfg.token_unit), y);
    let tz = builder.mul_const(F::from_canonical_u64(cfg.token_unit), z);
    let mut calls = match branch {
        1 => vec![
            call(
                builder,
                pool_contract_id,
                SWAP,
                vec![payer, psy, x, y, nonce],
            ),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, cfg.token_id, TOKEN_TRANSFER, vec![payer, ty]),
        ],
        2 => vec![
            call(
                builder,
                pool_contract_id,
                SWAP,
                vec![payer, usdt, x, y, nonce],
            ),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, cfg.token_id, TOKEN_CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, py]),
        ],
        3 => vec![
            call(builder, pool_contract_id, REFUND_SWAP, vec![payer, psy, x]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, px]),
        ],
        4 => vec![
            call(builder, pool_contract_id, REFUND_SWAP, vec![payer, usdt, x]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, cfg.token_id, TOKEN_CLAIM, vec![payer]),
            call(builder, cfg.token_id, TOKEN_TRANSFER, vec![payer, tx]),
        ],
        5 => vec![
            call(builder, pool_contract_id, ADD, vec![payer, x, y, z, nonce]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, cfg.token_id, TOKEN_CLAIM, vec![payer]),
        ],
        6 => vec![
            call(
                builder,
                pool_contract_id,
                REMOVE,
                vec![payer, x, y, z, nonce],
            ),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, py]),
            call(builder, cfg.token_id, TOKEN_TRANSFER, vec![payer, tz]),
        ],
        7 => vec![
            call(builder, pool_contract_id, REFUND_ADD, vec![payer, x, psy]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, px]),
        ],
        8 => vec![
            call(builder, pool_contract_id, REFUND_ADD, vec![payer, psy, y]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, cfg.token_id, TOKEN_CLAIM, vec![payer]),
            call(builder, cfg.token_id, TOKEN_TRANSFER, vec![payer, ty]),
        ],
        9 => vec![
            call(builder, pool_contract_id, REFUND_ADD, vec![payer, x, y]),
            call(builder, 0, CLAIM, vec![payer]),
            call(builder, cfg.token_id, TOKEN_CLAIM, vec![payer]),
            call(builder, 0, TRANSFER, vec![payer, px]),
            call(builder, cfg.token_id, TOKEN_TRANSFER, vec![payer, ty]),
        ],
        10 => {
            let curve = builder.constant(F::from_canonical_u64(cfg.curve_contract_id));
            let vault = builder.constant(F::from_canonical_u64(cfg.curve_vault_id));
            let issuer = builder.constant(F::from_canonical_u64(cfg.issuer_id));
            let pu = builder.constant(F::from_canonical_u64(cfg.psy_unit));
            let tu = builder.constant(F::from_canonical_u64(cfg.token_unit));
            vec![
                call(
                    builder,
                    pool_contract_id,
                    SEED,
                    vec![curve, vault, usdt, issuer, pu, tu, x, y, z],
                ),
                call(builder, 0, CLAIM, vec![vault]),
                call(builder, cfg.token_id, TOKEN_CLAIM, vec![vault]),
                call(builder, 0, CLAIM, vec![issuer]),
            ]
        }
        11 => vec![
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

/// Witness inputs: branch (1..11), payer, x, y, z, nonce, fee burn.
/// The guard method authenticates order state and the exact unpaid token delta.
pub fn build_launch_amm_sd_key_circuit(
    pool_contract_id: u64,
    cfg: PoolConfig,
) -> Result<SDKeyCircuitGadget> {
    cfg.validate(pool_contract_id)?;
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
    let six = builder.constant(F::from_canonical_u64(6));
    builder.connect(gadget.tx_introspection.tx_count, six);
    for field in &fields[1..5] {
        builder.range_check(*field, 24);
    }
    for branch in 1..=11 {
        let branch_constant = builder.constant(F::from_canonical_u64(branch));
        let selected = builder.is_equal(fields[0], branch_constant);
        valid_branch = builder.or(valid_branch, selected);
        if branch == 10 {
            let issuer = builder.constant(F::from_canonical_u64(cfg.issuer_id));
            guarded_equal(&mut builder, selected, fields[1], issuer);
            let zero = builder.zero();
            guarded_equal(&mut builder, selected, fields[5], zero);
        }
        let expected = branch_calls(&mut builder, pool_contract_id, cfg, branch, &fields);
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

    fn fixture() -> Result<Vec<(Vec<SDKeyTransactionInfo<F>>, [u64; 7])>> {
        let rows: serde_json::Value =
            serde_json::from_str(include_str!("../tests/call_stacks.json"))?;
        let abi: serde_json::Value =
            serde_json::from_str(include_str!("../../contract/target-v2/abi.json"))?;
        let mut result = vec![];
        for row in rows.as_array().unwrap() {
            let mut calls = vec![];
            for c in row["contract_calls"].as_array().unwrap() {
                let contract = c["contract_id"].as_u64().unwrap();
                let name = c["method_name"].as_str().unwrap();
                let method = match (contract, name) {
                    (0, "simple_claim") => CLAIM,
                    (0, "simple_transfer") => TRANSFER,
                    (0, "simple_burn") => BURN,
                    (65, "claim") => TOKEN_CLAIM,
                    (65, "transfer") => TOKEN_TRANSFER,
                    _ => abi["contract"]["methods"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|m| m["name"] == name)
                        .unwrap()["method_id"]
                        .as_u64()
                        .unwrap() as u32,
                };
                let inputs = c["inputs"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|x| x.as_u64().unwrap())
                    .collect::<Vec<_>>();
                calls.push(info(contract, method, &inputs));
            }
            let inputs = row["software_defined_call"]["inputs"]
                .as_array()
                .unwrap()
                .iter()
                .map(|x| x.as_u64().unwrap())
                .collect::<Vec<_>>()
                .try_into()
                .unwrap();
            result.push((calls, inputs));
        }
        Ok(result)
    }
    fn config() -> PoolConfig {
        PoolConfig {
            token_id: 65,
            curve_contract_id: 66,
            curve_vault_id: 758784,
            issuer_id: 1882112,
            psy_unit: 1000,
            token_unit: 1000000,
        }
    }
    #[test]
    fn every_builder_stack_proves_and_redirected_unscaled_extra_calls_fail() -> Result<()> {
        let gadget = build_launch_amm_sd_key_circuit(67, config())?;
        let fixtures = fixture()?;
        for (calls, inputs) in &fixtures {
            prove_operation(&gadget, calls, *inputs)?;
        }
        let (mut redirect, inputs) = fixtures[0].clone();
        redirect[2] = info(65, TOKEN_TRANSFER, &[333, 20_000_000]);
        assert!(prove_operation(&gadget, &redirect, inputs).is_err());
        let (mut unscaled, inputs) = fixtures[0].clone();
        unscaled[2] = info(65, TOKEN_TRANSFER, &[222, 20]);
        assert!(prove_operation(&gadget, &unscaled, inputs).is_err());
        let (mut extra, inputs) = fixtures[0].clone();
        extra.push(info(0, TRANSFER, &[333, 1]));
        assert!(prove_operation(&gadget, &extra, inputs).is_err());
        let (mut seed, inputs) = fixtures[9].clone();
        seed[1] = info(0, CLAIM, &[999]);
        assert!(prove_operation(&gadget, &seed, inputs).is_err());
        let (mut seed, inputs) = fixtures[9].clone();
        seed[0] = info(
            67,
            SEED,
            &[66, 999, 65, 1882112, 1000, 1000000, 300003, 3000, 29000],
        );
        assert!(prove_operation(&gadget, &seed, inputs).is_err());
        let (mut fee, mut inputs) = fixtures[9].clone();
        inputs[6] = 1_000_101_000;
        fee[5] = info(0, BURN, &[inputs[6]]);
        assert!(prove_operation(&gadget, &fee, inputs).is_err());
        Ok(())
    }
}
