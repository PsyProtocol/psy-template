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
    traits::qdatastore::{qmetadata::QMetaDataStoreReaderSync,qtreedata::QTreeDataStoreReaderSync},
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
use psy_template_u124_markets::market_key::{compute_tx_stack_hash, get_sd_key_public_key_param};
use psy_template_u124_markets::market_key::{SDKeyCircuitWitnessInput, SDKeySessionContext};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, fs, io::{Write,BufRead}, path::Path};
#[path = "../compact_prepared.rs"]
mod compact_prepared;
#[path = "../compact_benchmark.rs"]
mod compact_benchmark;
#[path = "../composition_quote.rs"]
mod composition_quote;
#[path = "../processor_runtime.rs"] mod processor_runtime;
#[path = "../stream_runtime.rs"] mod stream_runtime;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Guard {
    pub identity: SubmissionGuard,
    pub dependencies: Vec<LiveBinding>,
    pub valid_until_checkpoint: u64,
    #[serde(default)]
    pub stream: Option<stream_runtime::ContextInput>,
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
    psy_template_u124_markets::guard_reads::checked(&guard.dependencies, psy_template_u124_markets::guard_reads::concurrency()?, |b| async move {
        b.check(&s.st_provider).await.with_context(||format!("live dependency {}",b.contract.contract_id))
    }).await?;
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
                if attempt<2 && psy_template_u124_markets::guard_reads::retryable_public_transport(&reason) {
                    eprintln!("{}",json!({"publicGuardReadRetry":attempt+1,"reason":reason,"mutationRetry":false}));
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                } else {return Err(error);}
            }
        }
    }
    unreachable!("bounded read guard retry returns on its last attempt")
}
async fn run(phase: &mut &'static str, composition:bool, stream:bool) -> Result<()> {
    let memory_mode=psy_template_u124_markets::prover_resources::MemoryMode::selected()?;
    let started = std::time::Instant::now();
    *phase = "build-compact-key";
    let a = env::args().collect::<Vec<_>>();
    ensure!(a.len()>=3,"identity POLICY | register POLICY CONFIG FRESH_OUT | preflight/submit POLICY CONFIG CALLS GUARD FRESH_OUT");
    if stream{psy_template_u124_markets::stream_execution::validate_action(&a[1])?;}
    compact_benchmark::requested(&a[1])?;
    let spec: Value = serde_json::from_slice(&fs::read(&a[2])?)?;
    ensure!(spec["version"]!=3,"checkpoint processor candidates are offline-only; source qualification and release authorization are unavailable");
    let producer=processor_runtime::previous(&spec);
    if producer{ensure!(compact_benchmark::requested(&a[1])?.is_none(),"producer business source cannot use benchmark override");}
    if producer&&a[1]=="producer-order"{
        // This is a public planning proposal, not a signature or verification
        // resource. Validate the same policy without constructing the SD-key.
        // All proof/identity/broadcast actions retain the complete build below.
        *phase="derive-producer-order";
        ensure!(!composition&&spec.get("composition_profile").is_none(),"producer ordering requires its dedicated market policy");
        ensure!(a.len()==5,"producer-order POLICY INPUT FRESH_REPORT");
        let v:Value=serde_json::from_slice(&fs::read(&a[3])?)?;
        let rank=psy_template_u124_markets::checkpoint_processor::producer_order_proposal(&spec,&v)?;
        save(Path::new(&a[4]),&json!({"profile":"previous-checkpoint-seeded-v1","rank":rank,"qualifiedRandomness":false,"proofVerified":false,"broadcast":false}))?;return Ok(());
    }
    let circuit = if stream {
        ensure!(!composition, "separate stream driver required");
        stream_runtime::Circuit::Stream(stream_runtime::load(Path::new(&a[2]), &spec)?)
    } else {
        ensure!(spec["version"]!=14,"v14 requires its dedicated native driver");
        stream_runtime::Circuit::Batch(if composition {
            psy_template_u124_markets::composition_policy::build(&spec)?
        } else {
            ensure!(spec.get("composition_profile").is_none(),"funded composition requires its dedicated driver/key");
            batch_compact::build(&spec)?
        })
    };
    let key_ms = started.elapsed().as_millis();
    let fp = circuit.g().get_fingerprint();
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
        let mut identity=json!({"profile":if stream{"source-funded-v14"}else if composition{"composition-v1"}else{"compact-v1"},"fingerprint":fp.to_string(),"publicKeyHash":hash.to_string(),"publicKeyParam":param.to_string()});
        if producer{identity["orderingModel"]=json!("previous-checkpoint-seeded-v1");identity["producerInfluence"]=json!(true);identity["qualifiedRandomness"]=json!(false);}println!("{identity}");
        return Ok(());
    }
    if composition && a[1]=="inspect-controller" {
        ensure!(a.len()==6,"inspect-controller POLICY ARTIFACT DEPLOYER_USER_ID FRESH_OUT");
        let bytes=fs::read(&a[3])?;
        let artifact:psy_compiler::output::serialize::CompilationArtifact=serde_json::from_slice(&bytes)?;
        let prepared=psy_template_u124_markets::layout_preflight::prepare_initial(artifact.clone(),a[4].parse::<u64>()?)?;
        let mut report=psy_template_u124_markets::layout_preflight::verify_initial(&artifact,&prepared,a[4].parse::<u64>()?)?;
        report["functionTreeRoot"]=json!(prepared.deploy_contract.clone().into_with_whitelist_root::<PsyHasher>()?.function_whitelist_root.to_string());
        report["artifactSha256"]=json!(format!("{:x}",Sha256::digest(&bytes)));
        let out=Path::new(&a[5]);fs::create_dir(out)?;save(&out.join("inspection.json"),&report)?;
        return Ok(());
    }
    let config = PsyConfigGoldilocks::from_file(&a[3])?;
    ensure!(
        config.current_network_name() == "testnet",
        "isolated staging only"
    );
    let mut net = config.get_current_network()?.clone();
    require_staging(&net)?;
    ensure!(
        (if stream{&spec["base"]}else{&spec})["config"]["networkMagic"]
            .as_str()
            .context("policy network magic")?
            .parse::<u64>()?
            == PSY_NETWORK_MAGIC,
        "policy domain differs"
    );
    net.prove_proxy_url.clear();
    if ["broadcast-prepared", "verify-prepared"].contains(&a[1].as_str()) {
        return compact_prepared::broadcast(&a, &spec, fp, hash, &net, phase, circuit.stream()).await;
    }
    *phase = "initialize-staging-session";
    let session_started = std::time::Instant::now();
    let mut session = WalletSession::new(&net).await?;
    let session_ms = session_started.elapsed().as_millis();
    let circuit=std::sync::Arc::new(circuit);
    eprintln!("PSY_PROVER_LIFECYCLE {}",json!({"event":"session-built","pid":std::process::id(),"keyConstructionMilliseconds":key_ms,"sessionConstructionMilliseconds":session_ms,"memoryMode":memory_mode.name()}));
    psy_template_u124_markets::prover_resources::checkpoint(memory_mode,"compact-circuits-built");
    if a[1]=="check-registration" {
        ensure!(a.len()==6,"check-registration POLICY CONFIG USER FRESH_OUT");
        let runtime=circuit.stream().context("registration certificate requires dedicated v14 driver")?;
        runtime.check_instance(&spec,&session.st_provider).await?;
        let user=a[4].parse::<u64>()?;ensure!(user>0&&user<(1<<24),"registration user range");
        ensure!(session.st_provider.get_user_ids_for_public_key(hash).await?==vec![user],"unique exact public registration identity");
        let provider=session.st_provider.with_user_id_owned(user);
        let cp=provider.get_latest_block_state().await?.checkpoint_id;
        let index=psy_crypto::common::user_id::get_registration_id_from_user_id(user);
        let proof=provider.get_user_registration_tree_merkle_proof(cp,index).await?;
        let roots=provider.get_checkpoint_global_state_roots(cp).await?;
        let checkpoint=provider.get_checkpoint_leaf_data(cp).await?;
        ensure!(proof.index==index&&proof.value==hash&&proof.root==roots.user_registration_tree_root
            &&proof.verify::<PsyHasher>()&&roots.qfhash::<PsyHasher>()==checkpoint.global_chain_root,"registration Merkle/checkpoint identity");
        let out=Path::new(&a[5]);fs::create_dir(out)?;
        save(&out.join("verification.json"),&json!({"profile":"source-funded-v14","registered":true,"userId":user,"publicKeyHash":hash.to_string(),"fingerprint":fp.to_string(),"checkpoint":cp,"chainRoot":spec["executor_binding"]["chain_root"],"proof":proof,"roots":roots,"checkpointLeaf":checkpoint,"broadcast":false,"scope":"Authenticated registration membership relative to the pinned current chain; not consensus finality or a financial UPS"}))?;
        return Ok(());
    }
    if a[1] == "register" {
        ensure!(a.len() == 5, "register POLICY CONFIG FRESH_OUT");
        if stream{ensure!(spec["executor_binding"]["allow_broadcast"]==true,"instance-specific release is not enabled for registration");}
        let out = Path::new(&a[4]);
        fs::create_dir(out)?;
        fs::File::open(
            out.parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(Path::new(".")),
        )?
        .sync_all()?;
        if let Some(runtime)=circuit.stream(){runtime.check_instance(&spec,&session.st_provider).await?;}
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
            &json!({"profile":if stream{"source-funded-v14"}else{"compact-v1"},"publicKey":public,"publicKeyHash":hash.to_string()}),
        )?;
        *phase="broadcast-compact-ups";
        let receipt = if stream{psy_template_u124_markets::live_rpc::register(&net,request,out).await?}else{serde_json::to_value(session.st_provider.register_user(request).await?)?};
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
            ensure!(job.action=="preflight"||((composition||producer||stream)&&job.action=="quote"),"resident proof/quote actions only");
            let args=vec![a[0].clone(),job.action,a[2].clone(),a[3].clone(),job.calls,job.guard,job.out.clone()];
            let mut job_phase="resident-preflight-start";
            let result=psy_template_u124_markets::runtime::contain(process_action(&args,&spec,fp,hash,param,private,&net,&mut session,&circuit,0,0,std::time::Instant::now(),&mut job_phase)).await;
            session.user_session_mgrs.remove(&hash);
            psy_template_u124_markets::prover_resources::checkpoint(memory_mode,"compact-session-cleared");
            let error=match result {Ok(())=>None,Err(psy_template_u124_markets::runtime::Failure::Rejected(e))=>Some(format!("{e:#}")),Err(psy_template_u124_markets::runtime::Failure::Panic(code))=>Some(code.to_owned())};
            if let Some(reason)=&error{let dir=Path::new(&job.out);if dir.is_dir(){save(&dir.join("failure.json"),&json!({"ok":false,"phase":job_phase,"reason":reason,"broadcastMayHaveBeenAttempted":false,"automaticRetry":false}))?;}}
            println!("PSY_COMPACT_SERVER {}",json!({"id":job.id,"ok":error.is_none(),"error":error,"phase":job_phase}));std::io::stdout().flush()?;
            ensure!(error.is_none(),"resident proof rejected; explicit restart required");
        }
        return Ok(());
    }
    process_action(&a,&spec,fp,hash,param,private,&net,&mut session,&circuit,key_ms,session_ms,started,phase).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResidentJob {id:String,calls:String,guard:String,out:String,#[serde(default="preflight_action")]action:String}
fn preflight_action()->String{"preflight".into()}
#[allow(clippy::too_many_arguments)]
async fn process_action(a:&[String],spec:&Value,fp:QHashOut<F>,hash:QHashOut<F>,param:QHashOut<F>,private:QHashOut<F>,net:&psy_config::NetworkConfigGoldilocks,session:&mut WalletSession,circuit:&stream_runtime::Circuit,key_ms:u128,session_ms:u128,started:std::time::Instant,phase:&mut &'static str)->Result<()> {
    ensure!(
        a.len() == 7 && (["preflight", "submit"].contains(&a[1].as_str())||((spec["composition_profile"]=="two-amm-owner-funded-v1"||processor_runtime::previous(spec)||spec["version"]==14)&&a[1]=="quote")),
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
        data.software_defined_call.inputs.len() == spec["witness_length"].as_u64().context("witness width")?as usize,
        "compact witness length"
    );
    let mut fields = data.software_defined_call.inputs.clone();
    if fields[73] == 0 {
        fields[73] = 1_000_000_000;
    }
    let guard_bytes = fs::read(&a[5])?;
    let guard: Guard = serde_json::from_slice(&guard_bytes)?;
    ensure!(circuit.stream().is_some()==guard.stream.is_some(),"dedicated stream context boundary");
    let expected = stream_runtime::calls(&spec, &fields, &guard)?;
    ensure!(
        serde_json::to_value(&data.contract_calls)?
            == serde_json::to_value(&expected[..expected.len() - 1])?,
        "complete canonical compact call list"
    );
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
    if let Some(runtime)=circuit.stream(){let c=guard.stream.as_ref().context("stream context")?;psy_template_u124_markets::stream_execution::validate_request(&runtime.review,&c.source,&c.request)?;}
    guard.identity.validate(
        if spec["version"]==14{&spec["base"]}else{&spec},
        "testnet",
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
    let key = hash;
    ensure!(key == hash, "compact public identity");
    let producer=processor_runtime::previous(spec);
    let source_pin=compact_benchmark::requested(&a[1])?;
    if producer{ensure!(source_pin.is_none(),"producer source cannot be selected by benchmark environment");}
    let pin_started=std::time::Instant::now();
    if circuit.stream().is_some(){stream_runtime::start(session,key,&guard).await?;}else if producer&&fields[0]==2{processor_runtime::start(session,key,&guard,fields[3]).await?;}else if let Some(cp)=source_pin{compact_benchmark::start_at(&session,key,guard.identity.vault_id,cp).await?;}else{session.start_session(key).await?;}
    let source_pin_ms=if source_pin.is_some(){pin_started.elapsed().as_millis()}else{0};
    if a[1]=="quote" {
        *phase="composition-fee-quote";
        if circuit.stream().is_some(){return stream_runtime::execute(session,key,spec,&guard,true,out).await;}if producer{ensure!(fields[0]==2,"producer settlement quote only");return processor_runtime::execute(session,key,spec,&data,true,out).await;}return composition_quote::quote(session,key,&data,out).await;
    }
    *phase = "prove-compact-calls";
    let calls_started = std::time::Instant::now();
    if circuit.stream().is_some(){stream_runtime::execute(session,key,spec,&guard,false,out).await?;}else if producer&&fields[0]==2{ensure!(fields[73]==data.software_defined_call.inputs[73]&&fields[73]>0,"producer exact fee required");processor_runtime::execute(session,key,spec,&data,false,out).await?;}else{session.prove_contract_call(key,data.contract_calls).await?;}
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
    let logical = if spec["version"]==14{vec![]}else{batch_policy::expected_calls(&spec, &fields)?};
    let mut all = if spec["version"]==14{vec![]}else{spec["branches"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|b| b["calls"].as_array().unwrap())
        .chain([&spec["noop"], &spec["expire"]])
        .collect::<Vec<_>>()};
    if producer{all.extend([&spec["begin"],&spec["gather"],&spec["claim_a"],&spec["claim_b"],&spec["fee"],&spec["finish"],&spec["reward"]]);}
    let infos = if spec["version"]==14{psy_template_u124_markets::stream_execution::logical_infos(spec,&guard.stream.as_ref().unwrap().request)?}else{logical
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
        .collect::<Result<Vec<SDKeyTransactionInfo<F>>>>()?};
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
    let mut input = SDKeyCircuitWitnessInput {
        session_context: SDKeySessionContext {
            start_user_leaf: h.session_start_context.start_session_user_leaf,
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
    if let Some(runtime)=circuit.stream(){
        input=runtime.bind(session,key,spec,&guard,input.session_context.clone(),&actual,
            input.tx_stack_hash,input.tx_count,input.checkpoint_id,out).await?;
    }
    let key_circuit = circuit.g();
    *phase = "prove-compact-session-signature";
    let signature_started = std::time::Instant::now();
    let signature = key_circuit
        .prove(
            private,
            &input,
            manager.get_sighash(PSY_NETWORK_MAGIC, nonce),
        )
        .await?;
    if circuit.stream().is_some(){let bytes=bincode::serialize(&signature)?;let mut file=fs::OpenOptions::new().create_new(true).write(true).open(out.join("stream-sign-proof.bin"))?;file.write_all(&bytes)?;file.sync_all()?;}
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
    let endcap = manager.get_api_input().await?;
    drop(manager);
    let memory_mode=psy_template_u124_markets::prover_resources::MemoryMode::selected()?;
    if memory_mode.release() { session.user_session_mgrs.remove(&key); }
    psy_template_u124_markets::prover_resources::checkpoint(memory_mode,"compact-endcap-proved");
    let verify_started = std::time::Instant::now();
    let proof_profile = psy_template_u124_markets::live_guard::verify_ups_with_session_manager(
        cm.as_ref(), &proof,
    ).await?;
    let verify_ms = verify_started.elapsed().as_millis();
    validate_endcap_binding(&endcap.core, &proof.public_inputs)?;
    ensure!(
        endcap.core.new_user_leaf.user_id.to_canonical_u64() == guard.identity.vault_id
            && endcap.core.stats.total_transactions == f(actual.len() as u64),
        "proven compact identity/count"
    );
    let user = endcap.core.new_user_leaf.user_id.to_canonical_u64();
    let n = nonce.to_canonical_u64();
    let end = endcap.core.state_transition.end_user_leaf_hash;
    // Persist the full cryptographically verified, exact-stack UPS before any
    // fallible final public read. This is NOT authorization to broadcast.
    let mut preflight = json!({"persistenceProfile":"crypto-before-final-guard-v1","liveGuardsPending":true,"fullUpsVerified":true,"compositionProfile":spec["composition_profile"],"benchmarkSourceCheckpoint":source_pin,"timingsMilliseconds":{"keyConstruction":key_ms,"sessionConstruction":session_ms,"benchmarkSourceSetup":source_pin_ms,"callProving":calls_ms,"signatureProving":signature_ms,"recursiveFinalize":finalize_ms,"endCapProving":endcap_ms,"fullProofVerify":verify_ms,"cryptographicPreparationTotal":started.elapsed().as_millis()},"exactStackAndSessionVerified":true,"proofProfile":proof_profile,"profile":"compact-v1","actualCalls":actual.len(),"logicalSlots":40,"fee":burn,"core":endcap.core,"callsSha256":format!("{:x}",Sha256::digest(&bytes)),"guardSha256":format!("{:x}",Sha256::digest(&guard_bytes)),"broadcast":false});
    let request = QSubmitEndCapRPCRequest {
        user_ec_input: endcap,
        proof: bincode::serialize(&proof)?,
    };
    if producer{preflight["orderingModel"]=json!("previous-checkpoint-seeded-v1");preflight["producerInfluence"]=json!(true);preflight["qualifiedRandomness"]=json!(false);if fields[0]==2{preflight["producerSourceCheckpoint"]=json!(fields[3]);}}
    if circuit.stream().is_some(){preflight["streamContextSha256"]=json!(compact_prepared::sha(&fs::read(out.join("stream-context.json"))?));preflight["profile"]=json!("source-funded-v14");}
    save(&out.join("preflight.json"), &preflight)?;
    save(&out.join("request.json"), &request)?;
    let prepared = compact_prepared::manifest(&a[2], &bytes, &guard_bytes, out)?;
    save(&out.join("prepared.json"), &prepared)?;
    *phase = "verify-final-compact-state";
    let final_guard_started = std::time::Instant::now();
    check(&guard, &session).await?;
    let provider = session.st_provider.with_user_id_owned(user);
    let cp = provider.get_latest_block_state().await?.checkpoint_id;
    ensure!(
        cp <= guard.valid_until_checkpoint,
        "compact broadcast window expired; regenerate from current state"
    );
    let latest = provider.get_user_leaf_data(cp, user).await?;
    ensure!(
        request.user_ec_input.core.state_transition.start_user_leaf_hash == QHashOut::ZERO
            || latest.qfhash::<PsyHasher>() == request.user_ec_input.core.state_transition.start_user_leaf_hash,
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
    save(&out.join("final-live-state.json"), &json!({"liveGuardsPassed":true,"broadcast":false,
        "requestSha256":compact_prepared::sha(&fs::read(out.join("request.json"))?),
        "preparedManifestSha256":format!("{:x}",Sha256::digest(fs::read(out.join("prepared.json"))?)),
        "finalLiveGuardMilliseconds":final_guard_started.elapsed().as_millis(),
        "preflightTotalMilliseconds":started.elapsed().as_millis()}))?;
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
    execute_profile(false,false).await
}
pub async fn execute_composition()->std::process::ExitCode{execute_profile(true,false).await}
pub async fn execute_stream()->std::process::ExitCode{execute_profile(false,true).await}
async fn execute_profile(composition:bool,stream:bool) -> std::process::ExitCode {
    std::panic::set_hook(Box::new(|_| {}));
    let mut phase = "start";
    match psy_template_u124_markets::runtime::contain(run(&mut phase,composition,stream)).await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(failure) => {
            // This client has only a deliberately public SD-key witness. Keep
            // RPC/guard diagnostics, without logging any ordinary wallet file.
            let reason=match failure{psy_template_u124_markets::runtime::Failure::Rejected(e)=>format!("{e:#}"),psy_template_u124_markets::runtime::Failure::Panic(code)=>code.to_owned()};
            let report=json!({"ok":false,"phase":phase,"reason":reason,"broadcastMayHaveBeenAttempted":phase=="broadcast-compact-ups","automaticRetry":false});
            let a=env::args().collect::<Vec<_>>();let index=if a.get(1).map(String::as_str)==Some("check-registration"){5}else if a.get(1).map(String::as_str)==Some("register"){4}else if matches!(a.get(1).map(String::as_str),Some("broadcast-prepared")|Some("verify-prepared")){8}else{6};
            if let Some(out)=a.get(index){let dir=Path::new(out);if dir.is_dir(){let _=save(&dir.join("failure.json"),&report);}}
            eprintln!("{report}");
            std::process::ExitCode::FAILURE
        }
    }
}
