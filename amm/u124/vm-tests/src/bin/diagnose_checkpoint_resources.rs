//! Offline comparison of exact checkpoint bytes and frozen SDK verification paths.
//! Diagnostic output never qualifies a key, chain, finality certificate or random source.
use anyhow::{ensure, Context, Result};
use parth_core::protocol::core_types::{QZKProofPublicInputsHasherReader, QZKProofVerifier};
use plonky2::plonk::config::PoseidonGoldilocksConfig as C;
use psy_core::{constants::chain_id::PsyChainNetworkType, job::job_id::ProvingJobCircuitType as Kind};
use psy_plonky2_circuits::zk_verifier::PsyPlonky2ZKVerifier;
use psy_template_u124_markets::checkpoint_evidence::{decode_proof, resource_inventory};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Write}, time::Instant};

fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn read(path: &str) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(path)?.take(2_000_001).read_to_end(&mut bytes)?;
    ensure!(bytes.len() <= 2_000_000, "bounded proof input");
    Ok(bytes)
}
fn compare(verifier: &PsyPlonky2ZKVerifier<C, 2>, inputs: &[Result<Vec<u8>>]) -> Result<Vec<Value>> {
    let common = verifier.gcv.common.get_common_circuit_data_ref(Kind::GenerateRollupStateTransitionProof)?;
    let key = &verifier.gcv.library.info_map[&Kind::GenerateRollupStateTransitionProof];
    let mut rows = Vec::new();
    for input in inputs {
        let bytes = input.as_ref().map_err(|error| anyhow::anyhow!("proof read failed: {error:#}"))?;
        let proof = decode_proof(bytes).context("strict proof decode")?;
        let official = PsyPlonky2ZKVerifier::<C, 2>::try_proof_from_slice(bytes).context("SDK proof decode")?;
        let roundtrip = bincode::serialize(&proof)?;
        let official_bytes = bincode::serialize(&official)?;
        let start = Instant::now();
        let result = verifier.verify_zk_proof(Kind::GenerateRollupStateTransitionProof as u32, &official);
        let elapsed = start.elapsed().as_secs_f64();
        let owned = plonky2::plonk::circuit_data::VerifierCircuitData {
            verifier_only: key.verifier_data.to_verifier_data::<C, 2>(), common: common.clone(),
        }.verify(proof.clone());
        rows.push(json!({
            "proofSha256": digest(bytes), "bytes": bytes.len(),
            "strictAndSdkDecodeEqual": roundtrip == official_bytes,
            "strictRoundtripExact": &roundtrip == bytes, "sdkRoundtripExact": &official_bytes == bytes,
            "publicInputs": proof.public_inputs, "fingerprint": key.fingerprint.to_string(),
            "commonSha256": digest(&bincode::serialize(common)?),
            "verifierOnlySha256": digest(&bincode::serialize(&key.verifier_data.to_verifier_data::<C,2>())?),
            "commonDegreeBits": common.degree_bits(),
            "shape": {"publicInputs": proof.public_inputs.len(), "constants": proof.proof.openings.constants.len(),
                "wires": proof.proof.openings.wires.len(), "sigmas": proof.proof.openings.plonk_sigmas.len(),
                "quotients": proof.proof.openings.quotient_polys.len(),
                "friQueryRounds": proof.proof.opening_proof.query_round_proofs.len()},
            "sdkBorrowedVerified": result.is_ok(), "sdkBorrowedSeconds": elapsed,
            "sdkBorrowedError": result.err().map(|e| format!("{e:#}")),
            "applicationOwnedVerified": owned.is_ok(), "applicationOwnedError": owned.err().map(|e| format!("{e:#}"))
        }));
    }
    Ok(rows)
}
fn parameters(network: PsyChainNetworkType) -> Result<Value> {
    let path = std::env::var("PSY_CONFIG_PATH").context("explicit source configuration required")?;
    let bytes = read(&path)?;
    let config: Value = serde_json::from_slice(&bytes)?;
    let mut sections = Vec::new();
    for name in ["localhost", "testnet", "mainnet"] {
        let section = &config["networks"][name];
        let counts: Vec<Value> = section["realm_configs"].as_array().into_iter().flatten().map(|realm|
            json!({"realmId": realm["id"], "validatorCount": realm["validators"].as_array().map(Vec::len)})).collect();
        sections.push(json!({"name": name, "magic": section["magic"], "validatorCounts": counts}));
    }
    let rotation = match psy_data::config::network_config::load_realm_rotation_config(network) {
        Ok(value) => json!({"available": true, "checkpointsPerEpoch": value.checkpoints_per_epoch, "validatorSubIds": value.validator_sub_ids}),
        Err(error) => json!({"available": false, "error": format!("{error:#}")}),
    };
    Ok(json!({"configSha256": digest(&bytes), "runtimeNetwork": std::env::var("PSY_NETWORK").ok(),
        "sections": sections, "officialRotationParameters": rotation,
        "scope": "source-selected public parameter observation; no configuration rewritten or network identity authenticated"}))
}
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    ensure!(args.len() == 5 && ["cached", "constructed"].contains(&args[1].as_str()),
        "cached|constructed PREVIOUS_PROOF CURRENT_PROOF FRESH_REPORT");
    psy_template_u124_markets::live_guard::require_compiled_verifier_domain()?;
    // Reserve output before expensive construction; never overwrite original evidence.
    let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&args[4])?;
    let start = Instant::now();
    // Read once: the identities below must describe the same bytes actually verified.
    let inputs: Vec<_> = args[2..4].iter().map(|path| read(path)).collect();
    let network = PsyChainNetworkType::try_from_chain_id(psy_config::PSY_NETWORK_MAGIC)?;
    let result = std::panic::catch_unwind(|| -> Result<_> {
        if args[1] == "cached" { Ok(PsyPlonky2ZKVerifier::<C,2>::from_cached()) }
            else { PsyPlonky2ZKVerifier::<C,2>::for_network(network).context("official frozen network resource construction") }
    });
    let mut report = match result {
        Ok(Ok(verifier)) => match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| compare(&verifier, &inputs))) {
            Ok(Ok(rows)) => json!({"resourcesConstructed": true, "stage": "proofComparison", "proofs": rows}),
            Ok(Err(error)) => json!({"resourcesConstructed": true, "stage": "proofReadDecodeOrComparison", "error": format!("{error:#}")}),
            Err(_) => json!({"resourcesConstructed": true, "stage": "proofComparison", "comparisonPanicked": true}),
        },
        Ok(Err(error)) => json!({"resourcesConstructed": false, "stage": "resourceConstruction", "error": format!("{error:#}")}),
        Err(error) => {
            let text = error.downcast_ref::<String>().cloned().or_else(|| error.downcast_ref::<&str>().map(|s| s.to_string()));
            json!({"resourcesConstructed": false, "stage": "resourceConstruction", "constructionPanicked": true, "error": text})
        }
    };
    report["schema"] = 1.into();
    report["mode"] = args[1].clone().into();
    report["networkMagic"] = psy_config::PSY_NETWORK_MAGIC.to_string().into();
    report["sourceNetworkType"] = format!("{network:?}").into();
    report["elapsedSeconds"] = start.elapsed().as_secs_f64().into();
    match std::panic::catch_unwind(resource_inventory) {
        Ok(Ok(inventory)) => report["cachedResources"] = inventory,
        Ok(Err(error)) => report["cachedResourceError"] = format!("{error:#}").into(),
        Err(_) => report["cachedResourceInventoryPanicked"] = true.into(),
    }
    report["inputIdentities"] = inputs.iter().map(|input| match input {
        Ok(bytes) => json!({"bytes": bytes.len(), "sha256": digest(bytes)}),
        Err(error) => json!({"error": format!("{error:#}")}),
    }).collect::<Vec<_>>().into();
    report["sourceParameters"] = match parameters(network) {
        Ok(value) => value,
        Err(error) => json!({"error": format!("{error:#}")}),
    };
    for field in ["canonicalGenesisVerified", "chainDomainAuthenticated", "finalityVerified", "randomAuthorization", "broadcast"] {
        report[field] = false.into();
    }
    report["proofsGenerated"] = 0.into(); report["financialOperations"] = 0.into();
    let accepted = report["proofs"].as_array().is_some_and(|rows| !rows.is_empty() && rows.iter().all(|r| r["sdkBorrowedVerified"] == true && r["applicationOwnedVerified"] == true && r["strictRoundtripExact"] == true && r["sdkRoundtripExact"] == true));
    report["allProofsMatched"] = accepted.into();
    output.write_all(&serde_json::to_vec_pretty(&report)?)?; output.write_all(b"\n")?; output.sync_all()?;
    ensure!(accepted, "checkpoint compatibility diagnostic did not accept both proofs; report preserved");
    Ok(())
}
