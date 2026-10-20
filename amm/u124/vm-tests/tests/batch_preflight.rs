//! Offline capacity/cost probe for the existing SD-key primitive, including its
//! two recursive minifiers. This is NOT a market batch, CFC, UPS, or node TPS test.
use anyhow::{ensure, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::{hash_types::HashOut, poseidon::PoseidonHash},
    iop::witness::{PartialWitness, WitnessWrite},
    plonk::{circuit_builder::CircuitBuilder, circuit_data::CircuitConfig},
};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{
    dpn::{
        proving_session::DPNProvingSessionCompactMethodCall,
        sd_key::{SDKeyConfig, SDKeyTransactionInfo},
    },
    qdata::{
        ups_signature::PsyUserProvingSessionSignatureDataCompact, user::PsyUserLeaf,
        user_contract_state::SignContext,
    },
};
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use psy_config::{
    network_constants::{
        DEFAULT_CALLER_CONTRACT_ID_U64, MAX_CONTRACT_STATE_TREE_HEIGHT,
        SD_KEY_MAX_INTROSPECTABLE_TRANSACTIONS,
    },
    PSY_NETWORK_MAGIC,
};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_ups_circuit::signature::sd_key::{compute_tx_stack_hash, SDKeyCircuitGadget};
use serde_json::json;
use std::{fs::OpenOptions, io::Write, time::Instant};

fn info(slot: usize) -> SDKeyTransactionInfo<F> {
    DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(
        F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64),
        F::from_canonical_u64(1000),
        F::from_canonical_u64(slot as u64 + 1),
        &[F::from_canonical_u64(200 + slot as u64), F::ONE],
    )
    .into()
}

fn witness(
    g: &SDKeyCircuitGadget,
    calls: &[SDKeyTransactionInfo<F>],
    signed: &[SDKeyTransactionInfo<F>],
    count: u64,
) -> Result<PartialWitness<F>> {
    let leaf = PsyUserLeaf::<F> {
        user_id: F::from_canonical_u64(123),
        ..Default::default()
    };
    let mut end = leaf;
    end.nonce = F::ONE;
    let sig = PsyUserProvingSessionSignatureDataCompact {
        start_user_leaf_hash: leaf.qfhash::<PoseidonHash>(),
        end_user_leaf_hash: end.qfhash::<PoseidonHash>(),
        checkpoint_leaf_hash: QHashOut(HashOut::ZERO),
        tx_stack_hash: compute_tx_stack_hash(signed),
        tx_count: F::from_canonical_u64(count),
    }
    .get_sig_action_for_user::<PoseidonHash>(
        PSY_NETWORK_MAGIC,
        leaf.user_id,
        F::ONE,
        SignContext::new(QHashOut(HashOut::ZERO), leaf),
    )
    .get_qhash::<PoseidonHash>();
    let mut w = PartialWitness::new();
    w.set_hash_target(
        g.private_key,
        HashOut {
            elements: [F::ONE; 4],
        },
    )?;
    w.set_hash_target(g.sig_hash, sig.0)?;
    w.set_hash_target(
        g.session_context.start_user_leaf_hash,
        leaf.qfhash::<PoseidonHash>().0,
    )?;
    w.set_hash_target(g.session_context.checkpoint_leaf_hash, HashOut::ZERO)?;
    w.set_hash_target(
        g.session_context.sign_context.checkpoint_tree_root,
        HashOut::ZERO,
    )?;
    g.session_context
        .sign_context
        .user_leaf
        .set_witness(&mut w, &leaf)?;
    w.set_target(g.session_context.nonce, F::ONE)?;
    w.set_target(g.checkpoint_id, F::ZERO)?;
    w.set_target(g.user_id, leaf.user_id)?;
    for (i, pair) in g.circuit_inputs.chunks_exact(2).enumerate() {
        w.set_target(pair[0], F::from_canonical_u64(200 + i as u64))?;
        w.set_target(pair[1], F::ONE)?;
    }
    w.set_hash_target(
        g.tx_introspection.tx_stack_hash,
        compute_tx_stack_hash(calls).0,
    )?;
    w.set_target(g.tx_introspection.tx_count, F::from_canonical_u64(count))?;
    for (slot, c) in g.tx_introspection.tx_info_slots.iter().zip(calls) {
        w.set_target(slot.contract_id, c.contract_id)?;
        w.set_target(slot.method_id, c.method_id)?;
        w.set_target(slot.caller_contract_id, c.caller_contract_id)?;
        w.set_target(slot.inputs_length, c.inputs_length)?;
        w.set_hash_target(slot.inputs_hash, c.inputs_hash.0)?;
    }
    Ok(w)
}

