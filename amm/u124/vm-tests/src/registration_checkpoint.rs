//! Registration membership relative to captured checkpoint data. No signer,
//! prover, transport, account initialization or financial authorization.
use anyhow::{ensure, Result};
use plonky2::{field::goldilocks_field::GoldilocksField as F, hash::poseidon::PoseidonHash as H};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::qdata::checkpoint::{PsyCheckpointGlobalStateRoots, PsyCheckpointLeaf};
use psy_config::network_constants::{GLOBAL_USER_TREE_HEIGHT, CHECKPOINT_TREE_HEIGHT};
use psy_crypto::{common::user_id::get_registration_id_from_user_id,
    hash::{merkle::core::MerkleProofCore, traits::qhashable::QFieldHashable}};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RegistrationCheckpoint {
    pub schema: u32,
    pub checkpoint_id: u64,
    pub user_id: u64,
    pub public_key: Q<F>,
    pub chain_anchor_leaf: PsyCheckpointLeaf<F>,
    pub chain_anchor_proof: MerkleProofCore<Q<F>>,
    pub checkpoint_proof: MerkleProofCore<Q<F>>,
    pub checkpoint_leaf: PsyCheckpointLeaf<F>,
    pub state_roots: PsyCheckpointGlobalStateRoots<F>,
    pub registration_proof: MerkleProofCore<Q<F>>,
}

pub fn verify_registration_checkpoint(input: &RegistrationCheckpoint,
    expected_chain: Q<F>, expected_checkpoint_root: Q<F>, expected_user: u64, expected_key: Q<F>) -> Result<()> {
    ensure!(input.schema == 2 && input.checkpoint_id > 0 && input.checkpoint_id < (1u64 << 32), "checkpoint schema/range");
    ensure!(expected_user > 0 && expected_user < (1u64 << 24) && expected_key != Q::ZERO,
        "explicit ordinary identity required");
    ensure!(input.chain_anchor_leaf.global_chain_root == expected_chain && expected_chain != Q::ZERO,
        "chain instance differs from reviewed domain");
    ensure!(expected_checkpoint_root != Q::ZERO, "explicit checkpoint root required");
    for (proof, index, value) in [
        (&input.chain_anchor_proof, 1, input.chain_anchor_leaf.qfhash::<H>()),
        (&input.checkpoint_proof, input.checkpoint_id, input.checkpoint_leaf.qfhash::<H>()),
    ] {
        ensure!(proof.root == expected_checkpoint_root && proof.index == index && proof.value == value
            && proof.siblings.len() == CHECKPOINT_TREE_HEIGHT as usize && proof.verify::<H>(),
            "checkpoint membership/index/domain binding");
    }
    ensure!(input.user_id == expected_user && input.public_key == expected_key,
        "original registration identity changed");
    let proof = &input.registration_proof;
    ensure!(proof.index == get_registration_id_from_user_id(expected_user)
        && proof.siblings.len() == GLOBAL_USER_TREE_HEIGHT as usize,
        "registration index/height");
    ensure!(proof.value == expected_key && proof.root == input.state_roots.user_registration_tree_root
        && proof.verify::<H>(), "registration membership");
    ensure!(input.state_roots.qfhash::<H>() == input.checkpoint_leaf.global_chain_root,
        "checkpoint state roots differ");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> RegistrationCheckpoint {
        let user = 223232;
        let key = Q::from_values(1, 2, 3, 4);
        let proof = MerkleProofCore::new_from_params::<H>(get_registration_id_from_user_id(user), key,
            vec![Q::ZERO; GLOBAL_USER_TREE_HEIGHT as usize]);
        let mut state_roots = PsyCheckpointGlobalStateRoots::default();
        state_roots.user_registration_tree_root = proof.root;
        let mut checkpoint_leaf = PsyCheckpointLeaf::default();
        checkpoint_leaf.global_chain_root = state_roots.qfhash::<H>();
        let checkpoint_proof = MerkleProofCore::new_from_params::<H>(1, checkpoint_leaf.qfhash::<H>(),
            vec![Q::ZERO; CHECKPOINT_TREE_HEIGHT as usize]);
        RegistrationCheckpoint {schema:2, checkpoint_id:1, user_id:user, public_key:key,
            chain_anchor_leaf:checkpoint_leaf, chain_anchor_proof:checkpoint_proof.clone(),
            checkpoint_proof, checkpoint_leaf, state_roots, registration_proof:proof}
    }
    #[test]
    fn membership_does_not_require_an_initialized_user_state_leaf() -> Result<()> {
        let f = fixture();
        verify_registration_checkpoint(&f, f.chain_anchor_leaf.global_chain_root, f.checkpoint_proof.root, f.user_id, f.public_key)?;
        Ok(())
    }
    #[test]
    fn wrong_key_index_root_height_and_chain_reject() {
        for mutate in [0,1,2,3,4,5,6,7,8,9] {
            let mut f = fixture();
            let (chain,root,user,key) = (f.chain_anchor_leaf.global_chain_root,f.checkpoint_proof.root,f.user_id,f.public_key);
            match mutate {
                0 => f.registration_proof.value = Q::ZERO,
                1 => f.registration_proof.index += 1,
                2 => f.registration_proof.siblings.pop().map(|_| ()).unwrap(),
                3 => f.registration_proof.root = Q::ZERO,
                4 => f.checkpoint_leaf.global_chain_root = Q::ZERO,
                5 => f.chain_anchor_leaf.global_chain_root = Q::ZERO,
                6 => f.user_id += 1,
                7 => f.checkpoint_id += 1,
                8 => f.checkpoint_proof.root = Q::ZERO,
                _ => f.chain_anchor_proof.index += 1,
            }
            assert!(verify_registration_checkpoint(&f,chain,root,user,key).is_err());
        }
    }
}
