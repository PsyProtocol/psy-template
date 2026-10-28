//! Synthetic scope/seal/permutation relations, never a qualified entropy source.
use anyhow::{ensure, Result};
use plonky2::{field::goldilocks_field::GoldilocksField as F, plonk::{config::PoseidonGoldilocksConfig as C, proof::ProofWithPublicInputs}};
use psy_template_u124_markets::{random_order::{frozen_root, FIELDS}, scoped_order::{ScopedInput, ScopedOrderCircuit, scoped_root, scoped_permutation, validate_scope, verify_scoped_opening}};
use std::{fs, time::Instant, path::PathBuf};
use sha2::{Digest, Sha256};
#[path="support/seal_fixture.rs"] mod seal_fixture;
fn scope() -> [u64; 36] { let mut v = [1; 36]; v[0] = 2; v }
fn input(fields: [u64; FIELDS]) -> ScopedInput { ScopedInput { fields, scope: scope(), seed: [1, 2, 3, 4] } }

#[test]
fn scoped_membership_binds_every_context_word_and_rejects_old_roots() -> Result<()> {
    for kind in [1, 2] { for slot in 0..4 {
        let (fields, layout, root, opening) = seal_fixture::fixture_with_root(slot, kind, |v| scoped_root(&input(*v)))?;
        let good = input(fields); verify_scoped_opening(&good, layout, root, &opening)?;
        ensure!(scoped_root(&good)? != frozen_root(&fields)?, "version-separated stored commitment");
        for index in 0..36 { let mut bad = good.clone(); bad.scope[index] += 1; ensure!(verify_scoped_opening(&bad, layout, root, &opening).is_err(), "scope word {index} substituted"); }
        let (old_fields, old_layout, old_root, old_opening) = seal_fixture::fixture_with_root(slot, kind, frozen_root)?;
        ensure!(verify_scoped_opening(&input(old_fields), old_layout, old_root, &old_opening).is_err(), "old root reinterpreted as new scoped seal");
    }}
    for index in [1, 8, 9, 16, 18, 25, 27, 34] { let mut bad = scope(); bad[index] = 1 << 32; ensure!(validate_scope(&bad).is_err(), "digest truncation"); }
    for index in [17, 26, 35] { for value in [0, 1 << 62] { let mut bad = scope(); bad[index] = value; ensure!(validate_scope(&bad).is_err(), "epoch/nonce bound"); } }
    Ok(())
}

#[test]
#[ignore="two synthetic component proofs, eight invalid witnesses, fresh output; zero financial operations"]
fn scoped_seal_and_permutation_proofs() -> Result<()> {
    let out = PathBuf::from(std::env::var("SCOPED_ORDER_OUT")?); fs::create_dir(&out)?;
    let (fields, layout, root, opening) = seal_fixture::fixture_with_root(3, 1, |v| scoped_root(&input(*v)))?;
    let good = input(fields); let start = Instant::now(); let circuit = ScopedOrderCircuit::build(layout)?;
    let build = start.elapsed().as_secs_f64(); let rank = scoped_permutation(&good)?;
    let start = Instant::now(); let proof = circuit.prove(&good, root, &opening, rank)?; let prove = start.elapsed().as_secs_f64();
    let start = Instant::now(); circuit.verify_for(&good, root, opening.checkpoint_id, proof.clone())?; let verify = start.elapsed().as_secs_f64();
    let mut rejected = Vec::new();
    for name in ["new-instance", "new-source-epoch", "new-finality-epoch", "new-release-policy", "overflow-digest-word", "duplicate-member", "wrong-rank", "late-seal"] {
        let mut bad = good.clone(); let mut path = opening.clone(); let mut ranks = rank;
        match name { "new-instance" => bad.scope[1] += 1, "new-source-epoch" => bad.scope[17] += 1, "new-finality-epoch" => bad.scope[26] += 1,
            "new-release-policy" => bad.scope[27] += 1, "overflow-digest-word" => bad.scope[1] = 1 << 32,
            "duplicate-member" => bad.fields[56] = bad.fields[50], "wrong-rank" => ranks[1] = ranks[0], _ => path.checkpoint_id = 120 }
        let attempt = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| circuit.prove(&bad, root, &path, ranks)));
        ensure!(!matches!(attempt, Ok(Ok(_))), "invalid scoped witness {name} accepted"); rejected.push(name);
    }
    for index in 0..36 { let mut bad = good.clone(); bad.scope[index] += 1; ensure!(circuit.verify_for(&bad, root, opening.checkpoint_id, proof.clone()).is_err(), "public scope endpoint {index} changed"); }
    let (curve_fields, curve_layout, curve_root, curve_opening) = seal_fixture::fixture_with_root(3, 2, |v| scoped_root(&input(*v)))?;
    ensure!(serde_json::to_value(layout)? == serde_json::to_value(curve_layout)?, "shared component layout");
    let curve = input(curve_fields); let start = Instant::now(); let curve_proof = circuit.prove(&curve, curve_root, &curve_opening, scoped_permutation(&curve)?)?;
    let curve_seconds = start.elapsed().as_secs_f64(); circuit.verify_for(&curve, curve_root, curve_opening.checkpoint_id, curve_proof.clone())?;
    let legacy: ProofWithPublicInputs<F,C,2> = bincode::deserialize(&fs::read(std::env::var("SCOPED_ORDER_LEGACY_PROOF")?)?)?;
    ensure!(circuit.verify_for(&good, root, opening.checkpoint_id, legacy).is_err(), "legacy proof accepted");
    for (name, data, bytes) in [("amm", &good, bincode::serialize(&proof)?), ("curve", &curve, bincode::serialize(&curve_proof)?)] {
        fs::write(out.join(format!("{name}-input.json")), serde_json::to_vec_pretty(&serde_json::json!({"fields": data.fields.map(|n|n.to_string()).to_vec(), "scopeFields": data.scope.map(|n|n.to_string()).to_vec(), "seed": data.seed.map(|n|n.to_string())}))?)?;
        fs::write(out.join(format!("{name}-proof.bin")), bytes)?;
    }
    fs::write(out.join("layout.json"), serde_json::to_vec_pretty(&layout)?)?;
    fs::write(out.join("REPORT.json"), serde_json::to_vec_pretty(&serde_json::json!({"schema":2,"scope":"synthetic versioned seal/permutation binding only; no canonical history, source authentication, causal release, market CFC, SD-key or UPS",
        "ammCheckpointRoot":root.to_string(),"curveCheckpointRoot":curve_root.to_string(),"sealCheckpoint":opening.checkpoint_id,
        "scopedRoot":scoped_root(&good)?.map(|n|n.to_string()),"scopeFields":good.scope.map(|n|n.to_string()).to_vec(),"rank":rank,
        "publicInputs":circuit.data.common.num_public_inputs,"degreeBits":circuit.data.common.degree_bits(),"buildSeconds":build,"ammProveSeconds":prove,"curveProveSeconds":curve_seconds,"ammVerifySeconds":verify,
        "verifierSha256":format!("{:x}",Sha256::digest(bincode::serialize(&circuit.data.verifier_only)?)),"commonSha256":format!("{:x}",Sha256::digest(bincode::serialize(&circuit.data.common)?)),
        "conditionalComponentProofsVerified":2,"rejectedWitnesses":rejected,"scopeEndpointRejections":36,"legacyProofRejected":true,
        "chainInstanceAuthenticated":false,"finalityVerified":false,"qualifiedSource":false,"causalSealVerified":false,"randomAuthorization":false,"fullUpsVerified":false,"financialOperations":0,"broadcast":false}))?)?;
    Ok(())
}
