//! Offline proof helper. Witness input is private; output contains only a ZK proof and verifier data.
use anyhow::{ensure, Result};
use plonky2::{field::types::PrimeField64, plonk::circuit_data::VerifierCircuitData};
use psy_client_common::data::alt::AltVerifierOnlyCircuitData;
use psy_client_data::{
    config::store_config::{C, D, F},
    privacy::private_note_inclusion::PrivateNoteInclusionInput,
};
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_dpn_circuit::circuits::privacy::private_note_inclusion::PrivateNoteInclusionCircuit;
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
};
fn main() -> Result<()> {
    let args: Vec<_> = env::args().collect();
    ensure!(
        args.len() == 3,
        "prove_note_u124 <private-witness-json> <fresh-proof-json>"
    );
    // Reserve the output before proving: never replace evidence or previous proofs.
    let mut out = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&args[2])?;
    let input: PrivateNoteInclusionInput<F> = serde_json::from_slice(&fs::read(&args[1])?)?;
    ensure!(
        input.amount.to_canonical_u64() > 0 && input.amount.to_canonical_u64() < (1 << 62),
        "note amount must be a positive 62-bit limb"
    );
    ensure!(
        [293601306, 293601307].contains(&input.note_root_slot),
        "invalid U124 denomination root"
    );
    ensure!(
        input.contract_id >= 5 && input.contract_id < (1 << 24),
        "invalid token contract ID"
    );
    ensure!(
        input.note_membership_proof.siblings.len() == 20
            && input.note_root_slot_proof.siblings.len() == 32,
        "wrong note/state height"
    );
    let circuit = PrivateNoteInclusionCircuit::<C, D>::new(
        psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize,
        psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize,
        32,
        20,
    );
    let fingerprint = circuit.get_fingerprint();
    ensure!(
        fingerprint.0.elements.map(|x| x.to_canonical_u64())
            == [
                2482434993266711942,
                6028864160300535936,
                2827549014984201026,
                3018365102481798071
            ],
        "note verifier fingerprint mismatch"
    );
    let proof = circuit.prove(&input)?;
    VerifierCircuitData {
        verifier_only: circuit.get_verifier_config_ref().clone(),
        common: circuit.get_common_circuit_data_ref().clone(),
    }
    .verify(proof.clone())?;
    let report = serde_json::json!({"fingerprint":fingerprint.0.elements.map(|x|x.to_canonical_u64().to_string()),"publicInputs":proof.public_inputs.iter().map(|x|x.to_canonical_u64().to_string()).collect::<Vec<_>>(),"noteProofJson":serde_json::to_string(&proof)?,"verifierDataJson":serde_json::to_string(&AltVerifierOnlyCircuitData::from(circuit.get_verifier_config_ref()))?,"verified":true});
    out.write_all(&serde_json::to_vec(&report)?)?;
    out.write_all(b"\n")?;
    println!("Verified native U124 denomination note proof; no witness written to output.");
    Ok(())
}
