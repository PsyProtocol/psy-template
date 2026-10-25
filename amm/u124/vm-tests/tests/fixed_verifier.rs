//! Offline actual ordinary and SD-key UPSs. No provider, signer or broadcast.
use anyhow::{ensure, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F, types::Field},plonk::proof::ProofWithPublicInputs};
use psy_client_data::config::store_config::{C,D};
use psy_provider::request::QSubmitEndCapRPCRequest;
use psy_template_u124_markets::{fixed_verifier::with_verifier, proof_binding::validate_endcap_binding};
use std::{fs,io::Write,time::Instant};
#[test]
#[ignore = "requires explicit preserved public request list and fresh report"]
fn real_proofs_verify_each_time_and_tampering_is_rejected() -> Result<()> {
    let files:Vec<String>=serde_json::from_slice(&fs::read(std::env::var("FIXED_VERIFIER_FIXTURES")?)?)?;
    ensure!(files.len()>=2,"ordinary and market proof fixtures required");
    let mut rows=Vec::new();
    for mode in ["fresh-v1","cached-v1","cached-v1","fresh-v1"] {
        std::env::set_var("PSY_FIXED_VERIFIER_MODE",mode);
        for file in &files {
            let request:QSubmitEndCapRPCRequest<F>=serde_json::from_slice(&fs::read(file)?)?;
            let proof:ProofWithPublicInputs<F,C,D>=bincode::deserialize(&request.proof)?;
            let start=Instant::now();
            with_verifier(|v|{v.verify(proof.clone())?;Ok(())})?;
            let milliseconds=start.elapsed().as_secs_f64()*1000.;
            validate_endcap_binding(&request.user_ec_input.core,&proof.public_inputs)?;
            let mut changed=proof.clone();changed.public_inputs[0]+=F::ONE;
            ensure!(with_verifier(|v|{v.verify(changed)?;Ok(())}).is_err(),"modified proof accepted from immutable cache");
            let mut core=request.user_ec_input.core.clone();core.stats.total_transactions+=F::ONE;
            ensure!(validate_endcap_binding(&core,&proof.public_inputs).is_err(),"metadata substitution");
            rows.push(serde_json::json!({"mode":mode,"file":file,"fullVerificationMilliseconds":milliseconds,"fullProofVerified":true,"changedProofRejected":true,"changedMetadataRejected":true,"broadcast":false}));
        }
    }
    // Cached resources must not suppress the per-access compiled domain guard.
    std::env::set_var("PSY_MARKET_TESTNET_PROFILE","sepolia-config-v1");
    ensure!(with_verifier(|_|Ok(())).is_err(),"wrong network reused cached resources");
    std::env::set_var("PSY_MARKET_TESTNET_PROFILE","staging-bundled-regtest-20261020-v1");
    std::env::set_var("PSY_FIXED_VERIFIER_MODE","skip");
    ensure!(with_verifier(|_|Ok(())).is_err(),"unsupported cache mode");
    let report=serde_json::json!({"rows":rows,"wrongNetworkRejectedAfterCacheWarm":true,"unknownModeRejected":true,"broadcast":false,"scope":"same actual saved ordinary and market UPSs in fresh/cached/cached/fresh order, including negative proof and metadata checks; not network confirmation timing"});
    let mut out=fs::OpenOptions::new().create_new(true).write(true).open(std::env::var("FIXED_VERIFIER_RESULT")?)?;
    out.write_all(&serde_json::to_vec_pretty(&report)?)?;out.sync_all()?;Ok(())
}
