//! Read-only local comparison against the repository's bundled Node verifier.
//! Source-bundled keys are not runtime attestation. Never submits a transaction.
use anyhow::{ensure, Result};
use plonky2::{
    field::goldilocks_field::GoldilocksField as F, plonk::circuit_data::VerifierCircuitData,
};
use psy_client_data::config::store_config::{C, D};
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_core::constants::chain_id::PsyChainNetworkType;
use psy_plonky2_circuits::{
    circuit_library::end_cap_verifier_data::get_end_cap_alt_verifier_data_for_network,
    proof_minifier::pm_core::get_circuit_fingerprint_generic_q,
};
use psy_ups_circuit::circuit_manager::core::PsyUPSStepCircuitManager;
use serde_json::json;
use std::{env, fs, io::Write};
fn main() -> Result<()> {
    let a = env::args().collect::<Vec<_>>();
    ensure!(
        a.len() >= 3,
        "FRESH_OUTPUT [PUBLIC_REQUEST...] requires at least one saved public request"
    );
    let bundled =
        get_end_cap_alt_verifier_data_for_network::<F>(PsyChainNetworkType::InternalTestnet)?
            .to_verifier_data::<C, D>();
    let bundled_fp = get_circuit_fingerprint_generic_q::<D, F, C>(&bundled);
    let mut rows = vec![];
    for magic in [0x1337CF514544CF69, 0x1337CF514544C169] {
        let cm = PsyUPSStepCircuitManager::<C, D>::new_with_config(magic);
        let own = cm.ups_end_cap.get_verifier_config_ref();
        let fp = get_circuit_fingerprint_generic_q::<D, F, C>(own);
        let mut proofs = vec![];
        for path in &a[2..] {
            let v: serde_json::Value = serde_json::from_slice(&fs::read(path)?)?;
            let bytes: Vec<u8> = serde_json::from_value(v["proof"].clone())?;
            let proof: plonky2::plonk::proof::ProofWithPublicInputs<F, C, D> =
                bincode::deserialize(&bytes)?;
            let local = cm.ups_end_cap.verify_proof(proof.clone()).is_ok();
            let node = VerifierCircuitData {
                common: cm.ups_end_cap.get_common_circuit_data_ref().clone(),
                verifier_only: bundled.clone(),
            }
            .verify(proof)
            .is_ok();
            proofs.push(json!({"publicRequest":path,"sdkVerified":local,"bundledNodeKeyWithSdkCommonVerified":node}));
        }
        rows.push(json!({"networkMagic":magic.to_string(),"sdkFingerprint":fp.to_string(),"bundledNodeFingerprint":bundled_fp.to_string(),"verifierOnlyExactlyMatchesBundledNode":own==&bundled,"commonDataSha256Note":"SDK common data used, not independently attested Node runtime common data","proofs":proofs}));
    }
    let report = json!({"broadcast":false,"sourceBundleIsRuntimeAttestation":false,"rows":rows});
    let mut out = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&a[1])?;
    out.write_all(&serde_json::to_vec_pretty(&report)?)?;
    out.sync_all()?;
    println!("{}", report);
    Ok(())
}
