//! Strict local testnet dependency guard. Does not lock upgrades on chain.
use anyhow::{ensure, Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F, types::PrimeField64};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::traits::qdatastore::qmetadata::QMetaDataStoreReaderSync;
use psy_provider::provider::RpcProvider;
use serde::Deserialize;
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiveBinding {
    pub contract: crate::submission_guard::ContractBinding,
    pub function_tree_root: String,
    pub layout_field_count: u64,
    pub layout_slot_count: u64,
}
impl LiveBinding {
    pub async fn check(&self, p: &RpcProvider) -> Result<()> {
        ensure!(
            self.contract.contract_id < 16777216,
            "live contract ID range"
        );
        ensure!(
            if self.contract.contract_id == 0 {
                self.contract.state_tree_height == 32
            } else {
                [30, 31].contains(&self.contract.state_tree_height)
            },
            "live contract height"
        );
        for text in [
            &self.contract.code_root,
            &self.contract.layout_root,
            &self.function_tree_root,
        ] {
            let hash: QHashOut<F> = text.parse()?;
            ensure!(hash.to_string() == *text, "canonical live dependency root");
        }
        let leaf = p.get_contract_leaf_data(self.contract.contract_id).await?;
        self.contract.check_leaf(&leaf)?;
        ensure!(
            leaf.function_tree_root.to_string() == self.function_tree_root,
            "function whitelist root changed"
        );
        ensure!(
            leaf.state_layout_field_count.to_canonical_u64() == self.layout_field_count
                && leaf.state_layout_slot_count.to_canonical_u64() == self.layout_slot_count,
            "layout endpoint counts changed"
        );
        Ok(())
    }
}
const STAGING_MAGIC: u64 = 0x1337CF514544C169;
pub const MAINNET_BETA_PROFILE: &str = "mainnet-beta-20261027-v1";
pub const BUNDLED_PROFILE: &str = "staging-bundled-regtest-20261020-v1";
fn profile_magic(name: &str) -> Result<u64> {
    match name {
        "sepolia-config-v1" => Ok(STAGING_MAGIC),
        BUNDLED_PROFILE | MAINNET_BETA_PROFILE => Ok(0x1337CF514544CF69),
        _ => anyhow::bail!("unknown explicit staging compatibility profile"),
    }
}
fn selected_magic() -> Result<u64> {
    let profile = std::env::var("PSY_MARKET_TESTNET_PROFILE")
        .map_err(|_| anyhow::anyhow!("explicit PSY_MARKET_TESTNET_PROFILE required"))?;
    profile_magic(&profile)
}
pub fn require_compiled_verifier_domain() -> Result<()> {
    ensure!(selected_magic()? == psy_config::PSY_NETWORK_MAGIC, "fixed verifier compiled network domain mismatch");
    Ok(())
}
fn staging_config(net: &psy_config::NetworkConfigGoldilocks, expected_magic: u64) -> Result<()> {
    let text = net.magic.strip_prefix("0x").unwrap_or(&net.magic);
    let magic = if net.magic.starts_with("0x") {
        u64::from_str_radix(text, 16)?
    } else {
        text.parse()?
    };
    ensure!(
        magic == expected_magic,
        "isolated client requires the staging network domain"
    );
    ensure!(
        !net.coordinator_configs.is_empty() && !net.realm_configs.is_empty(),
        "staging endpoints required"
    );
    let mut coordinator_ids = std::collections::BTreeSet::new();
    for c in &net.coordinator_configs {
        ensure!(
            c.id == 0 && coordinator_ids.insert(c.id) && !c.rpc_url.is_empty(),
            "staging coordinator topology"
        );
        ensure!(
            c.rpc_url
                .iter()
                .all(|url| url.trim_end_matches('/') == "https://coordinator-stg.psy-protocol.xyz"),
            "staging coordinator RPC"
        );
    }
    let mut realm_ids = std::collections::BTreeSet::new();
    for r in &net.realm_configs {
        let expected = match r.id {
            0 => "https://realm0-stg.psy-protocol.xyz",
            1 => "https://realm1-stg.psy-protocol.xyz",
            _ => anyhow::bail!("unknown staging realm"),
        };
        ensure!(
            realm_ids.insert(r.id) && !r.rpc_url.is_empty(),
            "staging realm topology"
        );
        ensure!(
            r.rpc_url
                .iter()
                .all(|url| url.trim_end_matches('/') == expected),
            "staging realm RPC"
        );
    }
    Ok(())
}
pub fn require_staging(net: &psy_config::NetworkConfigGoldilocks) -> Result<()> {
    let magic = selected_magic()?;
    staging_config(net, magic)?;
    ensure!(
        psy_config::PSY_NETWORK_MAGIC == magic,
        "test network magic differs from compiled domain"
    );
    Ok(())
}

