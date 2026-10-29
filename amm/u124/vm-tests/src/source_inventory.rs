//! Complete sparse account inventory relative to one pinned user-tree root.
//! This verifies membership/absence, not checkpoint finality or market eligibility.
use anyhow::{ensure, Result};
use plonky2::{field::goldilocks_field::GoldilocksField as F, hash::poseidon::PoseidonHash as H};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_crypto::hash::{
    merkle::core::{compute_root_merkle_proof_generic, MerkleProofCore},
    traits::hasher::MerkleZeroHasher,
};
use std::collections::BTreeMap;

pub struct Inventory {
    root: Q<F>,
    height: usize,
    pending: BTreeMap<(u64, usize), Q<F>>,
    leaves: BTreeMap<u64, Q<F>>,
    proofs: usize,
}
impl Inventory {
    pub fn new(root: Q<F>, height: usize) -> Result<Self> {
        ensure!(
            (1..=32).contains(&height),
            "inventory height outside reviewed range"
        );
        let mut pending = BTreeMap::new();
        if root != H::get_zero_hash(height) {
            pending.insert((0, height), root);
        }
        Ok(Self {
            root,
            height,
            pending,
            leaves: BTreeMap::new(),
            proofs: 0,
        })
    }
    pub fn next(&self) -> Option<u64> {
        self.pending.keys().next().map(|(id, _)| *id)
    }
    pub fn consume(&mut self, proof: &MerkleProofCore<Q<F>>) -> Result<()> {
        let (&(prefix, height), &expected) = self
            .pending
            .first_key_value()
            .ok_or_else(|| anyhow::anyhow!("inventory already complete"))?;
        ensure!(
            proof.index == prefix
                && proof.siblings.len() == self.height
                && proof.root == self.root
                && proof.verify::<H>(),
            "wrong inventory index/root/path"
        );
        ensure!(
            compute_root_merkle_proof_generic::<_, H>(
                proof.value,
                prefix,
                &proof.siblings[..height]
            ) == expected,
            "inventory subtree changed"
        );
        // All validation precedes mutation. The leftmost leaf path partitions
        // this subtree into one leaf and disjoint right siblings, including zeros.
        let mut children = vec![];
        for level in 0..height {
            if proof.siblings[level] != H::get_zero_hash(level) {
                let key = (prefix + (1u64 << level), level);
                ensure!(
                    !self.pending.contains_key(&key),
                    "duplicate inventory subtree"
                );
                children.push((key, proof.siblings[level]));
            }
        }
        ensure!(
            !self.leaves.contains_key(&prefix),
            "duplicate inventory leaf"
        );
        self.pending.remove(&(prefix, height));
        self.pending.extend(children);
        if proof.value != Q::ZERO {
            self.leaves.insert(prefix, proof.value);
        }
        self.proofs += 1;
        Ok(())
    }
    pub fn complete(&self) -> bool {
        self.pending.is_empty()
    }
    pub fn leaves(&self) -> &BTreeMap<u64, Q<F>> {
        &self.leaves
    }
    pub fn proofs(&self) -> usize {
        self.proofs
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use psy_crypto::hash::traits::hasher::MerkleHasher;
    fn tree(height: usize, ids: &[u64]) -> Vec<BTreeMap<u64, Q<F>>> {
        let mut levels = vec![ids
            .iter()
            .map(|&i| (i, Q::from_values(i + 1, 0, 0, 0)))
            .collect::<BTreeMap<_, _>>()];
        for level in 0..height {
            let prev = &levels[level];
            let mut next = BTreeMap::new();
            for &i in prev.keys() {
                let p = i / 2;
                let z = H::get_zero_hash(level);
                next.insert(
                    p,
                    H::two_to_one(
                        prev.get(&(p * 2)).unwrap_or(&z),
                        prev.get(&(p * 2 + 1)).unwrap_or(&z),
                    ),
                );
            }
            levels.push(next);
        }
        levels
    }
    fn proof(t: &[BTreeMap<u64, Q<F>>], index: u64) -> MerkleProofCore<Q<F>> {
        let height = t.len() - 1;
        MerkleProofCore::new_from_params::<H>(
            index,
            *t[0].get(&index).unwrap_or(&Q::ZERO),
            (0..height)
                .map(|h| {
                    *t[h]
                        .get(&((index >> h) ^ 1))
                        .unwrap_or(&H::get_zero_hash(h))
                })
                .collect(),
        )
    }
    #[test]
    fn complete_sparse_inventory_including_high_realm_ids() {
        let ids = [0, 4, 9, 1 << 20, (1 << 32) - 1];
        let t = tree(32, &ids);
        let mut inv = Inventory::new(t[32][&0], 32).unwrap();
        while let Some(i) = inv.next() {
            inv.consume(&proof(&t, i)).unwrap();
        }
        assert_eq!(inv.leaves.keys().copied().collect::<Vec<_>>(), ids);
        assert!(inv.consume(&proof(&t, 0)).is_err());
    }
    #[test]
    fn omissions_wrong_root_and_duplicates_cannot_finish() {
        let t = tree(8, &[3, 8, 200]);
        let mut inv = Inventory::new(t[8][&0], 8).unwrap();
        let p = proof(&t, 0);
        let mut bad = p.clone();
        bad.siblings[0] = Q::ZERO;
        // Select a definitely different valid proof, and a forged root.
        assert!(inv.consume(&proof(&t, 3)).is_err());
        bad.root = Q::ZERO;
        assert!(inv.consume(&bad).is_err());
        assert_eq!(inv.next(), Some(0));
        inv.consume(&p).unwrap();
        assert!(!inv.complete());
        assert!(inv.consume(&p).is_err());
        while let Some(i) = inv.next() {
            inv.consume(&proof(&t, i)).unwrap();
        }
        assert_eq!(inv.leaves.len(), 3);
    }
    #[test]
    fn empty_root_is_a_complete_absence_proof() {
        let inv = Inventory::new(H::get_zero_hash(32), 32).unwrap();
        assert!(inv.complete());
        assert!(inv.leaves.is_empty());
        assert!(Inventory::new(Q::ZERO, 0).is_err());
        assert!(Inventory::new(Q::ZERO, 33).is_err());
    }
}
