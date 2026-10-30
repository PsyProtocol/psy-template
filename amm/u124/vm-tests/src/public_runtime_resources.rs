//! Inspect public runtime metadata against compiled resources. Never install a
//! remote verifier or promote RPC metadata into chain/finality authentication.
use anyhow::{ensure, Result};
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_data::config::store_config::C;
use psy_plonky2_circuits::proof_minifier::pm_core::get_circuit_fingerprint_generic_q;
use psy_provider::provider::QCommonCircuitData;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const MAX_CAPTURE_BYTES: usize = 1_048_576;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope { jsonrpc: String, id: u64, result: String }
#[derive(Deserialize)]
struct Registry { ups_end_cap: QCommonCircuitData<F> }
fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }

/// The owned caller supplies a captured public RPC response, not a verifier.
/// Only the already-compiled Endcap identity is compared; other registry fields
/// are inventoried by name and are never interpreted as checkpoint resources.
pub fn inspect(bytes: &[u8]) -> Result<Value> {
    ensure!(bytes.len() <= MAX_CAPTURE_BYTES, "public resource capture limit");
    let envelope: Envelope = serde_json::from_slice(bytes)?;
    ensure!(envelope.jsonrpc == "2.0" && envelope.id == 1, "public resource response identity");
    let remote: Registry = serde_json::from_str(&envelope.result)?;
    let inventory: Value = serde_json::from_str(&envelope.result)?;
    let fields = inventory.as_object().ok_or_else(|| anyhow::anyhow!("resource registry object required"))?
        .keys().cloned().collect::<Vec<_>>();
    // Remote bytes can never replace the frozen common data or verifier key.
    crate::fixed_verifier::with_verifier(|fixed| {
        let fingerprint = get_circuit_fingerprint_generic_q::<2, F, C>(&fixed.verifier_only);
        let remote_verifier = remote.ups_end_cap.verifier_config.to_verifier_data::<C, 2>();
        let remote_fingerprint = get_circuit_fingerprint_generic_q::<2, F, C>(&remote_verifier);
        ensure!(remote.ups_end_cap.fingerprint.0.elements == remote_fingerprint.0.elements,
            "runtime Endcap advertised fingerprint differs from its verifier");
        ensure!(remote_verifier == fixed.verifier_only && remote_fingerprint == fingerprint,
            "runtime Endcap differs from compiled frozen verifier");
        Ok(json!({
            "schema":1,"kind":"compiled-endcap-resource-comparison-v1",
            "captureSha256":digest(bytes),"captureBytes":bytes.len(),
            "registryFieldNames":fields,
            "endcapFingerprint":fingerprint.to_string(),
            "verifierBincodeSha256":digest(&bincode::serialize(&fixed.verifier_only)?),
            "commonBincodeSha256":digest(&bincode::serialize(&fixed.common)?),
            "compiledNetworkMagic":psy_config::PSY_NETWORK_MAGIC.to_string(),
            "endcapVerifierBytesMatch":true,"endcapAdvertisedFingerprintRecomputed":true,
            "commonDataSource":"compiled frozen SDK only; not returned by this RPC",
            "checkpointResourcesAuthenticated":false,"runtimeBuildIdentityAuthenticated":false,
            "chainInstanceAuthenticated":false,"finalityVerified":false,
            "seedSecrecyAuthenticated":false,"qualifiedRandomness":false,
            "approvedCallStackVerified":false,"canSign":false,"canBroadcast":false,
            "financialOperations":0,"proofsGenerated":0
        }))
    })
}

#[cfg(test)] mod tests {
    use super::*;
    fn captured() -> Result<Value> {
        use psy_core::constants::chain_id::PsyChainNetworkType;
        use psy_plonky2_circuits::circuit_library::end_cap_verifier_data::get_end_cap_alt_verifier_data_for_network;
        let config = get_end_cap_alt_verifier_data_for_network::<F>(PsyChainNetworkType::try_from_chain_id(psy_config::PSY_NETWORK_MAGIC)?)?;
        let verifier = config.to_verifier_data::<C, 2>();
        let fingerprint = get_circuit_fingerprint_generic_q::<2, F, C>(&verifier);
        Ok(json!({"ups_end_cap":{"fingerprint":fingerprint.to_string(),"verifier_config":config}}))
    }
    fn response(value: &Value) -> Result<Vec<u8>> {
        Ok(serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"result":serde_json::to_string(value)?}))?)
    }
    #[test] fn compares_exact_compiled_resources_without_promoting_authority() -> Result<()> {
        let mut v = captured()?;
        // A claimed extra role or trust assertion cannot become an authority.
        v["checkpoint_finality_certificate"] = json!({"verified":true});
        let r = inspect(&response(&v)?)?;
        assert_eq!(r["endcapVerifierBytesMatch"],true);
        for k in ["checkpointResourcesAuthenticated","runtimeBuildIdentityAuthenticated","chainInstanceAuthenticated","finalityVerified","seedSecrecyAuthenticated","qualifiedRandomness","approvedCallStackVerified","canSign","canBroadcast"] {
            assert_eq!(r[k],false,"{k}");
        }
        Ok(())
    }
    #[test] fn rejects_fingerprint_key_and_envelope_substitution() -> Result<()> {
        let good = captured()?;
        let mut v=good.clone();v["ups_end_cap"]["fingerprint"]=json!("0".repeat(64));
        assert!(inspect(&response(&v)?).is_err());
        let mut v=good.clone();v["ups_end_cap"]["verifier_config"]["circuit_digest"]=json!("0".repeat(64));
        assert!(inspect(&response(&v)?).is_err());
        for id in [0,2] {
            let mut e: Value=serde_json::from_slice(&response(&good)?)?;e["id"]=json!(id);
            assert!(inspect(&serde_json::to_vec(&e)?).is_err());
        }
        let mut e: Value=serde_json::from_slice(&response(&good)?)?;e["error"]=json!({"code":-1});
        assert!(inspect(&serde_json::to_vec(&e)?).is_err());
        assert!(inspect(&vec![b' ';MAX_CAPTURE_BYTES+1]).is_err());
        assert!(inspect(br#"{"jsonrpc":"2.0","id":1,"id":1,"result":"{}"}"#).is_err());
        Ok(())
    }
}
