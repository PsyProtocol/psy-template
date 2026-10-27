//! Export verifier-only resources from the already selected SDK. No proving key,
//! new circuit definition, wallet material, network action or trust downgrade.
use crate::wallet_verification::VerifierPack;
use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use plonky2::{
    field::goldilocks_field::GoldilocksField as F,
    plonk::{circuit_data::VerifierCircuitData, config::PoseidonGoldilocksConfig as C},
};
use psy_common_circuit::{
    circuits::{
        traits::qstandard::QStandardCircuit, zk_signature3::core::PsyBasicZKSignatureCircuit,
    },
    serialization::PsyGateSerializer,
};
use psy_ups_circuit::circuit_manager::core::PsyUPSStepCircuitManager;
pub fn encode_verifier(circuit: &impl QStandardCircuit<C, 2>) -> Result<String> {
    let v = VerifierCircuitData {
        verifier_only: circuit.get_verifier_config_ref().clone(),
        common: circuit.get_common_circuit_data_ref().clone(),
    };
    Ok(B64.encode(
        v.to_bytes(&PsyGateSerializer)
            .map_err(|e| anyhow::anyhow!("verifier serialization: {e}"))?,
    ))
}
pub fn export_fixed_verifiers(
    cm: &PsyUPSStepCircuitManager<C, 2>,
    signature: &PsyBasicZKSignatureCircuit<C, 2>,
) -> Result<VerifierPack> {
    crate::live_guard::verify_ups_profile(cm)?;
    let endcap_b64 = crate::fixed_verifier::with_verifier(|v: &VerifierCircuitData<F, C, 2>| {
        Ok(B64.encode(
            v.to_bytes(&PsyGateSerializer)
                .map_err(|e| anyhow::anyhow!("fixed verifier serialization: {e}"))?,
        ))
    })?;
    Ok(VerifierPack {
        schema: 1,
        sdk_manifest: "06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f".into(),
        network_magic: psy_config::PSY_NETWORK_MAGIC,
        ups_whitelist: cm.ups_circuit_whitelist_root,
        start_fingerprint: cm.ups_start.get_fingerprint(),
        step_fingerprint: cm.ups_cfc_standard_tx.get_fingerprint(),
        endcap_b64,
        start_b64: encode_verifier(&cm.ups_start)?,
        step_b64: encode_verifier(&cm.ups_cfc_standard_tx)?,
        sign_b64: encode_verifier(signature)?,
        sign_fingerprint: signature.get_fingerprint(),
        contracts: vec![],
    })
}
