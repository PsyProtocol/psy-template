//! Exact production verifier against two new public synthetic note proofs.
//! Private witnesses stay in memory; no UPS, network, wallet or signing action.
use super::*;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
#[path = "../../../../../../market-client/wallet/native/src/private_notes.rs"]
mod private_notes;
use private_notes::{Context, NotePack, NoteVerifier, Packet};
#[test]
#[ignore = "bounded two-note proof generation; fresh external output required"]
fn fixed_note_packet_verifier_binds_every_denomination() -> Result<()> {
    let out = std::path::PathBuf::from(std::env::var("PRIVATE_PACKET_OUT")?);
    fs::create_dir(&out)?;
    let mut world = World::new()?;
    let amount = 10u128.pow(27) + 123;
    world.set_balance(A, amount + 9);
    world.transfer(amount, h(&[BOB, 1337, 7, 8]), funding_secrets())?;
    let n = prepare(&world, amount, fp());
    let circuit = PrivateNoteInclusionCircuit::<C, 2>::new(
        psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize,
        psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize,
        32,
        20,
    );
    ensure!(
        circuit.get_fingerprint().0 == fp(),
        "reviewed frozen note fingerprint"
    );
    let verifier = plonky2::plonk::circuit_data::VerifierCircuitData {
        verifier_only: circuit.get_verifier_config_ref().clone(),
        common: circuit.get_common_circuit_data_ref().clone(),
    };
    let pack = NotePack {
        schema: 1,
        sdk_manifest: "246cfcb12788fe0d0eb79594556acdfcc7781d01641890e47836db1fbc93c467".into(),
        network_magic: "1384803358401154921".into(),
        chain_root_at_1: "01".repeat(32),
        verifier_b64: B64.encode(verifier.to_bytes(&psy_common_circuit::serialization::PsyGateSerializer)
            .map_err(|e|anyhow::anyhow!("fixed note verifier serialization: {e}"))?),
    };
    fs::write(
        out.join("private-note-pack.json"),
        serde_json::to_vec(&pack)?,
    )?;
    let checked = NoteVerifier::new(pack)?;
    let mut proofs = [None, None];
    for i in 0..2 {
        proofs[i] = Some(B64.encode(bincode::serialize(&circuit.prove(&n.native[i])?)?));
    }
    let to_strings = |h: HashOut<F>| h.elements.map(|v| v.to_canonical_u64().to_string());
    let packet = Packet {
        kind: "psy_private_ft_u124_v1".into(),
        contract_id: T.to_string(),
        owner: to_strings(n.native[0].owner.0),
        amount: [(amount % RADIX).to_string(), (amount / RADIX).to_string()],
        checkpoint: CP.to_string(),
        user_tree_root: to_strings(n.checkpoint),
        nullifiers: std::array::from_fn(|i| {
            to_strings(PoseidonHash::hash_no_pad(
                &n.native[i].nullifier_secret.0.elements,
            ))
        }),
        proofs,
    };
    let context = Context {
        network_magic: "1384803358401154921".into(),
        chain_root_at_1: "01".repeat(32),
        contract_id: T.to_string(),
        owner: packet.owner.clone(),
        checkpoint: CP.to_string(),
        user_tree_root: packet.user_tree_root.clone(),
    };
    let report = checked.verify(&packet, &context)?;
    ensure!(
        report["amount"] == amount.to_string()
            && report["proofCount"] == 2
            && report["claimAuthorized"] == false,
        "packet report scope"
    );
    fs::write(out.join("packet.json"), serde_json::to_vec(&packet)?)?;
    fs::write(out.join("context.json"), serde_json::to_vec(&context)?)?;
    for zero_index in 0..2 {
        let mut p = packet.clone();
        p.amount[zero_index] = "0".into();
        p.nullifiers[zero_index] = std::array::from_fn(|_| "0".into());
        p.proofs[zero_index] = None;
        ensure!(
            checked.verify(&p, &context)?["proofCount"] == 1,
            "single active limb"
        );
    }
    let mut rejected = 0;
    for mode in 0..21 {
        let mut p = packet.clone();
        let mut c = context.clone();
        match mode {
            0 => p.amount[0] = "1".into(),
            1 => p.amount[1] = "1".into(),
            2 => p.owner[0] = "1".into(),
            3 => p.user_tree_root[0] = "1".into(),
            4 => p.checkpoint = "99".into(),
            5 => p.contract_id = "43".into(),
            6 => p.nullifiers[0][0] = "1".into(),
            7 => p.nullifiers[1][0] = "1".into(),
            8 => p.proofs.swap(0, 1),
            9 => p.proofs[0] = None,
            10 => p.amount[0] = (1u64 << 62).to_string(),
            11 => p.amount[0] = "01".into(),
            12 => p.owner[0] = "18446744069414584321".into(),
            13 => c.network_magic = "1".into(),
            14 => c.chain_root_at_1 = "02".repeat(32),
            15 => {
                c.owner = std::array::from_fn(|_| "0".into());
                p.owner = c.owner.clone()
            }
            16 => {
                let mut bytes = B64.decode(p.proofs[0].as_ref().unwrap())?;
                bytes.push(0);
                p.proofs[0] = Some(B64.encode(bytes));
            }
            17 => p.nullifiers[1] = p.nullifiers[0].clone(),
            18 => {
                p.amount[1] = "0".into();
            }
            19 => {
                p.checkpoint = "4294967296".into();
                c.checkpoint = p.checkpoint.clone();
            }
            _ => {
                let mut proof: plonky2::plonk::proof::ProofWithPublicInputs<F, C, 2> =
                    bincode::deserialize(&B64.decode(p.proofs[0].as_ref().unwrap())?)?;
                proof.public_inputs[0] += F::ONE;
                p.proofs[0] = Some(B64.encode(bincode::serialize(&proof)?));
            }
        }
        ensure!(
            checked.verify(&p, &c).is_err(),
            "note mutation {mode} accepted"
        );
        rejected += 1;
    }
    let mut extra = serde_json::to_value(&packet)?;
    extra["verifier_b64"] = serde_json::json!("page-selected");
    ensure!(
        serde_json::from_value::<Packet>(extra).is_err(),
        "page resource injection"
    );
    fs::write(
        out.join("REPORT.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"schema":1,"scope":"synthetic public denomination-note verification","newNoteProofs":2,"newCompleteUps":0,"validPackets":3,"mutationRejections":rejected,"unknownFieldRejected":true,"amount":amount.to_string(),"fullClaimAuthorization":false,"finalityAuthentication":false,"financialOperations":0}),
        )?,
    )?;
    println!("PRIVATE_PACKET_VERIFY accepted=3 rejected={rejected} note-proofs=2 complete-ups=0 financial-actions=0");
    Ok(())
}
