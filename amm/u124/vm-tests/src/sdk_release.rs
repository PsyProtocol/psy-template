//! Compile-time SDK release identity, separate from the runtime network name.
use anyhow::{ensure, Result};
#[cfg(feature = "sdk-audit-v1")]
pub const SDK_COMMIT: &str = "01b8f2b0a077367a7b9879baba1a72aea8ab5510";
#[cfg(not(feature = "sdk-audit-v1"))]
pub const SDK_COMMIT: &str = "c92880c8b6e2c8d392f19368bc8801a2584fd427";
#[cfg(feature = "sdk-audit-v1")]
pub const CLIENT_COMMIT: &str = "7058070057c3242b5d8b29e1a31d498aaa4202c0";
#[cfg(not(feature = "sdk-audit-v1"))]
pub const CLIENT_COMMIT: &str = "b280d714a8f0930c61962c885374ea63ea63d274";
#[cfg(feature = "sdk-audit-v1")]
pub const PROFILE: &str = "sdk-audit-20261102-v1";
#[cfg(not(feature = "sdk-audit-v1"))]
pub const PROFILE: &str = "mainnet-beta-20261027-v1";
#[cfg(feature = "sdk-audit-v1")]
pub const ENDCAP_FINGERPRINT: &str = "043e026dc674c310d8a9c529268a02619cab6f3779a74396a330c5ff0d0a5893";
#[cfg(not(feature = "sdk-audit-v1"))]
pub const ENDCAP_FINGERPRINT: &str = "78b73eceb32a446a7cc04ca3ad36e0d856293f366593de8f6132c9240f91c6a3";
pub fn require_profile(profile: &str) -> Result<()> {
    if cfg!(feature = "sdk-audit-v1") {
        ensure!(profile == PROFILE, "audit binary requires its exact SDK profile");
    } else {
        ensure!(profile != "sdk-audit-20261102-v1", "historic binary cannot select the audit SDK profile");
    }
    Ok(())
}
pub fn require_linked_endcap() -> Result<()> {
    use plonky2::field::goldilocks_field::GoldilocksField as F;
    use psy_client_data::config::store_config::C;
    use psy_core::constants::chain_id::PsyChainNetworkType;
    use psy_plonky2_circuits::{circuit_library::end_cap_verifier_data::get_end_cap_alt_verifier_data_for_network, proof_minifier::pm_core::get_circuit_fingerprint_generic_q};
    let data = get_end_cap_alt_verifier_data_for_network::<F>(PsyChainNetworkType::try_from_chain_id(psy_config::PSY_NETWORK_MAGIC)?)?.to_verifier_data::<C, 2>();
    ensure!(get_circuit_fingerprint_generic_q::<2,F,C>(&data).to_string() == ENDCAP_FINGERPRINT,
        "linked SDK Endcap differs from the compile-time release identity");
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn linked_resource_matches_selected_release() { require_linked_endcap().unwrap(); }
    #[test] fn sdk_profiles_cannot_be_selected_by_runtime_environment_alone() {
        require_profile(PROFILE).unwrap();
        if cfg!(feature="sdk-audit-v1") { assert!(require_profile("mainnet-beta-20261027-v1").is_err()); }
        else { assert!(require_profile("sdk-audit-20261102-v1").is_err()); }
    }
}
