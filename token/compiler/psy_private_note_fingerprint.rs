use plonky2::field::types::PrimeField64;
use psy_client_data::config::store_config::{C, D};
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_dpn_circuit::circuits::privacy::private_note_inclusion::PrivateNoteInclusionCircuit;

fn main() {
    let circuit = PrivateNoteInclusionCircuit::<C, D>::new(
        psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize,
        psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize,
        psy_config::network_constants::TOKEN_CONTRACT_STATE_TREE_HEIGHT as usize,
        20,
    );
    let hash = circuit.get_fingerprint();
    let limbs: Vec<String> = hash.0.elements.iter()
        .map(|felt| felt.to_canonical_u64().to_string()).collect();
    println!("{}", serde_json::to_string(&limbs).expect("serialize fingerprint"));
}
