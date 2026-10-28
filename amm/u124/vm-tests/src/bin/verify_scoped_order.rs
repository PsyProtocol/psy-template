//! Offline saved component verification; identities and seed remain unqualified.
use anyhow::{ensure, Result};
use bincode::Options;
use plonky2::{field::goldilocks_field::GoldilocksField as F, plonk::{config::PoseidonGoldilocksConfig as C, proof::ProofWithPublicInputs}};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_template_u124_markets::{scoped_order::{decode_scoped_input, scoped_root, scoped_permutation, expected_public_inputs, ScopedOrderCircuit}, seal_inclusion::SealLayout};
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Write}};
#[derive(Clone, Copy, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum Stage { Domain, ReadInputs, Input, Resources, PublicInputs, Proof }
fn read(path: &str, limit: u64) -> Result<Vec<u8>> {
    let mut bytes = Vec::new(); fs::File::open(path)?.take(limit + 1).read_to_end(&mut bytes)?;
    ensure!(bytes.len() as u64 <= limit, "bounded scoped component input"); Ok(bytes)
}
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    ensure!(args.len() == 7, "SCOPED_INPUT REVIEWED_LAYOUT EXPECTED_CHECKPOINT_ROOT SEAL_CHECKPOINT PROOF FRESH_REPORT");
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&args[6])?;
    let mut stage = Stage::Domain;
    let mut identities = None;
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<serde_json::Value> {
        psy_template_u124_markets::live_guard::require_compiled_verifier_domain()?;
        stage = Stage::ReadInputs;
        let bytes = read(&args[1], 32768)?; let layout_bytes = read(&args[2], 4096)?; let proof_bytes = read(&args[5], 2_000_000)?;
        identities = Some(serde_json::json!({"statementSha256":format!("{:x}",Sha256::digest(&bytes)),"layoutSha256":format!("{:x}",Sha256::digest(&layout_bytes)),"proofSha256":format!("{:x}",Sha256::digest(&proof_bytes))}));
        stage = Stage::Input;
        let input = decode_scoped_input(&bytes)?;
        let layout: SealLayout = serde_json::from_slice(&layout_bytes)?; layout.validate()?;
        let root: Q<F> = serde_json::from_value(serde_json::Value::String(args[3].clone()))?;
        ensure!(root.to_string() == args[3], "canonical scoped checkpoint root");
        let checkpoint: u64 = args[4].parse()?; ensure!(checkpoint.to_string() == args[4], "canonical scoped checkpoint index");
        let proof: ProofWithPublicInputs<F,C,2> = bincode::DefaultOptions::new().with_fixint_encoding().with_limit(2_000_000).reject_trailing_bytes().deserialize(&proof_bytes)?;
        stage = Stage::Resources;
        let circuit = ScopedOrderCircuit::build(layout)?;
        stage = Stage::PublicInputs;
        ensure!(proof.public_inputs == expected_public_inputs(&input, root, checkpoint)?, "scoped seal/order public endpoints");
        stage = Stage::Proof;
        circuit.data.verify(proof)?;
        Ok(serde_json::json!({"conditionalComponentProofVerified":true,
            "statementSha256":format!("{:x}",Sha256::digest(&bytes)),"layoutSha256":format!("{:x}",Sha256::digest(&layout_bytes)),"proofSha256":format!("{:x}",Sha256::digest(&proof_bytes)),
            "scopedRoot":scoped_root(&input)?.map(|n|n.to_string()),"rank":scoped_permutation(&input)?,"checkpointRoot":root.to_string(),"checkpoint":checkpoint}))
    }));
    let (mut report, exit) = match outcome {
        Ok(Ok(report)) => (report, 0),
        Ok(Err(error)) => (serde_json::json!({"conditionalComponentProofVerified":false,"failureKind":"rejected","stage":stage,"error":format!("{error:#}")}), 1),
        Err(_) => (serde_json::json!({"conditionalComponentProofVerified":false,"failureKind":"panic","stage":stage}), 2),
    };
    report["schema"] = 2.into();
    report["inputIdentities"] = identities.into();
    report["scope"] = "saved conditional membership/permutation component only; no finality, entropy, causal release or spending authorization".into();
    for field in ["chainInstanceAuthenticated", "finalityVerified", "qualifiedSource", "causalSealVerified", "randomAuthorization", "fullUpsVerified", "broadcast"] { report[field] = false.into(); }
    report["financialOperations"] = 0.into(); report["proofsGenerated"] = 0.into();
    file.write_all(&serde_json::to_vec_pretty(&report)?)?; file.write_all(b"\n")?; file.sync_all()?;
    if exit != 0 { std::process::exit(exit); }
    Ok(())
}
