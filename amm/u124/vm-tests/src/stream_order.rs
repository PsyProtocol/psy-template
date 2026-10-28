//! Shared state and v3 member-commitment targets for deterministic stream vaults.
use crate::{checkpoint_stream::State, stream_source::Tape};
use anyhow::Result;
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::{
        hash_types::{HashOut, HashOutTarget},
        poseidon::PoseidonHash as H,
    },
    iop::{
        target::Target,
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::circuit_builder::CircuitBuilder,
};
#[derive(Clone)]
pub struct StateTargets {
    pub cursor: Target,
    pub seen: HashOutTarget,
    pub ordered: HashOutTarget,
    pub last: [Target; 7],
}
impl StateTargets {
    pub fn fields(&self) -> Vec<Target> {
        let mut v = vec![self.cursor];
        v.extend(self.seen.elements);
        v.extend(self.ordered.elements);
        v.extend(self.last);
        v
    }
    pub fn add(b: &mut CircuitBuilder<F, 2>, t: &mut Tape) -> Self {
        Self {
            cursor: t.scalar(b),
            seen: t.hash(b),
            ordered: t.hash(b),
            last: std::array::from_fn(|_| t.scalar(b)),
        }
    }
    pub fn set(&self, pw: &mut PartialWitness<F>, s: &State) -> Result<()> {
        let mut v = vec![s.cursor];
        v.extend(s.seen);
        v.extend(s.ordered);
        v.extend(s.last);
        for (t, n) in self.fields().into_iter().zip(v) {
            pw.set_target(t, F::from_canonical_u64(n))?;
        }
        Ok(())
    }
}
pub fn member(
    b: &mut CircuitBuilder<F, 2>,
    scope: &[Target],
    index: Target,
    owner: Target,
    nonce: Target,
    terms: HashOutTarget,
) -> HashOutTarget {
    let mut raw = vec![b.constant(F::from_canonical_u64(0x5354524d454d33))];
    raw.extend(&scope[..8]);
    raw.extend(&scope[9..17]);
    raw.extend(&scope[25..]);
    raw.extend([index, owner, nonce]);
    raw.extend(terms.elements);
    b.hash_n_to_hash_no_pad::<H>(raw)
}
