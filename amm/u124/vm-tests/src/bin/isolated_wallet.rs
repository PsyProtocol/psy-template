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
use std::{env, fs, io::{Write, BufRead}, os::unix::fs::OpenOptionsExt, path::Path, time::Instant};
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
    if reason == "Failed to parse JSON response: EOF while parsing a value at line 1 column 0" {"RPC_EMPTY_JSON"}
    else if reason.starts_with("error sending request for url (") && reason.ends_with(": operation timed out") {"RPC_SEND_TIMEOUT_UNKNOWN"}
    else if reason.contains("Connection error to https://") && reason.contains("error sending request") {"RPC_CONNECTION"}
    else if reason.contains("ahead of coordinator checkpoint") {"REALM_AHEAD_COORDINATOR"}
    else if reason.contains("Invalid checkpoint:") {"NON_MONOTONIC_SOURCE_CHECKPOINT"}
    else if reason.contains("not registered") {"REGISTRATION_LOOKUP_FAILED"}
    else if reason.contains("stale ordinary anchor") {"STALE_OWN_ANCHOR"}
    else if reason.contains("nonce not submittable") {"NONCE_NOT_SUBMITTABLE"}
    else {"REJECTED_REVIEW_REQUIRED"}
}
// Only retry public reads on recognizable transport/empty-body failures. A
// failed constraint, identity check, state witness or submission is never retried.
fn transient_public_read(reason: &str) -> bool {
    reason == "Failed to parse JSON response: EOF while parsing a value at line 1 column 0"
        || reason.starts_with("Connection error to https://")
        || reason.starts_with("Timeout error to https://")
}
async fn public_read<T, F, Fut>(mut read: F) -> Result<T>
where F: FnMut() -> Fut, Fut: std::future::Future<Output = Result<T>> {
    for attempt in 0..4u64 {
        match read().await {
            Ok(value) => return Ok(value),
            Err(error) => {
                if attempt == 3 || !transient_public_read(&format!("{error:#}")) { return Err(error); }
                tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt + 1))).await;
            }
        }
    }
    unreachable!()
}
fn ordinary_concurrency() -> Result<usize> {
    match env::var("PSY_ORDINARY_GUARD_MODE").as_deref() {
        Err(env::VarError::NotPresent) | Ok("parallel-v1") => Ok(4),
        Ok("serial-v1") => Ok(1),
        _ => anyhow::bail!("unknown ordinary guard scheduling mode"),
    }
}
struct OrdinaryMetrics {
    started: Instant, last: Instant, name: &'static str, phases: Vec<Value>,
}
impl OrdinaryMetrics {
    fn new(_startup: f64) -> Self { Self { started:Instant::now(), last:Instant::now(), name:"load-job", phases:vec![] } }
    fn finish(&mut self) {
        self.phases.push(json!({"phase":self.name,"milliseconds":self.last.elapsed().as_secs_f64()*1000.0}));
        self.last=Instant::now();
    }
    fn enter(&mut self, phase: &mut &'static str, next: &'static str) { self.finish(); self.name=next; *phase=next; }
}
// One process, one ordinary signer and one immutable network/dependency set.
// Only compiled circuits / immutable code resources and HTTP clients stay warm.
// Each job removes all transaction managers and starts a fresh SDK session.
struct PinnedOrdinary { files:Vec<(String,String)>, bindings:Value, public:String, input_sha256:Option<String> }
impl PinnedOrdinary {
    fn load(a:&[String]) -> Result<Self> {
        ensure!(a.len()==5,"serve-ordinary CONFIG SECRET DEPENDENCIES");
        let files=a[2..5].iter().map(|p|Ok((p.clone(),hash(&fs::read(p)?)))).collect::<Result<_>>()?;
        let secret:Value=serde_json::from_slice(&fs::read(&a[3])?)?;
        let pin=Self { files, bindings:serde_json::from_slice(&fs::read(&a[4])?)?, input_sha256:None,
            public:secret["public"]["publicKeyHash"].as_str().context("resident public identity missing")?.into() };
        pin.check_files()?;Ok(pin)
    }
    fn check_files(&self) -> Result<()> {
        for (path,digest) in &self.files { ensure!(hash(&fs::read(path)?) == *digest,"resident ordinary identity files changed"); }
        Ok(())
    }
    fn check_bindings(&self, bindings:&[LiveBinding]) -> Result<()> {
        let expected:Vec<LiveBinding> = serde_json::from_value(self.bindings.clone())?;
        for b in bindings {
            let found = expected.iter().find(|x|x.contract.contract_id==b.contract.contract_id)
                .context("unreviewed resident ordinary dependency")?;
            // LiveBinding intentionally exposes deserialization only. Compare
            // its complete reviewed fields, not ABI or contract ID alone.
            ensure!(found.contract.code_root==b.contract.code_root && found.contract.layout_root==b.contract.layout_root
                && found.contract.state_tree_height==b.contract.state_tree_height
                && found.function_tree_root==b.function_tree_root && found.layout_field_count==b.layout_field_count
                && found.layout_slot_count==b.layout_slot_count,"resident dependency identity mismatch");
        }
        Ok(())
    }
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all="camelCase")]
struct OrdinaryJob { id:String, action:String, input:String, input_sha256:String, out:String }
async fn serve(a:&[String], net:&psy_config::NetworkConfigGoldilocks, session:&mut WalletSession,
    startup_ms:f64, mut pin:PinnedOrdinary, phase:&mut &'static str) -> Result<()> {
    ensure!(a.len()==5,"serve-ordinary CONFIG SECRET DEPENDENCIES");
    pin.check_files()?;
    let deps:Vec<LiveBinding>=serde_json::from_value(pin.bindings.clone())?;
    let ids=deps.iter().map(|b|b.contract.contract_id).collect::<std::collections::BTreeSet<_>>();
    ensure!(ids.len()==deps.len() && ids.contains(&0),"resident dependency manifest coverage");
    println!("PSY_ORDINARY_SERVER {}",json!({"ready":true,"publicKeyHash":pin.public,"sessionConstructionMs":startup_ms}));
    std::io::stdout().flush()?;
    for line in std::io::stdin().lock().lines() {
        let line=line?; ensure!(line.len()<=32768,"ordinary job protocol bound");
        let job:OrdinaryJob=serde_json::from_str(&line)?;
        ensure!(["call","preflight"].contains(&job.action.as_str()) && !job.id.is_empty(),"ordinary resident actions only");
        ensure!(job.input_sha256.len()==64 && job.input_sha256.bytes().all(|c|c.is_ascii_hexdigit()),"ordinary job input digest");
        pin.input_sha256=Some(job.input_sha256);
        session.user_session_mgrs.clear();
        let args=vec![a[0].clone(),job.action,a[2].clone(),a[3].clone(),job.input,job.out.clone()];
        *phase="resident-job-start";
        let result=psy_template_u124_markets::runtime::contain(process(&args,net,session,0.0,Some(&pin),phase)).await;
        session.user_session_mgrs.clear();
        psy_template_u124_markets::prover_resources::checkpoint(psy_template_u124_markets::prover_resources::MemoryMode::selected()?,"ordinary-session-cleared");
        let code=match &result {
            Ok(())=>None,
            Err(psy_template_u124_markets::runtime::Failure::Rejected(e))=>Some(error_code(&format!("{e:#}"))),
            Err(_)=>Some("PANIC_REVIEW_REQUIRED"),
        };
        if let Some(reason)=code {
            let out=Path::new(&job.out);
            if out.is_dir() { save(&out.join("failure.json"),&json!({"ok":false,"phase":phase,"reasonCode":reason,"privateDataSuppressed":true,"broadcastMayHaveBeenAttempted":*phase=="broadcast-ordinary-ups","automaticRetry":false}))?; }
        }
        println!("PSY_ORDINARY_SERVER {}",json!({"id":job.id,"ok":code.is_none(),"phase":phase,"reasonCode":code}));
        std::io::stdout().flush()?;
        ensure!(result.is_ok(),"ordinary resident failed; reconcile exact request before explicit restart");
    }
    Ok(())
}
async fn run(phase: &mut &'static str) -> Result<()> {
    let memory_mode=psy_template_u124_markets::prover_resources::MemoryMode::selected()?;
    *phase = "load-testnet-config";
    let a = env::args().collect::<Vec<_>>();
    ensure!(
        a.len() >= 5,
        "create|register|preflight|call|deploy CONFIG SECRET INPUT_OR_PUBLIC [FRESH_OUT]"
    );
    // Freeze identity bytes before loading the config and constructing public
    // circuits; changes during cold construction must fail before readiness.
    let pinned=if a[1]=="serve-ordinary" {Some(PinnedOrdinary::load(&a)?)} else {None};
    let config = PsyConfigGoldilocks::from_file(&a[2])?;
    ensure!(
        config.current_network_name() == "sepolia",
        "isolated testnet only"
    );
    let mut net = config.get_current_network()?.clone();
    psy_template_u124_markets::live_guard::require_staging(&net)?;
    net.prove_proxy_url.clear();
    *phase = "initialize-testnet-wallet";
    let started = Instant::now();
    let mut session = WalletSession::new(&net).await?;
    let startup_ms = started.elapsed().as_secs_f64() * 1000.0;
    eprintln!("PSY_PROVER_LIFECYCLE {}",json!({"event":"session-built","pid":std::process::id(),"sessionConstructionMilliseconds":startup_ms,"memoryMode":memory_mode.name()}));
    psy_template_u124_markets::prover_resources::checkpoint(memory_mode,"ordinary-circuits-built");
    if a[1] == "serve-ordinary" {
        return serve(&a, &net, &mut session, startup_ms, pinned.context("resident identity not frozen")?, phase).await;
    }
    process(&a, &net, &mut session, startup_ms, None, phase).await
}
async fn process(a: &[String], net: &psy_config::NetworkConfigGoldilocks, session: &mut WalletSession,
    startup_ms: f64, pinned: Option<&PinnedOrdinary>, phase: &mut &'static str) -> Result<()> {
    let mut metrics = OrdinaryMetrics::new(startup_ms);
    let result = operation(a, net, session, pinned, phase, &mut metrics).await;
    metrics.finish();
    if a.len() == 6 && Path::new(&a[5]).is_dir() {
        save(&Path::new(&a[5]).join("metrics.json"), &json!({
            "schema":"ordinary-phases-v1", "startupMilliseconds":startup_ms,
            "resident":pinned.is_some(), "guardConcurrency":ordinary_concurrency()?,
            "phases":metrics.phases, "jobMilliseconds":metrics.started.elapsed().as_secs_f64()*1000.0,
            "ok":result.is_ok(), "lastPhase":phase,
            "scope":"one actual ordinary job, separate process circuit construction; proof phase includes SDK RPC and recursion; no TPS claim"
        }))?;
    }
    result
}
async fn operation(a: &[String], net: &psy_config::NetworkConfigGoldilocks, session: &mut WalletSession,
    pinned: Option<&PinnedOrdinary>, phase: &mut &'static str, metrics: &mut OrdinaryMetrics) -> Result<()> {
    if let Some(pin) = pinned { pin.check_files()?; }

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
    metrics.enter(phase, "load-own-isolated-identity");
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
    if let Some(pin) = pinned { ensure!(public.to_string()==pin.public,"resident ordinary signer changed"); }
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
        metrics.enter(phase, "register-testnet-user");
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
        metrics.enter(phase, "prepare-and-verify-initial-layout");
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
        metrics.enter(phase, "broadcast-new-contract");
        let receipt = session.st_provider.deploy_contract::<F>(request).await?;
        save(&out.join("receipt.json"), &json!({"receipt":receipt}))?;
        println!("initial deployment submitted; reconcile saved receipt");
        return Ok(());
    }
    ensure!(
        ["call", "preflight"].contains(&a[1].as_str()),
        "known isolated wallet action"
    );
    metrics.enter(phase, "verify-ordinary-input-and-dependencies");
    let bytes = fs::read(&a[4])?;
    if let Some(pin)=pinned { ensure!(pin.input_sha256.as_deref()==Some(hash(&bytes).as_str()),"ordinary job input does not match frozen request"); }
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
    if let Some(pin) = pinned { pin.check_bindings(&bindings)?; }
    psy_template_u124_markets::guard_reads::checked(&bindings, ordinary_concurrency()?, |c| async {
        public_read(|| c.check(&session.st_provider)).await
    }).await?;
    metrics.enter(phase, "start-ordinary-session");
    let key = session.add_user(private, pk.fingerprint).await?;
    session.start_session(key).await?;
    metrics.enter(phase, "prove-ordinary-calls");
    session
        .prove_contract_call(key, data.contract_calls)
        .await?;
    metrics.enter(phase, "prove-ordinary-signature-endcap");
    let (endcap, proof) = session.sign(key, data.software_defined_call).await?;
    // sign returns owned final inputs/proof. Release transaction-only managers
    // before verification/RPC; immutable wallet circuits remain live. Every
    // request still verifies the complete proof and its exact end-cap binding.
    if psy_template_u124_markets::prover_resources::MemoryMode::selected()?.release() { session.user_session_mgrs.clear(); }
    psy_template_u124_markets::prover_resources::checkpoint(psy_template_u124_markets::prover_resources::MemoryMode::selected()?,"ordinary-signed");
    metrics.enter(phase, "verify-ordinary-full-proof");
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
    metrics.enter(phase, "verify-current-ordinary-state");
    let provider = session.st_provider.with_user_id_owned(user);
    let cp = public_read(|| provider.get_latest_block_state()).await?.checkpoint_id;
    ensure!(
        cp <= valid_until,
        "ordinary broadcast window expired; regenerate from current state"
    );
    let (current, status) = if ordinary_concurrency()? == 1 {
        (public_read(|| provider.get_user_leaf_data(cp, user)).await?,
         public_read(|| provider.get_tx_status(user, nonce)).await?)
    } else {
        // Both are public reads. Drain both before rejecting; no send on error.
        let (leaf, status) = futures_util::future::join(
            public_read(|| provider.get_user_leaf_data(cp, user)),
            public_read(|| provider.get_tx_status(user, nonce)),
        ).await;
        (leaf?, status?)
    };
    ensure!(
        endcap.core.state_transition.start_user_leaf_hash == QHashOut::ZERO
            || current.qfhash::<PsyHasher>() == endcap.core.state_transition.start_user_leaf_hash,
        "stale ordinary anchor"
    );
    ensure!(
        matches!(
            status,
            TxStatus::Submittable
        ),
        "ordinary nonce not submittable"
    );
    psy_template_u124_markets::guard_reads::checked(&bindings, ordinary_concurrency()?, |c| async {
        public_read(|| c.check(&provider)).await
    }).await?;
    ensure!(hash(&fs::read(&a[4])?) == hash(&bytes), "ordinary input changed while proving");
    if let Some(pin) = pinned { pin.check_files()?; }
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
    metrics.enter(phase, "broadcast-ordinary-ups");
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
    fn resident_identity_files_and_every_dependency_endpoint_are_bound() -> Result<()> {
        let dir=env::temp_dir().join(format!("ordinary-pins-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos()));
        fs::create_dir(&dir)?;
        let binding=json!({"contract":{"contractId":3,"codeRoot":"0".repeat(64),"layoutRoot":"1".repeat(64),"stateTreeHeight":31},"functionTreeRoot":"2".repeat(64),"layoutFieldCount":14,"layoutSlotCount":100});
        fs::write(dir.join("config"),b"frozen-config")?;fs::write(dir.join("wallet"),serde_json::to_vec(&json!({"public":{"publicKeyHash":"a".repeat(64)}}))?)?;
        fs::write(dir.join("deps"),serde_json::to_vec(&vec![binding.clone()])?)?;
        let args=vec!["binary".into(),"serve-ordinary".into(),dir.join("config").to_string_lossy().into(),dir.join("wallet").to_string_lossy().into(),dir.join("deps").to_string_lossy().into()];
        let pin=PinnedOrdinary::load(&args)?;
        pin.check_bindings(&serde_json::from_value::<Vec<LiveBinding>>(json!([binding.clone()]))?)?;
        for (section,key,value) in [
            (true,"codeRoot",json!("9".repeat(64))),(true,"layoutRoot",json!("9".repeat(64))),
            (true,"stateTreeHeight",json!(30)),(true,"contractId",json!(4)),
            (false,"functionTreeRoot",json!("9".repeat(64))),(false,"layoutFieldCount",json!(17)),(false,"layoutSlotCount",json!(101)),
        ] {
            let mut changed=binding.clone();if section{changed["contract"][key]=value;}else{changed[key]=value;}
            assert!(pin.check_bindings(&serde_json::from_value::<Vec<LiveBinding>>(json!([changed]))?).is_err());
        }
        for file in ["config","wallet","deps"] {
            let path=dir.join(file);let original=fs::read(&path)?;fs::write(&path,b"changed")?;
            assert!(pin.check_files().is_err());fs::write(path,original)?;pin.check_files()?;
        }
        fs::remove_dir_all(dir)?;Ok(())
    }
    #[test]
    fn only_public_transport_failures_are_retryable() {
        assert!(transient_public_read("Failed to parse JSON response: EOF while parsing a value at line 1 column 0"));
        for reason in ["assertion failed", "stale ordinary anchor", "nonce not submittable", "RPC returned invalid proof", "Failed to parse JSON response: wrong type", "broadcast result unknown"] { assert!(!transient_public_read(reason)); }
    }
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
