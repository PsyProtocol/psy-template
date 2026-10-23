//! Isolated testnet ordinary wallet. New local secrets only; no old wallet import.
//! Save and verify complete requests before a single broadcast attempt.
use anyhow::{ensure, Context, Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F, types::PrimeField64};
use psy_client_common::{args::ContractCallData, data::qhashout::QHashOut};
use psy_client_data::{
    config::store_config::{PsyHasher, C, D},
    traits::qdatastore::qmetadata::QMetaDataStoreReaderSync,
};
use psy_config::{PsyConfigGoldilocks, PSY_NETWORK_MAGIC};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_prover::session::session::WalletSession;
use psy_provider::{
    provider::QUserRpcProvider,
    request::{QDeployContractRPCRequest, QRegisterUserRPCRequest, QSubmitEndCapRPCRequest},
    session::TxStatus,
};
use psy_template_u124_markets::{
    layout_preflight, live_guard::LiveBinding, proof_binding::validate_endcap_binding,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, fs, io::Write, os::unix::fs::OpenOptionsExt, path::Path};
fn save(path: &Path, value: &impl serde::Serialize) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(value)?;
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)?;
    f.write_all(&bytes)?;
    f.write_all(b"\n")?;
    f.sync_all()?;
    fs::File::open(
        path.parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new(".")),
    )?
    .sync_all()?;
    Ok(())
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
// Return only reviewed static codes. Never print an arbitrary SDK error chain:
// witness/key values can appear in lower-level diagnostics.
fn error_code(reason: &str) -> &'static str {
    if reason.contains("Connection error to https://") && reason.contains("error sending request") {"RPC_CONNECTION"}
    else if reason.contains("ahead of coordinator checkpoint") {"REALM_AHEAD_COORDINATOR"}
    else if reason.contains("Invalid checkpoint:") {"NON_MONOTONIC_SOURCE_CHECKPOINT"}
    else if reason.contains("not registered") {"REGISTRATION_LOOKUP_FAILED"}
    else if reason.contains("stale ordinary anchor") {"STALE_OWN_ANCHOR"}
    else if reason.contains("nonce not submittable") {"NONCE_NOT_SUBMITTABLE"}
    else {"REJECTED_REVIEW_REQUIRED"}
}
async fn run(phase: &mut &'static str) -> Result<()> {
    *phase = "load-testnet-config";
    let a = env::args().collect::<Vec<_>>();
    ensure!(
        a.len() >= 5,
        "create|register|preflight|call|deploy CONFIG SECRET INPUT_OR_PUBLIC [FRESH_OUT]"
    );
    let config = PsyConfigGoldilocks::from_file(&a[2])?;
    ensure!(
        config.current_network_name() == "sepolia",
        "isolated testnet only"
    );
    let mut net = config.get_current_network()?.clone();
    psy_template_u124_markets::live_guard::require_staging(&net)?;
    net.prove_proxy_url.clear();
    *phase = "initialize-testnet-wallet";
    let mut session = WalletSession::new(&net).await?;
    if a[1] == "create" {
        ensure!(a.len() == 5, "create CONFIG FRESH_SECRET FRESH_PUBLIC");
        let k = session.get_random_keypair().await?;
        let public = json!({"schema":"isolated-market-wallet-v1","network":"sepolia","networkMagic":PSY_NETWORK_MAGIC.to_string(),"publicKeyHash":k.public_key.qfhash::<PsyHasher>().to_string(),"fingerprint":k.public_key.fingerprint.to_string(),"publicKeyParam":k.public_key.public_key_param.to_string()});
        save(
            Path::new(&a[3]),
            &json!({"schema":"isolated-market-wallet-v1","network":"sepolia","networkMagic":PSY_NETWORK_MAGIC.to_string(),"privateKey":k.private_key.to_string(),"public":public}),
        )?;
        save(Path::new(&a[4]), &public)?;
        println!("{}", public);
        return Ok(());
    }
    let secret: Value = serde_json::from_slice(&fs::read(&a[3])?)?;
    ensure!(
        secret["schema"] == "isolated-market-wallet-v1"
            && secret["network"] == "sepolia"
            && secret["networkMagic"] == PSY_NETWORK_MAGIC.to_string(),
        "isolated wallet identity/network schema"
    );
    *phase = "load-own-isolated-identity";
    let private: QHashOut<F> = secret["privateKey"]
        .as_str()
        .context("own isolated wallet missing key")?
        .parse()
        .map_err(|_| anyhow::anyhow!("invalid isolated key encoding"))?;
    let pk = session.get_zk_public_key(private).await?;
    let public = pk.qfhash::<PsyHasher>();
    ensure!(
        public.to_string() == secret["public"]["publicKeyHash"],
        "isolated wallet public identity mismatch"
    );
    if a[1] == "register" {
        ensure!(a.len() == 5, "register CONFIG SECRET FRESH_OUT");
        let out = Path::new(&a[4]);
        fs::create_dir(out)?;
        fs::File::open(
            out.parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(Path::new(".")),
        )?
        .sync_all()?;
        let existing = session
            .st_provider
            .get_user_ids_for_public_key(public)
            .await?;
        ensure!(
            existing.is_empty(),
            "identity already registered; reconcile by public identity"
        );
        let request = QRegisterUserRPCRequest { public_key: pk };
        save(&out.join("request.json"), &request)?;
        save(
            &out.join("intent.json"),
            &json!({"action":"register","publicKey":pk,"networkMagic":PSY_NETWORK_MAGIC.to_string()}),
        )?;
        *phase = "register-testnet-user";
        let receipt = session.st_provider.register_user(request).await?;
        save(
            &out.join("receipt.json"),
            &json!({"publicKeyHash":public.to_string(),"receipt":receipt,"submitted":true,"included":false}),
        )?;
        println!("submitted registration for isolated public key {public}");
        return Ok(());
    }
    ensure!(
        a.len() == 6,
        "preflight|call|deploy CONFIG SECRET INPUT FRESH_OUT"
    );
    let out = Path::new(&a[5]);
    fs::create_dir(out)?;
    fs::File::open(
        out.parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new(".")),
    )?
    .sync_all()?;
    if a[1] == "deploy" {
        let artifact: psy_compiler::output::serialize::CompilationArtifact =
            serde_json::from_slice(&fs::read(&a[4])?)?;
        *phase = "prepare-and-verify-initial-layout";
        let prepared = layout_preflight::prepare_initial(artifact.clone(), public)?;
        let mut report = layout_preflight::verify_initial(&artifact, &prepared, public)?;
        let function_root = prepared
            .deploy_contract
            .clone()
            .into_with_whitelist_root::<PsyHasher>()?
            .function_whitelist_root;
        report["functionTreeRoot"] = json!(function_root.to_string());
        save(&out.join("preflight.json"), &report)?;
        let request = QDeployContractRPCRequest {
            deploy_contract: prepared,
        };
        save(&out.join("request.json"), &request)?;
        // Long offline layout proving can outlive an idle HTTP connection.
        // Retry this PUBLIC READ only; the deployment POST below stays single.
        let mut read_attempt = 0;
        let before = loop {
            match session.st_provider.get_latest_block_state().await {
                Ok(state) => break state,
                Err(error) => {
                    read_attempt += 1;
                    if read_attempt < 3 && error_code(&format!("{error:#}")) == "RPC_CONNECTION" {
                        eprintln!("{}", json!({"publicReadRetry":read_attempt,"method":"latest-deployment-state","mutationRetry":false}));
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    } else { return Err(error); }
                }
            }
        };
        save(&out.join("before.json"), &before)?;
        save(
            &out.join("intent.json"),
            &json!({"action":"initial-deploy-only","deployer":public.to_string(),"artifactSha256":hash(&fs::read(&a[4])?)}),
        )?;
        *phase = "broadcast-new-contract";
        let receipt = session.st_provider.deploy_contract::<F>(request).await?;
        save(&out.join("receipt.json"), &json!({"receipt":receipt}))?;
        println!("initial deployment submitted; reconcile saved receipt");
        return Ok(());
    }
    ensure!(
        ["call", "preflight"].contains(&a[1].as_str()),
        "known isolated wallet action"
    );
    *phase = "verify-ordinary-input-and-dependencies";
    let bytes = fs::read(&a[4])?;
    let input: Value = serde_json::from_slice(&bytes)?;
    let valid_until = input["validUntilCheckpoint"]
        .as_u64()
        .context("explicit ordinary broadcast checkpoint bound required")?;
    ensure!(valid_until < (1u64 << 32), "ordinary checkpoint bound");
    let data: ContractCallData = serde_json::from_value(input["calls"].clone())?;
    ensure!(
        data.software_defined_call.inputs.is_empty()
            && !data.contract_calls.is_empty()
            && data.contract_calls.len() <= 16,
        "ordinary test wallet exact call bounds"
    );
    ensure!(data.contract_calls.iter().all(|c|c.contract_id<16777216&&c.inputs.iter().all(|n|*n<18446744069414584321)),"canonical ordinary call fields");
    let bindings: Vec<LiveBinding> = serde_json::from_value(input["contracts"].clone())?;
    let mut needed = std::collections::BTreeSet::from([0]);
    needed.extend(data.contract_calls.iter().map(|c| c.contract_id));
    let provided = bindings
        .iter()
        .map(|c| c.contract.contract_id)
        .collect::<std::collections::BTreeSet<_>>();
    ensure!(
        needed == provided && provided.len() == bindings.len(),
        "exact ordinary call dependency coverage"
    );
    for c in &bindings {
        c.check(&session.st_provider).await?;
    }
    *phase = "start-ordinary-session";
    let key = session.add_user(private, pk.fingerprint).await?;
    session.start_session(key).await?;
    *phase = "prove-ordinary-calls";
    session
        .prove_contract_call(key, data.contract_calls)
        .await?;
    *phase = "prove-ordinary-signature-endcap";
    let (endcap, proof) = session.sign(key, data.software_defined_call).await?;
    let proof_profile = psy_template_u124_markets::live_guard::verify_ups_with_session_manager(
        session.wallet.random_circuit_manager().as_ref(), &proof,
    ).await?;
    validate_endcap_binding(&endcap.core, &proof.public_inputs)?;
    ensure!(
        endcap.core.stats.guta_fees_collected.to_canonical_u64()
            + endcap.core.stats.da_fees_collected.to_canonical_u64()
            <= 2_000_000_000,
        "ordinary isolated fee cap"
    );
    let user = endcap.core.new_user_leaf.user_id.to_canonical_u64();
    let nonce = endcap.core.new_user_leaf.nonce.to_canonical_u64();
    let end = endcap.core.state_transition.end_user_leaf_hash;
    *phase = "verify-current-ordinary-state";
    let provider = session.st_provider.with_user_id_owned(user);
    let cp = provider.get_latest_block_state().await?.checkpoint_id;
    ensure!(
        cp <= valid_until,
        "ordinary broadcast window expired; regenerate from current state"
    );
    let current = provider.get_user_leaf_data(cp, user).await?;
    ensure!(
        endcap.core.state_transition.start_user_leaf_hash == QHashOut::ZERO
            || current.qfhash::<PsyHasher>() == endcap.core.state_transition.start_user_leaf_hash,
        "stale ordinary anchor"
    );
    ensure!(
        matches!(
            provider.get_tx_status(user, nonce).await?,
            TxStatus::Submittable
        ),
        "ordinary nonce not submittable"
    );
    for c in &bindings {
        c.check(&provider).await?;
    }
    save(
        &out.join("preflight.json"),
        &json!({"inputSha256":hash(&bytes),"fullUpsVerified":true,"proofProfile":proof_profile,"userId":user,"nonce":nonce,"endUserLeafHash":end.to_string(),"core":endcap.core,"broadcast":false}),
    )?;
    let request = QSubmitEndCapRPCRequest {
        user_ec_input: endcap,
        proof: bincode::serialize(&proof)?,
    };
    save(&out.join("request.json"), &request)?;
    if a[1] == "preflight" {
        println!("verified isolated ordinary UPS {end}; not submitted");
        return Ok(());
    }
    save(
        &out.join("intent.json"),
        &json!({"status":"broadcast_intent","userId":user,"nonce":nonce,"endUserLeafHash":end.to_string(),"retryAllowed":false}),
    )?;
    *phase = "broadcast-ordinary-ups";
    let receipt = psy_template_u124_markets::live_rpc::submit(&net, request, out).await?;
    save(
        &out.join("receipt.json"),
        &json!({"submitted":true,"included":false,"receipt":receipt,"endUserLeafHash":end.to_string()}),
    )?;
    println!("submitted isolated ordinary UPS {end}");
    Ok(())
}
#[tokio::main]
async fn main() -> std::process::ExitCode {
    std::panic::set_hook(Box::new(|_| {}));
    let mut phase = "start";
    match psy_template_u124_markets::runtime::contain(run(&mut phase)).await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(failure) => {
            let (code,digest)=match failure {
                psy_template_u124_markets::runtime::Failure::Rejected(error)=>{let reason=format!("{error:#}");(error_code(&reason),hash(reason.as_bytes()))},
                psy_template_u124_markets::runtime::Failure::Panic(_)=>("PANIC_REVIEW_REQUIRED",hash(b"suppressed panic")),
            };
            let args=env::args().collect::<Vec<_>>();
            if args.len()==6 && ["preflight","call","deploy"].contains(&args[1].as_str()) {
                let out=Path::new(&args[5]);
                if out.is_dir() {
                    let _=save(&out.join("failure.json"),&json!({"ok":false,"phase":phase,"reasonCode":code,"suppressedErrorSha256":digest,"privateDataSuppressed":true,"broadcastMayHaveBeenAttempted":phase=="broadcast-ordinary-ups"||phase=="broadcast-new-contract","automaticRetry":false}));
                }
            }
            eprintln!("{}",json!({"ok":false,"phase":phase,"reasonCode":code,"privateDataSuppressed":true,"automaticRetry":false}));
            eprintln!("isolated wallet stopped during {phase}; inspect saved intent and reconcile before retry; private data suppressed");
            std::process::ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostics_are_static_codes_without_private_error_text() {
        for (reason,code) in [
            ("Connection error to https://test.invalid: error sending request privateKey=do-not-print", "RPC_CONNECTION"),
            ("realm latest checkpoint 20 is ahead of coordinator checkpoint 19", "REALM_AHEAD_COORDINATOR"),
            ("Invalid checkpoint: new checkpoint 1 must be > last user_leaf checkpoint 1", "NON_MONOTONIC_SOURCE_CHECKPOINT"),
            ("User confidential-witness not registered", "REGISTRATION_LOOKUP_FAILED"),
            ("unknown confidential-witness privateKey=do-not-print", "REJECTED_REVIEW_REQUIRED"),
        ] {assert_eq!(error_code(reason),code);assert!(!error_code(reason).contains("privateKey"));}
    }
}
