//! Public SD-key test driver. No ordinary-wallet key import or keystore access.
use anyhow::{bail, ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{hash_types::HashOut, poseidon::PoseidonHash},
    plonk::config::Hasher,
};
use psy_client_common::{
    args::{ContractCallArgs, DPNSoftwareDefinedCallData},
    data::qhashout::QHashOut,
};
use psy_client_data::qstore::controllers::proving_session::PsyReadLocalProvingSessionStore;
use psy_client_data::{
    config::store_config::{PsyHasher, C, D},
    privacy::private_note_inclusion::PrivateNoteInclusionInput,
    traits::qdatastore::{
        qmetadata::QMetaDataStoreReaderSync, qtreedata::QTreeDataStoreReaderSync,
    },
};
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_config::{PsyConfigGoldilocks, PSY_NETWORK_MAGIC};
use psy_crypto::{
    hash::{merkle::core::MerkleProofCore, traits::qhashable::QFieldHashable},
    signature::zk::data::ZKPublicKeyInfo,
};
use psy_prover::session::WalletSession;
use psy_provider::{
    provider::{QUserRpcProvider, RpcProvider},
    request::QSubmitEndCapRPCRequest,
    session::TxStatus,
};
use psy_template_token_wide_private::test_policy::{build, TestPolicy};
use psy_ups_circuit::{
    circuit_manager::core::PsyUPSStepCircuitManager, signature::sd_key::get_sd_key_public_key_param,
};
use serde::{Deserialize, Serialize};
use std::{env, fs, io::Write, os::unix::fs::OpenOptionsExt};
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn h(v: &[u64]) -> HashOut<F> {
    PoseidonHash::hash_no_pad(&v.iter().copied().map(f).collect::<Vec<_>>())
}
fn hh(a: HashOut<F>, b: HashOut<F>) -> HashOut<F> {
    PoseidonHash::two_to_one(a, b)
}
fn zero() -> HashOut<F> {
    HashOut {
        elements: [F::ZERO; 4],
    }
}
fn words(h: HashOut<F>) -> [u64; 4] {
    h.elements.map(|x| x.to_canonical_u64())
}
fn save(path: &str, v: &impl Serialize) -> Result<()> {
    let mut out = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(path)?;
    out.write_all(&serde_json::to_vec(v)?)?;
    out.write_all(b"\n")?;
    out.sync_all()?;
    Ok(())
}
#[derive(Serialize, Deserialize)]
struct SecretNote {
    token: u64,
    receiver_id: u64,
    amount: [u64; 2],
    owner: [u64; 4],
    random: [u64; 2],
    note_secrets: [[u64; 4]; 2],
    nullifier_secrets: [[u64; 4]; 2],
    indices: [u64; 2],
}
#[derive(Serialize, Deserialize)]
struct Packet {
    token: u64,
    receiver: u64,
    amount: [u64; 2],
    owner: [u64; 4],
    random: [u64; 2],
    checkpoint: u64,
    user_tree_root: [u64; 4],
    nullifiers: [[u64; 4]; 2],
    proofs: Vec<(usize, String)>,
}
fn sample() -> u64 {
    loop {
        let n = rand::random::<u64>();
        if n < 18_446_744_069_414_584_321 {
            return n;
        }
    }
}
async fn read_at(p: &RpcProvider, cp: u64, user: u64, cid: u64, offset: u64) -> Result<u64> {
    let a = p
        .get_user_contract_state_tree_leaf_hash(cp, user, cid as u32, 32, offset / 4)
        .await?;
    Ok(a.0.elements[(offset % 4) as usize].to_canonical_u64())
}
#[tokio::main]
async fn main() -> std::process::ExitCode {
    std::panic::set_hook(Box::new(|_| {}));
    let result = futures_util::FutureExt::catch_unwind(std::panic::AssertUnwindSafe(run())).await;
    match result {
        Ok(Ok(())) => std::process::ExitCode::SUCCESS,
        Ok(Err(e)) => {
            eprintln!(
                "{}",
                serde_json::json!({"ok":false,"error":e.to_string(),"retryAllowed":false})
            );
            std::process::ExitCode::FAILURE
        }
        Err(_) => {
            eprintln!(
                "{}",
                serde_json::json!({"ok":false,"error":"SDK execution aborted; reconcile any recorded broadcast intent","retryAllowed":false})
            );
            std::process::ExitCode::FAILURE
        }
    }
}
async fn run() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    ensure!(args.len() >= 3, "private_test_wallet action args");
    let action = args[1].as_str();
    if action == "prepare-note" {
        ensure!(
            args.len() == 4,
            "prepare-note <public-request.json> <new-secret-file>"
        );
        let request: serde_json::Value = serde_json::from_slice(&fs::read(&args[2])?)?;
        let amount = request["amount"]
            .as_str()
            .context("decimal string amount")?
            .parse::<u128>()?;
        ensure!(amount > 0 && amount < (1u128 << 124), "invalid amount");
        let token = request["token"].as_u64().context("token")?;
        let receiver = request["receiver"].as_u64().context("receiver")?;
        ensure!(
            token >= 5 && token < 16777216 && receiver > 0 && receiver < 16777216,
            "invalid identities"
        );
        let random = [sample(), sample()];
        let owner = words(h(&[receiver, 1337, random[0], random[1]]));
        let note_secrets = std::array::from_fn(|_| std::array::from_fn(|_| sample()));
        let nullifier_secrets = std::array::from_fn(|_| std::array::from_fn(|_| sample()));
        let value = [(amount % (1u128 << 62)) as u64, (amount >> 62) as u64];
        let indices = [
            request["low_index"].as_u64().unwrap_or(0),
            request["high_index"].as_u64().unwrap_or(0),
        ];
        let note = SecretNote {
            token,
            receiver_id: receiver,
            amount: value,
            owner,
            random,
            note_secrets,
            nullifier_secrets,
            indices,
        };
        save(&args[3], &note)?;
        let mut inputs = owner.to_vec();
        inputs.extend(value);
        for i in 0..2 {
            inputs.extend(if value[i] == 0 {
                [0; 4]
            } else {
                words(h(&nullifier_secrets[i]
                    .into_iter()
                    .chain(note_secrets[i])
                    .collect::<Vec<_>>()))
            });
        }
        println!(
            "{}",
            serde_json::json!({"contract_id":token,"method_name":"private_transfer","inputs":inputs,"secretFile":args[3],"amount":amount.to_string()})
        );
        return Ok(());
    }
    if action == "prove-notes" {
        ensure!(
            args.len() == 7,
            "prove-notes <secret-file> <sender> <checkpoint> <rpc-config> <new-packet>"
        );
        let note: SecretNote = serde_json::from_slice(&fs::read(&args[2])?)?;
        let sender = args[3].parse::<u64>()?;
        let cp = args[4].parse::<u64>()?;
        let cfg = PsyConfigGoldilocks::from_file(&args[5])?;
        let network = cfg.get_current_network()?.clone();
        let p = RpcProvider::new_with_config(&network)?.with_user_id_owned(sender);
        let user_leaf = p.get_user_leaf_data(cp, sender).await?;
        let contract = p
            .get_user_contract_tree_merkle_proof(cp, sender, note.token as u32)
            .await?;
        let user = p.get_user_tree_merkle_proof(cp, sender).await?;
        ensure!(
            contract.root == user_leaf.user_state_tree_root,
            "contract proof/user leaf mismatch"
        );
        ensure!(
            user.value == user_leaf.qfhash::<PsyHasher>(),
            "user proof/leaf mismatch"
        );
        let circuit =
            psy_dpn_circuit::circuits::privacy::private_note_inclusion::PrivateNoteInclusionCircuit::<
                C,
                D,
            >::new(
                psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize,
                24,
                32,
                20,
            );
        ensure!(
            words(circuit.get_fingerprint().0)
                == [
                    2482434993266711942,
                    6028864160300535936,
                    2827549014984201026,
                    3018365102481798071
                ],
            "note verifier mismatch"
        );
        let mut proofs = vec![];
        let mut nullifiers = [[0; 4]; 2];
        for i in 0..2 {
            if note.amount[i] == 0 {
                continue;
            }
            let count_offset = 1174405232 + i as u64;
            ensure!(
                read_at(&p, cp, sender, note.token, count_offset).await? == note.indices[i] + 1,
                "checkpoint must contain this latest denomination append"
            );
            let hash = h(&note.nullifier_secrets[i]
                .into_iter()
                .chain(note.note_secrets[i])
                .collect::<Vec<_>>());
            let commitment = hh(
                hh(
                    HashOut {
                        elements: note.owner.map(f),
                    },
                    HashOut {
                        elements: [f(note.amount[i]), F::ZERO, F::ZERO, F::ZERO],
                    },
                ),
                hash,
            );
            let mut siblings = vec![];
            let mut zero = zero();
            let mut current = commitment;
            for level in 0..20 {
                let sibling = if note.indices[i] >> level & 1 == 0 {
                    zero
                } else {
                    let offset = (if i == 0 { 1174405234 } else { 1174405314 }) + level * 4;
                    let mut a = [F::ZERO; 4];
                    for j in 0..4 {
                        a[j] = f(read_at(&p, cp, sender, note.token, offset + j as u64).await?);
                    }
                    HashOut { elements: a }
                };
                siblings.push(QHashOut(sibling));
                current = if note.indices[i] >> level & 1 == 0 {
                    hh(current, sibling)
                } else {
                    hh(sibling, current)
                };
                zero = hh(zero, zero);
            }
            let membership = MerkleProofCore {
                root: QHashOut(current),
                value: QHashOut(commitment),
                index: note.indices[i],
                siblings,
            };
            let slot = [293601306, 293601307][i];
            let slot_proof = p
                .get_user_contract_state_tree_merkle_proof(cp, sender, note.token as u32, 32, slot)
                .await?;
            ensure!(
                slot_proof.value == membership.root && slot_proof.root == contract.value,
                "note/state/contract proof mismatch"
            );
            let input = PrivateNoteInclusionInput {
                nullifier_secret: QHashOut(HashOut {
                    elements: note.nullifier_secrets[i].map(f),
                }),
                sender_user_id: sender,
                contract_id: note.token,
                user_leaf: user_leaf.clone(),
                owner: QHashOut(HashOut {
                    elements: note.owner.map(f),
                }),
                amount: f(note.amount[i]),
                note_secret: QHashOut(HashOut {
                    elements: note.note_secrets[i].map(f),
                }),
                note_membership_proof: membership,
                note_root_slot: slot,
                note_root_slot_proof: slot_proof,
                contract_proof: contract.clone(),
                user_tree_proof: user.clone(),
                checkpoint_id: f(cp),
            };
            let proof = circuit.prove(&input)?;
            plonky2::plonk::circuit_data::VerifierCircuitData {
                verifier_only: circuit.get_verifier_config_ref().clone(),
                common: circuit.get_common_circuit_data_ref().clone(),
            }
            .verify(proof.clone())?;
            nullifiers[i] = words(h(&note.nullifier_secrets[i]));
            proofs.push((i, serde_json::to_string(&proof)?));
            println!("verified native denomination proof {i}");
        }
        save(
            &args[6],
            &Packet {
                token: note.token,
                receiver: note.receiver_id,
                amount: note.amount,
                owner: note.owner,
                random: note.random,
                checkpoint: cp,
                user_tree_root: words(user.root.0),
                nullifiers,
                proofs,
            },
        )?;
        println!("native note packet saved privately; no witnesses exported");
        return Ok(());
    }
    ensure!(
        [
            "identity",
            "register",
            "preflight",
            "verified-submit",
            "claim-preflight",
            "claim-verified-submit"
        ]
        .contains(&action),
        "invalid action"
    );
    let spec: TestPolicy = serde_json::from_slice(&fs::read(&args[2])?)?;
    let circuit = build(&spec)?;
    let fingerprint = circuit.get_fingerprint();
    let public_key = QHashOut(HashOut {
        elements: [F::ONE; 4],
    });
    let public = ZKPublicKeyInfo {
        public_key_param: get_sd_key_public_key_param(&public_key),
        fingerprint,
    };
    if action == "identity" {
        ensure!(args.len() == 3, "identity spec");
        println!(
            "{}",
            serde_json::json!({"fingerprint":fingerprint.to_string(),"publicKeyHash":public.qfhash::<PsyHasher>().to_string()})
        );
        return Ok(());
    }
    let config_index = if action == "register" { 3 } else { 4 };
    ensure!(args.len() == config_index + 1, "action spec request config");
    let cfg = PsyConfigGoldilocks::from_file(&args[config_index])?;
    let mut network = cfg.get_current_network()?.clone();
    network.prove_proxy_url.clear();
    let mut session = WalletSession::new(&network).await?;
    session.wallet.insert_sd_key_circuit(fingerprint, circuit);
    if action == "register" {
        let key = session.register_user(public_key, fingerprint).await?;
        println!(
            "{}",
            serde_json::json!({"registeredPublicKeyHash":key.to_string(),"fingerprint":fingerprint.to_string()})
        );
        return Ok(());
    }
    let key = session.add_user(public_key, fingerprint).await?;
    session.start_session(key).await?;
    let mut packet_context = None;
    let call: ContractCallArgs = if action.starts_with("claim-") {
        let packet: Packet = serde_json::from_slice(&fs::read(&args[3])?)?;
        let user_id = session
            .user_session_mgrs
            .get(&key)
            .context("manager")?
            .require_lps()?
            .get_current_user_id()
            .to_canonical_u64();
        ensure!(
            packet.receiver == user_id && packet.token == spec.token_id,
            "packet recipient/token mismatch"
        );
        ensure!(
            words(h(&[user_id, 1337, packet.random[0], packet.random[1]])) == packet.owner,
            "receiver mismatch"
        );
        let native_fp = session.private_note_inclusion_fingerprint()?;
        ensure!(
            words(native_fp.0)
                == [
                    2482434993266711942,
                    6028864160300535936,
                    2827549014984201026,
                    3018365102481798071
                ],
            "native note fingerprint mismatch"
        );
        let verifier = session.resolve_private_note_inclusion_verifier_data(native_fp)?;
        let mut refs = vec![];
        for (limb, json) in &packet.proofs {
            ensure!(
                *limb < 2 && packet.amount[*limb] > 0,
                "invalid denomination proof"
            );
            let proof: plonky2::plonk::proof::ProofWithPublicInputs<F, C, D> =
                serde_json::from_str(json)?;
            let mut values = packet.owner.to_vec();
            values.push(packet.amount[*limb]);
            values.extend(packet.user_tree_root);
            values.extend([
                packet.checkpoint,
                [293601306, 293601307][*limb],
                packet.token,
            ]);
            values.extend(packet.nullifiers[*limb]);
            ensure!(
                proof.public_inputs == h(&values).elements,
                "proof PI mismatch"
            );
            let index = session
                .add_external_proof(key, native_fp, proof, verifier.clone())
                .await?;
            refs.push((*limb, index));
        }
        let mut paths = [vec![0u64; 65], vec![0u64; 65]];
        for (limb, index) in refs {
            let manager = session.user_session_mgrs.get(&key).context("manager")?;
            let p = manager.proof_tree_state.get_leaf_merkle_proof(index).await;
            ensure!(
                p.siblings.len() == 16
                    && p.root == manager.proof_tree_state.get_proof_tree_root().await,
                "stale session path"
            );
            let mut v = vec![];
            for sibling in p.siblings {
                v.extend(words(sibling.0));
            }
            v.push(index);
            paths[limb] = v;
        }
        let mut inputs = packet.owner.to_vec();
        inputs.extend(packet.amount);
        inputs.extend(packet.user_tree_root);
        inputs.extend([packet.checkpoint, packet.random[0], packet.random[1]]);
        inputs.extend(packet.nullifiers[0]);
        inputs.extend(packet.nullifiers[1]);
        inputs.extend(paths[0].clone());
        inputs.extend(paths[1].clone());
        packet_context = Some(packet);
        ContractCallArgs {
            contract_id: spec.token_id,
            method_name: "private_claim".into(),
            inputs,
        }
    } else {
        serde_json::from_slice(&fs::read(&args[3])?)?
    };
    let branch = match (
        call.contract_id,
        call.method_name.as_str(),
        call.inputs.len(),
    ) {
        (0, "simple_claim", 1) => 1,
        (id, "claim", 1) if id == spec.token_id => 2,
        (id, "private_transfer", 14) if id == spec.token_id => 3,
        (id, "private_claim", 151) if id == spec.token_id => 4,
        (id, "transfer", 3) if id == spec.token_id && call.inputs[0] == spec.issuer => 5,
        _ => bail!("test policy call rejected"),
    };
    let mut w = vec![0u64; 154];
    w[0] = branch;
    w[1..1 + call.inputs.len()].copy_from_slice(&call.inputs);
    w[153] = spec.role;
    println!(
        "proving authenticated contract function {}",
        call.method_name
    );
    session.prove_contract_call(key, vec![call]).await?;
    let fee = {
        let manager = session.user_session_mgrs.get(&key).context("manager")?;
        let lps = manager.require_lps()?;
        let c = &lps.last_transaction_record().call_data.call_data;
        ensure!(
            c.contract_id == F::ZERO && c.method_id == f(2923993647) && c.inputs.len() == 1,
            "auto burn shape"
        );
        c.inputs[0].to_canonical_u64()
    };
    ensure!(
        fee >= 1_000_000_000
            && fee <= 1_000_000_000 + (101 - spec.role) * 1000
            && (fee - 1_000_000_000) % 1000 == 0,
        "fee rejected"
    );
    w[152] = fee;
    let (endcap, proof) = session
        .sign(key, DPNSoftwareDefinedCallData { inputs: w })
        .await?;
    let verifier = PsyUPSStepCircuitManager::<C, D>::new_with_config(PSY_NETWORK_MAGIC);
    ensure!(
        verifier.ups_end_cap.get_fingerprint()
            == session
                .wallet
                .random_circuit_manager()
                .ups_end_cap_circuit_fingerprint()
                .await?,
        "UPS verifier mismatch"
    );
    verifier.ups_end_cap.verify_proof(proof.clone())?;
    println!(
        "{}",
        serde_json::json!({"fullUpsVerified":true,"submitted":false,"fee":fee,"endUserLeafHash":endcap.core.state_transition.end_user_leaf_hash.to_string(),"claimPacket":packet_context.is_some()})
    );
    if action.ends_with("verified-submit") {
        let id = endcap.core.new_user_leaf.user_id.to_canonical_u64();
        let nonce = endcap.core.new_user_leaf.nonce.to_canonical_u64();
        let p = session.st_provider.with_user_id_owned(id);
        let cp = p.get_latest_block_state().await?.checkpoint_id;
        let latest = p.get_user_leaf_data(cp, id).await?;
        ensure!(
            endcap.core.state_transition.start_user_leaf_hash == QHashOut::ZERO
                || latest.qfhash::<PsyHasher>()
                    == endcap.core.state_transition.start_user_leaf_hash,
            "stale anchor"
        );
        ensure!(
            matches!(p.get_tx_status(id, nonce).await?, TxStatus::Submittable),
            "nonce not submittable"
        );
        let hash = endcap.core.state_transition.end_user_leaf_hash;
        println!(
            "{}",
            serde_json::json!({"status":"broadcast_intent","userId":id,"nonce":nonce,"endUserLeafHash":hash.to_string()})
        );
        std::io::stdout().flush()?;
        p.submit_end_cap_proof::<F>(QSubmitEndCapRPCRequest {
            user_ec_input: endcap,
            proof: bincode::serialize(&proof)?,
        })
        .await?;
        println!("submitted {hash}");
    } else {
        ensure!(
            action == "preflight" || action == "claim-preflight",
            "invalid action"
        );
    }
    Ok(())
}
