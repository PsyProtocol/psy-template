//! Explicit compact key path. Never changes the generic SDK exact-count route.
//! Complete logical policy + actual UPS stack/session proof verified before send.
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{hash_types::HashOut, poseidon::PoseidonHash},
};
use psy_client_common::{args::ContractCallData, data::qhashout::QHashOut};
use psy_client_data::{
    config::store_config::PsyHasher,
    dpn::{proving_session::DPNProvingSessionCompactMethodCall, sd_key::SDKeyTransactionInfo},
    qstore::controllers::proving_session::PsyReadLocalProvingSessionStore,
    traits::qdatastore::qmetadata::QMetaDataStoreReaderSync,
};
use psy_config::{PsyConfigGoldilocks, PSY_NETWORK_MAGIC};
use psy_crypto::{hash::traits::qhashable::QFieldHashable, signature::zk::data::ZKPublicKeyInfo};
use psy_prover::session::session::WalletSession;
use psy_provider::{
    provider::QUserRpcProvider,
    request::{QRegisterUserRPCRequest, QSubmitEndCapRPCRequest},
    session::TxStatus,
};
use psy_template_u124_markets::{
    batch_compact, batch_policy,
    live_guard::{require_staging, LiveBinding},
    proof_binding::validate_endcap_binding,
    submission_guard::SubmissionGuard,
};
use psy_ups_circuit::signature::sd_key::{compute_tx_stack_hash, get_sd_key_public_key_param};
use psy_vm::ups::sd_key::{SDKeyCircuitWitnessInput, SDKeySessionContext};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, fs, io::{Write,BufRead}, path::Path};
#[path = "../compact_prepared.rs"]
mod compact_prepared;
#[path = "../compact_benchmark.rs"]
mod compact_benchmark;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Guard {
    pub identity: SubmissionGuard,
    pub dependencies: Vec<LiveBinding>,
    pub valid_until_checkpoint: u64,
}
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn save(path: &Path, value: &impl serde::Serialize) -> Result<()> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(&serde_json::to_vec_pretty(value)?)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    fs::File::open(
        path.parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new(".")),
    )?
    .sync_all()?;
    Ok(())
}
async fn check_once(guard: &Guard, s: &WalletSession) -> Result<()> {
    guard.identity.check_current(&s.st_provider).await.context("live vault registration/code/layout guard")?;
    for b in &guard.dependencies {
        b.check(&s.st_provider).await.with_context(||format!("live dependency {}",b.contract.contract_id))?;
    }
    Ok(())
}
async fn check(guard: &Guard, s: &WalletSession) -> Result<()> {
    // Only these GET-style public identity/dependency reads may repeat. A
    // changed binding fails immediately; proving and submit are never retried.
    for attempt in 0..3 {
        match check_once(guard,s).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                let reason=format!("{error:#}");
                if attempt<2 && reason.contains("Connection error to https://") && reason.contains("error sending request for url") {
                    eprintln!("{}",json!({"publicGuardReadRetry":attempt+1,"reason":reason,"mutationRetry":false}));
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                } else {return Err(error);}
            }
        }
    }
    unreachable!("bounded read guard retry returns on its last attempt")
}
async fn run(phase: &mut &'static str) -> Result<()> {
    let started = std::time::Instant::now();
    *phase = "build-compact-key";
    let a = env::args().collect::<Vec<_>>();
    ensure!(a.len()>=3,"identity POLICY | register POLICY CONFIG FRESH_OUT | preflight/submit POLICY CONFIG CALLS GUARD FRESH_OUT");
    compact_benchmark::requested(&a[1])?;
    let spec: Value = serde_json::from_slice(&fs::read(&a[2])?)?;
    let circuit = batch_compact::build(&spec)?;
    let key_ms = started.elapsed().as_millis();
    let fp = circuit.get_fingerprint();
    let private = QHashOut(HashOut {
        elements: [F::ONE; 4],
    });
    let param = get_sd_key_public_key_param(&private);
    let public = ZKPublicKeyInfo {
        public_key_param: param,
        fingerprint: fp,
    };
    let hash = public.qfhash::<PsyHasher>();
    if a[1] == "identity" {
        ensure!(a.len() == 3, "identity args");
        println!(
            "{}",
            json!({"profile":"compact-v1","fingerprint":fp.to_string(),"publicKeyHash":hash.to_string(),"publicKeyParam":param.to_string()})
        );
        return Ok(());
    }
    let config = PsyConfigGoldilocks::from_file(&a[3])?;
    ensure!(
        config.current_network_name() == "sepolia",
        "isolated staging only"
    );
    let mut net = config.get_current_network()?.clone();
    require_staging(&net)?;
    ensure!(
        spec["config"]["networkMagic"]
            .as_str()
            .context("policy network magic")?
            .parse::<u64>()?
            == PSY_NETWORK_MAGIC,
        "policy domain differs"
    );
    net.prove_proxy_url.clear();
    if ["broadcast-prepared", "verify-prepared"].contains(&a[1].as_str()) {
        return compact_prepared::broadcast(&a, &spec, fp, hash, &net, phase).await;
    }
    *phase = "initialize-staging-session";
    let session_started = std::time::Instant::now();
    let mut session = WalletSession::new(&net).await?;
    let session_ms = session_started.elapsed().as_millis();
    session.wallet.insert_sd_key_circuit(fp, circuit);
    if a[1] == "register" {
        ensure!(a.len() == 5, "register POLICY CONFIG FRESH_OUT");
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
            .get_user_ids_for_public_key(hash)
            .await?;
        ensure!(
            existing.is_empty(),
            "compact identity already registered; reconcile by public identity"
        );
        let request = QRegisterUserRPCRequest { public_key: public };
        save(&out.join("request.json"), &request)?;
        save(
            &out.join("intent.json"),
            &json!({"profile":"compact-v1","publicKey":public,"publicKeyHash":hash.to_string()}),
        )?;
        let receipt = session.st_provider.register_user(request).await?;
        save(
            &out.join("receipt.json"),
            &json!({"publicKeyHash":hash.to_string(),"receipt":receipt,"submitted":true,"included":false}),
        )?;
        println!("submitted compact public market registration {hash}");
        return Ok(());
    }
    if a[1] == "serve-preflight" {
        ensure!(a.len()==4,"serve-preflight POLICY CONFIG");
        println!("PSY_COMPACT_SERVER {}",json!({"ready":true,"keyConstructionMs":key_ms,"sessionConstructionMs":session_ms}));std::io::stdout().flush()?;
        // One immutable network/policy per process; never carries user session
        // state across requests. Only circuit resources remain warm.
        for line in std::io::stdin().lock().lines(){
            let job:ResidentJob=serde_json::from_str(&line?)?;
            let args=vec![a[0].clone(),"preflight".into(),a[2].clone(),a[3].clone(),job.calls,job.guard,job.out.clone()];
            let mut job_phase="resident-preflight-start";
            let result=psy_template_u124_markets::runtime::contain(process_action(&args,&spec,fp,hash,param,private,&net,&mut session,0,0,std::time::Instant::now(),&mut job_phase)).await;
            session.user_session_mgrs.remove(&hash);
            let error=match result {Ok(())=>None,Err(psy_template_u124_markets::runtime::Failure::Rejected(e))=>Some(format!("{e:#}")),Err(psy_template_u124_markets::runtime::Failure::Panic(code))=>Some(code.to_owned())};
            if let Some(reason)=&error{let dir=Path::new(&job.out);if dir.is_dir(){save(&dir.join("failure.json"),&json!({"ok":false,"phase":job_phase,"reason":reason,"broadcastMayHaveBeenAttempted":false,"automaticRetry":false}))?;}}
            println!("PSY_COMPACT_SERVER {}",json!({"id":job.id,"ok":error.is_none(),"error":error,"phase":job_phase}));std::io::stdout().flush()?;
            ensure!(error.is_none(),"resident proof rejected; explicit restart required");
        }
        return Ok(());
    }
    process_action(&a,&spec,fp,hash,param,private,&net,&mut session,key_ms,session_ms,started,phase).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResidentJob {id:String,calls:String,guard:String,out:String}
#[allow(clippy::too_many_arguments)]
async fn process_action(a:&[String],spec:&Value,fp:QHashOut<F>,hash:QHashOut<F>,param:QHashOut<F>,private:QHashOut<F>,net:&psy_config::NetworkConfigGoldilocks,session:&mut WalletSession,key_ms:u128,session_ms:u128,started:std::time::Instant,phase:&mut &'static str)->Result<()> {
    ensure!(
        a.len() == 7 && ["preflight", "submit"].contains(&a[1].as_str()),
        "explicit compact action args"
    );
    *phase = "verify-compact-request";
    let out = Path::new(&a[6]);
    fs::create_dir(out)?;
    fs::File::open(
        out.parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new(".")),
    )?
    .sync_all()?;
    let bytes = fs::read(&a[4])?;
    let mut data: ContractCallData = serde_json::from_slice(&bytes)?;
    ensure!(
        data.software_defined_call.inputs.len() == 74,
        "compact witness length"
    );
    let mut fields = data.software_defined_call.inputs.clone();
    if fields[73] == 0 {
        fields[73] = 1_000_000_000;
    }
    let expected = batch_compact::calls(&spec, &fields)?;
    ensure!(
        serde_json::to_value(&data.contract_calls)?
            == serde_json::to_value(&expected[..expected.len() - 1])?,
        "complete canonical compact call list"
    );
    let guard_bytes = fs::read(&a[5])?;
    let guard: Guard = serde_json::from_slice(&guard_bytes)?;
    ensure!(
        guard.valid_until_checkpoint < (1u64 << 32),
        "live checkpoint bound"
    );
    if fields[0] == 1 {
        ensure!(
            guard.valid_until_checkpoint <= fields[3],
            "commit broadcast after declared expiry"
        );
    }
    guard.identity.validate(
        &spec,
        "sepolia",
        &fp.to_string(),
        &hash.to_string(),
    )?;
    let required = guard
        .identity
        .contracts
        .iter()
        .map(|c| c.contract_id)
        .collect::<std::collections::BTreeSet<_>>();
    let bound = guard
        .dependencies
        .iter()
        .map(|c| c.contract.contract_id)
        .collect::<std::collections::BTreeSet<_>>();
    ensure!(
        required == bound && bound.len() == guard.dependencies.len(),
        "complete live whitelist dependencies"
    );
    *phase = "verify-live-identity-and-dependencies";
    check(&guard, &session).await?;
    *phase = "start-compact-session";
    let key = session.add_user(private, fp).await?;
    ensure!(key == hash, "compact public identity");
    let source_pin=compact_benchmark::requested(&a[1])?;
    let pin_started=std::time::Instant::now();
    if let Some(cp)=source_pin{compact_benchmark::start_at(&session,key,guard.identity.vault_id,cp).await?;}else{session.start_session(key).await?;}
    let source_pin_ms=if source_pin.is_some(){pin_started.elapsed().as_millis()}else{0};
    *phase = "prove-compact-calls";
    let calls_started = std::time::Instant::now();
    session
        .prove_contract_call(key, data.contract_calls)
        .await?;
    let calls_ms = calls_started.elapsed().as_millis();
    let mut manager = session
        .user_session_mgrs
        .get_mut(&key)
        .context("compact session")?;
    let nonce = manager.require_lps()?.get_nonce();
    let burn = manager
        .require_lps()?
        .last_transaction_record()
        .call_data
        .call_data
        .inputs[0]
        .to_canonical_u64();
    ensure!(
        (1_000_000_000..=1_000_100_000).contains(&burn) && (burn - 1_000_000_000) % 1000 == 0,
        "compact burn budget"
    );
    ensure!(
        data.software_defined_call.inputs[73] == 0 || data.software_defined_call.inputs[73] == burn,
        "fee witness differs"
    );
    data.software_defined_call.inputs[73] = burn;
    fields[73] = burn;
    let logical = batch_policy::expected_calls(&spec, &fields)?;
    let all = spec["branches"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|b| b["calls"].as_array().unwrap())
        .chain([&spec["noop"], &spec["expire"]])
        .collect::<Vec<_>>();
    let infos = logical
        .iter()
        .map(|c| {
            let d = all
                .iter()
                .find(|d| {
                    d["contract_id"] == c["contract_id"] && d["method_name"] == c["method_name"]
                })
                .context("logical call descriptor")?;
            Ok(
                DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(
                    f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),
                    f(c["contract_id"].as_u64().unwrap()),
                    f(d["method_id"].as_u64().unwrap()),
                    &c["inputs"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|n| f(n.as_u64().unwrap()))
                        .collect::<Vec<_>>(),
                )
                .into(),
            )
        })
        .collect::<Result<Vec<SDKeyTransactionInfo<F>>>>()?;
    let selected = infos
        .iter()
        .filter(|c| {
            c.contract_id != f(spec["noop"]["contract_id"].as_u64().unwrap())
                || c.method_id != f(spec["noop"]["method_id"].as_u64().unwrap())
        })
        .copied()
        .collect::<Vec<_>>();
    let actual = manager.sd_key_transaction_infos();
    let h = *manager.get_current_ups_header();
    ensure!(
        actual.len() == expected.len()
            && selected == actual
            && h.current_state.tx_count == f(actual.len() as u64)
            && compute_tx_stack_hash(&actual) == h.current_state.tx_hash_stack,
        "exact authenticated actual stack"
    );
    let input = SDKeyCircuitWitnessInput {
        session_context: SDKeySessionContext {
            start_user_leaf_hash: h
                .session_start_context
                .start_session_user_leaf
                .qfhash::<PsyHasher>(),
            checkpoint_leaf_hash: h.session_start_context.checkpoint_leaf_hash,
            checkpoint_tree_root: h.session_start_context.checkpoint_tree_root,
            current_user_leaf: h.current_state.user_leaf,
            nonce,
        },
        circuit_inputs: fields.iter().copied().map(f).collect(),
        transaction_infos: infos,
        tx_stack_hash: h.current_state.tx_hash_stack,
        tx_count: h.current_state.tx_count,
        state_reader_results: None,
        secp256k1_slots: vec![],
        checkpoint_id: h.session_start_context.checkpoint_id,
        user_id: h.session_start_context.start_session_user_leaf.user_id,
    };
    let key_circuit = session
        .wallet
        .get_sd_key_circuit(&fp)
        .context("compact circuit")?;
    *phase = "prove-compact-session-signature";
    let signature_started = std::time::Instant::now();
    let signature = key_circuit
        .prove(
            private,
            &input,
            manager.get_sighash(PSY_NETWORK_MAGIC, nonce),
        )
        .await?;
    let signature_ms = signature_started.elapsed().as_millis();
    let finalize_started = std::time::Instant::now();
    let cm = session.wallet.random_circuit_manager();
    manager.proof_tree_state.finalize_tree(cm.as_ref()).await?;
    let finalize_ms = finalize_started.elapsed().as_millis();
    let slots = manager.require_lps()?.get_total_slots_modified();
    *phase = "prove-compact-endcap";
    let endcap_started = std::time::Instant::now();
    let proof = manager
        .prove_end_cap(
            cm.as_ref(),
            PSY_NETWORK_MAGIC,
            nonce,
            slots,
            fp,
            param,
            signature,
            key_circuit
                .minifier_chain
                .as_ref()
                .unwrap()
                .get_verifier_data()
                .clone(),
        )
        .await?;
    let endcap_ms = endcap_started.elapsed().as_millis();
    let verify_started = std::time::Instant::now();
    let proof_profile = psy_template_u124_markets::live_guard::verify_ups_with_session_manager(
        cm.as_ref(), &proof,
    ).await?;
    let verify_ms = verify_started.elapsed().as_millis();
    let endcap = manager.get_api_input().await?;
    validate_endcap_binding(&endcap.core, &proof.public_inputs)?;
    ensure!(
        endcap.core.new_user_leaf.user_id.to_canonical_u64() == guard.identity.vault_id
            && endcap.core.stats.total_transactions == f(actual.len() as u64),
        "proven compact identity/count"
    );
    drop(manager);
    drop(key_circuit);
    check(&guard, &session).await?;
    let user = endcap.core.new_user_leaf.user_id.to_canonical_u64();
    let n = nonce.to_canonical_u64();
    let end = endcap.core.state_transition.end_user_leaf_hash;
    let provider = session.st_provider.with_user_id_owned(user);
    let cp = provider.get_latest_block_state().await?.checkpoint_id;
    ensure!(
        cp <= guard.valid_until_checkpoint,
        "compact broadcast window expired; regenerate from current state"
    );
    let latest = provider.get_user_leaf_data(cp, user).await?;
    ensure!(
        endcap.core.state_transition.start_user_leaf_hash == QHashOut::ZERO
            || latest.qfhash::<PsyHasher>() == endcap.core.state_transition.start_user_leaf_hash,
        "stale compact anchor"
    );
    ensure!(
        matches!(
            provider.get_tx_status(user, n).await?,
            TxStatus::Submittable
        ),
        "compact nonce not submittable"
    );
    check(&guard, &session).await?;
    let preflight = json!({"fullUpsVerified":true,"benchmarkSourceCheckpoint":source_pin,"timingsMilliseconds":{"keyConstruction":key_ms,"sessionConstruction":session_ms,"benchmarkSourceSetup":source_pin_ms,"callProving":calls_ms,"signatureProving":signature_ms,"recursiveFinalize":finalize_ms,"endCapProving":endcap_ms,"fullProofVerify":verify_ms,"preflightTotal":started.elapsed().as_millis()},"exactStackAndSessionVerified":true,"proofProfile":proof_profile,"profile":"compact-v1","actualCalls":actual.len(),"logicalSlots":40,"fee":burn,"core":endcap.core,"callsSha256":format!("{:x}",Sha256::digest(&bytes)),"guardSha256":format!("{:x}",Sha256::digest(&guard_bytes)),"broadcast":false});
    let request = QSubmitEndCapRPCRequest {
        user_ec_input: endcap,
        proof: bincode::serialize(&proof)?,
    };
    save(&out.join("preflight.json"), &preflight)?;
    save(&out.join("request.json"), &request)?;
    let prepared = compact_prepared::manifest(&a[2], &bytes, &guard_bytes, out)?;
    save(&out.join("prepared.json"), &prepared)?;
    if a[1] == "preflight" {
        println!("verified compact UPS {end}; not submitted");
        return Ok(());
    }
    save(
        &out.join("intent.json"),
        &json!({"status":"broadcast_intent","userId":user,"nonce":n,"endUserLeafHash":end.to_string(),"retryAllowed":false}),
    )?;
    *phase = "broadcast-compact-ups";
    let receipt = psy_template_u124_markets::live_rpc::submit(&net, request, out).await?;
    save(
        &out.join("receipt.json"),
        &json!({"submitted":true,"included":false,"receipt":receipt,"endUserLeafHash":end.to_string()}),
    )?;
    println!("submitted compact UPS {end}");
    Ok(())
}
#[tokio::main]
async fn main() -> std::process::ExitCode {
    std::panic::set_hook(Box::new(|_| {}));
    let mut phase = "start";
    match psy_template_u124_markets::runtime::contain(run(&mut phase)).await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(failure) => {
            // This client has only a deliberately public SD-key witness. Keep
            // RPC/guard diagnostics, without logging any ordinary wallet file.
            let reason=match failure{psy_template_u124_markets::runtime::Failure::Rejected(e)=>format!("{e:#}"),psy_template_u124_markets::runtime::Failure::Panic(code)=>code.to_owned()};
            let report=json!({"ok":false,"phase":phase,"reason":reason,"broadcastMayHaveBeenAttempted":phase=="broadcast-compact-ups","automaticRetry":false});
            let a=env::args().collect::<Vec<_>>();let index=if a.get(1).map(String::as_str)==Some("register"){4}else if matches!(a.get(1).map(String::as_str),Some("broadcast-prepared")|Some("verify-prepared")){8}else{6};
            if let Some(out)=a.get(index){let dir=Path::new(out);if dir.is_dir(){let _=save(&dir.join("failure.json"),&report);}}
            eprintln!("{report}");
            std::process::ExitCode::FAILURE
        }
    }
}
