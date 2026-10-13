use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::hash_types::HashOut,
    iop::witness::{PartialWitness, WitnessWrite},
    plonk::{
        circuit_builder::CircuitBuilder,
        circuit_data::{CircuitConfig, CircuitData},
        config::PoseidonGoldilocksConfig,
    },
};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::dpn::sd_key::{SDKeyConfig, SDKeyTransactionInfo};
use psy_client_data::qdata::{
    ups_signature::PsyUserProvingSessionSignatureDataCompact,
    user::PsyUserLeaf,
    user_contract_state::SignContext,
};
use psy_config::PSY_NETWORK_MAGIC;
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_ups_circuit::signature::sd_key::{compute_tx_stack_hash, SDKeyCircuitGadget};

type C = PoseidonGoldilocksConfig;

fn prove_with_sighash(
    circuit: &CircuitData<F, C, 2>,
    gadget: &SDKeyCircuitGadget,
    sig_hash: QHashOut<F>,
) -> anyhow::Result<Vec<F>> {
    let allowed_call = SDKeyTransactionInfo::<F> {
        contract_id: F::ZERO,
        method_id: F::from_canonical_u64(7),
        caller_contract_id: F::ZERO,
        inputs_length: F::ZERO,
        inputs_hash: QHashOut(HashOut::ZERO),
    };
    let user_leaf = PsyUserLeaf::<F> {
        user_id: F::ONE,
        ..Default::default()
    };
    let mut witness = PartialWitness::<F>::new();
    witness.set_hash_target(
        gadget.private_key,
        HashOut {
            elements: [F::ONE; 4],
        },
    )?;
    witness.set_hash_target(gadget.sig_hash, sig_hash.0)?;
    witness.set_hash_target(
        gadget.session_context.start_user_leaf_hash,
        user_leaf.qfhash::<plonky2::hash::poseidon::PoseidonHash>().0,
    )?;
    witness.set_hash_target(gadget.session_context.checkpoint_leaf_hash, HashOut::ZERO)?;
    witness.set_hash_target(gadget.session_context.sign_context.checkpoint_tree_root, HashOut::ZERO)?;
    gadget.session_context.sign_context.user_leaf.set_witness(&mut witness, &user_leaf)?;
    witness.set_target(gadget.session_context.nonce, F::ONE)?;
    witness.set_target(gadget.checkpoint_id, F::ZERO)?;
    witness.set_target(gadget.user_id, F::ONE)?;
    witness.set_hash_target(
        gadget.tx_introspection.tx_stack_hash,
        compute_tx_stack_hash(&[allowed_call]).0,
    )?;
    witness.set_target(gadget.tx_introspection.tx_count, F::ONE)?;
    let slot = &gadget.tx_introspection.tx_info_slots[0];
    witness.set_target(slot.contract_id, allowed_call.contract_id)?;
    witness.set_target(slot.method_id, allowed_call.method_id)?;
    witness.set_target(slot.caller_contract_id, allowed_call.caller_contract_id)?;
    witness.set_target(slot.inputs_length, allowed_call.inputs_length)?;
    witness.set_hash_target(slot.inputs_hash, allowed_call.inputs_hash.0)?;

    let proof = circuit.prove(witness)?;
    let public_inputs = proof.public_inputs.clone();
    circuit.verify(proof)?;
    Ok(public_inputs)
}

fn main() -> anyhow::Result<()> {
    let config = SDKeyConfig {
        num_introspectable_transactions: 1,
        can_read_state: false,
        contract_state_tree_height: 23,
        requires_secp256k1: false,
        num_secp256k1_slots: 0,
    };
    let mut builder = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
    let gadget = SDKeyCircuitGadget::add_virtual_to(&mut builder, &config, 0);
    let contract = builder.constant(F::ZERO);
    let method = builder.constant(F::from_canonical_u64(7));
    builder.connect(gadget.tx_introspection.get_tx_contract_id(0), contract);
    builder.connect(gadget.tx_introspection.get_tx_method_id(0), method);
    let circuit = builder.build::<C>();

    let allowed_call = SDKeyTransactionInfo::<F> {
        contract_id: F::ZERO,
        method_id: F::from_canonical_u64(7),
        caller_contract_id: F::ZERO,
        inputs_length: F::ZERO,
        inputs_hash: QHashOut(HashOut::ZERO),
    };
    let user_leaf = PsyUserLeaf::<F> {
        user_id: F::ONE,
        ..Default::default()
    };
    let mut end_user_leaf = user_leaf;
    end_user_leaf.nonce = F::ONE;
    let sig_data = PsyUserProvingSessionSignatureDataCompact {
        start_user_leaf_hash: user_leaf.qfhash::<plonky2::hash::poseidon::PoseidonHash>(),
        end_user_leaf_hash: end_user_leaf.qfhash::<plonky2::hash::poseidon::PoseidonHash>(),
        checkpoint_leaf_hash: QHashOut(HashOut::ZERO),
        tx_stack_hash: compute_tx_stack_hash(&[allowed_call]),
        tx_count: F::ONE,
    };
    let expected = sig_data
        .get_sig_action_for_user::<plonky2::hash::poseidon::PoseidonHash>(
            PSY_NETWORK_MAGIC,
            F::ONE,
            F::ONE,
            SignContext::new(QHashOut(HashOut::ZERO), user_leaf),
        )
        .get_qhash::<plonky2::hash::poseidon::PoseidonHash>();
    prove_with_sighash(&circuit, &gadget, expected)?;
    let unauthorized_call = SDKeyTransactionInfo::<F> {
        method_id: F::from_canonical_u64(8),
        ..allowed_call
    };
    let mut unauthorized_sig_data = sig_data;
    unauthorized_sig_data.tx_stack_hash = compute_tx_stack_hash(&[unauthorized_call]);
    let forged = unauthorized_sig_data
        .get_sig_action_for_user::<plonky2::hash::poseidon::PoseidonHash>(
            PSY_NETWORK_MAGIC,
            F::ONE,
            F::ONE,
            SignContext::new(QHashOut(HashOut::ZERO), user_leaf),
        )
        .get_qhash::<plonky2::hash::poseidon::PoseidonHash>();
    assert!(prove_with_sighash(&circuit, &gadget, forged).is_err());
    println!("VERIFIED: allowed session accepted; unauthorized real transaction digest rejected");
    Ok(())
}
