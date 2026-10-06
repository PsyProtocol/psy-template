//! Local artifact identity and independent canonical layout proof verification.
use anyhow::{ensure, Context, Result};
use parth_core::pgoldilocks::{PoseidonHasher, QHashOut};
use parth_core::PF;
use plonky2::hash::hash_types::HashOut;
use plonky2::plonk::config::PoseidonGoldilocksConfig;
use psy_client_common::data::qhashout::QHashOut as ClientHash;
use psy_config::network_constants::MAX_CONTRACT_STATE_TREE_HEIGHT;
use psy_core::constants::protocol::{
    STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT, STATE_LAYOUT_MAX_AGGREGATION_DEPTH,
    STATE_LAYOUT_TREE_HEIGHT,
};
use psy_data::v1::qdata::contract::{
    canonical_layout_manifest_from_compiler_abi_json, CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT,
};
use psy_plonky2_circuits::coordinator::state_layout_helper::CanonicalLayoutProofVerifier;
use psy_prover::session::gen_contract_deploy_and_circuits_for_functions;
use psy_vm::dpn::vm::def::DPNFunctionCircuitDefinition;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{env, fs};
#[derive(Deserialize)]
struct Artifact {
    state_tree_height: u8,
    circuit_definitions: Vec<DPNFunctionCircuitDefinition>,
    abi: Value,
}
fn main() -> Result<()> {
    let a = env::args().collect::<Vec<_>>();
    ensure!(
        a.len() == 4,
        "review_deploy <artifact|proof> <input.json> <new-output.json>"
    );
    let input = fs::read(&a[2])?;
    let result = if a[1] == "artifact" {
        let artifact: Artifact = serde_json::from_slice(&input)?;
        ensure!(
            artifact.state_tree_height <= MAX_CONTRACT_STATE_TREE_HEIGHT,
            "invalid tree height"
        );
        let (_, deploy) =
            gen_contract_deploy_and_circuits_for_functions::<PoseidonGoldilocksConfig, 2>(
                ClientHash(HashOut::ZERO),
                artifact.state_tree_height,
                &artifact.circuit_definitions,
            )?;
        let m = canonical_layout_manifest_from_compiler_abi_json::<PoseidonHasher, PF, QHashOut<PF>>(
            &serde_json::to_string(&artifact.abi)?,
            STATE_LAYOUT_TREE_HEIGHT,
            CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT,
        )?;
        json!({"codeRoot":deploy.code_root.to_string(),"layoutRoot":m.layout.contract_layout.state_layout_root.to_string(),"manifest":m,"stateTreeHeight":artifact.state_tree_height,"methods":artifact.abi["contract"]["methods"]})
    } else {
        ensure!(a[1] == "proof", "unknown review action");
        let v: Value = serde_json::from_slice(&input)?;
        let proof: Vec<u8> = serde_json::from_value(v["canonical_layout_proof"].clone())
            .context("missing canonical proof")?;
        let verifier = CanonicalLayoutProofVerifier::<PoseidonGoldilocksConfig, 2>::new(
            STATE_LAYOUT_TREE_HEIGHT - STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT,
            STATE_LAYOUT_APPEND_SUB_TREE_HEIGHT,
            STATE_LAYOUT_MAX_AGGREGATION_DEPTH,
        );
        ensure!(
            v["canonical_layout_verifier_fingerprint"] == verifier.fingerprint().to_string(),
            "layout verifier mismatch"
        );
        verifier.verify_serialized_proof(&proof)?;
        let command: psy_client_data::qblock::cmds::deploy_contract::QBCDeployContractV2<
            plonky2::field::goldilocks_field::GoldilocksField,
        > = serde_json::from_slice(&input)?;
        command.validate_shape()?;
        let deployed = command
            .deploy_contract
            .into_with_whitelist_root::<psy_client_data::config::store_config::PsyHasher>()?;
        let hash = psy_crypto::hash::tx_hash::compute_deploy_contract_content_hash(
            &deployed.deployer.to_le_bytes(),
            &deployed.function_whitelist_root.to_le_bytes(),
            deployed.code_definition.state_tree_height as u64,
        );
        let content_hash = hash.iter().map(|b| format!("{b:02x}")).collect::<String>();
        json!({"valid":true,"verifierFingerprint":verifier.fingerprint().to_string(),"proofBytes":proof.len(),"contentHash":content_hash})
    };
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&a[3])?;
    use std::io::Write;
    f.write_all(serde_json::to_string_pretty(&result)?.as_bytes())?;
    f.sync_all()?;
    println!("saved verified public review {}", a[3]);
    Ok(())
}
