//! Complete Cartesian frontier pages over an authenticated remaining set.
//! No bounded full-set witness: each page proves up to four canonical pairs.
//! Source eligibility/quotes stay fixed at C; current selected state is checked
//! again by the actual settlement CFC. No inclusion-tip/finality claim follows.
use crate::{
    checkpoint_stream::{Hash, Path},
    final_state_coverage::{order_fields, verify_snapshot, Review, Snapshot},
    stream_order,
    stream_source::{lt, PriorityMember, PriorityTree, Tape},
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
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::{circuit_builder::CircuitBuilder, config::Hasher},
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_common_circuit::{
    builder::hash::core::CircuitBuilderHashCore,
    hash::merkle::gadgets::merkle_proof::MerkleProofGadget,
};
use psy_crypto::hash::{merkle::core::MerkleProofCore, traits::hasher::MerkleZeroHasher};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
pub const PAGE: usize = 4;
pub const SCAN: u64 = 10;
pub const CARRY: u64 = 11;
pub const CONTEXT_TAG: u64 = 6004517965416974136;
const BEST_TAG: u64 = 0x5041495242455354;
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn h(a: Hash) -> HashOut<F> {
    HashOut { elements: a.map(f) }
}
fn hash(v: &[u64]) -> Hash {
    H::hash_no_pad(&v.iter().copied().map(f).collect::<Vec<_>>())
        .elements
        .map(|v| v.to_canonical_u64())
}
pub fn empty() -> Hash {
    <H as MerkleZeroHasher<Q<F>>>::get_zero_hash(56)
        .0
        .elements
        .map(|n| n.to_canonical_u64())
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Record {
    pub index: u64,
    pub owner: u64,
    pub values: Vec<u64>,
    pub consumed: u64,
    pub paid_a: [u64; 2],
    pub paid_b: [u64; 2],
    pub fee: u64,
}
fn offset(kind: u64, name: &str) -> usize {
    let mut i = 0;
    for (n, w) in order_fields(kind) {
        if n == name {
            return i;
        }
        i += w;
    }
    panic!("unknown source column {name}")
}
impl Record {
    pub fn value(&self, kind: u64, name: &str) -> u64 {
        self.values[offset(kind, name)]
    }
    pub fn wide(&self, kind: u64, name: &str) -> u128 {
        let i = offset(kind, name);
        self.values[i] as u128 + ((self.values[i + 1] as u128) << 62)
    }
    pub fn terms(&self, scope: &[u64]) -> Hash {
        let mut v = vec![0x46494e414c4f5244, scope[6], scope[3], scope[4], self.owner];
        v.extend(&self.values);
        v.extend([
            self.consumed,
            self.paid_a[0],
            self.paid_a[1],
            self.paid_b[0],
            self.paid_b[1],
            self.fee,
        ]);
        hash(&v)
    }
    pub fn leaf(&self, scope: &[u64], kind: u64) -> Hash {
        let mut v = vec![0x5354524d454d33];
        v.extend(&scope[..8]);
        v.extend(&scope[9..17]);
        v.extend(&scope[25..]);
        v.extend([self.index, self.owner, self.value(kind, "nonce")]);
        v.extend(self.terms(scope));
        hash(&v)
    }
    pub fn source(r: &Review, s: &Snapshot, m: &PriorityMember) -> Result<Self> {
        let coverage = verify_snapshot(r, s, s.history.checkpoint_path.root)?;
        let a = s
            .accounts
            .iter()
            .find(|a| a.leaf.user_id.to_canonical_u64() == m.member.owner)
            .context("source member")?;
        let read = |account: &crate::final_state_coverage::Account, slot: u64| -> Result<u64> {
            let p = account
                .market
                .words
                .iter()
                .find(|p| p.index == slot / 4)
                .context("source word")?;
            Ok(p.value.0.elements[(slot % 4) as usize].to_canonical_u64())
        };
        let vault = s
            .accounts
            .iter()
            .find(|a| a.leaf.user_id.to_canonical_u64() == s.fields[4])
            .context("source vault")?;
        let row = coverage
            .audit
            .iter()
            .find(|a| a.owner == m.member.owner && a.disposition == "eligible")
            .context("eligible source member")?;
        let pair = |s: &Option<String>| -> Result<[u64; 2]> {
            let n = s.as_ref().context("funding")?.parse::<u128>()?;
            Ok([(n % (1u128 << 62)) as u64, (n >> 62) as u64])
        };
        let mut values = vec![];
        for (n, w) in order_fields(r.kind) {
            for j in 0..w {
                values.push(read(a, r.offsets[n] + j as u64)?);
            }
        }
        Ok(Self {
            index: m.index,
            owner: m.member.owner,
            values,
            consumed: read(vault, r.offsets["consumed"] + m.member.owner)?,
            paid_a: pair(&row.paid_a)?,
            paid_b: pair(&row.paid_b)?,
            fee: row.fee.context("fee")?,
        })
    }
}
pub fn compatible(kind: u64, a: &Record, b: &Record) -> bool {
    if kind == 3 {
        a.value(kind, "side") == 0
            && b.value(kind, "side") == 1
            && a.wide(kind, "y") <= b.wide(kind, "x")
            && b.wide(kind, "y") <= a.wide(kind, "x")
    } else {
        a.value(kind, "kind") == 1
            && b.value(kind, "kind") == 2
            && b.value(kind, "seller") == a.owner
            && b.value(kind, "listing_nonce") == a.value(kind, "nonce")
            && a.wide(kind, "price") == b.wide(kind, "price")
    }
}
fn time(kind: u64, a: &Record, b: &Record) -> Ordering {
    (a.value(kind, "order_checkpoint"), a.owner).cmp(&(b.value(kind, "order_checkpoint"), b.owner))
}
fn price(kind: u64, a: &Record, b: &Record) -> Ordering {
    use num_bigint::BigUint;
    let l = BigUint::from(a.wide(kind, "y")) * BigUint::from(b.wide(kind, "x"));
    let r = BigUint::from(b.wide(kind, "y")) * BigUint::from(a.wide(kind, "x"));
    l.cmp(&r).then_with(|| time(kind, a, b))
}
pub fn before(kind: u64, a: &Record, b: &Record, c: &Record, d: &Record) -> bool {
    let cmp = if kind == 3 {
        price(kind, a, c).then_with(|| price(kind, b, d))
    } else {
        time(kind, a, c).then_with(|| time(kind, b, d))
    };
    cmp == Ordering::Less
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Best {
    pub a: Record,
    pub b: Record,
}
impl Best {
    pub fn hash(&self, scope: &[u64], kind: u64) -> Hash {
        let mut v = vec![BEST_TAG];
        v.extend(self.a.leaf(scope, kind));
        v.extend(self.b.leaf(scope, kind));
        hash(&v)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct State {
    pub outer: Hash,
    pub inner: Hash,
    pub best: Option<Best>,
    pub cursor: u64,
    pub complete: bool,
}
impl State {
    pub fn initial(root: Hash) -> Self {
        Self {
            outer: root,
            inner: root,
            best: None,
            cursor: 0,
            complete: false,
        }
    }
    pub fn values(&self, scope: &[u64], kind: u64) -> Vec<u64> {
        let mut v = self.outer.to_vec();
        v.extend(self.inner);
        v.extend(
            self.best
                .as_ref()
                .map(|b| b.hash(scope, kind))
                .unwrap_or([0; 4]),
        );
        v.extend([self.cursor, u64::from(self.complete)]);
        v
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Row {
    pub a: Record,
    pub b: Record,
    pub outer: Path,
    pub inner: Path,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Option<Path>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Page {
    pub before: State,
    pub after: State,
    pub rows: Vec<Row>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head: Option<Path>,
}
pub fn next_page(
    kind: u64,
    scope: &[u64],
    q: &PriorityTree,
    records: &[Record],
    before: &State,
) -> Result<Page> {
    ensure!(
        !records.is_empty() && records.len() < (1 << 24) && !before.complete,
        "nonempty unfinished frontier"
    );
    let mut state = before.clone();
    let n = records.len();
    let mut rows = vec![];
    let oi = before.cursor as usize / n;
    let ii = before.cursor as usize % n;
    ensure!(oi < n, "frontier cursor");
    let mut outer = q.clone();
    for r in &records[..oi] {
        outer.remove(r.index);
    }
    let mut inner = q.clone();
    for r in &records[..ii] {
        inner.remove(r.index);
    }
    ensure!(
        outer.root() == state.outer && inner.root() == state.inner,
        "exact host frontier roots"
    );
    for _ in 0..PAGE {
        let oi = state.cursor as usize / n;
        let ii = state.cursor as usize % n;
        if oi == n {
            break;
        }
        let a = records[oi].clone();
        let b = records[ii].clone();
        rows.push(Row {
            outer: outer.proof(a.index),
            inner: inner.proof(b.index),
            a: a.clone(),
            b: b.clone(),
            next: None,
        });
        if compatible(kind, &a, &b)
            && state
                .best
                .as_ref()
                .map(|c| before_pair(kind, &a, &b, c))
                .unwrap_or(true)
        {
            state.best = Some(Best {
                a: a.clone(),
                b: b.clone(),
            });
        }
        inner.remove(b.index);
        state.cursor += 1;
        if ii + 1 == n {
            outer.remove(a.index);
            inner = q.clone();
            if oi + 1 == n {
                state.complete = true;
                inner.remove_all(records);
            }
        }
        state.outer = outer.root();
        state.inner = inner.root();
    }
    Ok(Page {
        before: before.clone(),
        after: state,
        rows,
        head: None,
    })
}
fn before_pair(kind: u64, a: &Record, b: &Record, c: &Best) -> bool {
    before(kind, a, b, &c.a, &c.b)
}
/// Visit every unordered pair once. Orientation is derived from the authenticated
/// side/kind, never chosen by the Executor. The old Cartesian builder is intact.
pub fn next_triangular_page(
    kind: u64,
    scope: &[u64],
    q: &PriorityTree,
    records: &[Record],
    before: &State,
) -> Result<Page> {
    ensure!(
        !records.is_empty() && !before.complete,
        "unfinished nonempty triangle"
    );
    ensure!(
        records.windows(2).all(|w| w[0].index < w[1].index),
        "canonical source order"
    );
    let n = records.len();
    let mut oi = 0;
    let mut skip = before.cursor as usize;
    while oi + 1 < n && skip >= n - oi - 1 {
        skip -= n - oi - 1;
        oi += 1;
    }
    ensure!(
        oi + 1 < n || (n == 1 && before.cursor == 0),
        "triangle cursor"
    );
    let mut ii = oi + 1 + skip;
    let mut outer = q.clone();
    for r in &records[..oi] {
        outer.remove(r.index);
    }
    let mut inner = outer.clone();
    let head = if before.cursor == 0 {
        Some(outer.proof(records[oi].index))
    } else {
        None
    };
    inner.remove(records[oi].index);
    for r in &records[oi + 1..ii] {
        inner.remove(r.index);
    }
    ensure!(
        outer.root() == before.outer
            && (before.cursor == 0 && before.inner == q.root()
                || before.cursor > 0 && inner.root() == before.inner),
        "exact triangular roots"
    );
    let mut state = before.clone();
    let mut rows = vec![];
    if n == 1 {
        state.outer = empty();
        state.inner = empty();
        state.complete = true;
    }
    while rows.len() < PAGE && !state.complete {
        let a = records[oi].clone();
        let b = records[ii].clone();
        let mut row = Row {
            outer: outer.proof(a.index),
            inner: inner.proof(b.index),
            a: a.clone(),
            b: b.clone(),
            next: None,
        };
        let (left, right) = if compatible(kind, &b, &a) {
            (&b, &a)
        } else {
            (&a, &b)
        };
        if compatible(kind, left, right)
            && state
                .best
                .as_ref()
                .map(|v| before_pair(kind, left, right, v))
                .unwrap_or(true)
        {
            state.best = Some(Best {
                a: left.clone(),
                b: right.clone(),
            });
        }
        inner.remove(b.index);
        state.cursor += 1;
        ii += 1;
        if ii == n {
            outer.remove(a.index);
            oi += 1;
            ii = oi + 1;
            row.next = Some(outer.proof(records[oi].index));
            inner = outer.clone();
            inner.remove(records[oi].index);
            if oi + 1 == n {
                outer.remove(records[oi].index);
                state.complete = true;
            }
        }
        state.outer = outer.root();
        state.inner = inner.root();
        rows.push(row);
    }
    Ok(Page {
        before: before.clone(),
        after: state,
        rows,
        head,
    })
}
fn set_path(
    pw: &mut PartialWitness<F>,
    target: &MerkleProofGadget,
    path: Option<&Path>,
) -> Result<()> {
    let p = path
        .map(|p| {
            MerkleProofCore::new_from_params::<H>(
                p.index,
                Q(h(p.value)),
                p.siblings.iter().map(|s| Q(h(*s))).collect(),
            )
        })
        .unwrap_or_else(|| {
            MerkleProofCore::new_from_params::<H>(
                0,
                Q::ZERO,
                (0..56).map(H::get_zero_hash).collect(),
            )
        });
    target.set_witness_core_proof_q(pw, &p)?;
    Ok(())
}
fn minimum(
    b: &mut CircuitBuilder<F, 2>,
    gate: BoolTarget,
    p: &MerkleProofGadget,
    root: HashOutTarget,
) {
    gh(b, gate, p.root, root);
    let zero = b.constant_hash(HashOut::ZERO);
    let absent = eq_hash(b, p.value, zero);
    let z = b.zero();
    eq(b, gate, absent.target, z);
    let bits = b.split_le(p.index, 56);
    for j in 0..56 {
        let g = b.and(gate, bits[j]);
        let e = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(j).0);
        gh(b, g, p.siblings[j], e);
    }
}
trait RemoveAll {
    fn remove_all(&mut self, r: &[Record]);
}
impl RemoveAll for PriorityTree {
    fn remove_all(&mut self, r: &[Record]) {
        for r in r {
            self.remove(r.index);
        }
    }
}
fn eq(b: &mut CircuitBuilder<F, 2>, g: BoolTarget, a: Target, c: Target) {
    crate::batch_policy::eq(b, g, a, c)
}
fn gh(b: &mut CircuitBuilder<F, 2>, g: BoolTarget, a: HashOutTarget, c: HashOutTarget) {
    for (x, y) in a.elements.into_iter().zip(c.elements) {
        eq(b, g, x, y)
    }
}
fn and(b: &mut CircuitBuilder<F, 2>, v: &[BoolTarget]) -> BoolTarget {
    let mut a = b._true();
    for x in v {
        a = b.and(a, *x);
    }
    a
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
fn eq_hash(b: &mut CircuitBuilder<F, 2>, a: HashOutTarget, c: HashOutTarget) -> BoolTarget {
    let v = a
        .elements
        .into_iter()
        .zip(c.elements)
        .map(|(x, y)| b.is_equal(x, y))
        .collect::<Vec<_>>();
    and(b, &v)
}
#[derive(Clone)]
pub struct RecordTargets {
    pub owner: Target,
    pub index: Target,
    values: Vec<Target>,
    consumed: Target,
    pa: [Target; 2],
    pb: [Target; 2],
    fee: Target,
}
impl RecordTargets {
    fn add(b: &mut CircuitBuilder<F, 2>, t: &mut Tape, kind: u64) -> Self {
        let owner = t.scalar(b);
        b.range_check(owner, 24);
        let index = t.scalar(b);
        b.range_check(index, 56);
        let mut values = vec![];
        for (n, w) in order_fields(kind) {
            for _ in 0..w {
                let v = t.scalar(b);
                if w == 2 || n == "nonce" {
                    b.range_check(v, 62);
                }
                if n == "order_checkpoint" || n == "deadline" {
                    b.range_check(v, 32);
                }
                values.push(v);
            }
        }
        let consumed = t.scalar(b);
        b.range_check(consumed, 62);
        let pa = [t.scalar(b), t.scalar(b)];
        let pb = [t.scalar(b), t.scalar(b)];
        let fee = t.scalar(b);
        for v in pa.into_iter().chain(pb).chain([fee]) {
            b.range_check(v, 62);
        }
        Self {
            owner,
            index,
            values,
            consumed,
            pa,
            pb,
            fee,
        }
    }
    pub fn nonce(&self, kind: u64) -> Target {
        self.val(kind, "nonce")
    }
    pub fn amount(&self, kind: u64, n: &str) -> [Target; 2] {
        self.pair(kind, n)
    }
    fn val(&self, kind: u64, n: &str) -> Target {
        self.values[offset(kind, n)]
    }
    fn pair(&self, kind: u64, n: &str) -> [Target; 2] {
        let i = offset(kind, n);
        [self.values[i], self.values[i + 1]]
    }
    fn targets(&self) -> Vec<Target> {
        let mut v = vec![self.owner, self.index];
        v.extend(&self.values);
        v.extend([
            self.consumed,
            self.pa[0],
            self.pa[1],
            self.pb[0],
            self.pb[1],
            self.fee,
        ]);
        v
    }
    fn select(b: &mut CircuitBuilder<F, 2>, g: BoolTarget, a: &Self, c: &Self) -> Self {
        let choose = |b: &mut CircuitBuilder<F, 2>, a: Target, c: Target| b.select(g, a, c);
        Self {
            owner: choose(b, a.owner, c.owner),
            index: choose(b, a.index, c.index),
            values: a
                .values
                .iter()
                .zip(&c.values)
                .map(|(a, c)| choose(b, *a, *c))
                .collect(),
            consumed: choose(b, a.consumed, c.consumed),
            pa: std::array::from_fn(|i| choose(b, a.pa[i], c.pa[i])),
            pb: std::array::from_fn(|i| choose(b, a.pb[i], c.pb[i])),
            fee: choose(b, a.fee, c.fee),
        }
    }
    pub fn terms(&self, b: &mut CircuitBuilder<F, 2>, scope: &[Target]) -> HashOutTarget {
        let tag = b.constant(f(0x46494e414c4f5244));
        let mut v = vec![tag, scope[6], scope[3], scope[4], self.owner];
        v.extend(&self.values);
        v.extend([
            self.consumed,
            self.pa[0],
            self.pa[1],
            self.pb[0],
            self.pb[1],
            self.fee,
        ]);
        b.hash_n_to_hash_no_pad::<H>(v)
    }
    pub fn leaf(&self, b: &mut CircuitBuilder<F, 2>, scope: &[Target], kind: u64) -> HashOutTarget {
        let terms = self.terms(b, scope);
        stream_order::member(
            b,
            scope,
            self.index,
            self.owner,
            self.val(kind, "nonce"),
            terms,
        )
    }
    fn set(&self, pw: &mut PartialWitness<F>, r: Option<&Record>) -> Result<()> {
        let values = r
            .map(|r| {
                let mut v = vec![r.owner, r.index];
                v.extend(&r.values);
                v.extend([
                    r.consumed,
                    r.paid_a[0],
                    r.paid_a[1],
                    r.paid_b[0],
                    r.paid_b[1],
                    r.fee,
                ]);
                v
            })
            .unwrap_or(vec![0; self.targets().len()]);
        ensure!(
            values.len() == self.targets().len(),
            "canonical source record width"
        );
        for (t, v) in self.targets().into_iter().zip(values) {
            pw.set_target(t, f(v))?;
        }
        Ok(())
    }
}
fn wide_lt(b: &mut CircuitBuilder<F, 2>, a: [Target; 2], c: [Target; 2]) -> BoolTarget {
    let hi = lt(b, a[1], c[1], 62);
    let same = b.is_equal(a[1], c[1]);
    let lo = lt(b, a[0], c[0], 62);
    let at = b.and(same, lo);
    b.or(hi, at)
}
fn wide_le(b: &mut CircuitBuilder<F, 2>, a: [Target; 2], c: [Target; 2]) -> BoolTarget {
    let reversed = wide_lt(b, c, a);
    b.not(reversed)
}
fn compatible_t(
    b: &mut CircuitBuilder<F, 2>,
    kind: u64,
    a: &RecordTargets,
    c: &RecordTargets,
) -> BoolTarget {
    let z = b.zero();
    let one = b.one();
    if kind == 3 {
        let sidea = b.is_equal(a.val(kind, "side"), z);
        let sideb = b.is_equal(c.val(kind, "side"), one);
        let x = wide_le(b, a.pair(kind, "y"), c.pair(kind, "x"));
        let y = wide_le(b, c.pair(kind, "y"), a.pair(kind, "x"));
        and(b, &[sidea, sideb, x, y])
    } else {
        let two = b.constant(f(2));
        let ka = b.is_equal(a.val(kind, "kind"), one);
        let kb = b.is_equal(c.val(kind, "kind"), two);
        let seller = b.is_equal(c.val(kind, "seller"), a.owner);
        let nonce = b.is_equal(c.val(kind, "listing_nonce"), a.val(kind, "nonce"));
        let same0 = b.is_equal(a.pair(kind, "price")[0], c.pair(kind, "price")[0]);
        let same1 = b.is_equal(a.pair(kind, "price")[1], c.pair(kind, "price")[1]);
        and(b, &[ka, kb, seller, nonce, same0, same1])
    }
}
fn time_t(
    b: &mut CircuitBuilder<F, 2>,
    kind: u64,
    a: &RecordTargets,
    c: &RecordTargets,
) -> (BoolTarget, BoolTarget) {
    let ac = a.val(kind, "order_checkpoint");
    let cc = c.val(kind, "order_checkpoint");
    let earlier = lt(b, ac, cc, 32);
    let same = b.is_equal(ac, cc);
    let owner = lt(b, a.owner, c.owner, 24);
    let tie = b.and(same, owner);
    let before = b.or(earlier, tie);
    let same_owner = b.is_equal(a.owner, c.owner);
    let equal = b.and(same, same_owner);
    (before, equal)
}
// Five base-2^30 digits keep each multiplication column below 2^63 < p.
// Never fold a 248-bit cross product into a single field element.
fn digits(b: &mut CircuitBuilder<F, 2>, a: [Target; 2]) -> Vec<Target> {
    let mut bits = b.split_le(a[0], 62);
    bits.extend(b.split_le(a[1], 62));
    bits.chunks(30).map(|s| b.le_sum(s.iter())).collect()
}
fn product(b: &mut CircuitBuilder<F, 2>, a: [Target; 2], c: [Target; 2]) -> Vec<Target> {
    let a = digits(b, a);
    let c = digits(b, c);
    let mut carry = b.zero();
    let mut out = vec![];
    for k in 0..a.len() + c.len() {
        let mut sum = carry;
        for i in 0..a.len() {
            if k >= i && k - i < c.len() {
                let p = b.mul(a[i], c[k - i]);
                sum = b.add(sum, p);
            }
        }
        let bits = b.split_le(sum, 63);
        out.push(b.le_sum(bits[..30].iter()));
        carry = b.le_sum(bits[30..].iter());
    }
    b.assert_zero(carry);
    out
}
fn price_t(
    b: &mut CircuitBuilder<F, 2>,
    kind: u64,
    a: &RecordTargets,
    c: &RecordTargets,
) -> (BoolTarget, BoolTarget) {
    let l = product(b, a.pair(kind, "y"), c.pair(kind, "x"));
    let r = product(b, c.pair(kind, "y"), a.pair(kind, "x"));
    let mut less = b._false();
    let mut same = b._true();
    for (x, y) in l.into_iter().zip(r) {
        let low = lt(b, x, y, 30);
        let equal = b.is_equal(x, y);
        let carry = b.and(equal, less);
        less = b.or(low, carry);
        same = b.and(same, equal);
    }
    let (time, equal) = time_t(b, kind, a, c);
    let tie = b.and(same, time);
    let before = b.or(less, tie);
    let eq = b.and(same, equal);
    (before, eq)
}
fn better_t(
    b: &mut CircuitBuilder<F, 2>,
    kind: u64,
    a: &RecordTargets,
    c: &RecordTargets,
    x: &RecordTargets,
    y: &RecordTargets,
) -> BoolTarget {
    let (first, equal) = if kind == 3 {
        price_t(b, kind, a, x)
    } else {
        time_t(b, kind, a, x)
    };
    let (second, _) = if kind == 3 {
        price_t(b, kind, c, y)
    } else {
        time_t(b, kind, c, y)
    };
    let tie = b.and(equal, second);
    b.or(first, tie)
}
fn best_hash(
    b: &mut CircuitBuilder<F, 2>,
    scope: &[Target],
    kind: u64,
    exists: BoolTarget,
    a: &RecordTargets,
    c: &RecordTargets,
) -> HashOutTarget {
    let tag = b.constant(f(BEST_TAG));
    let ah = a.leaf(b, scope, kind);
    let ch = c.leaf(b, scope, kind);
    let v = [vec![tag], ah.elements.to_vec(), ch.elements.to_vec()].concat();
    let h = b.hash_n_to_hash_no_pad::<H>(v);
    let z = b.constant_hash(HashOut::ZERO);
    select_hash(b, exists, h, z)
}
pub struct StateTargets {
    pub outer: HashOutTarget,
    pub inner: HashOutTarget,
    pub best: HashOutTarget,
    pub cursor: Target,
    pub complete: BoolTarget,
}
impl StateTargets {
    fn add(b: &mut CircuitBuilder<F, 2>, t: &mut Tape) -> Self {
        let outer = t.hash(b);
        let inner = t.hash(b);
        let best = t.hash(b);
        let cursor = t.scalar(b);
        b.range_check(cursor, 48);
        let complete = BoolTarget::new_unsafe(t.scalar(b));
        b.assert_bool(complete);
        Self {
            outer,
            inner,
            best,
            cursor,
            complete,
        }
    }
    pub fn values(&self) -> Vec<Target> {
        [
            self.outer.elements.to_vec(),
            self.inner.elements.to_vec(),
            self.best.elements.to_vec(),
            vec![self.cursor, self.complete.target],
        ]
        .concat()
    }
    fn set(
        &self,
        pw: &mut PartialWitness<F>,
        v: Option<&State>,
        scope: &[u64],
        kind: u64,
    ) -> Result<()> {
        let values = v.map(|v| v.values(scope, kind)).unwrap_or(vec![0; 14]);
        for (t, v) in self.values().into_iter().zip(values) {
            pw.set_target(t, f(v))?;
        }
        Ok(())
    }
}
struct RowTargets {
    a: RecordTargets,
    b: RecordTargets,
    outer: MerkleProofGadget,
    inner: MerkleProofGadget,
    next: Option<MerkleProofGadget>,
}
pub struct Targets {
    pub before: StateTargets,
    pub after: StateTargets,
    pub prev_exists: BoolTarget,
    pub prev_a: RecordTargets,
    pub prev_b: RecordTargets,
    len: Target,
    rows: Vec<RowTargets>,
    head: Option<MerkleProofGadget>,
}
impl Targets {
    pub fn add(
        b: &mut CircuitBuilder<F, 2>,
        t: &mut Tape,
        kind: u64,
        scope: &[Target],
        remaining: HashOutTarget,
        total: Target,
        settled: Target,
        scan: BoolTarget,
    ) -> Result<Self> {
        let before = StateTargets::add(b, t);
        let after = StateTargets::add(b, t);
        let prev_exists = BoolTarget::new_unsafe(t.scalar(b));
        b.assert_bool(prev_exists);
        let prev_a = RecordTargets::add(b, t, kind);
        let prev_b = RecordTargets::add(b, t, kind);
        let prior = best_hash(b, scope, kind, prev_exists, &prev_a, &prev_b);
        let always = b._true();
        gh(b, always, before.best, prior);
        let len = t.scalar(b);
        b.range_check(len, 3);
        let z = b.zero();
        let one = b.one();
        let four = b.constant(f(4));
        let positive = lt(b, z, len, 3);
        eq(b, scan, positive.target, one);
        let above = lt(b, four, len, 3);
        eq(b, scan, above.target, z);
        eq(b, scan, before.complete.target, z);
        let empty = b.constant_hash(h(empty()));
        let start = b.is_equal(before.cursor, z);
        let gate = b.and(scan, start);
        gh(b, gate, before.outer, remaining);
        gh(b, gate, before.inner, remaining);
        eq(b, gate, prev_exists.target, z);
        let mut outer = before.outer;
        let mut inner = before.inner;
        let mut best_a = prev_a.clone();
        let mut best_b = prev_b.clone();
        let mut exists = prev_exists;
        let mut rows = vec![];
        for i in 0..PAGE {
            let a = RecordTargets::add(b, t, kind);
            let c = RecordTargets::add(b, t, kind);
            let op = t.proof(b, 56);
            let ip = t.proof(b, 56);
            let idx = b.constant(f(i as u64));
            let used = lt(b, idx, len, 3);
            let active = b.and(scan, used);
            let invalid = b.not(used);
            let pad = b.and(scan, invalid);
            for v in a.targets().into_iter().chain(c.targets()) {
                eq(b, pad, v, z);
            }
            let outer_nonempty = eq_hash(b, outer, empty);
            eq(b, active, outer_nonempty.target, z);
            for (rec, path, root) in [(&a, &op, outer), (&c, &ip, inner)] {
                let cp = rec.val(kind, "order_checkpoint");
                let index = b.mul_const_add(f(1 << 24), cp, rec.owner);
                eq(b, active, rec.index, index);
                eq(b, active, path.index, rec.index);
                let leaf = rec.leaf(b, scope, kind);
                gh(b, active, path.value, leaf);
                gh(b, active, path.root, root);
                let bits = b.split_le(rec.index, 56);
                for j in 0..56 {
                    let left = b.and(active, bits[j]);
                    let e = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(j).0);
                    gh(b, left, path.siblings[j], e);
                }
            }
            let compatible = compatible_t(b, kind, &a, &c);
            let better = better_t(b, kind, &a, &c, &best_a, &best_b);
            let absent = b.not(exists);
            let better_or_first = b.or(absent, better);
            let update = and(b, &[active, compatible, better_or_first]);
            best_a = RecordTargets::select(b, update, &a, &best_a);
            best_b = RecordTargets::select(b, update, &c, &best_b);
            exists = b.or(exists, update);
            let zero = b.constant_hash(HashOut::ZERO);
            let inner_removed =
                MerkleProofGadget::compute_root::<H, F, 2>(b, ip.index, zero, &ip.siblings);
            let inner_done = eq_hash(b, inner_removed, empty);
            let outer_removed =
                MerkleProofGadget::compute_root::<H, F, 2>(b, op.index, zero, &op.siblings);
            let outer_next = select_hash(b, inner_done, outer_removed, outer);
            let outer_done = eq_hash(b, outer_next, empty);
            let reset = select_hash(b, outer_done, empty, remaining);
            let inner_next = select_hash(b, inner_done, reset, inner_removed);
            outer = select_hash(b, active, outer_next, outer);
            inner = select_hash(b, active, inner_next, inner);
            rows.push(RowTargets {
                a,
                b: c,
                outer: op,
                inner: ip,
                next: None,
            });
        }
        let best = best_hash(b, scope, kind, exists, &best_a, &best_b);
        gh(b, scan, after.outer, outer);
        gh(b, scan, after.inner, inner);
        gh(b, scan, after.best, best);
        let cursor = b.add(before.cursor, len);
        eq(b, scan, after.cursor, cursor);
        let done = eq_hash(b, outer, empty);
        eq(b, scan, after.complete.target, done.target);
        let full = b.is_equal(len, four);
        let complete_or_full = b.or(done, full);
        eq(b, scan, complete_or_full.target, one);
        let n = b.sub(total, settled);
        b.range_check(n, 24);
        let count = b.mul(n, n);
        let finish = b.and(scan, done);
        eq(b, finish, cursor, count);
        Ok(Self {
            before,
            after,
            prev_exists,
            prev_a,
            prev_b,
            len,
            rows,
            head: None,
        })
    }
    pub fn add_triangular(
        b: &mut CircuitBuilder<F, 2>,
        t: &mut Tape,
        kind: u64,
        scope: &[Target],
        remaining: HashOutTarget,
        total: Target,
        settled: Target,
        scan: BoolTarget,
    ) -> Result<Self> {
        let before = StateTargets::add(b, t);
        let after = StateTargets::add(b, t);
        let prev_exists = BoolTarget::new_unsafe(t.scalar(b));
        b.assert_bool(prev_exists);
        let prev_a = RecordTargets::add(b, t, kind);
        let prev_b = RecordTargets::add(b, t, kind);
        let prior = best_hash(b, scope, kind, prev_exists, &prev_a, &prev_b);
        let always = b._true();
        gh(b, always, before.best, prior);
        let len = t.scalar(b);
        b.range_check(len, 3);
        let z = b.zero();
        let one = b.one();
        let four = b.constant(f(4));
        let above = lt(b, four, len, 3);
        eq(b, scan, above.target, z);
        eq(b, scan, before.complete.target, z);
        let empty = b.constant_hash(h(empty()));
        let zero = b.constant_hash(HashOut::ZERO);
        let start = b.is_equal(before.cursor, z);
        let first = b.and(scan, start);
        gh(b, first, before.outer, remaining);
        gh(b, first, before.inner, remaining);
        eq(b, first, prev_exists.target, z);
        let head = t.proof(b, 56);
        minimum(b, first, &head, remaining);
        let suffix =
            MerkleProofGadget::compute_root::<H, F, 2>(b, head.index, zero, &head.siblings);
        let mut inner = select_hash(b, start, suffix, before.inner);
        let mut outer = before.outer;
        let singleton = eq_hash(b, inner, empty);
        let singleton = b.and(start, singleton);
        outer = select_hash(b, singleton, empty, outer);
        let mut best_a = prev_a.clone();
        let mut best_b = prev_b.clone();
        let mut exists = prev_exists;
        let mut rows = vec![];
        for i in 0..PAGE {
            let a = RecordTargets::add(b, t, kind);
            let c = RecordTargets::add(b, t, kind);
            let op = t.proof(b, 56);
            let ip = t.proof(b, 56);
            let next = t.proof(b, 56);
            let idx = b.constant(f(i as u64));
            let used = lt(b, idx, len, 3);
            let active = b.and(scan, used);
            let not_used = b.not(used);
            let pad = b.and(scan, not_used);
            for v in a.targets().into_iter().chain(c.targets()) {
                eq(b, pad, v, z);
            }
            for (rec, p, root) in [(&a, &op, outer), (&c, &ip, inner)] {
                let index =
                    b.mul_const_add(f(1 << 24), rec.val(kind, "order_checkpoint"), rec.owner);
                eq(b, active, rec.index, index);
                eq(b, active, p.index, rec.index);
                let leaf = rec.leaf(b, scope, kind);
                gh(b, active, p.value, leaf);
                minimum(b, active, p, root);
            }
            let ordered = lt(b, a.index, c.index, 56);
            eq(b, active, ordered.target, one);
            let reverse = if kind == 3 {
                let v = a.val(kind, "side");
                b.is_equal(v, one)
            } else {
                let two = b.constant(f(2));
                let v = a.val(kind, "kind");
                b.is_equal(v, two)
            };
            let left = RecordTargets::select(b, reverse, &c, &a);
            let right = RecordTargets::select(b, reverse, &a, &c);
            let compatible = compatible_t(b, kind, &left, &right);
            let better = better_t(b, kind, &left, &right, &best_a, &best_b);
            let absent = b.not(exists);
            let better_or_first = b.or(absent, better);
            let update = and(b, &[active, compatible, better_or_first]);
            best_a = RecordTargets::select(b, update, &left, &best_a);
            best_b = RecordTargets::select(b, update, &right, &best_b);
            exists = b.or(exists, update);
            let ir = MerkleProofGadget::compute_root::<H, F, 2>(b, ip.index, zero, &ip.siblings);
            let inner_done = eq_hash(b, ir, empty);
            let or = MerkleProofGadget::compute_root::<H, F, 2>(b, op.index, zero, &op.siblings);
            let resetting = b.and(active, inner_done);
            minimum(b, resetting, &next, or);
            let nr =
                MerkleProofGadget::compute_root::<H, F, 2>(b, next.index, zero, &next.siblings);
            let finished = eq_hash(b, nr, empty);
            let next_outer = select_hash(b, finished, empty, or);
            let next_inner = select_hash(b, inner_done, nr, ir);
            let next_outer = select_hash(b, inner_done, next_outer, outer);
            outer = select_hash(b, active, next_outer, outer);
            inner = select_hash(b, active, next_inner, inner);
            rows.push(RowTargets {
                a,
                b: c,
                outer: op,
                inner: ip,
                next: Some(next),
            });
        }
        let best = best_hash(b, scope, kind, exists, &best_a, &best_b);
        gh(b, scan, after.outer, outer);
        gh(b, scan, after.inner, inner);
        gh(b, scan, after.best, best);
        let cursor = b.add(before.cursor, len);
        eq(b, scan, after.cursor, cursor);
        let done = eq_hash(b, outer, empty);
        eq(b, scan, after.complete.target, done.target);
        let full = b.is_equal(len, four);
        let full_or_done = b.or(full, done);
        eq(b, scan, full_or_done.target, one);
        let positive = lt(b, z, len, 3);
        let positive_or_done = b.or(positive, done);
        eq(b, scan, positive_or_done.target, one);
        let n = b.sub(total, settled);
        b.range_check(n, 24);
        let nm = b.sub(n, one);
        let product = b.mul(n, nm);
        let count = b.mul_const(f(2).inverse(), product);
        let finish = b.and(scan, done);
        eq(b, finish, cursor, count);
        Ok(Self {
            before,
            after,
            prev_exists,
            prev_a,
            prev_b,
            len,
            rows,
            head: Some(head),
        })
    }
    pub fn set(
        &self,
        pw: &mut PartialWitness<F>,
        kind: u64,
        scope: &[u64],
        page: Option<&Page>,
    ) -> Result<()> {
        self.before.set(pw, page.map(|p| &p.before), scope, kind)?;
        self.after.set(pw, page.map(|p| &p.after), scope, kind)?;
        let best = page.and_then(|p| p.before.best.as_ref());
        pw.set_bool_target(self.prev_exists, best.is_some())?;
        self.prev_a.set(pw, best.map(|b| &b.a))?;
        self.prev_b.set(pw, best.map(|b| &b.b))?;
        pw.set_target(self.len, f(page.map(|p| p.rows.len() as u64).unwrap_or(0)))?;
        if let Some(head) = &self.head {
            set_path(pw, head, page.and_then(|p| p.head.as_ref()))?;
        }
        for (i, t) in self.rows.iter().enumerate() {
            let row = page.and_then(|p| p.rows.get(i));
            t.a.set(pw, row.map(|r| &r.a))?;
            t.b.set(pw, row.map(|r| &r.b))?;
            if let Some(next) = &t.next {
                set_path(pw, next, row.and_then(|r| r.next.as_ref()))?;
            }
            for (target, path) in [
                (&t.outer, row.map(|r| &r.outer)),
                (&t.inner, row.map(|r| &r.inner)),
            ] {
                let p = path
                    .map(|p| {
                        MerkleProofCore::new_from_params::<H>(
                            p.index,
                            Q(h(p.value)),
                            p.siblings.iter().map(|s| Q(h(*s))).collect(),
                        )
                    })
                    .unwrap_or_else(|| {
                        MerkleProofCore::new_from_params::<H>(
                            0,
                            Q::ZERO,
                            (0..56).map(H::get_zero_hash).collect(),
                        )
                    });
                target.set_witness_core_proof_q(pw, &p)?;
            }
        }
        Ok(())
    }
}
pub fn context_value(stream: Hash, state: &State, scope: &[u64], kind: u64) -> Hash {
    let mut v = vec![CONTEXT_TAG];
    v.extend(stream);
    v.extend(state.values(scope, kind));
    hash(&v)
}
pub fn context_target(
    b: &mut CircuitBuilder<F, 2>,
    stream: HashOutTarget,
    s: &StateTargets,
) -> HashOutTarget {
    let tag = b.constant(f(CONTEXT_TAG));
    let mut v = vec![tag];
    v.extend(stream.elements);
    v.extend(s.values());
    b.hash_n_to_hash_no_pad::<H>(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use plonky2::plonk::{circuit_data::CircuitConfig, config::PoseidonGoldilocksConfig as C};
    fn records(kind: u64) -> Vec<Record> {
        let max = (1u128 << 124) - 1;
        let mut rows = vec![];
        for u in 200..205 {
            let mut r = Record {
                owner: u,
                index: 0,
                values: vec![0; order_fields(kind).iter().map(|(_, w)| w).sum()],
                consumed: 0,
                paid_a: [0; 2],
                paid_b: [0; 2],
                fee: 1_000_100_000,
            };
            let set = |r: &mut Record, n: &str, v: u64| r.values[offset(kind, n)] = v;
            for (n, v) in [("pool", 100), ("nonce", 1), ("deadline", 200)] {
                set(&mut r, n, v);
            }
            if kind == 3 {
                let (side, x, y, cp) = match u {
                    200 => (0, max - 10, max - 25, 93),
                    201 => (1, max - 15, max - 30, 95),
                    202 => (0, max - 5, max - 29, 92),
                    203 => (1, max - 12, max - 31, 94),
                    _ => (0, max - 40, max - 1, 96),
                };
                set(&mut r, "kind", 1);
                set(&mut r, "side", side);
                set(&mut r, "order_checkpoint", cp);
                for (n, v) in [("x", x), ("y", y)] {
                    let i = offset(kind, n);
                    r.values[i] = (v % (1u128 << 62)) as u64;
                    r.values[i + 1] = (v >> 62) as u64;
                }
                if side == 0 {
                    r.paid_a = [(x % (1u128 << 62)) as u64, (x >> 62) as u64]
                } else {
                    r.paid_b = [(x % (1u128 << 62)) as u64, (x >> 62) as u64]
                }
            } else {
                let seller = [200, 202].contains(&u);
                set(&mut r, "kind", if seller { 1 } else { 2 });
                set(
                    &mut r,
                    "order_checkpoint",
                    match u {
                        200 | 202 => 90,
                        203 => 92,
                        201 => 93,
                        _ => 94,
                    },
                );
                if !seller {
                    set(&mut r, "seller", if u == 204 { 202 } else { 200 });
                    set(&mut r, "listing_nonce", 1);
                }
                let i = offset(kind, "price");
                r.values[i] = ((max - 17) % (1u128 << 62)) as u64;
                r.values[i + 1] = ((max - 17) >> 62) as u64;
                if seller {
                    r.paid_b = [1, 0]
                } else {
                    r.paid_a = [r.values[i], r.values[i + 1]];
                }
            }
            r.index = (r.value(kind, "order_checkpoint") << 24) | r.owner;
            rows.push(r);
        }
        rows.sort_by_key(|r| r.index);
        rows
    }
    #[test]
    #[ignore = "bounded conditional frontier component proofs, no signature or UPS"]
    fn complete_cartesian_frontier_components() -> Result<()> {
        let out = std::env::var("PAIR_FRONTIER_COMPONENT_OUT")?;
        std::fs::create_dir(&out)?;
        for kind in [3, 4] {
            let records = records(kind);
            let mut scope = vec![1; 41];
            scope[..9].copy_from_slice(&[
                3,
                psy_config::PSY_NETWORK_MAGIC,
                kind,
                1000,
                100,
                1,
                100,
                132,
                5,
            ]);
            let members = records
                .iter()
                .map(|r| PriorityMember {
                    index: r.index,
                    member: crate::checkpoint_stream::Member {
                        owner: r.owner,
                        nonce: r.value(kind, "nonce"),
                        terms: r.terms(&scope),
                    },
                })
                .collect();
            let q = PriorityTree::from_committed(&scope, members)?;
            let mut b = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
            let mut tape = Tape::default();
            let s = scope.iter().map(|n| b.constant(f(*n))).collect::<Vec<_>>();
            let root = tape.hash(&mut b);
            let count = b.constant(f(5));
            let zero = b.zero();
            let scan = b._true();
            let targets = Targets::add(&mut b, &mut tape, kind, &s, root, count, zero, scan)?;
            let data = b.build::<C>();
            let mut state = State::initial(q.root());
            let mut count = 0;
            let mut attacks = vec![];
            while !state.complete {
                let page = next_page(kind, &scope, &q, &records, &state)?;
                let prove = |p: &Page| -> Result<_> {
                    let mut pw = PartialWitness::new();
                    pw.set_hash_target(root, h(q.root()))?;
                    targets.set(&mut pw, kind, &scope, Some(p))?;
                    Ok(data.prove(pw)?)
                };
                if count == 0 {
                    for name in [
                        "cursor",
                        "reset-inner",
                        "duplicate",
                        "source-terms",
                        "best-substitution",
                        "omitted-minimum",
                    ] {
                        let mut bad = page.clone();
                        match name {
                            "cursor" => bad.after.cursor += 1,
                            "reset-inner" => bad.after.inner = q.root(),
                            "duplicate" => bad.rows[1].b = bad.rows[0].b.clone(),
                            "source-terms" => bad.rows[0].a.fee += 1,
                            "best-substitution" => {
                                bad.after.best = Some(Best {
                                    a: records.iter().find(|r| r.owner == 200).unwrap().clone(),
                                    b: records.iter().find(|r| r.owner == 201).unwrap().clone(),
                                });
                            }
                            "omitted-minimum" => {
                                bad.rows[0].b = records[1].clone();
                                bad.rows[0].inner = q.proof(records[1].index);
                            }
                            _ => unreachable!(),
                        };
                        ensure!(prove(&bad).is_err(), "accepted {name}");
                        attacks.push(name);
                    }
                }
                let proof = prove(&page)?;
                data.verify(proof.clone())?;
                std::fs::write(
                    format!("{out}/{kind}-page-{count}.bin"),
                    bincode::serialize(&proof)?,
                )?;
                std::fs::write(
                    format!("{out}/{kind}-page-{count}.json"),
                    serde_json::to_vec_pretty(&page)?,
                )?;
                state = page.after;
                count += 1;
            }
            ensure!(
                state.cursor == 25 && count == 7,
                "all25 comparisons in7 pages"
            );
            let best = state.best.as_ref().unwrap();
            ensure!(
                (best.a.owner, best.b.owner) == if kind == 3 { (202, 203) } else { (200, 203) },
                "full precision global winner"
            );
            std::fs::write(
                format!("{out}/{kind}-REPORT.json"),
                serde_json::to_vec_pretty(
                    &serde_json::json!({"scope":"conditional authenticated-root Cartesian scan component; no source discovery, current identity, signature or full UPS","kind":kind,"pages":count,"comparisons":state.cursor,"winner":[best.a.owner,best.b.owner],"maxU124CrossProducts":kind==3,"attackRejections":attacks,"degreeBits":data.common.degree_bits(),"broadcast":false}),
                )?,
            )?;
        }
        Ok(())
    }
    #[test]
    #[ignore = "offline conditional triangular completeness proofs"]
    fn triangular_frontier_components() -> Result<()> {
        let out = std::env::var("PAIR_TRIANGLE_COMPONENT_OUT")?;
        std::fs::create_dir(&out)?;
        for kind in [3, 4] {
            let all = records(kind);
            let mut evidence = vec![];
            for n in [1, 2, 5] {
                let records = &all[..n];
                let mut scope = vec![1; 41];
                scope[..9].copy_from_slice(&[
                    3,
                    psy_config::PSY_NETWORK_MAGIC,
                    kind,
                    1000,
                    100,
                    1,
                    100,
                    132,
                    n as u64,
                ]);
                let q = PriorityTree::from_committed(
                    &scope,
                    records
                        .iter()
                        .map(|r| PriorityMember {
                            index: r.index,
                            member: crate::checkpoint_stream::Member {
                                owner: r.owner,
                                nonce: r.value(kind, "nonce"),
                                terms: r.terms(&scope),
                            },
                        })
                        .collect(),
                )?;
                let mut b = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
                let mut tape = Tape::default();
                let s = scope.iter().map(|n| b.constant(f(*n))).collect::<Vec<_>>();
                let root = tape.hash(&mut b);
                let count = b.constant(f(n as u64));
                let zero = b.zero();
                let scan = b._true();
                let target =
                    Targets::add_triangular(&mut b, &mut tape, kind, &s, root, count, zero, scan)?;
                let data = b.build::<C>();
                let prove = |p: &Page| -> Result<_> {
                    let mut pw = PartialWitness::new();
                    pw.set_hash_target(root, h(q.root()))?;
                    target.set(&mut pw, kind, &scope, Some(p))?;
                    Ok(data.prove(pw)?)
                };
                let mut state = State::initial(q.root());
                let mut pages = 0;
                let mut attacks = vec![];
                while !state.complete {
                    let page = next_triangular_page(kind, &scope, &q, records, &state)?;
                    if n == 5 && pages == 0 {
                        for name in [
                            "head-omission",
                            "duplicate",
                            "wrong-suffix",
                            "omitted-pair",
                            "best-substitution",
                            "cursor",
                        ] {
                            let mut bad = page.clone();
                            match name {
                                "head-omission" => bad.head = None,
                                "duplicate" => {
                                    bad.rows[1] = bad.rows[0].clone();
                                }
                                "wrong-suffix" => {
                                    bad.rows[3].next = Some(q.proof(records[0].index))
                                }
                                "omitted-pair" => {
                                    bad.rows.remove(0);
                                }
                                "best-substitution" => {
                                    bad.after.best = Some(Best {
                                        a: all[0].clone(),
                                        b: all[1].clone(),
                                    })
                                }
                                "cursor" => bad.after.cursor += 1,
                                _ => unreachable!(),
                            }
                            ensure!(prove(&bad).is_err(), "accepted triangular attack {name}");
                            attacks.push(name);
                        }
                    }
                    let proof = prove(&page)?;
                    data.verify(proof.clone())?;
                    std::fs::write(
                        format!("{out}/{kind}-{n}-{pages}.bin"),
                        bincode::serialize(&proof)?,
                    )?;
                    std::fs::write(
                        format!("{out}/{kind}-{n}-{pages}.json"),
                        serde_json::to_vec_pretty(&page)?,
                    )?;
                    state = page.after;
                    pages += 1;
                }
                let mut expected: Option<Best> = None;
                for a in records {
                    for c in records {
                        if compatible(kind, a, c)
                            && expected
                                .as_ref()
                                .map(|v| before_pair(kind, a, c, v))
                                .unwrap_or(true)
                        {
                            expected = Some(Best {
                                a: a.clone(),
                                b: c.clone(),
                            });
                        }
                    }
                }
                ensure!(
                    state.best == expected && state.cursor == (n * (n - 1) / 2) as u64,
                    "exact Cartesian reference winner and triangle count"
                );
                evidence.push(serde_json::json!({"members":n,"pages":pages,"comparisons":state.cursor,"attacks":attacks,"degreeBits":data.common.degree_bits()}));
            }
            std::fs::write(
                format!("{out}/{kind}-REPORT.json"),
                serde_json::to_vec_pretty(
                    &serde_json::json!({"scope":"conditional triangle proofs only, no signature/UPS/network","cases":evidence}),
                )?,
            )?;
        }
        Ok(())
    }
    #[test]
    fn planner_rejects_raw_snapshot_domain_before_proving() {
        let mut scope = vec![1; 41];
        assert!(PriorityTree::from_committed(&scope, vec![]).is_err());
        scope[0] = 3;
        assert!(PriorityTree::from_committed(&scope, vec![]).is_ok());
        assert!(PriorityTree::from_committed(&scope[..40], vec![]).is_err());
    }
}
