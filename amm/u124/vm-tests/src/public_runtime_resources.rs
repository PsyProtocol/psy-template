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

fn compare_resource(name: &str, fingerprint: psy_client_common::data::qhashout::QHashOut<F>,
    verifier: &plonky2::plonk::circuit_data::VerifierOnlyCircuitData<C,2>, remote: &QCommonCircuitData<F>) -> Result<Value> {
    let actual = remote.verifier_config.to_verifier_data::<C,2>();
    ensure!(get_circuit_fingerprint_generic_q::<2,F,C>(&actual).0 == remote.fingerprint.0, "{name}: advertised fingerprint differs from key");
    ensure!(actual == *verifier && fingerprint == remote.fingerprint, "{name}: runtime resource differs from frozen SDK");
    Ok(json!({"role":name,"fingerprint":fingerprint.to_string(),"verifierBytesMatch":true,"advertisedFingerprintRecomputed":true}))
}

/// Compare the entire ordinary-ZK UPS chain and aggregation resources. Endcap
/// equality alone does not establish start/registration/deferred compatibility.
/// This constructs immutable circuits only; it never proves or calls RPC.
pub async fn inspect_ordinary_ups(bytes: &[u8]) -> Result<Value> {
    use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
    use psy_vm::ups::circuit_manager::UPSCircuitManager;
    crate::live_guard::require_compiled_verifier_domain()?;
    let mut report = inspect(bytes)?;
    let envelope: Envelope = serde_json::from_slice(bytes)?;
    let remote: psy_provider::provider::LocalCommonCircuitsData<F> = serde_json::from_str(&envelope.result)?;
    let manager = psy_ups_circuit::circuit_manager::core::PsyUPSStepCircuitManager::<C,2>::new_with_config(psy_config::PSY_NETWORK_MAGIC);
    let mut roles = vec![];
    macro_rules! check {($name:ident) => {roles.push(compare_resource(stringify!($name), manager.$name.get_fingerprint(), manager.$name.get_verifier_config_ref(), &remote.$name)?)};}
    check!(ups_start); check!(ups_start_register_user); check!(ups_cfc_standard_tx);
    check!(ups_cfc_deferred_tx); check!(ups_end_cap);
    let aggregate = &manager.proof_tree_agg_circuits.circuit_set;
    macro_rules! agg {($name:ident) => {roles.push(compare_resource(stringify!($name), aggregate.$name.get_fingerprint(), aggregate.$name.get_verifier_config_ref(), &remote.$name)?)};}
    agg!(single_leaf_circuit); agg!(two_leaf_circuit); agg!(two_agg_circuit);
    agg!(left_leaf_right_agg_circuit); agg!(left_agg_right_leaf_circuit);
    let zk = manager.zk_signature_minifier_verifier_config().await?;
    roles.push(compare_resource("zk_circuit", manager.zk_signature_minifier_fingerprint().await?, &zk, &remote.zk_circuit)?);
    ensure!(remote.ups_circuit_whitelist_root == manager.ups_circuit_whitelist_root, "ordinary UPS whitelist root differs");
    for (name, actual, expected) in [
        ("ups_start", &remote.ups_start_whitelist_proof, &manager.ups_start_whitelist_proof),
        ("ups_start_register_user", &remote.ups_start_register_user_whitelist_proof, &manager.ups_start_register_user_whitelist_proof),
        ("ups_cfc_standard_tx", &remote.ups_cfc_standard_tx_whitelist_proof, &manager.ups_cfc_standard_tx_whitelist_proof),
        ("ups_cfc_deferred_tx", &remote.ups_cfc_deferred_tx_whitelist_proof, &manager.ups_cfc_deferred_tx_whitelist_proof),
    ] {
        ensure!(serde_json::to_value(actual)? == serde_json::to_value(expected)?, "{name}: ordinary UPS whitelist path differs");
    }
    let recursion = &manager.proof_tree_agg_circuits;
    ensure!(remote.leaf_circuit_config_id == recursion.circuit_set.leaf_circuit_config_id
        && remote.leaf_verifier_data_cap_height == recursion.circuit_set.leaf_verifier_data_cap_height
        && remote.agg_verifier_data_cap_height == recursion.circuit_set.agg_verifier_data_cap_height
        && serde_json::to_value(&remote.circuit_inclusion_proofs)? == serde_json::to_value(&recursion.circuit_inclusion_proofs)?, "ordinary UPS aggregation inclusion/config differs");
    report["kind"] = json!("compiled-ordinary-ups-resource-comparison-v1");
    report["ordinaryUpsResources"] = json!(roles);
    report["ordinaryUpsWhitelistAndAggregationMatch"] = json!(true);
    report["uncomparedRoles"] = json!(["secp_circuit","eth_personal_secp_circuit","private_note_inclusion_minifier","shield_deposit_claim_minifier"]);
    report["completeTransactionProofVerified"] = json!(false);
    Ok(report)
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
    #[test] fn application_runtime_binding_rejects_substituted_resource() -> Result<()> {
        let remote: QCommonCircuitData<F> = serde_json::from_value(captured()?["ups_end_cap"].clone())?;
        crate::fixed_verifier::with_verifier(|fixed| {
            let fp = psy_client_common::data::qhashout::QHashOut(get_circuit_fingerprint_generic_q::<2,F,C>(&fixed.verifier_only).0);
            compare_resource("endcap",fp,&fixed.verifier_only,&remote)?;
            let mut wrong = remote.clone();wrong.fingerprint = psy_client_common::data::qhashout::QHashOut::ZERO;
            assert!(compare_resource("endcap",fp,&fixed.verifier_only,&wrong).is_err());
            let mut value=serde_json::to_value(&remote)?;value["verifier_config"]["circuit_digest"]=json!("0".repeat(64));
            let wrong: QCommonCircuitData<F> = serde_json::from_value(value)?;
            assert!(compare_resource("endcap",fp,&fixed.verifier_only,&wrong).is_err());
            Ok(())
        })
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
