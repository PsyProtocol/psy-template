//! Bind a valid UPS proof's public inputs to the exact end-cap metadata that
//! will be broadcast. Verifying an unrelated valid proof is insufficient.
use anyhow::{ensure, Result};
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_data::{
    config::store_config::PsyHasher, guta::api::SubmitUserEndCapNonProofCoreInput,
};
use psy_crypto::hash::traits::qhashable::QFieldHashable;

pub fn validate_endcap_binding(
    core: &SubmitUserEndCapNonProofCoreInput<F>,
    public_inputs: &[F],
) -> Result<()> {
    ensure!(public_inputs.len() == 4, "UPS public input count");
    ensure!(
        public_inputs == core.get_proof_public_inputs_hash::<PsyHasher>().0.elements,
        "UPS proof/endcap public input binding"
    );
    ensure!(
        core.new_user_leaf.qfhash::<PsyHasher>() == core.state_transition.end_user_leaf_hash,
        "UPS end user leaf binding"
    );
    ensure!(
        core.new_user_leaf.user_id == core.state_transition.user_id,
        "UPS user ID binding"
    );
    ensure!(
        core.new_user_leaf.last_checkpoint_id == core.checkpoint_id,
        "UPS checkpoint binding"
    );
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use plonky2::field::types::Field;
    #[test]
    fn proof_metadata_swap_and_inconsistent_endcap_are_rejected() -> Result<()> {
        let mut core = SubmitUserEndCapNonProofCoreInput::<F>::default();
        core.checkpoint_id = F::from_canonical_u64(100);
        core.new_user_leaf.last_checkpoint_id = core.checkpoint_id;
        core.new_user_leaf.user_id = F::from_canonical_u64(123);
        core.state_transition.user_id = core.new_user_leaf.user_id;
        core.state_transition.end_user_leaf_hash = core.new_user_leaf.qfhash::<PsyHasher>();
        let inputs = core.get_proof_public_inputs_hash::<PsyHasher>().0.elements;
        validate_endcap_binding(&core, &inputs)?;
        assert!(validate_endcap_binding(&core, &inputs[..3]).is_err());
        let mut wrong = inputs;
        wrong[0] += F::ONE;
        assert!(validate_endcap_binding(&core, &wrong).is_err());
        for mutation in 0..4 {
            let mut altered = core;
            match mutation {
                0 => altered.new_user_leaf.nonce += F::ONE,
                1 => altered.new_user_leaf.user_id += F::ONE,
                2 => altered.checkpoint_id += F::ONE,
                _ => altered.state_transition.end_user_leaf_hash.0.elements[0] += F::ONE,
            };
            assert!(validate_endcap_binding(&altered, &inputs).is_err());
            // Even freshly recomputed metadata public inputs cannot make an internally
            // inconsistent end cap valid. This does not manufacture a valid UPS proof.
            assert!(validate_endcap_binding(
                &altered,
                &altered
                    .get_proof_public_inputs_hash::<PsyHasher>()
                    .0
                    .elements
            )
            .is_err());
        }
        Ok(())
    }
}
