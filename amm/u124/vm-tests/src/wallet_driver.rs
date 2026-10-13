//! Public SD-key driver for the three U124 markets. No private wallet import.
//! `verified-submit` verifies the exact UPS proof, checks anchor/nonce, then submits once.
use crate::{
    policy::build_policy,
    runtime::{contain, Progress},
};
use anyhow::{bail, ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::hash_types::HashOut,
};
use psy_client_common::{args::ContractCallData, data::qhashout::QHashOut};
use psy_client_data::config::store_config::{PsyHasher, C, D};
use psy_client_data::traits::qdatastore::qmetadata::QMetaDataStoreReaderSync;
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_config::{PsyConfigGoldilocks, PSY_NETWORK_MAGIC};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_prover::session::session::WalletSession;
use psy_provider::{
    provider::QUserRpcProvider, request::QSubmitEndCapRPCRequest, session::TxStatus,
};
use psy_ups_circuit::circuit_manager::core::PsyUPSStepCircuitManager;
use std::io::Write;
use std::{env, fs};
const USAGE:&str="usage: market_wallet fingerprint <policy.json> | register <policy.json> <rpc-config.json> | preflight/submit/verified-submit <policy.json> <calls.json> <rpc-config.json>";
/// All CLI errors are structured; panic payloads are not printed by the hook.
/// A contained panic drops the entire session; no proof or broadcast follows it.
pub async fn main_entry() -> std::process::ExitCode {
    std::panic::set_hook(Box::new(|_| {}));
    let mut progress = Progress::default();
    match contain(run(&mut progress)).await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{}", progress.failure(&error));
            std::process::ExitCode::FAILURE
        }
    }
}
async fn run(progress: &mut Progress) -> Result<()> {
    let args: Vec<String> = env::args().collect();
    ensure!(args.len() >= 3, USAGE);
    let action = args[1].as_str();
    ensure!(
        [
            "fingerprint",
            "register",
            "preflight",
            "submit",
            "verified-submit"
        ]
        .contains(&action),
        USAGE
    );
    let spec: serde_json::Value = serde_json::from_slice(&fs::read(&args[2])?)?;
    let circuit = build_policy(&spec)?;
    let fingerprint = circuit.get_fingerprint();
    if action == "fingerprint" {
        ensure!(args.len() == 3, USAGE);
        println!("{fingerprint}");
        return Ok(());
    }
    let config_index = if action == "register" { 3 } else { 4 };
    ensure!(args.len() == config_index + 1, USAGE);
    let calls = if action == "register" {
        None
    } else {
        let data: ContractCallData = serde_json::from_slice(&fs::read(&args[3])?)?;
        ensure!(
            data.contract_calls.len() == 8 && data.software_defined_call.inputs.len() == 13,
            "eight explicit calls and thirteen witness fields required"
        );
        ensure!(
            data.contract_calls[0].contract_id
                == spec["market_id"].as_u64().context("market ID")?,
            "first call must be the bound market guard"
        );
        ensure!(
            data.software_defined_call.inputs[3..9]
                .iter()
                .all(|n| *n < (1u64 << 62)),
            "noncanonical U124 amount limb"
        );
        Some(data)
    };
    let config = PsyConfigGoldilocks::from_file(&args[config_index])?;
    let mut network = config.get_current_network()?.clone();
    network.prove_proxy_url.clear();
    let mut session = WalletSession::new(&network).await?;
    session.wallet.insert_sd_key_circuit(fingerprint, circuit);
    let public_key = QHashOut(HashOut {
        elements: [F::ONE; 4],
    });
    if action == "register" {
        progress.broadcast_attempted = true;
        let key = session.register_user(public_key, fingerprint).await?;
        println!("registered public market account {key}; fingerprint {fingerprint}");
        return Ok(());
    }
    let mut data = calls.context("missing call request")?;
    let key = session.add_user(public_key, fingerprint).await?;
    session.start_session(key).await?;
    session
        .prove_contract_call(key, data.contract_calls)
        .await?;
    let fee = {
        let manager = session.user_session_mgrs.get(&key).context("session")?;
        let lps = manager.require_lps()?;
        let burn = &lps.last_transaction_record().call_data.call_data;
        ensure!(
            burn.contract_id.to_canonical_u64() == 0
                && burn.method_id.to_canonical_u64() == 2_923_993_647
                && burn.inputs.len() == 1,
            "unexpected automatic PSY burn"
        );
        burn.inputs[0].to_canonical_u64()
    };
    ensure!(
        fee >= 1_000_000_000 && fee <= 1_000_100_000 && (fee - 1_000_000_000) % 1000 == 0,
        "automatic fee exceeds escrow/policy"
    );
    ensure!(
        data.software_defined_call.inputs[12] == 0 || data.software_defined_call.inputs[12] == fee,
        "supplied fee differs from actual fee"
    );
    data.software_defined_call.inputs[12] = fee;
    match action {
        "preflight" | "verified-submit" | "submit" => {
            let (endcap, proof) = session.sign(key, data.software_defined_call).await?;
            let verifier = PsyUPSStepCircuitManager::<C, D>::new_with_config(PSY_NETWORK_MAGIC);
            ensure!(
                verifier.ups_end_cap.get_fingerprint()
                    == session
                        .wallet
                        .random_circuit_manager()
                        .ups_end_cap_circuit_fingerprint()
                        .await?,
                "endcap verifier mismatch"
            );
            verifier.ups_end_cap.verify_proof(proof.clone())?;
            println!(
                "{}",
                serde_json::json!({"fullUpsVerified":true,"submitted":false,"marketId":spec["market_id"],"fingerprint":fingerprint.to_string(),"fee":fee,"endUserLeafHash":endcap.core.state_transition.end_user_leaf_hash.to_string()})
            );
            if action == "verified-submit" || action == "submit" {
                let user_id = endcap.core.new_user_leaf.user_id.to_canonical_u64();
                let nonce = endcap.core.new_user_leaf.nonce.to_canonical_u64();
                let provider = session.st_provider.with_user_id_owned(user_id);
                let checkpoint = provider.get_latest_block_state().await?.checkpoint_id;
                let latest = provider.get_user_leaf_data(checkpoint, user_id).await?;
                ensure!(
                    endcap.core.state_transition.start_user_leaf_hash == QHashOut::ZERO
                        || latest.qfhash::<PsyHasher>()
                            == endcap.core.state_transition.start_user_leaf_hash,
                    "stale submit anchor: do not submit"
                );
                ensure!(
                    matches!(
                        provider.get_tx_status(user_id, nonce).await?,
                        TxStatus::Submittable
                    ),
                    "nonce not submittable: do not submit"
                );
                let hash = endcap.core.state_transition.end_user_leaf_hash;
                let request = QSubmitEndCapRPCRequest {
                    user_ec_input: endcap,
                    proof: bincode::serialize(&proof)?,
                };
                progress.end_user_leaf_hash = Some(hash.to_string());
                progress.user_id = Some(user_id);
                progress.nonce = Some(nonce);
                // Flush identity before attempting transmission. A failed response is ambiguous,
                // so callers must reconcile this exact leaf hash instead of retrying the request.
                println!(
                    "{}",
                    serde_json::json!({"status":"broadcast_intent","endUserLeafHash":hash.to_string(),"userId":user_id,"nonce":nonce})
                );
                std::io::stdout().flush()?;
                progress.broadcast_attempted = true;
                provider.submit_end_cap_proof::<F>(request).await?;
                println!("submitted market transaction {hash}");
            }
        }
        _ => bail!(USAGE),
    }
    Ok(())
}
