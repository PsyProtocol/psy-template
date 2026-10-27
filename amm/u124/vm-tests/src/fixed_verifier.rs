//! Immutable verification resources only. No witness, account, nonce, market
//! layout, signed request or verification result is cached here.
use anyhow::Result;
#[cfg(test)] use anyhow::ensure;
use plonky2::{field::goldilocks_field::GoldilocksField as F, plonk::circuit_data::VerifierCircuitData};
use psy_client_data::config::store_config::C;
use psy_core::{constants::chain_id::PsyChainNetworkType, job::job_id::ProvingJobCircuitType};
use psy_plonky2_circuits::{circuit_library::end_cap_verifier_data::get_end_cap_alt_verifier_data_for_network, generated::cached_common_data::get_cached_common_data_library};
use std::{sync::OnceLock, time::Instant};
pub type FixedVerifier = VerifierCircuitData<F, C, 2>;
static VERIFIER: OnceLock<std::result::Result<FixedVerifier, String>> = OnceLock::new();

pub fn mode(text: &str) -> Result<bool> {
    match text { "cached-v1" => Ok(true), "fresh-v1" => Ok(false), _ => anyhow::bail!("unsupported fixed verifier resource mode") }
}
fn build() -> Result<FixedVerifier> {
    let verifier_only = get_end_cap_alt_verifier_data_for_network::<F>(PsyChainNetworkType::try_from_chain_id(psy_config::PSY_NETWORK_MAGIC)?)?.to_verifier_data::<C, 2>();
    let library = get_cached_common_data_library::<C, 2>();
    let common = library.get_common_circuit_data_ref(ProvingJobCircuitType::UserEndCap)?.clone();
    Ok(FixedVerifier { verifier_only, common })
}
/// The binary and frozen SDK fix the circuit/key identity. The process accepts
/// only its compiled, explicitly selected network domain, on EVERY access.
/// All request-specific identity, state, dependency and PI guards remain in
/// the callers. The supplied closure must verify each complete proof anew.
pub fn with_verifier<T>(verify: impl FnOnce(&FixedVerifier) -> Result<T>) -> Result<T> {
    crate::live_guard::require_compiled_verifier_domain()?;
    let cached = mode(&std::env::var("PSY_FIXED_VERIFIER_MODE").unwrap_or_else(|_| "cached-v1".into()))?;
    let start = Instant::now();
    let hit = cached && VERIFIER.get().is_some();
    let owned;
    let verifier = if cached {
        VERIFIER.get_or_init(|| build().map_err(|e| e.to_string())).as_ref().map_err(|e| anyhow::anyhow!("fixed verifier initialization failed: {e}"))?
    } else { owned = build()?; &owned };
    let construction = start.elapsed().as_secs_f64() * 1000.0;
    let begin_verify = Instant::now();
    let result = verify(verifier);
    eprintln!("PSY_FIXED_VERIFIER {}", serde_json::json!({"pid":std::process::id(),"unixMilliseconds":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis(),"mode":if cached{"cached-v1"}else{"fresh-v1"},"cacheHit":hit,"resourceMilliseconds":construction,"verificationMilliseconds":begin_verify.elapsed().as_secs_f64()*1000.0,"ok":result.is_ok(),"scope":"immutable compiled SDK end-cap verifier and common data; complete proof verification is never cached"}));
    result
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn explicit_modes_only() { assert_eq!(mode("fresh-v1").unwrap(), false); assert!(mode("cached-v1").unwrap()); for x in ["", "auto", "skip", "cached-v2"] { assert!(mode(x).is_err()); } }
    #[test] fn cached_resources_equal_fresh_source_and_reject_invalid_proofs() -> Result<()> {
        let fresh = build()?;
        let cached = VERIFIER.get_or_init(|| build().map_err(|e|e.to_string())).as_ref().map_err(|e|anyhow::anyhow!("{e}"))?;
        ensure!(fresh.verifier_only == cached.verifier_only && fresh.common == cached.common, "fixed resource substitution");
        // A valid unrelated circuit proof must fail under both fixed verifiers.
        use plonky2::{plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig},iop::witness::PartialWitness};
        let unrelated = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config()).build::<C>();
        let proof = unrelated.prove(PartialWitness::new())?;
        assert!(fresh.verify(proof.clone()).is_err()); assert!(cached.verify(proof).is_err());
        Ok(())
    }
}
