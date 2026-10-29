//! Circuit-enforced source coverage transitions. Each page extends the complete
//! reconstructed account tree and the exact trading/recovery manifests.
//! Authentication of the immutable source facts is owned by the stream SD-key.
use crate::{
    checkpoint_stream::{Hash, Member},
    final_state_coverage::{
        order_fields, verify_snapshot, Account, Review, Snapshot, StateOpening,
    },
};
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{
        hash_types::{HashOut, HashOutTarget},
        poseidon::PoseidonHash as H,
    },
    iop::{
        target::{BoolTarget, Target},
        witness::{PartialWitness, Witness, WitnessWrite},
    },
    plonk::{
        circuit_builder::CircuitBuilder,
        circuit_data::{CircuitConfig, CircuitData},
        config::{Hasher, PoseidonGoldilocksConfig as C},
    },
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::qdata::user::PsyUserLeaf;
use psy_common_circuit::{
    hash::merkle::gadgets::merkle_proof::MerkleProofGadget,
    traits::{CreatableTarget, ToTargets},
    u32::multiple_comparison::list_lte_circuit,
};
use psy_crypto::hash::{
    merkle::core::MerkleProofCore,
    traits::{hasher::MerkleZeroHasher, qhashable::QFieldHashable},
};
use psy_network_circuit::gadgets::qdata::user::PsyUserLeafGadget;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
const R: u128 = 1u128 << 62;
pub const ROWS: usize = 4;
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn h(v: Hash) -> HashOut<F> {
    HashOut { elements: v.map(f) }
}
fn arr(q: Q<F>) -> Hash {
    q.0.elements.map(|n| n.to_canonical_u64())
}
fn hash(v: &[u64]) -> Hash {
    H::hash_no_pad(&v.iter().copied().map(f).collect::<Vec<_>>())
        .elements
        .map(|n| n.to_canonical_u64())
}
fn gh(b: &mut CircuitBuilder<F, 2>, g: BoolTarget, a: HashOutTarget, c: HashOutTarget) {
    for (x, y) in a.elements.into_iter().zip(c.elements) {
        crate::batch_policy::eq(b, g, x, y);
    }
}
fn ge(b: &mut CircuitBuilder<F, 2>, g: BoolTarget, a: Target, c: Target) {
    crate::batch_policy::eq(b, g, a, c);
}
pub(crate) fn lt(b: &mut CircuitBuilder<F, 2>, a: Target, c: Target, bits: usize) -> BoolTarget {
    if bits > 32 {
        let aa = b.split_le(a, bits);
        let cc = b.split_le(c, bits);
        let al = b.le_sum(aa[..32].iter());
        let ah = b.le_sum(aa[32..].iter());
        let cl = b.le_sum(cc[..32].iter());
        let ch = b.le_sum(cc[32..].iter());
        let hi = lt(b, ah, ch, bits - 32);
        let same = b.is_equal(ah, ch);
        let lo = lt(b, al, cl, 32);
        let tie = b.and(same, lo);
        return b.or(hi, tie);
    }
    let le = list_lte_circuit(b, vec![a], vec![c], bits);
    let same = b.is_equal(a, c);
    let ne = b.not(same);
    b.and(le, ne)
}
fn and(b: &mut CircuitBuilder<F, 2>, v: &[BoolTarget]) -> BoolTarget {
    let mut out = b._true();
    for x in v {
        out = b.and(out, *x);
    }
    out
}
fn nz(b: &mut CircuitBuilder<F, 2>, t: Target) -> BoolTarget {
    let z = b.zero();
    let e = b.is_equal(t, z);
    b.not(e)
}
fn eqhash(b: &mut CircuitBuilder<F, 2>, a: HashOutTarget, c: HashOutTarget) -> BoolTarget {
    let v = a
        .elements
        .into_iter()
        .zip(c.elements)
        .map(|(x, y)| b.is_equal(x, y))
        .collect::<Vec<_>>();
    and(b, &v)
}
fn select_hash(
    b: &mut CircuitBuilder<F, 2>,
    g: BoolTarget,
    a: HashOutTarget,
    c: HashOutTarget,
) -> HashOutTarget {
    HashOutTarget {
        elements: std::array::from_fn(|i| b.select(g, a.elements[i], c.elements[i])),
    }
}
#[derive(Default)]
pub struct Tape {
    pub targets: Vec<Target>,
}
impl Tape {
    pub fn scalar(&mut self, b: &mut CircuitBuilder<F, 2>) -> Target {
        let t = b.add_virtual_target();
        self.targets.push(t);
        t
    }
    pub fn hash(&mut self, b: &mut CircuitBuilder<F, 2>) -> HashOutTarget {
        let t = b.add_virtual_hash();
        self.targets.extend(t.elements);
        t
    }
    pub fn proof(&mut self, b: &mut CircuitBuilder<F, 2>, height: usize) -> MerkleProofGadget {
        let p = MerkleProofGadget::add_virtual_to::<H, F, 2>(b, height);
        self.targets.push(p.index);
        self.targets.extend(p.value.elements);
        for s in &p.siblings {
            self.targets.extend(s.elements);
        }
        p
    }
    pub fn values(&self, pw: &PartialWitness<F>) -> Vec<u64> {
        self.targets
            .iter()
            .map(|t| pw.get_target(*t).to_canonical_u64())
            .collect()
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Progress {
    pub accounts: u64,
    pub last_owner: u64,
    pub users: Hash,
    pub orders: Hash,
    pub recovery: Hash,
    pub order_count: u64,
    pub recovery_count: u64,
}
impl Progress {
    pub fn empty() -> Self {
        Self {
            accounts: 0,
            last_owner: 0,
            users: arr(H::get_zero_hash(32)),
            orders: arr(H::get_zero_hash(56)),
            recovery: arr(H::get_zero_hash(56)),
            order_count: 0,
            recovery_count: 0,
        }
    }
    pub fn fields(&self) -> Vec<u64> {
        let mut v = vec![self.accounts, self.last_owner];
        v.extend(self.users);
        v.extend(self.orders);
        v.extend(self.recovery);
        v.extend([self.order_count, self.recovery_count]);
        v
    }
}
#[derive(Clone)]
pub struct ProgressTargets {
    pub accounts: Target,
    pub last_owner: Target,
    pub users: HashOutTarget,
    pub orders: HashOutTarget,
    pub recovery: HashOutTarget,
    pub order_count: Target,
    pub recovery_count: Target,
}
impl ProgressTargets {
    pub fn fields(&self) -> Vec<Target> {
        let mut v = vec![self.accounts, self.last_owner];
        v.extend(self.users.elements);
        v.extend(self.orders.elements);
        v.extend(self.recovery.elements);
        v.extend([self.order_count, self.recovery_count]);
        v
    }
    pub(crate) fn create(b: &mut CircuitBuilder<F, 2>, t: &mut Tape) -> Self {
        Self {
            accounts: t.scalar(b),
            last_owner: t.scalar(b),
            users: t.hash(b),
            orders: t.hash(b),
            recovery: t.hash(b),
            order_count: t.scalar(b),
            recovery_count: t.scalar(b),
        }
    }
    pub(crate) fn set(&self, pw: &mut PartialWitness<F>, p: &Progress) -> Result<()> {
        for (t, v) in self.fields().into_iter().zip(p.fields()) {
            pw.set_target(t, f(v))?;
        }
        Ok(())
    }
}
pub(crate) struct Word {
    proof: MerkleProofGadget,
    slot: Target,
    gate: BoolTarget,
    pub(crate) value: Target,
}
impl Word {
    pub(crate) fn create(
        b: &mut CircuitBuilder<F, 2>,
        t: &mut Tape,
        root: HashOutTarget,
        slot: Target,
        gate: BoolTarget,
        height: usize,
    ) -> Self {
        let p = t.proof(b, height);
        // Disabled reads have no peer-derived address. Select BEFORE range
        // decomposition so unrelated full-width user IDs cannot poison capture.
        let zero = b.zero();
        let effective_slot = b.select(gate, slot, zero);
        let bits = b.split_le(effective_slot, 34);
        let index = b.le_sum(bits[2..].iter());
        b.connect(p.index, index);
        gh(b, gate, p.root, root);
        let low = b.le_sum(bits[..2].iter());
        let v = b.random_access(low, p.value.elements.to_vec());
        let z = b.zero();
        let value = b.select(gate, v, z);
        Self {
            proof: p,
            slot,
            gate,
            value,
        }
    }
    pub(crate) fn set(
        &self,
        pw: &mut PartialWitness<F>,
        opening: &StateOpening,
        slot: u64,
        enabled: bool,
    ) -> Result<()> {
        let p = if enabled {
            opening
                .words
                .iter()
                .find(|p| p.index == slot / 4)
                .cloned()
                .context("missing source coverage word proof")?
        } else {
            empty_proof(0, self.proof.siblings.len())
        };
        self.proof.set_witness_core_proof_q(pw, &p)
    }
}
fn empty_proof(index: u64, height: usize) -> MerkleProofCore<Q<F>> {
    MerkleProofCore::new_from_params::<H>(
        index,
        Q::ZERO,
        (0..height).map(|i| H::get_zero_hash(i)).collect(),
    )
}
fn wide(b: &mut CircuitBuilder<F, 2>, lo: Target, hi: Target) {
    b.range_check(lo, 62);
    b.range_check(hi, 62);
}
fn subtract(b: &mut CircuitBuilder<F, 2>, sent: [Target; 2], base: [Target; 2]) -> [Target; 2] {
    for p in [sent, base] {
        wide(b, p[0], p[1]);
    }
    let borrow = lt(b, sent[0], base[0], 62);
    let x = b.sub(sent[0], base[0]);
    let low = b.mul_const_add(f(1 << 62), borrow.target, x);
    let x = b.sub(sent[1], base[1]);
    let high = b.sub(x, borrow.target);
    wide(b, low, high);
    [low, high]
}
fn quantity(
    b: &mut CircuitBuilder<F, 2>,
    unit: u128,
    lots: Target,
    paid: [Target; 2],
) -> BoolTarget {
    b.range_check(lots, 62);
    let bits = b.split_le(lots, 62);
    let ld = [b.le_sum(bits[..31].iter()), b.le_sum(bits[31..].iter())];
    let mut carry = b.zero();
    let mut digits = vec![];
    for col in 0..6 {
        let mut sum = carry;
        for i in 0..4 {
            if col >= i && col - i < 2 {
                let u = ((unit >> (31 * i)) & ((1 << 31) - 1)) as u64;
                let p = b.mul_const(f(u), ld[col - i]);
                sum = b.add(sum, p);
            }
        }
        let bits = b.split_le(sum, 63);
        digits.push(b.le_sum(bits[..31].iter()));
        carry = b.le_sum(bits[31..].iter());
    }
    let lo = b.split_le(paid[0], 62);
    let hi = b.split_le(paid[1], 62);
    let expected = [
        b.le_sum(lo[..31].iter()),
        b.le_sum(lo[31..].iter()),
        b.le_sum(hi[..31].iter()),
        b.le_sum(hi[31..].iter()),
    ];
    let z = b.zero();
    let mut ok = vec![b.is_equal(carry, z)];
    for i in 0..6 {
        ok.push(b.is_equal(digits[i], if i < 4 { expected[i] } else { z }));
    }
    and(b, &ok)
}
struct Row {
    leaf: PsyUserLeafGadget,
    insert: MerkleProofGadget,
    original: MerkleProofGadget,
    contract: MerkleProofGadget,
    order_words: Vec<(u64, Word)>,
    funding_paths: Vec<MerkleProofGadget>,
    sender: Vec<Word>,
    claimed: Vec<Word>,
    baseline: Vec<Word>,
    consumed: Word,
    append: MerkleProofGadget,
    recover: MerkleProofGadget,
    nft_words: Vec<Word>,
}
pub struct SourcePageTargets {
    pub scope: Vec<Target>,
    pub facts: Vec<HashOutTarget>,
    pub before: ProgressTargets,
    pub after: ProgressTargets,
    pub len: Target,
    rows: Vec<Row>,
}
pub struct SourcePageCircuit {
    pub data: CircuitData<F, C, 2>,
    pub targets: SourcePageTargets,
    pub tape: Tape,
}
impl SourcePageCircuit {
    pub fn build(r: &Review) -> Result<Self> {
        let mut b = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
        let mut tape = Tape::default();
        let targets = SourcePageTargets::add(&mut b, &mut tape, r)?;
        let pi = targets.public();
        b.register_public_inputs(&pi);
        Ok(Self {
            data: b.build::<C>(),
            targets,
            tape,
        })
    }
}
impl SourcePageTargets {
    /// Circuit metadata only: identify public proof-opening targets without
    /// exposing witness values or changing any gate/fingerprint.
    pub(crate) fn target_labels(&self, target: Target) -> Vec<String> {
        let mut out = vec![];
        let mut note = |name: String, values: Vec<Target>| {
            for (i, t) in values.into_iter().enumerate() {
                if t == target {
                    out.push(format!("{name}:{i}"));
                }
            }
        };
        for (i, row) in self.rows.iter().enumerate() {
            note(format!("source-row-{i}-user"), row.leaf.to_targets());
            for (offset, w) in &row.order_words {
                note(format!("source-row-{i}-order-word-{offset}"), w.inputs());
            }
            for (kind, words) in [
                ("sender", &row.sender),
                ("claimed", &row.claimed),
                ("baseline", &row.baseline),
                ("nft", &row.nft_words),
            ] {
                for (j, w) in words.iter().enumerate() {
                    note(format!("source-row-{i}-{kind}-{j}"), w.inputs());
                }
            }
            note(format!("source-row-{i}-consumed"), row.consumed.inputs());
        }
        out
    }
    pub fn public(&self) -> Vec<Target> {
        let mut v = self.scope.clone();
        for h in &self.facts {
            v.extend(h.elements);
        }
        v.extend(self.before.fields());
        v.extend(self.after.fields());
        v.push(self.len);
        v
    }
    pub fn add(b: &mut CircuitBuilder<F, 2>, t: &mut Tape, r: &Review) -> Result<Self> {
        let scope = (0..41).map(|_| t.scalar(b)).collect::<Vec<_>>();
        let facts = (0..5).map(|_| t.hash(b)).collect::<Vec<_>>();
        let before = ProgressTargets::create(b, t);
        let len = t.scalar(b);
        b.range_check(len, 3);
        let one = b.one();
        let z = b.zero();
        let four = b.constant(f(4));
        let positive = lt(b, z, len, 3);
        b.assert_one(positive.target);
        let max = list_lte_circuit(b, vec![len], vec![four], 3);
        b.assert_one(max.target);
        for (target, value) in [
            (scope[0], 3),
            (scope[1], psy_config::PSY_NETWORK_MAGIC),
            (scope[2], r.kind),
            (scope[3], r.market),
        ] {
            let k = b.constant(f(value));
            b.connect(target, k);
        }
        b.range_check(scope[4], 24);
        b.range_check(scope[6], 32);
        b.range_check(scope[7], 32);
        b.range_check(scope[8], 24);
        b.range_check(before.accounts, 32);
        b.range_check(before.last_owner, 32);
        b.range_check(before.order_count, 24);
        b.range_check(before.recovery_count, 24);
        let first = b.is_equal(before.accounts, z);
        let empty_user = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(32).0);
        let empty_member = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(56).0);
        gh(b, first, before.users, empty_user);
        gh(b, first, before.orders, empty_member);
        gh(b, first, before.recovery, empty_member);
        ge(b, first, before.last_owner, z);
        ge(b, first, before.order_count, z);
        ge(b, first, before.recovery_count, z);
        let mut current = before.clone();
        let mut rows = vec![];
        for pos in 0..ROWS {
            let p = b.constant(f(pos as u64));
            let active = lt(b, p, len, 3);
            let leaf = PsyUserLeafGadget::create_virtual(b);
            t.targets.extend(leaf.to_targets());
            b.range_check(leaf.user_id, 32);
            b.range_check(leaf.nonce, 62);
            b.range_check(leaf.last_checkpoint_id, 32);
            let cp = list_lte_circuit(b, vec![leaf.last_checkpoint_id], vec![scope[6]], 32);
            ge(b, active, cp.target, one);
            let no_old = b.is_equal(current.accounts, z);
            let has_old = b.not(no_old);
            let compare = b.and(active, has_old);
            let ascending = lt(b, current.last_owner, leaf.user_id, 32);
            ge(b, compare, ascending.target, one);
            let insert = t.proof(b, 32);
            ge(b, active, insert.index, leaf.user_id);
            gh(b, active, insert.root, current.users);
            let empty = b.constant_hash(HashOut::ZERO);
            gh(b, active, insert.value, empty);
            let leaf_hash = leaf.to_hash::<H, F, 2>(b);
            let original = t.proof(b, 32);
            ge(b, active, original.index, leaf.user_id);
            gh(b, active, original.root, facts[0]);
            gh(b, active, original.value, leaf_hash);
            let owner_bits = b.split_le(leaf.user_id, 32);
            for j in 0..32 {
                let left = b.and(active, owner_bits[j]);
                gh(b, left, original.siblings[j], insert.siblings[j]);
            }

            let next = MerkleProofGadget::compute_root::<H, F, 2>(
                b,
                insert.index,
                leaf_hash,
                &insert.siblings,
            );
            current.users = select_hash(b, active, next, current.users);
            current.accounts = b.add(current.accounts, active.target);
            current.last_owner = b.select(active, leaf.user_id, current.last_owner);
            let contract = t.proof(b, 24);
            let mid = b.constant(f(r.market));
            b.connect(contract.index, mid);
            gh(b, active, contract.root, leaf.user_state_tree_root);
            let empty_contract = eqhash(b, contract.value, empty);
            let exists = b.not(empty_contract);
            let own = b.is_equal(leaf.user_id, scope[4]);
            let foreign = b.not(own);
            let read_order = and(b, &[active, exists, foreign]);
            let mut words = vec![];
            let mut values = BTreeMap::<String, Vec<Target>>::new();
            for (name, width) in order_fields(r.kind) {
                let mut row = vec![];
                for j in 0..width {
                    let o = r.offsets[name] + j as u64;
                    let slot = b.constant(f(o));
                    let w = Word::create(b, t, contract.value, slot, read_order, 31);
                    if width == 2 {
                        b.range_check(w.value, 62);
                    }
                    row.push(w.value);
                    words.push((o, w));
                }
                values.insert(name.into(), row);
            }
            let owner_nonzero = nz(b, leaf.user_id);
            let bound = b.constant(f(1 << 24));
            let supported = lt(b, leaf.user_id, bound, 32);
            let nonzero = nz(b, values["kind"][0]);
            let pool = b.is_equal(values["pool"][0], scope[4]);
            let candidate0 = and(b, &[read_order, owner_nonzero, supported, nonzero, pool]);
            let cs = b.add_const(leaf.user_id, f(r.offsets["consumed"]));
            let consumed = Word::create(b, t, facts[4], cs, candidate0, 31);
            b.range_check(values["nonce"][0], 62);
            b.range_check(consumed.value, 62);
            let unconsumed = lt(b, consumed.value, values["nonce"][0], 62);
            let candidate = b.and(candidate0, unconsumed);
            let mut funding_paths = vec![];
            let mut sender = vec![];
            let mut claimed = vec![];
            let mut baseline = vec![];
            let mut paid = vec![];
            let mut fee = z;
            let mut nft_words = vec![];
            let mut nft_ok = b._true();
            let mut paired_present = vec![];
            for i in 0..3 {
                let path = t.proof(b, 24);
                let cid = b.constant(f(r.assets[i].id));
                b.connect(path.index, cid);
                gh(b, candidate, path.root, leaf.user_state_tree_root);
                let empty_contract = eqhash(b, path.value, empty);
                let present = b.not(empty_contract);
                if r.kind >= 3 {
                    paired_present.push(present);
                }
                let sender_gate = b.and(candidate, present);
                if r.kind == 4 && i == 2 {
                    let origin = b.constant(f(1214));
                    let ss = b.mul_const_add(f(35), scope[4], origin);
                    let sw = Word::create(b, t, path.value, ss, sender_gate, 30);
                    let origin = b.constant(f(1215));
                    let cs = b.mul_const_add(f(35), leaf.user_id, origin);
                    let cw = Word::create(b, t, facts[3], cs, candidate, 30);
                    b.range_check(sw.value, 62);
                    b.range_check(cw.value, 62);
                    let delta = b.sub(sw.value, cw.value);
                    b.range_check(delta, 62);
                    paid.push([delta, z]);
                    let bits = b.split_le(cw.value, 62);
                    let q = b.le_sum(bits[..2].iter());
                    let base = b.constant(f(1182));
                    let base = b.mul_const_add(f(35), scope[4], base);
                    let base = b.mul_const_add(f(8), q, base);
                    // Existing NFT v3 stores the pre-deposit FIFO baseline.
                    let seq = b.is_equal(cw.value, values["nft_sequence"][0]);
                    let mut checks = vec![seq];
                    nft_words.push(sw);
                    nft_words.push(cw);
                    for j in 0..8 {
                        let slot = b.add_const(base, f(j));
                        let w = Word::create(b, t, path.value, slot, sender_gate, 30);
                        let name = if j < 4 {
                            format!("token_id_{j}")
                        } else {
                            format!("metadata_hash_{}", j - 4)
                        };
                        checks.push(b.is_equal(w.value, values[&name][0]));
                        nft_words.push(w);
                    }
                    nft_ok = and(b, &checks);
                    funding_paths.push(path);
                    continue;
                }
                let native = i == 0;
                let width = if native { 1 } else { 2 };
                let mut sent = vec![];
                let mut base = vec![];
                for j in 0..width {
                    let origin = b.constant(f(if native { 3 } else { 33554453 } + j as u64));
                    let send_slot =
                        b.mul_const_add(f(if native { 2 } else { 4 }), scope[4], origin);
                    let sw = Word::create(
                        b,
                        t,
                        path.value,
                        send_slot,
                        sender_gate,
                        if native { 32 } else { 31 },
                    );
                    sent.push(sw.value);
                    sender.push(sw);
                    let origin = b.constant(f(if native { 4 } else { 33554455 } + j as u64));
                    let claim_slot =
                        b.mul_const_add(f(if native { 2 } else { 4 }), leaf.user_id, origin);
                    let cw = Word::create(
                        b,
                        t,
                        facts[i + 1],
                        claim_slot,
                        candidate,
                        if native { 32 } else { 31 },
                    );
                    let origin = b.constant(f(r.offsets[if native {
                        "settled_fee"
                    } else if i == 1 {
                        "settled_a"
                    } else {
                        "settled_b"
                    }] + j as u64));
                    let base_slot = b.mul_const_add(f(width as u64), leaf.user_id, origin);
                    let bw = Word::create(b, t, facts[4], base_slot, candidate, 31);
                    ge(b, candidate, cw.value, bw.value);
                    base.push(bw.value);
                    claimed.push(cw);
                    baseline.push(bw);
                }
                if native {
                    b.range_check(sent[0], 62);
                    b.range_check(base[0], 62);
                    fee = b.sub(sent[0], base[0]);
                    b.range_check(fee, 62);
                } else {
                    paid.push(subtract(b, [sent[0], sent[1]], [base[0], base[1]]));
                }
                funding_paths.push(path);
            }
            b.range_check(values["deadline"][0], 32);
            b.range_check(values["order_checkpoint"][0], 32);
            let source_time =
                list_lte_circuit(b, vec![values["order_checkpoint"][0]], vec![scope[6]], 32);
            ge(b, candidate, source_time.target, one);
            b.range_check(values["cancelled"][0], 1);
            let pa = paid[0];
            let pb = paid[1];
            let k = values["kind"][0];
            let a0 = b.is_equal(pa[0], z);
            let a1 = b.is_equal(pa[1], z);
            let a_zero = b.and(a0, a1);
            let b0 = b.is_equal(pb[0], z);
            let b1 = b.is_equal(pb[1], z);
            let b_zero = b.and(b0, b1);
            let x = if r.kind == 4 {
                [values["price"][0], values["price"][1]]
            } else {
                [values["x"][0], values["x"][1]]
            };
            let same = |b: &mut CircuitBuilder<F, 2>, a: [Target; 2], c: [Target; 2]| {
                let x = b.is_equal(a[0], c[0]);
                let y = b.is_equal(a[1], c[1]);
                b.and(x, y)
            };
            let kind1 = b.is_equal(k, one);
            let two = b.constant(f(2));
            let kind2 = b.is_equal(k, two);
            let a_x = same(b, pa, x);
            let b_x = same(b, pb, x);
            let funded = if r.kind == 4 {
                let one_nft = b.is_equal(pb[0], one);
                let listing = and(b, &[kind1, a_zero, one_nft, nft_ok]);
                let buy = and(b, &[kind2, a_x, b_zero]);
                b.or(listing, buy)
            } else if r.kind == 1 || r.kind == 3 {
                let side0 = b.is_equal(values["side"][0], z);
                let side1 = b.is_equal(values["side"][0], one);
                let swap0 = and(b, &[side0, a_x, b_zero]);
                let swap1 = and(b, &[side1, b_x, a_zero]);
                let swap = b.or(swap0, swap1);
                let swap = b.and(kind1, swap);
                let y = [values["y"][0], values["y"][1]];
                let b_y = same(b, pb, y);
                let add = and(b, &[kind2, a_x, b_y]);
                let three = b.constant(f(3));
                let kind3 = b.is_equal(k, three);
                let remove = and(b, &[kind3, a_zero, b_zero]);
                if r.kind == 3 {
                    swap
                } else {
                    let p = b.or(swap, add);
                    b.or(p, remove)
                }
            } else {
                let buy = and(b, &[kind1, a_zero, b_x]);
                let qty = quantity(b, r.unit, values["lots"][0], pa);
                let sell = and(b, &[kind2, b_zero, qty]);
                b.or(buy, sell)
            };
            let fee_expected = b.constant(f(1_000_100_000));
            let fee_valid = b.is_equal(fee, fee_expected);
            let not_cancelled = b.is_equal(values["cancelled"][0], z);
            let live = list_lte_circuit(b, vec![scope[6]], vec![values["deadline"][0]], 32);
            let eligible = and(b, &[candidate, funded, fee_valid, not_cancelled, live]);
            // Paired CFC snapshots require prepared foreign funding subtrees.
            // Absent subtrees stay explicitly recoverable, never silently read
            // as registered empty contracts or admitted into a stuck page.
            let eligible = if r.kind >= 3 {
                let prepared = and(b, &paired_present);
                b.and(eligible, prepared)
            } else {
                eligible
            };
            let has_asset = b.and(a_zero, b_zero);
            let nofee = b.is_equal(fee, z);
            let nofunds = b.and(has_asset, nofee);
            let funds = b.not(nofunds);
            let not_eligible = b.not(eligible);
            let recovery = and(b, &[candidate, not_eligible, funds]);
            let mut raw = vec![
                b.constant(f(0x46494e414c4f5244)),
                scope[6],
                scope[3],
                scope[4],
                leaf.user_id,
            ];
            for (name, _) in order_fields(r.kind) {
                raw.extend(&values[name]);
            }
            raw.extend([consumed.value, pa[0], pa[1], pb[0], pb[1], fee]);
            let terms = b.hash_n_to_hash_no_pad::<H>(raw);
            let priority = b.mul_const_add(f(1 << 24), values["order_checkpoint"][0], leaf.user_id);
            let append = t.proof(b, 56);
            let recover = t.proof(b, 56);
            for (g, proof, index, old) in [
                (eligible, &append, priority, current.orders),
                (recovery, &recover, priority, current.recovery),
            ] {
                ge(b, g, proof.index, index);
                gh(b, g, proof.root, old);
                gh(b, g, proof.value, empty);
            }
            let member = |b: &mut CircuitBuilder<F, 2>, index: Target| {
                let mut raw = vec![b.constant(f(0x5354524d454d33))];
                raw.extend(&scope[..8]);
                raw.extend(&scope[9..17]);
                raw.extend(&scope[25..]);
                raw.extend([index, leaf.user_id, values["nonce"][0]]);
                raw.extend(terms.elements);
                b.hash_n_to_hash_no_pad::<H>(raw)
            };
            let a = member(b, priority);
            let a =
                MerkleProofGadget::compute_root::<H, F, 2>(b, append.index, a, &append.siblings);
            current.orders = select_hash(b, eligible, a, current.orders);
            current.order_count = b.add(current.order_count, eligible.target);
            let a = member(b, priority);
            let a =
                MerkleProofGadget::compute_root::<H, F, 2>(b, recover.index, a, &recover.siblings);
            current.recovery = select_hash(b, recovery, a, current.recovery);
            current.recovery_count = b.add(current.recovery_count, recovery.target);
            rows.push(Row {
                leaf,
                insert,
                original,
                contract,
                order_words: words,
                funding_paths,
                sender,
                claimed,
                baseline,
                consumed,
                append,
                recover,
                nft_words,
            });
        }
        let full = b.is_equal(len, four);
        let final_root = eqhash(b, current.users, facts[0]);
        let valid = b.or(full, final_root);
        b.assert_one(valid.target);
        Ok(Self {
            scope,
            facts,
            before,
            after: current,
            len,
            rows,
        })
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct SourceRow {
    pub account: Account,
    pub insert: MerkleProofCore<Q<F>>,
    pub original: MerkleProofCore<Q<F>>,
    pub append: MerkleProofCore<Q<F>>,
    pub recover: MerkleProofCore<Q<F>>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct SourcePage {
    pub scope: Vec<u64>,
    pub facts: Vec<Hash>,
    pub before: Progress,
    pub after: Progress,
    pub rows: Vec<SourceRow>,
}
#[derive(Clone)]
struct Sparse {
    height: usize,
    leaves: BTreeMap<u64, Q<F>>,
}
impl Sparse {
    fn new(height: usize) -> Self {
        Self {
            height,
            leaves: BTreeMap::new(),
        }
    }
    fn levels(&self) -> Vec<BTreeMap<u64, Q<F>>> {
        let mut out = vec![self.leaves.clone()];
        for h in 0..self.height {
            let mut parents = BTreeMap::new();
            for i in out[h].keys() {
                let parent = i / 2;
                if parents.contains_key(&parent) {
                    continue;
                }
                let z = H::get_zero_hash(h);
                let a = *out[h].get(&(2 * parent)).unwrap_or(&z);
                let b = *out[h].get(&(2 * parent + 1)).unwrap_or(&z);
                parents.insert(parent, Q(H::two_to_one(a.0, b.0)));
            }
            out.push(parents);
        }
        out
    }
    fn root(&self) -> Hash {
        arr(*self.levels()[self.height]
            .get(&0)
            .unwrap_or(&H::get_zero_hash(self.height)))
    }
    fn proof(&self, index: u64) -> MerkleProofCore<Q<F>> {
        let levels = self.levels();
        MerkleProofCore::new_from_params::<H>(
            index,
            *levels[0].get(&index).unwrap_or(&Q::ZERO),
            (0..self.height)
                .map(|h| {
                    *levels[h]
                        .get(&((index >> h) ^ 1))
                        .unwrap_or(&H::get_zero_hash(h))
                })
                .collect(),
        )
    }
    fn set(&mut self, index: u64, value: Hash) {
        self.leaves.insert(index, Q(h(value)));
    }
}
fn member(scope: &[u64], index: u64, row: &Member) -> Hash {
    let mut raw = vec![0x5354524d454d33];
    raw.extend(&scope[..8]);
    raw.extend(&scope[9..17]);
    raw.extend(&scope[25..]);
    raw.extend([index, row.owner, row.nonce]);
    raw.extend(row.terms);
    hash(&raw)
}
pub fn prepare(r: &Review, s: &Snapshot, history: Q<F>) -> Result<Vec<SourcePage>> {
    let verified = verify_snapshot(r, s, history)?;
    let members = verified
        .trading_manifest
        .as_ref()
        .map(|m| m.members.clone())
        .unwrap_or_default();
    let mut scope = verified
        .trading_manifest
        .as_ref()
        .map(|m| m.fields.clone())
        .unwrap_or_else(|| s.fields.clone());
    scope[0] = 3;
    let mut canonical = Sparse::new(56);
    for (i, row) in members.iter().enumerate() {
        let a = s
            .accounts
            .iter()
            .find(|a| a.leaf.user_id.to_canonical_u64() == row.owner)
            .unwrap();
        let key = (read(&a.market, r.offsets["order_checkpoint"])? << 24) | row.owner;
        canonical.set(key, member(&scope, key, row));
    }
    scope[8] = members.len() as u64;
    scope[17..21].copy_from_slice(&canonical.root());
    let vault = s
        .accounts
        .iter()
        .find(|a| a.leaf.user_id.to_canonical_u64() == scope[4])
        .context("source vault")?;
    let facts = vec![
        arr(s.history.roots.user_tree_root),
        arr(vault
            .native
            .as_ref()
            .context("vault native")?
            .contract_path
            .value),
        arr(vault
            .asset_a
            .as_ref()
            .context("vault A")?
            .contract_path
            .value),
        arr(vault
            .asset_b
            .as_ref()
            .context("vault B")?
            .contract_path
            .value),
        arr(vault.market.contract_path.value),
    ];
    let mut users = Sparse::new(32);
    let mut orders = Sparse::new(56);
    let mut recovery = Sparse::new(56);
    let mut original = Sparse::new(32);
    for a in &s.accounts {
        original.set(a.leaf.user_id.to_canonical_u64(), arr(a.leaf.qfhash::<H>()));
    }
    let mut progress = Progress::empty();
    let mut pages = vec![];
    for chunk in s.accounts.chunks(ROWS) {
        let before = progress.clone();
        let mut rows = vec![];
        for a in chunk {
            let owner = a.leaf.user_id.to_canonical_u64();
            let insert = users.proof(owner);
            let key = if owner == scope[4] || a.market.contract_path.value == Q::ZERO {
                0
            } else {
                (read(&a.market, r.offsets["order_checkpoint"])? << 24) | owner
            };
            let append = orders.proof(key);
            let recover = recovery.proof(key);
            users.set(owner, arr(a.leaf.qfhash::<H>()));
            if let Some(row) = members.iter().find(|x| x.owner == owner) {
                orders.set(key, member(&scope, key, row));
                progress.order_count += 1;
            }
            if let Some(row) = verified.recovery_members.iter().find(|x| x.owner == owner) {
                recovery.set(key, member(&scope, key, row));
                progress.recovery_count += 1;
            }
            progress.accounts += 1;
            progress.last_owner = owner;
            progress.users = users.root();
            progress.orders = orders.root();
            progress.recovery = recovery.root();
            rows.push(SourceRow {
                account: a.clone(),
                insert,
                original: original.proof(owner),
                append,
                recover,
            });
        }
        pages.push(SourcePage {
            scope: scope.clone(),
            facts: facts.clone(),
            before,
            after: progress.clone(),
            rows,
        });
    }
    ensure!(
        progress.users == facts[0]
            && progress.order_count == scope[8]
            && progress.orders == scope[17..21],
        "complete native source coverage plan"
    );
    Ok(pages)
}
fn proof_at(
    opening: &StateOpening,
    slot: u64,
    enabled: bool,
    height: usize,
) -> Result<MerkleProofCore<Q<F>>> {
    if enabled {
        opening
            .words
            .iter()
            .find(|w| w.index == slot / 4)
            .cloned()
            .context("missing authenticated coverage word")
    } else {
        Ok(empty_proof(0, height))
    }
}
fn read(opening: &StateOpening, offset: u64) -> Result<u64> {
    if opening.contract_path.value == Q::ZERO {
        return Ok(0);
    }
    let p = opening
        .words
        .iter()
        .find(|w| w.index == offset / 4)
        .context("coverage source word")?;
    Ok(p.value.0.elements[(offset % 4) as usize].to_canonical_u64())
}
impl SourcePage {
    pub fn public(&self) -> Vec<u64> {
        let mut p = self.scope.clone();
        for h in &self.facts {
            p.extend(h);
        }
        p.extend(self.before.fields());
        p.extend(self.after.fields());
        p.push(self.rows.len() as u64);
        p
    }
}
impl SourcePageTargets {
    pub fn set(
        &self,
        pw: &mut PartialWitness<F>,
        r: &Review,
        s: &Snapshot,
        page: &SourcePage,
    ) -> Result<()> {
        ensure!(
            !page.rows.is_empty()
                && page.rows.len() <= ROWS
                && page.scope.len() == 41
                && page.facts.len() == 5,
            "source page witness shape"
        );
        for (t, v) in self.scope.iter().zip(&page.scope) {
            pw.set_target(*t, f(*v))?;
        }
        for (t, v) in self.facts.iter().zip(&page.facts) {
            pw.set_hash_target(*t, h(*v))?;
        }
        self.before.set(pw, &page.before)?;
        pw.set_target(self.len, f(page.rows.len() as u64))?;
        let vault_id = page.scope[4];
        let vault = s
            .accounts
            .iter()
            .find(|a| a.leaf.user_id.to_canonical_u64() == vault_id)
            .context("coverage vault")?;
        let va = [
            vault.native.as_ref().context("vault native")?,
            vault.asset_a.as_ref().context("vault A")?,
            vault.asset_b.as_ref().context("vault B")?,
        ];
        for (pos, t) in self.rows.iter().enumerate() {
            let active = pos < page.rows.len();
            let row = &page.rows[if active { pos } else { 0 }];
            let a = &row.account;
            let owner = a.leaf.user_id.to_canonical_u64();
            t.leaf.set_witness(pw, &a.leaf)?;
            let insertion = if active {
                row.insert.clone()
            } else {
                empty_proof(owner, 32)
            };
            t.insert.set_witness_core_proof_q(pw, &insertion)?;
            let original = if active {
                row.original.clone()
            } else {
                empty_proof(owner, 32)
            };
            t.original.set_witness_core_proof_q(pw, &original)?;
            t.contract
                .set_witness_core_proof_q(pw, &a.market.contract_path)?;
            let read_order = active && owner != vault_id && a.market.contract_path.value != Q::ZERO;
            for (o, w) in &t.order_words {
                w.proof
                    .set_witness_core_proof_q(pw, &proof_at(&a.market, *o, read_order, 31)?)?;
            }
            let candidate0 = read_order
                && owner > 0
                && owner < 1 << 24
                && read(&a.market, r.offsets["kind"])? != 0
                && read(&a.market, r.offsets["pool"])? == vault_id;
            let consumed = if candidate0 {
                read(&vault.market, r.offsets["consumed"] + owner)?
            } else {
                0
            };
            t.consumed.proof.set_witness_core_proof_q(
                pw,
                &proof_at(&vault.market, r.offsets["consumed"] + owner, candidate0, 31)?,
            )?;
            let candidate = candidate0 && read(&a.market, r.offsets["nonce"])? > consumed;
            let aa = [a.native.as_ref(), a.asset_a.as_ref(), a.asset_b.as_ref()];
            let mut word = 0;
            for i in 0..3 {
                let actual = aa[i];
                let path = if candidate {
                    actual
                        .context("source funding contract")?
                        .contract_path
                        .clone()
                } else {
                    empty_proof(r.assets[i].id, 24)
                };
                t.funding_paths[i].set_witness_core_proof_q(pw, &path)?;
                let sender_gate = candidate && path.value != Q::ZERO;
                if r.kind == 4 && i == 2 {
                    let sent_slot = 1214 + 35 * vault_id;
                    let claim_slot = 1215 + 35 * owner;
                    t.nft_words[0].proof.set_witness_core_proof_q(
                        pw,
                        &if sender_gate {
                            proof_at(actual.unwrap(), sent_slot, true, 30)?
                        } else {
                            empty_proof(0, 30)
                        },
                    )?;
                    t.nft_words[1].proof.set_witness_core_proof_q(
                        pw,
                        &proof_at(va[2], claim_slot, candidate, 30)?,
                    )?;
                    let claimed = if candidate {
                        read(va[2], claim_slot)?
                    } else {
                        0
                    };
                    let payload = 1182 + 35 * vault_id + 8 * (claimed % 4);
                    for j in 0..8 {
                        t.nft_words[2 + j].proof.set_witness_core_proof_q(
                            pw,
                            &if sender_gate {
                                proof_at(actual.unwrap(), payload + j as u64, true, 30)?
                            } else {
                                empty_proof(0, 30)
                            },
                        )?;
                    }
                    continue;
                }
                let width = if i == 0 { 1 } else { 2 };
                for j in 0..width {
                    let send = (if i == 0 {
                        3 + 2 * vault_id
                    } else {
                        33554453 + 4 * vault_id
                    }) + j as u64;
                    let claim = (if i == 0 {
                        4 + 2 * owner
                    } else {
                        33554455 + 4 * owner
                    }) + j as u64;
                    let base = r.offsets[if i == 0 {
                        "settled_fee"
                    } else if i == 1 {
                        "settled_a"
                    } else {
                        "settled_b"
                    }] + width as u64 * owner
                        + j as u64;
                    t.sender[word].proof.set_witness_core_proof_q(
                        pw,
                        &if sender_gate {
                            proof_at(actual.unwrap(), send, true, if i == 0 { 32 } else { 31 })?
                        } else {
                            empty_proof(0, if i == 0 { 32 } else { 31 })
                        },
                    )?;
                    t.claimed[word].proof.set_witness_core_proof_q(
                        pw,
                        &proof_at(va[i], claim, candidate, if i == 0 { 32 } else { 31 })?,
                    )?;
                    t.baseline[word].proof.set_witness_core_proof_q(
                        pw,
                        &proof_at(&vault.market, base, candidate, 31)?,
                    )?;
                    word += 1;
                }
            }
            t.append.set_witness_core_proof_q(pw, &row.append)?;
            t.recover.set_witness_core_proof_q(pw, &row.recover)?;
        }
        Ok(())
    }
}

impl Word {
    pub(crate) fn inputs(&self) -> Vec<Target> {
        let mut v = vec![self.proof.index];
        v.extend(self.proof.value.elements);
        for s in &self.proof.siblings {
            v.extend(s.elements);
        }
        v
    }
    pub(crate) fn empty(&self, pw: &mut PartialWitness<F>, _slot: u64) -> Result<()> {
        self.proof
            .set_witness_core_proof_q(pw, &empty_proof(0, self.proof.siblings.len()))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PriorityMember {
    pub index: u64,
    pub member: Member,
}
#[derive(Clone)]
pub struct PriorityTree {
    tree: Sparse,
    pub members: Vec<PriorityMember>,
}
impl PriorityTree {
    /// Untrusted planner helper; only source coverage authenticates this root.
    pub fn from_committed(scope: &[u64], mut members: Vec<PriorityMember>) -> Result<Self> {
        ensure!(
            scope.len() == 41 && scope[0] == 3,
            "planner requires authenticated source-page v3 domain, not raw snapshot fields"
        );
        members.sort_by_key(|m| m.index);
        ensure!(
            members.windows(2).all(|w| w[0].index < w[1].index),
            "unique planner members"
        );
        let mut tree = Sparse::new(56);
        for m in &members {
            ensure!(m.index < 1 << 56, "priority index");
            tree.set(m.index, member(scope, m.index, &m.member));
        }
        Ok(Self { tree, members })
    }
    pub fn root(&self) -> Hash {
        self.tree.root()
    }
    pub fn proof(&self, index: u64) -> crate::checkpoint_stream::Path {
        let p = self.tree.proof(index);
        crate::checkpoint_stream::Path {
            index: p.index,
            value: arr(p.value),
            siblings: p.siblings.into_iter().map(arr).collect(),
        }
    }
    pub fn remove(&mut self, index: u64) {
        self.tree.leaves.remove(&index);
    }
}
pub fn priority(r: &Review, s: &Snapshot, history: Q<F>) -> Result<PriorityTree> {
    let verified = verify_snapshot(r, s, history)?;
    let pages = prepare(r, s, history)?;
    let scope = &pages.first().context("source accounts")?.scope;
    let mut tree = Sparse::new(56);
    let mut members = vec![];
    for m in verified
        .trading_manifest
        .map(|m| m.members)
        .unwrap_or_default()
    {
        let a = s
            .accounts
            .iter()
            .find(|a| a.leaf.user_id.to_canonical_u64() == m.owner)
            .unwrap();
        let index = (read(&a.market, r.offsets["order_checkpoint"])? << 24) | m.owner;
        tree.set(index, member(scope, index, &m));
        members.push(PriorityMember { index, member: m });
    }
    members.sort_by_key(|m| m.index);
    Ok(PriorityTree { tree, members })
}