#[test]
fn measure_exact_stack_capacity_and_recursive_authorization_cost() -> Result<()> {
    // An explicit fresh output is required: this probe must not overwrite prior evidence.
    let path = std::env::var("BATCH_PREFLIGHT_RESULT")?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(path)?;
    let mut measurements = Vec::new();
    // 17/32 deliberately test beyond the documented constant. Success only
    // demonstrates this local primitive; it does not prove node admission.
    for n in [9usize, 10, 16, 17, 32] {
        let calls: Vec<_> = (0..n).map(info).collect();
        let start = Instant::now();
        let cfg = SDKeyConfig {
            num_introspectable_transactions: n as u32,
            can_read_state: false,
            contract_state_tree_height: MAX_CONTRACT_STATE_TREE_HEIGHT,
            requires_secp256k1: false,
            num_secp256k1_slots: 0,
        };
        let mut b = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
        let mut g = SDKeyCircuitGadget::add_virtual_to(&mut b, &cfg, 2 * n);
        for (i, (slot, c)) in g
            .tx_introspection
            .tx_info_slots
            .iter()
            .zip(&calls)
            .enumerate()
        {
            for (t, v) in [
                (slot.contract_id, c.contract_id),
                (slot.method_id, c.method_id),
                (slot.caller_contract_id, c.caller_contract_id),
                (slot.inputs_length, c.inputs_length),
            ] {
                let constant = b.constant(v);
                b.connect(t, constant);
            }
            let inputs = &g.circuit_inputs[2 * i..2 * i + 2];
            for t in inputs {
                b.range_check(*t, 62);
            }
            let h = b.safe_hash_fixed_length::<PoseidonHash>(inputs);
            b.connect_hashes(slot.inputs_hash, h);
        }
        g.build_circuit(b)?;
        let build_ms = start.elapsed().as_secs_f64() * 1000.;
        let circuit = g.circuit_data.as_ref().unwrap();
        let minifier = g.minifier_chain.as_ref().unwrap();
        let mut samples = Vec::new();
        let mut bytes = 0;
        for _ in 0..3 {
            let w = witness(&g, &calls, &calls, n as u64)?;
            let t = Instant::now();
            let base = circuit.prove(w)?;
            let base_ms = t.elapsed().as_secs_f64() * 1000.;
            let t = Instant::now();
            let proof = minifier.prove(&base)?;
            let minify_ms = t.elapsed().as_secs_f64() * 1000.;
            let t = Instant::now();
            minifier.verify(proof.clone())?;
            let verify_ms = t.elapsed().as_secs_f64() * 1000.;
            bytes = bincode::serialize(&proof)?.len();
            samples.push(json!({"baseProveMs":base_ms,"minifyMs":minify_ms,"verifyMs":verify_ms}));
        }
        // Mutation, permutation, truncation, extra call, and signed-stack
        // substitution must all fail under this exact registered template.
        let mut changed = calls.clone();
        changed[n - 1] = info(n + 1);
        ensure!(
            circuit
                .prove(witness(&g, &changed, &changed, n as u64)?)
                .is_err(),
            "tail substitution accepted"
        );
        let mut reordered = calls.clone();
        reordered.swap(0, 1);
        ensure!(
            circuit
                .prove(witness(&g, &reordered, &reordered, n as u64)?)
                .is_err(),
            "permutation accepted"
        );
        for count in [n - 1, n + 1] {
            let altered: Vec<_> = (0..count).map(info).collect();
            ensure!(
                circuit
                    .prove(witness(&g, &calls, &altered, count as u64)?)
                    .is_err(),
                "wrong count accepted"
            );
        }
        ensure!(
            circuit
                .prove(witness(&g, &calls, &changed, n as u64)?)
                .is_err(),
            "signed-stack substitution accepted"
        );
        let row = json!({"calls":n,"dynamicInputFelts":2*n,"degreeBits":circuit.common.degree_bits(),"buildMs":build_ms,
            "samples":samples,"minifiedProofBytes":bytes,"mutationsRejected":5});
        println!("BATCH_PREFLIGHT {row}");
        measurements.push(row);
    }
    output.write_all(&serde_json::to_vec_pretty(&json!({"schema":1,"scope":"synthetic exact-stack SD-key with two dynamic 62-bit inputs per call plus two recursive minifiers",
        "configuredIntrospectionConstant":SD_KEY_MAX_INTROSPECTABLE_TRANSACTIONS,"measurements":measurements,
        "marketBatchImplemented":false,"fullUpsVerified":false,"nodeAdmissionTested":false,"broadcast":false,"chainTps":null}))?)?;
    output.write_all(b"\n")?;
    output.sync_all()?;
    Ok(())
}