/// Mandatory comparison against the declared stable source verifier and common
/// data. Runtime provenance remains separately unverified; no guess/retry here.
pub fn verify_ups_profile(
    cm: &psy_ups_circuit::circuit_manager::core::PsyUPSStepCircuitManager<
        psy_client_data::config::store_config::C,
        2,
    >,
) -> Result<serde_json::Value> {
    use psy_client_data::config::store_config::C;
    use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
    use psy_core::{constants::chain_id::PsyChainNetworkType, job::job_id::ProvingJobCircuitType};
    use psy_plonky2_circuits::{
        circuit_library::end_cap_verifier_data::get_end_cap_alt_verifier_data_for_network,
        generated::cached_common_data::get_cached_common_data_library,
        proof_minifier::pm_core::get_circuit_fingerprint_generic_q,
    };
    let bundled =
        get_end_cap_alt_verifier_data_for_network::<F>(PsyChainNetworkType::try_from_chain_id(psy_config::PSY_NETWORK_MAGIC)?)?
            .to_verifier_data::<C, 2>();
    ensure!(
        cm.ups_end_cap.get_verifier_config_ref() == &bundled,
        "SDK key differs from declared stable Node verifier; no broadcast"
    );
    let library = get_cached_common_data_library::<C, 2>();
    let common = library.get_common_circuit_data_ref(ProvingJobCircuitType::UserEndCap)?;
    ensure!(
        cm.ups_end_cap.get_common_circuit_data_ref() == common,
        "SDK common data differs from declared stable Node verifier; no broadcast"
    );
    Ok(
        serde_json::json!({"profile":std::env::var("PSY_MARKET_TESTNET_PROFILE").unwrap_or_else(|_|MAINNET_BETA_PROFILE.into()),"networkMagic":selected_magic()?.to_string(),"bundledNodeVerifierFingerprint":get_circuit_fingerprint_generic_q::<2,F,C>(&bundled).to_string(),"verifierOnlyMatches":true,"commonDataMatches":true,"runtimeImageAttested":false}),
    )
}

/// Reuse the already-built session manager. Verify the *complete proof* with
/// the fixed Node verifier AND fixed Node common data, not a supplied proof key.
/// The SDK trait exposes verifier-only data but not its common-data object;
/// full verification against the pinned common data replaces rebuilding an
/// identical manager merely to compare that object. No stack/session/PI guard
/// in the callers is skipped.
pub async fn verify_ups_with_session_manager(
    cm: &(dyn psy_vm::ups::circuit_manager::UPSCircuitManager<
        psy_client_data::config::store_config::C, 2,
    > + Send + Sync),
    proof: &plonky2::plonk::proof::ProofWithPublicInputs<
        F, psy_client_data::config::store_config::C, 2,
    >,
) -> Result<serde_json::Value> {
    use psy_client_data::config::store_config::C;
    use psy_plonky2_circuits::proof_minifier::pm_core::get_circuit_fingerprint_generic_q;
    let actual = cm.ups_end_cap_circuit_verifier_config().await?;
    let fingerprint = crate::fixed_verifier::with_verifier(|verifier| {
        ensure!(actual == verifier.verifier_only, "session SDK key differs from fixed Node verifier; no broadcast");
        verifier.verify(proof.clone())?;
        Ok(get_circuit_fingerprint_generic_q::<2,F,C>(&verifier.verifier_only).to_string())
    })?;
    Ok(serde_json::json!({
        "profile":std::env::var("PSY_MARKET_TESTNET_PROFILE").unwrap_or_else(|_|MAINNET_BETA_PROFILE.into()),
        "networkMagic":selected_magic()?.to_string(),
        "bundledNodeVerifierFingerprint":fingerprint,
        "verifierOnlyMatches":true,"fullProofVerifiedWithPinnedCommonData":true,
        "sdkCommonDataObjectEqualityCompared":false,"sessionManagerReused":true,
        "runtimeImageAttested":false
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn staging_guard_rejects_domain_or_endpoint_substitution() -> Result<()> {
        let config = psy_config::PsyConfigGoldilocks::from_file(&std::env::var("PSY_CONFIG_PATH")?)?;
        let selected = config.get_current_network()?.clone();
        staging_config(&selected, profile_magic(MAINNET_BETA_PROFILE)?)?;
        require_staging(&selected)?;
        let mut net = selected.clone();net.magic=format!("0x{STAGING_MAGIC:x}");
        staging_config(&net, STAGING_MAGIC)?;
        assert_eq!(
            require_staging(&net).is_ok(),
            psy_config::PSY_NETWORK_MAGIC == STAGING_MAGIC && selected_magic()? == STAGING_MAGIC
        );
        let mut spoofed = net.clone();
        spoofed.magic = psy_config::PSY_NETWORK_MAGIC.to_string();
        assert_eq!(
            require_staging(&spoofed).is_ok(),
            psy_config::PSY_NETWORK_MAGIC == selected_magic()?
        );
        assert!(profile_magic("automatic-fallback").is_err());
        let mut reg = net.clone();
        reg.magic = "0x1337CF514544CF69".into();
        assert!(staging_config(&reg, STAGING_MAGIC).is_err());
        assert!(staging_config(&net, profile_magic(BUNDLED_PROFILE)?).is_err());
        staging_config(&reg, profile_magic(BUNDLED_PROFILE)?)?;
        let mut wrong = net.clone();
        wrong.magic = "1".into();
        assert!(staging_config(&wrong, STAGING_MAGIC).is_err());
        for url in [
            "https://realm0-stg.psy-protocol.xyz.evil.invalid",
            "http://realm0-stg.psy-protocol.xyz",
            "https://mainnet.psy-protocol.xyz",
        ] {
            let mut wrong = net.clone();
            wrong.realm_configs[0].rpc_url[0] = url.into();
            assert!(staging_config(&wrong, STAGING_MAGIC).is_err());
        }
        let mut wrong = net.clone();
        wrong.realm_configs[0].rpc_url.clear();
        assert!(staging_config(&wrong, STAGING_MAGIC).is_err());
        let mut wrong = net.clone();
        wrong.coordinator_configs[0].rpc_url.clear();
        assert!(staging_config(&wrong, STAGING_MAGIC).is_err());
        let mut wrong = net.clone();
        wrong.realm_configs.push(wrong.realm_configs[0].clone());
        assert!(staging_config(&wrong, STAGING_MAGIC).is_err());
        let mut wrong = net.clone();
        wrong.realm_configs[0].rpc_url[0] = "https://coordinator-stg.psy-protocol.xyz".into();
        assert!(staging_config(&wrong, STAGING_MAGIC).is_err());
        Ok(())
    }
}
