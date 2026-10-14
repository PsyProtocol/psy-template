//! Public-key test identities only. Native PSY can only be claimed or burned as fees.
use anyhow::{ensure, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::poseidon::PoseidonHash,
    iop::target::{BoolTarget, Target},
    plonk::{circuit_builder::CircuitBuilder, circuit_data::CircuitConfig},
};
use psy_client_data::dpn::sd_key::SDKeyConfig;
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use psy_config::network_constants::{
    DEFAULT_CALLER_CONTRACT_ID_U64, MAX_CONTRACT_STATE_TREE_HEIGHT,
};
use psy_ups_circuit::signature::sd_key::SDKeyCircuitGadget;
use serde::{Deserialize, Serialize};
#[derive(Clone, Serialize, Deserialize)]
pub struct TestPolicy {
    pub token_id: u64,
    pub issuer: u64,
    pub role: u64,
    pub native_claim: u64,
    pub ft_claim: u64,
    pub private_transfer: u64,
    pub private_claim: u64,
    pub public_transfer: u64,
}
fn eq(b: &mut CircuitBuilder<F, 2>, when: BoolTarget, a: Target, e: Target) {
    let diff = b.sub(a, e);
    let gated = b.mul(when.target, diff);
    let z = b.zero();
    b.connect(gated, z);
}
pub fn build(p: &TestPolicy) -> Result<SDKeyCircuitGadget> {
    ensure!(
        p.token_id >= 5
            && p.token_id < 16777216
            && p.issuer > 0
            && p.issuer < 16777216
            && p.role > 0
            && p.role < 100,
        "invalid test policy"
    );
    let cfg = SDKeyConfig {
        num_introspectable_transactions: 2,
        can_read_state: false,
        contract_state_tree_height: MAX_CONTRACT_STATE_TREE_HEIGHT,
        requires_secp256k1: false,
        num_secp256k1_slots: 0,
    };
    let mut b = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
    let mut g = SDKeyCircuitGadget::add_virtual_to(&mut b, &cfg, 154);
    let w = g.circuit_inputs.clone();
    let two = b.constant(F::TWO);
    b.connect(g.tx_introspection.tx_count, two);
    let role = b.constant(F::from_canonical_u64(p.role));
    b.connect(w[153], role);
    let caller = b.constant(F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64));
    let first = &g.tx_introspection.tx_info_slots[0];
    let mut valid = b._false();
    for (branch, cid, method, length) in [
        (1, 0, p.native_claim, 1),
        (2, p.token_id, p.ft_claim, 1),
        (3, p.token_id, p.private_transfer, 14),
        (4, p.token_id, p.private_claim, 151),
        (5, p.token_id, p.public_transfer, 3),
    ] {
        let id = b.constant(F::from_canonical_u64(branch));
        let selected = b.is_equal(w[0], id);
        valid = b.or(valid, selected);
        let cid = b.constant(F::from_canonical_u64(cid));
        let method = b.constant(F::from_canonical_u64(method));
        let length_t = b.constant(F::from_canonical_u64(length));
        let hash = b.safe_hash_fixed_length::<PoseidonHash>(&w[1..1 + length as usize]);
        eq(&mut b, selected, first.contract_id, cid);
        eq(&mut b, selected, first.method_id, method);
        eq(&mut b, selected, first.caller_contract_id, caller);
        eq(&mut b, selected, first.inputs_length, length_t);
        for (a, e) in first.inputs_hash.elements.into_iter().zip(hash.elements) {
            eq(&mut b, selected, a, e);
        }
        if branch == 5 {
            let issuer = b.constant(F::from_canonical_u64(p.issuer));
            eq(&mut b, selected, w[1], issuer);
        }
    }
    b.assert_one(valid.target);
    let mut fee_ok = b._false();
    // Distinct fee caps produce distinct signing identities; an unused witness tag alone is optimized away.
    for i in 0..=(101 - p.role) {
        let fee = b.constant(F::from_canonical_u64(1_000_000_000 + 1000 * i));
        let matched = b.is_equal(w[152], fee);
        fee_ok = b.or(fee_ok, matched);
    }
    b.assert_one(fee_ok.target);
    let burn = &g.tx_introspection.tx_info_slots[1];
    let native = b.zero();
    let method = b.constant(F::from_canonical_u64(2923993647));
    let one = b.one();
    b.connect(burn.contract_id, native);
    b.connect(burn.method_id, method);
    b.connect(burn.caller_contract_id, caller);
    b.connect(burn.inputs_length, one);
    let hash = b.safe_hash_fixed_length::<PoseidonHash>(&[w[152]]);
    for (a, e) in burn.inputs_hash.elements.into_iter().zip(hash.elements) {
        b.connect(a, e);
    }
    g.build_circuit(b)?;
    Ok(g)
}
