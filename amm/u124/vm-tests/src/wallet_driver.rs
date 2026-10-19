//! Public SD-key driver for U124 markets and NFT Marketplace. No private wallet import.
//! `verified-submit` verifies the exact UPS proof, checks anchor/nonce, then submits once.
use crate::{
    policy::build_policy,
    proof_binding::validate_endcap_binding,
    submission_guard::SubmissionGuard,
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
use psy_ups_circuit::signature::sd_key::get_sd_key_public_key_param;
use psy_crypto::signature::zk::data::ZKPublicKeyInfo;
use std::io::Write;
use sha2::{Digest, Sha256};
use std::{env, fs};
const USAGE:&str="usage: market_wallet fingerprint/identity <policy.json> | register <policy.json> <rpc-config.json> | preflight/submit/verified-submit <policy.json> <calls.json> <rpc-config.json> | guarded-preflight/guarded-submit <policy.json> <calls.json> <rpc-config.json> <guard.json>";
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
            "identity",
            "register",
            "preflight",
            "submit",
            "verified-submit",
            "guarded-preflight",
            "guarded-submit"
        ]
        .contains(&action),
        USAGE
    );
    let spec: serde_json::Value = serde_json::from_slice(&fs::read(&args[2])?)?;
    let circuit = build_policy(&spec)?;
    let fingerprint = circuit.get_fingerprint();
    if action == "fingerprint" || action == "identity" {
        ensure!(args.len() == 3, USAGE);
        if action == "identity" {
            let public_key_param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[F::ONE;4]}));
            let public=ZKPublicKeyInfo{public_key_param,fingerprint};
            println!("{}",serde_json::json!({"fingerprint":fingerprint.to_string(),"publicKeyHash":public.qfhash::<PsyHasher>().to_string()}));
        }else{println!("{fingerprint}");}
        return Ok(());
    }
    let config_index = if action == "register" { 3 } else { 4 };
    let guarded = matches!(action, "guarded-preflight" | "guarded-submit");
    ensure!(args.len() == config_index + 1 + usize::from(guarded), USAGE);
    let mut calls_sha256 = None;
    let calls = if action == "register" {
        None
    } else {
        let bytes = fs::read(&args[3])?;
        calls_sha256 = Some(format!("{:x}", Sha256::digest(&bytes)));
        let data: ContractCallData = serde_json::from_slice(&bytes)?;
        ensure!(
            data.contract_calls.len() + 1 == spec["tx_count"].as_u64().context("transaction count")? as usize && data.software_defined_call.inputs.len() == 13,
            "policy explicit call count and thirteen witness fields required"
        );
        validate_guard_order(&spec, &data)?;
        ensure!(
            data.software_defined_call.inputs[..]
                .iter()
                .all(|n| *n < (1u64 << 62)),
            "noncanonical U124 amount limb"
        );
        Some(data)
    };
    let config = PsyConfigGoldilocks::from_file(&args[config_index])?;
    let mut guard_sha256 = None;
    let guard: Option<SubmissionGuard> = if guarded {
        let bytes = fs::read(&args[5])?;
        guard_sha256 = Some(format!("{:x}", Sha256::digest(&bytes)));
        let g: SubmissionGuard = serde_json::from_slice(&bytes)?;
        let public_key_param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[F::ONE;4]}));
        let public=ZKPublicKeyInfo{public_key_param,fingerprint};
        g.validate(&spec, config.current_network_name(), &fingerprint.to_string(), &public.qfhash::<PsyHasher>().to_string())?;
        Some(g)
    } else { None };
    let mut network = config.get_current_network()?.clone();
    network.prove_proxy_url.clear();
    let mut session = WalletSession::new(&network).await?;
    if let Some(g) = &guard { g.check_current(&session.st_provider).await?; }
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
        "preflight" | "verified-submit" | "submit" | "guarded-preflight" | "guarded-submit" => {
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
            validate_endcap_binding(&endcap.core,&proof.public_inputs)?;
            if let Some(g) = &guard {
                ensure!(endcap.core.new_user_leaf.user_id.to_canonical_u64() == g.vault_id, "guard proven vault binding");
                g.check_current(&session.st_provider).await?;
            }
            println!(
                "{}",
                serde_json::json!({"fullUpsVerified":true,"submissionGuardVerified":guard.is_some(),"callsSha256":calls_sha256,"guardSha256":guard_sha256,"submitted":false,"marketId":spec["market_id"],"fingerprint":fingerprint.to_string(),"fee":fee,"endUserLeafHash":endcap.core.state_transition.end_user_leaf_hash.to_string()})
            );
            if matches!(action, "verified-submit" | "submit" | "guarded-submit") {
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
                // Re-read after the expensive proof and nonce checks. These
                // application checks do not lock upgrades on chain.
                if let Some(g) = &guard { g.check_current(&provider).await?; }
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

// All explicit calls, including activation's pre-guard prefix, must match the
// selected registered template before any RPC. UPS verification remains final.
fn validate_guard_order(spec:&serde_json::Value,data:&ContractCallData)->Result<()> {
 ensure!(data.software_defined_call.inputs.len()==13,"thirteen witness fields required");
 let branch=spec["branches"].as_array().context("branches")?.iter()
  .find(|b|b["branch"].as_u64()==data.software_defined_call.inputs.first().copied()).context("selected policy branch")?;
 let calls=branch["calls"].as_array().context("policy calls")?;
 ensure!(data.contract_calls.len()+1==calls.len(),"exact explicit policy call count");
 for(actual,expected)in data.contract_calls.iter().zip(calls){
  ensure!(Some(actual.contract_id)==expected["contract_id"].as_u64() && Some(actual.method_name.as_str())==expected["method_name"].as_str(),"policy call binding");
  let inputs=expected["inputs"].as_array().context("policy inputs")?.iter().map(|v|{
   if let Some(i)=v["witness"].as_u64(){data.software_defined_call.inputs.get(i as usize).copied().context("policy witness")}
   else{Ok(v["constant"].as_str().context("policy constant")?.parse::<u64>()?)}
  }).collect::<Result<Vec<_>>>()?;
  ensure!(actual.inputs==inputs,"policy input binding");
 }
 Ok(())
}

#[cfg(test)]
mod activation_tests {
 use super::*;
 #[test]
 fn activation_prefix_is_exact_before_any_rpc()->Result<()> {
  let root=std::env::var("NFT_MARKET_BUILD")?;
  let spec:serde_json::Value=serde_json::from_slice(&fs::read(format!("{root}/market/policy.json"))?)?;
  let samples:serde_json::Value=serde_json::from_slice(&fs::read(format!("{root}/market/policy-samples.json"))?)?;
  let sample=samples.as_array().context("samples")?.last().context("activation sample")?;
  let data:ContractCallData=serde_json::from_value(serde_json::json!({"contract_calls":&sample["calls"].as_array().context("calls")?[..9],"software_defined_call":{"inputs":sample["fields"]}}))?;
  validate_guard_order(&spec,&data)?;
  for slot in [0,1,2,3,4]{let mut bad=data.clone();bad.contract_calls[slot].inputs[0]+=1;assert!(validate_guard_order(&spec,&bad).is_err());}
  let mut bad=data.clone();bad.contract_calls[4].inputs[1]=2;assert!(validate_guard_order(&spec,&bad).is_err());
  let mut bad=data.clone();bad.contract_calls.swap(0,3);assert!(validate_guard_order(&spec,&bad).is_err());
  let mut bad=data.clone();bad.software_defined_call.inputs[0]=1;assert!(validate_guard_order(&spec,&bad).is_err());
  Ok(())
 }
 #[test]
 fn every_market_and_nft_branch_checks_every_explicit_call_before_rpc()->Result<()> {
  let root=std::env::var("U124_BUILD")?;
  let nft=std::env::var("NFT_MARKET_BUILD")?;
  let mut paths=vec![(format!("{nft}/market/policy.json"),format!("{nft}/market/policy-samples.json"))];
  for kind in ["amm","orderbook","bondingcurve"]{paths.push((format!("{root}/{kind}/policy.json"),format!("{root}/{kind}/policy-samples.json")));}
  for(spec_path,samples_path)in paths {
   let spec:serde_json::Value=serde_json::from_slice(&fs::read(spec_path)?)?;
   let samples:serde_json::Value=serde_json::from_slice(&fs::read(samples_path)?)?;
   for sample in samples.as_array().context("samples")? {
    let count=spec["tx_count"].as_u64().context("call count")? as usize-1;
    let data:ContractCallData=serde_json::from_value(serde_json::json!({"contract_calls":&sample["calls"].as_array().context("calls")?[..count],"software_defined_call":{"inputs":sample["fields"]}}))?;
    validate_guard_order(&spec,&data)?;
    for slot in 0..count {
     let mut bad=data.clone();bad.contract_calls[slot].contract_id+=1;assert!(validate_guard_order(&spec,&bad).is_err());
     let mut bad=data.clone();bad.contract_calls[slot].method_name.push_str("_changed");assert!(validate_guard_order(&spec,&bad).is_err());
     if !data.contract_calls[slot].inputs.is_empty(){let mut bad=data.clone();bad.contract_calls[slot].inputs[0]+=1;assert!(validate_guard_order(&spec,&bad).is_err());}
    }
    let mut bad=data.clone();bad.contract_calls.pop();assert!(validate_guard_order(&spec,&bad).is_err());
   }
  }
  assert_eq!(format!("{:x}",Sha256::digest(b"abc")),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  Ok(())
 }

}
