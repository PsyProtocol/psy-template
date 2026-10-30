//! Accepted-seal membership under the *same* signed history as the draw CFC.
//! Certifies index order only, not canonical finality or seed secrecy/bias.
use crate::{
    final_state_coverage::{verify_source_context, Review, Snapshot},
    market_key::SDKeyCircuitGadget,
    stream_context::SourceContextTargets,
    stream_source::{lt, Tape},
};
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{hash_types::HashOutTarget, poseidon::PoseidonHash as H},
    iop::{
        target::{BoolTarget, Target},
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::circuit_builder::CircuitBuilder,
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_common_circuit::hash::merkle::gadgets::merkle_proof::MerkleProofGadget;
use psy_crypto::hash::{merkle::core::MerkleProofCore, traits::hasher::MerkleZeroHasher};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use plonky2::plonk::config::Hasher;
use psy_crypto::hash::traits::{hasher::FieldQHasher, qhashable::QFieldHashable};
pub const DRAW_DELAY: u64 = 32;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcceptedSeal {
    pub snapshot: Snapshot,
    pub vault_path: MerkleProofCore<Q<F>>,
}
/// Public planning check, mirroring the spending constraints. A supplied history
/// root remains conditional: this does not authenticate canonical finality or
/// the time at which a producer first learned the future seed.
pub fn verify_accepted_seal(r: &Review, source: &Snapshot, scope: &[u64], history: Q<F>, p: &AcceptedSeal) -> Result<()> {
    let v=&p.snapshot.fields;
    ensure!(scope.len()==41 && source.fields.len()==41 && v.len()==41,"seal scope length");
    verify_source_context(r,&p.snapshot,history)?;
    for i in [1usize,2,3,4,5,7].into_iter().chain(9..13).chain(25..41) {
        ensure!(v[i]==scope[i],"immutable seal identity at {i}");
    }
    let draw=scope[6].checked_add(DRAW_DELAY).context("draw overflow")?;
    ensure!(draw<1<<32 && scope[6]<v[6] && v[6]<draw,"S < accepted seal < fixed D");
    ensure!(p.snapshot.accounts.len()==1,"exact accepted vault opening");
    let a=&p.snapshot.accounts[0];
    let member=|proof:&MerkleProofCore<Q<F>>,root:Q<F>,index:u64,value:Q<F>,height:usize|->Result<()>{
        ensure!(proof.siblings.len()==height && proof.index==index && proof.root==root && proof.value==value && proof.verify::<H>(),"accepted-seal membership");Ok(())
    };
    ensure!(a.leaf.user_id.to_canonical_u64()==scope[4] && p.snapshot.key_public_param==source.key_public_param,"seal vault and key parameter");
    let q=|x:&[u64]|Q(plonky2::hash::hash_types::HashOut{elements:std::array::from_fn(|i|f(x[i]))});
    ensure!(a.leaf.public_key==H::q_two_to_one(q(&scope[33..37]),source.key_public_param),"seal spending key");
    member(&p.vault_path,p.snapshot.history.roots.user_tree_root,scope[4],a.leaf.qfhash::<H>(),32)?;
    for (id,state) in [(0,a.native.as_ref().context("seal native")?),(r.assets[1].id,a.asset_a.as_ref().context("seal A")?),(r.assets[2].id,a.asset_b.as_ref().context("seal B")?),(r.market,&a.market)] {
        member(&state.contract_path,a.leaf.user_state_tree_root,id,state.contract_path.value,24)?;
    }
    let read=|name:&str,i:u64|->Result<F>{let offset=r.offsets[name]+i;let word=a.market.words.iter().find(|w|w.index==offset/4).context("seal state word")?;member(word,a.market.contract_path.value,offset/4,word.value,31)?;Ok(word.value.0.elements[(offset%4)as usize])};
    let raw=scope[..8].iter().chain(&scope[9..17]).chain(&scope[21..]).copied().map(f).collect::<Vec<_>>();
    let scope_hash=H::hash_no_pad(&raw);
    for i in 0..4 {ensure!(read("stream_scope",i)?==scope_hash.elements[i as usize] && read("stream_target_users",i)?==source.history.roots.user_tree_root.0.elements[i as usize],"exact sealed original source");}
    for(name,value)in [("stream_source",scope[6]),("stream_id",scope[5]),("stream_expiry",scope[7]),("stream_seed_installed",0),("stream_busy",0),("batch_ready",1)]{ensure!(read(name,0)?==f(value),"accepted-seal {name}");}
    ensure!([1,2].contains(&read("stream_phase",0)?.to_canonical_u64()) && [0,3,4].contains(&read("batch_phase",0)?.to_canonical_u64()),"accepted unseeded idle phase");
    Ok(())
}
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn eq(b: &mut CircuitBuilder<F, 2>, gate: BoolTarget, a: Target, c: Target) {
    crate::batch_policy::eq(b, gate, a, c)
}
fn hash_eq(b: &mut CircuitBuilder<F, 2>, gate: BoolTarget, a: HashOutTarget, c: HashOutTarget) {
    for (x, y) in a.elements.into_iter().zip(c.elements) {
        eq(b, gate, x, y)
    }
}
pub fn word_offsets(r: &Review) -> Result<Vec<u64>> {
    let mut out = vec![];
    for (name, width) in [
        ("stream_scope", 4),
        ("stream_target_users", 4),
        ("stream_source", 1),
        ("stream_id", 1),
        ("stream_expiry", 1),
        ("stream_seed_installed", 1),
        ("stream_phase", 1),
        ("stream_busy", 1),
    ] {
        let start = *r
            .offsets
            .get(name)
            .with_context(|| format!("accepted-seal field {name}"))?;
        out.extend((0..width).map(|i| start + i));
    }
    Ok(out)
}
pub struct Targets {
    pub checkpoint: Target,
    scope: Vec<Target>,
    facts: Vec<HashOutTarget>,
    context: SourceContextTargets,
    words: BTreeMap<u64, MerkleProofGadget>,
}
impl Targets {
    pub fn add(
        b: &mut CircuitBuilder<F, 2>,
        t: &mut Tape,
        r: &Review,
        g: &SDKeyCircuitGadget,
        original: &[Target],
        original_users: HashOutTarget,
        scope_hash: HashOutTarget,
        chain: [u64; 4],
        gate: BoolTarget,
    ) -> Result<Self> {
        let scope = (0..41).map(|_| t.scalar(b)).collect::<Vec<_>>();
        let facts = (0..5).map(|_| t.hash(b)).collect::<Vec<_>>();
        let context = SourceContextTargets::add(b, t, r, g, &scope, &facts, chain, gate)?;
        // Historical C has its own leaf/hash/seed. Only the original immutable market
        // identity, epoch, expiry and chain match S; no fake equality of S/C states.
        for i in [1usize, 2, 3, 4, 5, 7]
            .into_iter()
            .chain(9..13)
            .chain(25..41)
        {
            eq(b, gate, scope[i], original[i]);
        }
        let checkpoint = scope[6];
        let draw = b.add_const(original[6], f(DRAW_DELAY));
        b.range_check(draw, 32);
        let a = lt(b, original[6], checkpoint, 32);
        let c = lt(b, checkpoint, draw, 32);
        let one = b.one();
        let zero = b.zero();
        eq(b, gate, a.target, one);
        eq(b, gate, c.target, one);
        let mut words = BTreeMap::new();
        for offset in word_offsets(r)? {
            let index = offset / 4;
            if !words.contains_key(&index) {
                let proof = t.proof(b, 31);
                let at = b.constant(f(index));
                eq(b, gate, proof.index, at);
                hash_eq(b, gate, proof.root, facts[4]);
                words.insert(index, proof);
            }
        }
        let read = |name: &str, i: u64| {
            let o = r.offsets[name] + i;
            words[&(o / 4)].value.elements[(o % 4) as usize]
        };
        for i in 0..4 {
            eq(
                b,
                gate,
                read("stream_scope", i as u64),
                scope_hash.elements[i],
            );
            eq(
                b,
                gate,
                read("stream_target_users", i as u64),
                original_users.elements[i],
            );
        }
        for (name, value) in [
            ("stream_source", original[6]),
            ("stream_id", original[5]),
            ("stream_expiry", original[7]),
            ("stream_seed_installed", zero),
            ("stream_busy", zero),
        ] {
            eq(b, gate, read(name, 0), value);
        }
        let phase = read("stream_phase", 0);
        let two = b.constant(f(2));
        let p1 = b.is_equal(phase, one);
        let p2 = b.is_equal(phase, two);
        let accepted = b.or(p1, p2);
        eq(b, gate, accepted.target, one);
        Ok(Self {
            checkpoint,
            scope,
            facts,
            context,
            words,
        })
    }
    pub fn set(
        &self,
        pw: &mut PartialWitness<F>,
        r: &Review,
        opening: Option<&AcceptedSeal>,
        original: &[u64],
    ) -> Result<()> {
        if let Some(p) = opening {
            ensure!(p.snapshot.history.anchor_path.verify::<H>()
                && p.snapshot.history.checkpoint_path.verify::<H>()
                && p.vault_path.verify::<H>(), "consistent serialized seal membership roots");
            ensure!(
                p.snapshot.fields.len() == 41 && original.len() == 41,
                "accepted seal scope shape"
            );
            for (t, n) in self.scope.iter().zip(&p.snapshot.fields) {
                pw.set_target(*t, f(*n))?;
            }
            let vault = p
                .snapshot
                .accounts
                .iter()
                .find(|a| a.leaf.user_id.to_canonical_u64() == original[4])
                .context("accepted seal vault")?;
            let contracts = [
                vault.native.as_ref().context("seal native")?,
                vault.asset_a.as_ref().context("seal A")?,
                vault.asset_b.as_ref().context("seal B")?,
                &vault.market,
            ];
            pw.set_hash_target(self.facts[0], p.snapshot.history.roots.user_tree_root.0)?;
            for (t, c) in self.facts[1..].iter().zip(contracts) {
                pw.set_hash_target(*t, c.contract_path.value.0)?;
            }
            self.context.set(pw, r, &p.snapshot, &p.vault_path)?;
            for (index, t) in &self.words {
                let proof = vault
                    .market
                    .words
                    .iter()
                    .find(|w| w.index == *index)
                    .context("accepted seal state word")?;
                t.set_witness_core_proof_q(pw, proof)?;
            }
        } else {
            for t in &self.scope {
                pw.set_target(*t, F::ZERO)?;
            }
            for t in &self.facts {
                pw.set_hash_target(*t, plonky2::hash::hash_types::HashOut::ZERO)?;
            }
            self.context.set_empty(pw)?;
            for t in self.words.values() {
                let p = MerkleProofCore::new_from_params::<H>(
                    0,
                    Q::ZERO,
                    (0..31)
                        .map(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash)
                        .collect(),
                );
                t.set_witness_core_proof_q(pw, &p)?;
            }
        }
        Ok(())
    }
}
