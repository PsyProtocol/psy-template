//! One fresh compact-claim UPS with independently verified public call/externals.
//! Signing material stays in RAM. The receive randoms 7/8 are public fixtures,
//! not wallet secrets. This exporter must never be used with a real wallet.
use super::*;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use psy_template_u124_markets::{wallet_verification::*, wallet_verifier_export::*};
use psy_ups_circuit::session::TraceStandardStepInput;

pub(super) async fn run(
    cache: PsyCmdStoreWithCache<F, Store>,
    cm: &PsyUPSStepCircuitManager<C, 2>,
    codes: &BTreeMap<u64, ContractCodeDefinition>,
    signature: &PsyBasicZKSignatureCircuit<C, 2>,
    secret: QHashOut<F>,
    key: &SimplePsyPrivateKey<F>,
    notes: Vec<plonky2::plonk::proof::ProofWithPublicInputs<F, C, 2>>,
    note_circuit: &PrivateNoteInclusionCircuit<C, 2>,
    cp: u64,
    start: PsyUserLeaf<F>,
    source_root: QHashOut<F>,
    amount: u128,
    output: &std::path::Path,
    source_identity: Option<String>,
) -> Result<()> {
    let started = Instant::now();
    ensure!(notes.len() == 2, "two actual note denominations");
    let mut info = SessionCircuitInfoStore::new();
    cm.register_info(&mut info).await;
    let lps = PsyLocalProvingSessionStore::new_at_with_cmd_store(
        cache.clone(),
        f(cp),
        f(BOB),
        F::ONE,
        start.event_index,
        16,
    );
    let mut trace =
        UserProvingSessionManager::new(lps, info, cm.ups_circuit_whitelist_root).await?;
    let start_header = *trace.get_current_ups_header();
    // Trace the exact start commitment without generating a throwaway start
    // proof. The independent proving manager below produces it once.
    let empty_root = trace.proof_tree_state.get_proof_tree_root().await;
    trace
        .proof_tree_state
        .injest_single_leaf_value(
            cm.ups_start.get_fingerprint(),
            empty_root,
            start_header.qfhash::<PoseidonHash>(),
        )
        .await;
    let mut external_steps = vec![];
    let mut insertions = vec![];
    for (limb, p) in notes.into_iter().enumerate() {
        let times = if limb == 0 { 2 } else { 1 };
        for _ in 0..times {
            let start_root = trace.proof_tree_state.get_proof_tree_root().await;
            let index = trace
                .add_external_proof(
                    note_circuit.get_fingerprint(),
                    p.clone(),
                    note_circuit.get_verifier_config_ref().clone(),
                )
                .await;
            let end_root = trace.proof_tree_state.get_proof_tree_root().await;
            trace.require_lps_mut()?.set_proof_tree_root(end_root);
            external_steps.push(PublicExternalStep {
                before_call: 0,
                fingerprint: note_circuit.get_fingerprint(),
                leaf_index: index,
                start_root,
                end_root,
                proof_b64: B64.encode(bincode::serialize(&p)?),
            });
            insertions.push(p.clone());
        }
    }
    let proof_path = trace.proof_tree_state.get_leaf_merkle_proof(2).await;
    let mut inputs = words(h(&[BOB, 1337, 7, 8]));
    inputs.extend([(amount % RADIX) as u64, (amount / RADIX) as u64]);
    inputs.extend(words(source_root.0));
    inputs.extend([cp, 7, 8]);
    for secret in [h(&[11, 12]), h(&[21, 22])] {
        inputs.extend(words(PoseidonHash::hash_no_pad(&secret.elements)));
    }
    for sibling in proof_path.siblings {
        inputs.extend(words(sibling.0));
    }
    inputs.push(2);
    ensure!(inputs.len() == 86, "compact claim arity");
    let (index, def) = cm
        .resolve_contract_function_by_method_name(T, &codes[&T], "private_claim".into())
        .await?;
    let claim = trace
        .trace_standard_call(
            cm,
            f(T),
            index as u32,
            &def,
            inputs.iter().copied().map(f).collect(),
        )
        .await?;
    cm.resolve_contract_function_by_method_name(0, &codes[&0], "burn".into())
        .await?;
    let burn = trace.trace_burn_fee(cm).await?;
    let fee = trace
        .require_lps()?
        .last_transaction_record()
        .call_data
        .call_data
        .inputs[0]
        .to_canonical_u64();
    let slots = trace.require_lps()?.get_total_slots_modified();
    let mut info = SessionCircuitInfoStore::new();
    cm.register_info(&mut info).await;
    let lps = PsyLocalProvingSessionStore::new_at_with_cmd_store(
        cache,
        f(cp),
        f(BOB),
        F::ONE,
        start.event_index,
        16,
    );
    let mut prove =
        UserProvingSessionManager::new(lps, info, cm.ups_circuit_whitelist_root).await?;
    prove.prove_ups_start(cm).await?;
    ensure!(
        *prove.get_current_ups_header() == start_header,
        "independent start header"
    );
    let start_proof_b64 = B64.encode(bincode::serialize(
        &prove
            .proof_tree_state
            .leaf_proofs
            .front()
            .ok_or_else(|| anyhow::anyhow!("start proof missing"))?
            .proof,
    )?);
    for (proof, want) in insertions.into_iter().zip(&external_steps) {
        ensure!(
            prove.proof_tree_state.get_proof_tree_root().await == want.start_root,
            "external start root replay"
        );
        let index = prove
            .add_external_proof(
                note_circuit.get_fingerprint(),
                proof,
                note_circuit.get_verifier_config_ref().clone(),
            )
            .await;
        ensure!(
            index == want.leaf_index
                && prove.proof_tree_state.get_proof_tree_root().await == want.end_root,
            "external exact root replay"
        );
    }
    let mut pack = export_fixed_verifiers(cm, signature)?;
    pack.private_note_b64 = Some(encode_verifier(note_circuit)?);
    let mut steps = vec![];
    for t in [claim, burn] {
        ensure!(t.deferred.is_empty(), "no hidden nested calls");
        let before = *prove.get_current_ups_header();
        let step = TraceStandardStepInput {
            contract_id: t.contract_id,
            fn_id: t.fn_id,
            cfc_witness: t.cfc_witness.clone(),
            state_delta: t.state_delta.clone(),
            cfc_inclusion_proof: t.cfc_inclusion_proof.clone(),
            end_header: t.end_header,
        };
        let proofs = prove
            .prove_step_standard(cm, prove.get_checkpoint_state(), &before, &step, None)
            .await?;
        let known = prove.get_last_ups_step_proof_info().known_proof_tree_root;
        prove.set_previous_ups_header(before);
        prove.set_current_ups_header(t.end_header);
        let leaf = t.cfc_inclusion_proof.contract_inclusion_proof.contract_leaf;
        let circuit = cm
            .contract_circuits
            .get(&(t.contract_id, t.fn_id))
            .ok_or_else(|| anyhow::anyhow!("fixed method absent"))?;
        pack.contracts.push(ContractVerifier {
            contract_id: t.contract_id,
            code_root: leaf.code_root,
            layout_root: leaf.state_layout_root,
            function_root: leaf.function_tree_root,
            height: leaf.state_tree_height.to_canonical_u64(),
            fields: leaf.state_layout_field_count.to_canonical_u64(),
            slots: leaf.state_layout_slot_count.to_canonical_u64(),
            methods: vec![MethodVerifier {
                method_id: t.method_id,
                name: t.method_name.clone(),
                arity: circuit.fn_def.circuit_inputs.len(),
                outputs: circuit.fn_def.circuit_outputs.len(),
                function_index: t.fn_id as u64,
                fingerprint: circuit.get_fingerprint(),
                verifier_b64: encode_verifier(circuit.as_ref())?,
            }],
        });
        steps.push(PublicStep {
            contract_id: t.contract_id,
            method_id: t.method_id,
            method_name: t.method_name,
            cfc_session_root: t.cfc_witness.session_proof_tree_root,
            state_delta: t.state_delta,
            inclusion: t.cfc_inclusion_proof,
            end_header: t.end_header,
            cfc_proof_b64: B64.encode(bincode::serialize(&proofs.cfc_proof)?),
            ups_proof_b64: B64.encode(bincode::serialize(&proofs.ups_proof)?),
            ups_known_root: known,
        });
    }
    let sighash = prove.get_sighash(psy_config::PSY_NETWORK_MAGIC, F::ONE);
    let sig = signature.prove_base(secret, sighash)?;
    let sign_proof_b64 = B64.encode(bincode::serialize(&sig)?);
    let full = prove
        .prove_end_cap(
            cm,
            psy_config::PSY_NETWORK_MAGIC,
            F::ONE,
            slots,
            signature.get_fingerprint(),
            key.get_public_key_param::<PoseidonHash>(),
            sig,
            signature.get_verifier_config_ref().clone(),
        )
        .await?;
    trace.set_current_ups_header(*prove.get_current_ups_header());
    let api = trace.get_api_input().await?;
    psy_template_u124_markets::proof_binding::validate_endcap_binding(
        &api.core,
        &full.public_inputs,
    )?;
    let quantity = trace
        .require_lps_mut()?
        .get_contract_state_slot(f(T), F::ZERO)
        .await?
        .value
        .0;
    ensure!(
        quantity.elements[0].to_canonical_u64() as u128
            + RADIX * quantity.elements[1].to_canonical_u64() as u128
            == amount,
        "full U124 claim endpoint"
    );
    let native = trace
        .require_lps_mut()?
        .get_contract_state_slot(F::ZERO, F::ZERO)
        .await?
        .value
        .0
        .elements[0]
        .to_canonical_u64();
    ensure!(native + fee == 100_000_000_000, "native fee conservation");
    let request = PublicRequest {
        user_ec_input: api,
        proof: bincode::serialize(&full)?,
    };
    let bytes = serde_json::to_vec(&request)?;
    let approval = WalletApproval {
        user_id: BOB,
        public_key: start.public_key,
        nonce: 1,
        checkpoint_min: cp,
        checkpoint_max: cp + 64,
        start_leaf: start.qfhash::<PoseidonHash>(),
        max_fee: 2_000_000_000,
        network_magic: psy_config::PSY_NETWORK_MAGIC,
        sdk_manifest: pack.sdk_manifest.clone(),
        calls: vec![
            ApprovedCall {
                contract_id: T.to_string(),
                method_id: None,
                method_name: "private_claim".into(),
                inputs: inputs.iter().map(u64::to_string).collect(),
            },
            ApprovedCall {
                contract_id: "0".into(),
                method_id: None,
                method_name: "burn".into(),
                inputs: vec![fee.to_string()],
            },
        ],
    };
    let bundle = PublicBundle {
        schema: 2,
        anchor: PublicAnchor {
            start_checkpoint_id: cp,
            checkpoint_leaf: *trace.get_current_checkpoint_leaf(),
            global_state_roots: *trace.get_current_global_state_roots(),
            ups_step_circuit_whitelist_root: cm.ups_circuit_whitelist_root,
        },
        start_header,
        start_proof_b64,
        steps,
        sign_proof_b64,
        public_key_param: key.get_public_key_param::<PoseidonHash>(),
        sig_hash: sighash,
        external_steps,
    };
    let verified = verify_market_request(&pack, &bytes, &approval, &bundle)?;
    for (name, value) in [
        ("verifiers", serde_json::to_value(&pack)?),
        ("approval", serde_json::to_value(&approval)?),
        ("bundle", serde_json::to_value(&bundle)?),
        ("verification", verified),
    ] {
        fs::write(
            output.join(format!("{name}.json")),
            serde_json::to_vec_pretty(&value)?,
        )?;
    }
    fs::write(output.join("request.json"), &bytes)?;
    let a = serde_json::to_value(&approval)?;
    let b = serde_json::to_value(&bundle)?;
    let p = serde_json::to_value(&pack)?;
    let mut refused = vec![];
    for mode in 0..18 {
        let (mut aa, mut bb, mut pp) = (a.clone(), b.clone(), p.clone());
        match mode {
            0 => bb["external_steps"].as_array_mut().unwrap().clear(),
            1 => {
                bb["external_steps"].as_array_mut().unwrap().remove(1);
            }
            2 => bb["external_steps"].as_array_mut().unwrap().swap(0, 2),
            3 => {
                bb["external_steps"][0]["fingerprint"] =
                    serde_json::json!(QHashOut::<F>::ZERO.to_string())
            }
            4 => bb["external_steps"][0]["leaf_index"] = serde_json::json!(9),
            5 => {
                bb["external_steps"][0]["start_root"] =
                    serde_json::json!(QHashOut::<F>::ZERO.to_string())
            }
            6 => {
                bb["external_steps"][2]["end_root"] =
                    serde_json::json!(QHashOut::<F>::ZERO.to_string())
            }
            7 => bb["external_steps"][0]["before_call"] = serde_json::json!(1),
            8 => aa["calls"][0]["inputs"][5] = serde_json::json!("0"),
            9 => aa["calls"][0]["inputs"][0] = serde_json::json!("1"),
            10 => aa["calls"][0]["inputs"][85] = serde_json::json!("1"),
            11 => aa["calls"].as_array_mut().unwrap().swap(0, 1),
            12 => aa["calls"][0]["inputs"][11] = serde_json::json!("9"),
            13 => aa["nonce"] = serde_json::json!(2),
            14 => aa["network_magic"] = serde_json::json!(1),
            15 => {
                pp.as_object_mut().unwrap().remove("private_note_b64");
            }
            16 => {
                bb["steps"][0]["cfc_session_root"] =
                    serde_json::json!(QHashOut::<F>::ZERO.to_string())
            }
            _ => aa["max_fee"] = serde_json::json!(1),
        }
        ensure!(
            verify_market_request(
                &serde_json::from_value(pp)?,
                &bytes,
                &serde_json::from_value(aa)?,
                &serde_json::from_value(bb)?
            )
            .is_err(),
            "stack mutation {mode} accepted"
        );
        refused.push(mode);
    }
    fs::write(
        output.join("REPORT.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"schema":1,"scope":"One synthetic compact claim UPS with complete ordered public proof verification; no extension or network acceptance","newCompleteUps":1,"newNoteProofs":2,"approvedCalls":2,"externalInsertions":3,"uniqueNoteProofs":2,"mutationsRefused":refused,"sourceTransferRequestSha256":source_identity,"amount":amount.to_string(),"fee":fee,"conserved":true,"elapsedSeconds":started.elapsed().as_secs_f64(),"ephemeralSigningWitnessPersisted":false,"receiveRandomsArePublicSyntheticConstants":true,"financialOperations":0}),
        )?,
    )?;
    println!(
        "PRIVATE_APPROVED_STACK full-ups=1 externals=3 unique-notes=2 refused=18 no-broadcast"
    );
    Ok(())
}
