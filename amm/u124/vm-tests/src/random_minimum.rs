//! Conditional minimum frontier. Insert the complete source in canonical index
//! order into an authenticated sorted linked list, then extract only its head.
//! This component does not authenticate a seed or authorize a financial UPS.
use crate::{
    checkpoint_stream::{Hash, Member, Path, Tree},
    random_stream as rank,
    stream_source::{lt, PriorityMember, PriorityTree, Tape},
};
use anyhow::{ensure, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, Field64, PrimeField64},
    },
    hash::{
        hash_types::{HashOut, HashOutTarget},
        poseidon::PoseidonHash as H,
    },
    iop::{
        target::{BoolTarget, Target},
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::{
        circuit_builder::CircuitBuilder,
        circuit_data::{CircuitConfig, CircuitData},
        config::{Hasher, PoseidonGoldilocksConfig as C},
        proof::ProofWithPublicInputs,
    },
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_common_circuit::hash::merkle::gadgets::merkle_proof::MerkleProofGadget;
use psy_crypto::hash::{merkle::core::MerkleProofCore, traits::hasher::MerkleZeroHasher};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
const NODE_TAG: u64 = 0x5354524c49535431;
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn h(a: Hash) -> HashOut<F> {
    HashOut { elements: a.map(f) }
}
fn arr(q: Q<F>) -> Hash {
    q.0.elements.map(|n| n.to_canonical_u64())
}
fn hash(v: Vec<u64>) -> Hash {
    H::hash_no_pad(&v.into_iter().map(f).collect::<Vec<_>>())
        .elements
        .map(|n| n.to_canonical_u64())
}
fn empty(depth: usize) -> Hash {
    arr(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(depth))
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Node {
    pub owner: u64,
    pub index: u64,
    pub nonce: u64,
    pub terms: Hash,
    pub prev: u64,
    pub next: u64,
}
impl Node {
    fn fields(&self) -> Vec<u64> {
        [
            vec![self.owner, self.index, self.nonce],
            self.terms.to_vec(),
            vec![self.prev, self.next],
        ]
        .concat()
    }
    fn member(&self) -> PriorityMember {
        PriorityMember {
            index: self.index,
            member: Member {
                owner: self.owner,
                nonce: self.nonce,
                terms: self.terms,
            },
        }
    }
    pub fn commitment(&self, scope: &[u64], seed: Hash) -> Hash {
        hash([vec![NODE_TAG], scope.to_vec(), seed.to_vec(), self.fields()].concat())
    }
    fn check(&self) -> Result<()> {
        ensure!(
            self.owner > 0
                && self.owner < 1 << 24
                && self.index < 1 << 56
                && self.nonce > 0
                && self.nonce < 1 << 62
                && self.prev < 1 << 24
                && self.next < 1 << 24
                && self.prev != self.owner
                && self.next != self.owner
                && self.terms.iter().all(|n| *n < F::ORDER),
            "canonical list member"
        );
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct State {
    pub built: u64,
    pub seen: Hash,
    pub list: Hash,
    pub head: u64,
    pub tail: u64,
    pub extracted: u64,
    pub queue: Hash,
    pub front: u64,
}
impl State {
    pub fn initial(scope: &[u64]) -> Self {
        Self {
            built: 0,
            seen: scope[17..21].try_into().unwrap(),
            list: empty(24),
            head: 0,
            tail: 0,
            extracted: 0,
            queue: empty(56),
            front: 0,
        }
    }
    pub fn fields(&self) -> Vec<u64> {
        [
            vec![self.built],
            self.seen.to_vec(),
            self.list.to_vec(),
            vec![self.head, self.tail, self.extracted],
            self.queue.to_vec(),
            vec![self.front],
        ]
        .concat()
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub scope: Vec<u64>,
    pub seed: Hash,
    pub extract: bool,
    pub before: State,
    pub after: State,
    pub node: Node,
    pub previous: Node,
    pub following: Node,
    pub source: Path,
    pub previous_path: Path,
    pub following_path: Path,
    pub node_path: Path,
    pub append: Path,
}
fn root(p: &Path, depth: usize, value: Hash) -> Result<Hash> {
    ensure!(
        p.siblings.len() == depth && p.index < 1u64 << depth,
        "exact frontier Merkle shape"
    );
    Ok(arr(MerkleProofCore::new_from_params::<H>(
        p.index,
        Q(h(value)),
        p.siblings.iter().map(|v| Q(h(*v))).collect(),
    )
    .root))
}
fn minimum(p: &Path) -> bool {
    p.siblings
        .iter()
        .enumerate()
        .all(|(i, s)| ((p.index >> i) & 1) == 0 || *s == empty(i))
}
fn scope(s: &[u64], seed: Hash) -> Result<()> {
    ensure!(
        s.len() == 41
            && s[0] == 3
            && s[1] == psy_config::PSY_NETWORK_MAGIC
            && [1, 2].contains(&s[2])
            && s.iter().chain(seed.iter()).all(|n| *n < F::ORDER)
            && s[8] > 0
            && s[8] < 1 << 24,
        "fixed canonical scope and seed"
    );
    Ok(())
}
pub fn after(p: &Step) -> Result<State> {
    scope(&p.scope, p.seed)?;
    p.node.check()?;
    let b = &p.before;
    let mut a = b.clone();
    ensure!(
        b.built <= p.scope[8] && b.extracted <= p.scope[8],
        "frontier count bounds"
    );
    if !p.extract {
        ensure!(
            b.built < p.scope[8] && b.extracted == 0 && b.queue == empty(56) && b.front == b.head,
            "build before any extraction"
        );
        if b.built == 0 {
            ensure!(
                *b == State::initial(&p.scope),
                "only canonical empty frontier may start"
            );
        }
        ensure!(
            p.source.index == p.node.index
                && p.source.value == rank::value(&p.scope, p.node.index, &p.node.member().member)
                && root(&p.source, 56, p.source.value)? == b.seen
                && minimum(&p.source),
            "consume actual minimum source index"
        );
        let prev = &p.previous;
        let next = &p.following;
        ensure!(
            p.node.prev == prev.owner
                && p.node.next == next.owner
                && p.node.owner != prev.owner
                && p.node.owner != next.owner,
            "exact neighboring owners"
        );
        let mut r = b.list;
        if prev.owner == 0 {
            ensure!(
                *prev == Node::default() && b.head == next.owner,
                "insert immediately before current head"
            );
            a.head = p.node.owner;
        } else {
            prev.check()?;
            ensure!(
                prev.next == next.owner
                    && rank::key(&p.scope, p.seed, &prev.member())
                        < rank::key(&p.scope, p.seed, &p.node.member()),
                "adjacent lower predecessor"
            );
            ensure!(
                p.previous_path.index == prev.owner
                    && p.previous_path.value == prev.commitment(&p.scope, p.seed)
                    && root(&p.previous_path, 24, p.previous_path.value)? == r,
                "predecessor membership"
            );
            let mut n = prev.clone();
            n.next = p.node.owner;
            r = root(&p.previous_path, 24, n.commitment(&p.scope, p.seed))?;
        }
        if next.owner == 0 {
            ensure!(
                *next == Node::default() && b.tail == prev.owner,
                "insert immediately after current tail"
            );
            a.tail = p.node.owner;
        } else {
            next.check()?;
            ensure!(
                next.prev == prev.owner
                    && rank::key(&p.scope, p.seed, &p.node.member())
                        < rank::key(&p.scope, p.seed, &next.member()),
                "adjacent upper successor"
            );
            ensure!(
                p.following_path.index == next.owner
                    && p.following_path.value == next.commitment(&p.scope, p.seed)
                    && root(&p.following_path, 24, p.following_path.value)? == r,
                "successor membership after predecessor update"
            );
            let mut n = next.clone();
            n.prev = p.node.owner;
            r = root(&p.following_path, 24, n.commitment(&p.scope, p.seed))?;
        }
        ensure!(
            p.node_path.index == p.node.owner
                && p.node_path.value == [0; 4]
                && root(&p.node_path, 24, [0; 4])? == r,
            "one new list node only"
        );
        a.list = root(&p.node_path, 24, p.node.commitment(&p.scope, p.seed))?;
        a.seen = root(&p.source, 56, [0; 4])?;
        a.built += 1;
        a.front = a.head;
        if a.built == p.scope[8] {
            ensure!(
                a.seen == empty(56),
                "complete original source before extraction"
            );
        }
    } else {
        ensure!(
            b.built == p.scope[8]
                && b.seen == empty(56)
                && b.extracted < p.scope[8]
                && b.front == p.node.owner,
            "only complete sorted list head may execute"
        );
        ensure!(
            p.node_path.index == p.node.owner
                && p.node_path.value == p.node.commitment(&p.scope, p.seed)
                && root(&p.node_path, 24, p.node_path.value)? == b.list,
            "exact immutable list membership"
        );
        ensure!(
            p.append.index == b.extracted
                && p.append.value == [0; 4]
                && root(&p.append, 56, [0; 4])? == b.queue,
            "append one exact queue position"
        );
        a.queue = root(
            &p.append,
            56,
            rank::value(&p.scope, b.extracted, &p.node.member().member),
        )?;
        a.extracted += 1;
        a.front = p.node.next;
        if a.extracted == p.scope[8] {
            ensure!(a.front == 0, "complete terminal list traversal");
        }
    }
    Ok(a)
}
fn blank(depth: usize) -> Path {
    Path {
        index: 0,
        value: [0; 4],
        siblings: (0..depth).map(empty).collect(),
    }
}
pub fn prepare(scope: &[u64], source: &PriorityTree, seed: Hash) -> Result<Vec<Step>> {
    self::scope(scope, seed)?;
    ensure!(
        scope[8] as usize == source.members.len() && scope[17..21] == source.root(),
        "complete original source root"
    );
    let mut s = State::initial(scope);
    let mut seen = source.clone();
    let mut tree = Tree::new();
    let mut nodes: BTreeMap<u64, Node> = BTreeMap::new();
    let mut steps = vec![];
    for m in &source.members {
        let mut order = nodes.values().cloned().collect::<Vec<_>>();
        order.sort_by_key(|n| rank::key(scope, seed, &n.member()));
        let k = rank::key(scope, seed, m);
        let prev = order
            .iter()
            .filter(|n| rank::key(scope, seed, &n.member()) < k)
            .last()
            .cloned()
            .unwrap_or_default();
        let next = order
            .iter()
            .find(|n| rank::key(scope, seed, &n.member()) > k)
            .cloned()
            .unwrap_or_default();
        let node = Node {
            owner: m.member.owner,
            index: m.index,
            nonce: m.member.nonce,
            terms: m.member.terms,
            prev: prev.owner,
            next: next.owner,
        };
        let pp = tree.path(prev.owner);
        if prev.owner != 0 {
            let mut n = prev.clone();
            n.next = node.owner;
            tree.set(n.owner, n.commitment(scope, seed));
            nodes.insert(n.owner, n);
        }
        let np = tree.path(next.owner);
        if next.owner != 0 {
            let mut n = next.clone();
            n.prev = node.owner;
            tree.set(n.owner, n.commitment(scope, seed));
            nodes.insert(n.owner, n);
        }
        let vp = tree.path(node.owner);
        let mut p = Step {
            scope: scope.to_vec(),
            seed,
            extract: false,
            before: s.clone(),
            after: s.clone(),
            node: node.clone(),
            previous: prev,
            following: next,
            source: seen.proof(m.index),
            previous_path: pp,
            following_path: np,
            node_path: vp,
            append: blank(56),
        };
        p.after = after(&p)?;
        s = p.after.clone();
        seen.remove(m.index);
        tree.set(node.owner, node.commitment(scope, seed));
        nodes.insert(node.owner, node);
        ensure!(tree.root() == s.list, "host list tree endpoint");
        steps.push(p);
    }
    let mut queue = PriorityTree::from_committed(scope, vec![])?;
    while s.front != 0 {
        let node = nodes[&s.front].clone();
        let mut p = Step {
            scope: scope.to_vec(),
            seed,
            extract: true,
            before: s.clone(),
            after: s.clone(),
            source: blank(56),
            previous: Node::default(),
            following: Node::default(),
            previous_path: blank(24),
            following_path: blank(24),
            node_path: tree.path(node.owner),
            append: queue.proof(s.extracted),
            node: node.clone(),
        };
        p.after = after(&p)?;
        let mut q = queue.members.clone();
        q.push(PriorityMember {
            index: s.extracted,
            member: node.member().member,
        });
        queue = PriorityTree::from_committed(scope, q)?;
        s = p.after.clone();
        ensure!(queue.root() == s.queue, "host queue endpoint");
        steps.push(p);
    }
    ensure!(s.extracted == scope[8], "complete canonical traversal");
    Ok(steps)
}
fn eq(b: &mut CircuitBuilder<F, 2>, g: BoolTarget, a: Target, c: Target) {
    crate::batch_policy::eq(b, g, a, c)
}
fn gh(b: &mut CircuitBuilder<F, 2>, g: BoolTarget, a: HashOutTarget, c: HashOutTarget) {
    for (x, y) in a.elements.into_iter().zip(c.elements) {
        eq(b, g, x, y)
    }
}
fn choose(
    b: &mut CircuitBuilder<F, 2>,
    g: BoolTarget,
    a: HashOutTarget,
    c: HashOutTarget,
) -> HashOutTarget {
    HashOutTarget {
        elements: std::array::from_fn(|i| b.select(g, a.elements[i], c.elements[i])),
    }
}
fn path_update(
    b: &mut CircuitBuilder<F, 2>,
    p: &MerkleProofGadget,
    v: HashOutTarget,
) -> HashOutTarget {
    MerkleProofGadget::compute_root::<H, F, 2>(b, p.index, v, &p.siblings)
}
struct NodeTargets {
    v: Vec<Target>,
}
impl NodeTargets {
    fn add(b: &mut CircuitBuilder<F, 2>, t: &mut Tape) -> Self {
        let v = (0..9).map(|_| t.scalar(b)).collect::<Vec<_>>();
        b.range_check(v[0], 24);
        b.range_check(v[1], 56);
        b.range_check(v[2], 62);
        b.range_check(v[7], 24);
        b.range_check(v[8], 24);
        Self { v }
    }
    fn value(
        &self,
        b: &mut CircuitBuilder<F, 2>,
        s: &[Target],
        seed: HashOutTarget,
        prev: Target,
        next: Target,
    ) -> HashOutTarget {
        let tag = b.constant(f(NODE_TAG));
        let mut raw = vec![tag];
        raw.extend(s);
        raw.extend(seed.elements);
        raw.extend(&self.v[..7]);
        raw.extend([prev, next]);
        b.hash_n_to_hash_no_pad::<H>(raw)
    }
    fn original(&self, b: &mut CircuitBuilder<F, 2>, s: &[Target], index: Target) -> HashOutTarget {
        crate::stream_order::member(
            b,
            s,
            index,
            self.v[0],
            self.v[2],
            HashOutTarget {
                elements: self.v[3..7].try_into().unwrap(),
            },
        )
    }
    fn key(&self, b: &mut CircuitBuilder<F, 2>, s: &[Target], seed: HashOutTarget) -> [Target; 7] {
        let tag = b.constant(f(0x53545252414e4b));
        let draw = b.add_const(s[6], F::ONE);
        let mut raw = vec![tag];
        raw.extend(s);
        raw.push(draw);
        raw.extend(seed.elements);
        raw.extend([self.v[1], self.v[0], self.v[2]]);
        raw.extend(&self.v[3..7]);
        let h = b.hash_n_to_hash_no_pad::<H>(raw);
        [
            h.elements[0],
            h.elements[1],
            h.elements[2],
            h.elements[3],
            self.v[0],
            self.v[2],
            self.v[1],
        ]
    }
    fn check(&self, b: &mut CircuitBuilder<F, 2>, g: BoolTarget) {
        let z = b.zero();
        let one = b.one();
        for t in [self.v[0], self.v[2]] {
            let bad = b.is_equal(t, z);
            eq(b, g, bad.target, z);
        }
        for t in [self.v[7], self.v[8]] {
            let bad = b.is_equal(t, self.v[0]);
            eq(b, g, bad.target, z);
        }
        let inactive = b.not(g);
        for t in &self.v {
            eq(b, inactive, *t, z);
        }
        let _ = one;
    }
    fn set(&self, pw: &mut PartialWitness<F>, n: &Node) -> Result<()> {
        for (t, n) in self.v.iter().zip(n.fields()) {
            pw.set_target(*t, f(n))?;
        }
        Ok(())
    }
}
pub struct StateTargets {
    v: Vec<Target>,
}
impl StateTargets {
    fn add(b: &mut CircuitBuilder<F, 2>, t: &mut Tape) -> Self {
        let v = (0..17).map(|_| t.scalar(b)).collect::<Vec<_>>();
        for i in [0, 9, 10, 11, 16] {
            b.range_check(v[i], 24);
        }
        Self { v }
    }
    fn hash(&self, i: usize) -> HashOutTarget {
        HashOutTarget {
            elements: self.v[i..i + 4].try_into().unwrap(),
        }
    }
    fn set(&self, pw: &mut PartialWitness<F>, s: &State) -> Result<()> {
        for (t, n) in self.v.iter().zip(s.fields()) {
            pw.set_target(*t, f(n))?;
        }
        Ok(())
    }
}
pub struct Targets {
    pub scope: Vec<Target>,
    pub seed: HashOutTarget,
    pub extract: BoolTarget,
    pub before: StateTargets,
    pub after: StateTargets,
    node: NodeTargets,
    previous: NodeTargets,
    following: NodeTargets,
    source: MerkleProofGadget,
    previous_path: MerkleProofGadget,
    following_path: MerkleProofGadget,
    node_path: MerkleProofGadget,
    append: MerkleProofGadget,
}
impl Targets {
    pub fn add(b: &mut CircuitBuilder<F, 2>, t: &mut Tape) -> Self {
        let s = (0..41).map(|_| t.scalar(b)).collect::<Vec<_>>();
        let seed = t.hash(b);
        let extract = b.add_virtual_bool_target_safe();
        t.targets.push(extract.target);
        let build = b.not(extract);
        let before = StateTargets::add(b, t);
        let after = StateTargets::add(b, t);
        let n = NodeTargets::add(b, t);
        let prev = NodeTargets::add(b, t);
        let next = NodeTargets::add(b, t);
        let source = t.proof(b, 56);
        let pp = t.proof(b, 24);
        let np = t.proof(b, 24);
        let vp = t.proof(b, 24);
        let append = t.proof(b, 56);
        let z = b.zero();
        let one = b.one();
        let yes = b._true();
        for (i, x) in [(0, 3), (1, psy_config::PSY_NETWORK_MAGIC)] {
            let c = b.constant(f(x));
            b.connect(s[i], c);
        }
        let k1 = b.is_equal(s[2], one);
        let two = b.constant(f(2));
        let k2 = b.is_equal(s[2], two);
        let kinds = b.or(k1, k2);
        b.assert_one(kinds.target);
        b.range_check(s[8], 24);
        let bad = b.is_equal(s[8], z);
        b.assert_zero(bad.target);
        let bld = before.v[0];
        let done = before.v[11];
        let count_ok = lt(b, bld, s[8], 24);
        eq(b, build, count_ok.target, one);
        eq(b, extract, bld, s[8]);
        let end_ok = lt(b, done, s[8], 24);
        eq(b, extract, end_ok.target, one);
        n.check(b, yes);
        let prev_zero = b.is_equal(prev.v[0], z);
        let next_zero = b.is_equal(next.v[0], z);
        let has_prev = b.not(prev_zero);
        let has_next = b.not(next_zero);
        let gp = b.and(build, has_prev);
        let gn = b.and(build, has_next);
        prev.check(b, gp);
        next.check(b, gn);
        let empty24 = b.constant_hash(h(empty(24)));
        let empty56 = b.constant_hash(h(empty(56)));
        let zero = b.constant_hash(HashOut::ZERO);
        eq(b, build, done, z);
        gh(b, build, before.hash(12), empty56);
        eq(b, build, before.v[16], before.v[9]);
        let first = b.is_equal(bld, z);
        let init = b.and(build, first);
        gh(
            b,
            init,
            before.hash(1),
            HashOutTarget {
                elements: s[17..21].try_into().unwrap(),
            },
        );
        gh(b, init, before.hash(5), empty24);
        eq(b, init, before.v[9], z);
        eq(b, init, before.v[10], z);
        eq(b, build, source.index, n.v[1]);
        gh(b, build, source.root, before.hash(1));
        let original = n.original(b, &s, n.v[1]);
        gh(b, build, source.value, original);
        let bits = b.split_le(source.index, 56);
        for (i, bit) in bits.iter().enumerate() {
            let check = b.and(build, *bit);
            let e = b.constant_hash(h(empty(i)));
            gh(b, check, source.siblings[i], e);
        }
        eq(b, build, n.v[7], prev.v[0]);
        eq(b, build, n.v[8], next.v[0]);
        for other in [prev.v[0], next.v[0]] {
            let same = b.is_equal(n.v[0], other);
            eq(b, build, same.target, z);
        }
        let left_edge = b.and(build, prev_zero);
        let right_edge = b.and(build, next_zero);
        eq(b, left_edge, before.v[9], next.v[0]);
        eq(b, right_edge, before.v[10], prev.v[0]);
        eq(b, gp, prev.v[8], next.v[0]);
        eq(b, gn, next.v[7], prev.v[0]);
        let nk = n.key(b, &s, seed);
        let pk = prev.key(b, &s, seed);
        let sk = next.key(b, &s, seed);
        let lower = rank::before(b, pk, nk);
        let upper = rank::before(b, nk, sk);
        eq(b, gp, lower.target, one);
        eq(b, gn, upper.target, one);
        eq(b, gp, pp.index, prev.v[0]);
        gh(b, gp, pp.root, before.hash(5));
        let old = prev.value(b, &s, seed, prev.v[7], prev.v[8]);
        gh(b, gp, pp.value, old);
        let val = prev.value(b, &s, seed, prev.v[7], n.v[0]);
        let updated = path_update(b, &pp, val);
        let r = choose(b, gp, updated, before.hash(5));
        eq(b, gn, np.index, next.v[0]);
        gh(b, gn, np.root, r);
        let old = next.value(b, &s, seed, next.v[7], next.v[8]);
        gh(b, gn, np.value, old);
        let val = next.value(b, &s, seed, n.v[0], next.v[8]);
        let updated = path_update(b, &np, val);
        let r = choose(b, gn, updated, r);
        eq(b, build, vp.index, n.v[0]);
        gh(b, build, vp.root, r);
        gh(b, build, vp.value, zero);
        let val = n.value(b, &s, seed, n.v[7], n.v[8]);
        let list = path_update(b, &vp, val);
        let seen = path_update(b, &source, zero);
        let head = b.select(prev_zero, n.v[0], before.v[9]);
        let tail = b.select(next_zero, n.v[0], before.v[10]);
        let built = b.add_const(bld, F::ONE);
        let terminal = b.is_equal(built, s[8]);
        let terminal = b.and(build, terminal);
        gh(b, terminal, seen, empty56);
        let expected = StateTargets {
            v: [
                vec![built],
                seen.elements.to_vec(),
                list.elements.to_vec(),
                vec![head, tail, z],
                empty56.elements.to_vec(),
                vec![head],
            ]
            .concat(),
        };
        for (x, y) in after.v.iter().zip(&expected.v) {
            eq(b, build, *x, *y);
        }
        gh(b, extract, before.hash(1), empty56);
        eq(b, extract, n.v[0], before.v[16]);
        eq(b, extract, vp.index, n.v[0]);
        gh(b, extract, vp.root, before.hash(5));
        gh(b, extract, vp.value, val);
        eq(b, extract, append.index, done);
        gh(b, extract, append.root, before.hash(12));
        gh(b, extract, append.value, zero);
        let qval = n.original(b, &s, done);
        let queue = path_update(b, &append, qval);
        let extracted = b.add_const(done, F::ONE);
        let final_pop = b.is_equal(extracted, s[8]);
        let final_pop = b.and(extract, final_pop);
        eq(b, final_pop, n.v[8], z);
        let expected = StateTargets {
            v: [
                before.v[..11].to_vec(),
                vec![extracted],
                queue.elements.to_vec(),
                vec![n.v[8]],
            ]
            .concat(),
        };
        for (x, y) in after.v.iter().zip(&expected.v) {
            eq(b, extract, *x, *y);
        }
        Self {
            scope: s,
            seed,
            extract,
            before,
            after,
            node: n,
            previous: prev,
            following: next,
            source,
            previous_path: pp,
            following_path: np,
            node_path: vp,
            append,
        }
    }
    pub fn set(&self, pw: &mut PartialWitness<F>, p: &Step) -> Result<()> {
        scope(&p.scope, p.seed)?;
        for (t, n) in self.scope.iter().zip(&p.scope) {
            pw.set_target(*t, f(*n))?;
        }
        pw.set_hash_target(self.seed, h(p.seed))?;
        pw.set_bool_target(self.extract, p.extract)?;
        self.before.set(pw, &p.before)?;
        self.after.set(pw, &p.after)?;
        self.node.set(pw, &p.node)?;
        self.previous.set(pw, &p.previous)?;
        self.following.set(pw, &p.following)?;
        for (g, p) in [
            (&self.source, &p.source),
            (&self.previous_path, &p.previous_path),
            (&self.following_path, &p.following_path),
            (&self.node_path, &p.node_path),
            (&self.append, &p.append),
        ] {
            ensure!(
                p.siblings.len() == g.siblings.len() && p.index < 1u64 << p.siblings.len(),
                "exact frontier path shape"
            );
            let proof = MerkleProofCore::new_from_params::<H>(
                p.index,
                Q(h(p.value)),
                p.siblings.iter().map(|v| Q(h(*v))).collect(),
            );
            g.set_witness_core_proof_q(pw, &proof)?;
        }
        Ok(())
    }
    pub fn public(&self) -> Vec<Target> {
        [
            self.scope.clone(),
            self.seed.elements.to_vec(),
            vec![self.extract.target],
            self.before.v.clone(),
            self.after.v.clone(),
        ]
        .concat()
    }
}
pub struct Circuit {
    pub data: CircuitData<F, C, 2>,
    targets: Targets,
}
impl Circuit {
    pub fn build() -> Self {
        let mut b = CircuitBuilder::new(CircuitConfig::standard_recursion_config());
        let mut tape = Tape::default();
        let targets = Targets::add(&mut b, &mut tape);
        b.register_public_inputs(&targets.public());
        Self {
            data: b.build::<C>(),
            targets,
        }
    }
    pub fn prove_raw(&self, p: &Step) -> Result<ProofWithPublicInputs<F, C, 2>> {
        let mut pw = PartialWitness::new();
        self.targets.set(&mut pw, p)?;
        Ok(self.data.prove(pw)?)
    }
    pub fn prove(&self, p: &Step) -> Result<ProofWithPublicInputs<F, C, 2>> {
        ensure!(after(p)? == p.after, "exact frontier transition");
        self.prove_raw(p)
    }
    pub fn verify(&self, p: &Step, proof: ProofWithPublicInputs<F, C, 2>) -> Result<()> {
        let mut v = p.scope.clone();
        v.extend(p.seed);
        v.push(u64::from(p.extract));
        v.extend(p.before.fields());
        v.extend(p.after.fields());
        ensure!(
            proof.public_inputs == v.into_iter().map(f).collect::<Vec<_>>(),
            "exact frontier public endpoints"
        );
        Ok(self.data.verify(proof)?)
    }
}
