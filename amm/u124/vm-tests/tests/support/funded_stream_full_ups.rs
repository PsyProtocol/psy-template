//! Deterministic v14 continuous settlement, separate from fresh bootstrap.
//! Initial pool/user actions and final claims are actual VM prerequisites only.
use super::*;
use super::funded_bootstrap_full_ups::{registered, OWNER, CAP};
use super::minimum_stream_full_ups::{native_total, conservation};

fn bound(mut request: Request, key: [u64;4]) -> Request {
    request.registered_key=Some(key);request
}

// Offline synthetic replay only. Verify exact proof, approved calls/session,
// starting state and independently replayed final state before advancing. This
// does not resend a request or trust a saved success flag.
async fn reuse_grant(chain:&mut StreamChain,w:&mut World,request:Request,input:&std::path::Path,out:&str)->Result<()> {
    use psy_client_data::qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user_contract_state::SignContext};
    use psy_template_u124_markets::market_key::compute_tx_stack_hash;
    use sha2::{Digest,Sha256};
    let started=Instant::now();
    let saved:Request=serde_json::from_slice(&fs::read(input.join("plan.json"))?)?;
    let expected=minimum_exact_fee(w,&chain.spec,request)?;
    ensure!(serde_json::to_value(&saved)?==serde_json::to_value(expected)?,"exact locally rebuilt grant before reuse");
    let raw=fs::read(input.join("request.json"))?;
    let api:psy_provider::request::QSubmitEndCapRPCRequest<GF>=serde_json::from_slice(&raw)?;
    let proof:plonky2::plonk::proof::ProofWithPublicInputs<GF,C,2>=bincode::deserialize(&api.proof)?;
    psy_template_u124_markets::fixed_verifier::with_verifier(|v|{v.verify(proof.clone())?;Ok(())})?;
    psy_template_u124_markets::proof_binding::validate_endcap_binding(&api.user_ec_input.core,&proof.public_inputs)?;
    let public:Value=serde_json::from_slice(&fs::read(input.join("public-session.json"))?)?;
    ensure!(public["keyFingerprint"]==chain.key.g.get_fingerprint().to_string(),"same compiled spending key");
    let calls=stream_policy::calls(&chain.spec,&saved,false)?;
    let infos=calls.iter().map(|call|{
        let cid=call["contract_id"].as_u64().unwrap();let definition=&w.methods[&(cid,call["method_name"].as_str().unwrap().into())];
        psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(
            f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(cid),f(definition.method_id as u64),
            &call["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect::<Vec<_>>()).into()
    }).collect::<Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>>();
    ensure!(serde_json::to_value(&infos)?==public["stack"],"exact actual calls, callers, hashes and counts");
    let active=infos.iter().filter(|info|info.contract_id!=f(M)||info.method_id!=f(chain.spec["noop"]["method_id"].as_u64().unwrap())).copied().collect::<Vec<_>>();
    let stack=compute_tx_stack_hash(&active);let count=f(active.len()as u64);
    ensure!(serde_json::to_value(stack)?==public["txStackHash"]&&serde_json::to_value(count)?==public["txCount"],"exact original stack identity");
    let context:SDKeySessionContext=serde_json::from_value(public["session"].clone())?;
    let mut end=context.current_user_leaf;end.nonce=context.nonce;
    ensure!(end==api.user_ec_input.core.new_user_leaf,"exact approved end leaf");
    let action=PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:context.start_user_leaf_hash,
        end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:context.checkpoint_leaf_hash,
        tx_stack_hash:stack,tx_count:count}.get_sig_action_for_user::<PoseidonHash>(PSY_NETWORK_MAGIC,
        context.start_user_leaf.user_id,context.nonce,SignContext{checkpoint_tree_root:context.checkpoint_tree_root,user_leaf:context.current_user_leaf}).get_qhash::<PoseidonHash>();
    ensure!(serde_json::to_value(action)?==public["sigHash"],"exact signature domain and session preimage");
    let key_proof:plonky2::plonk::proof::ProofWithPublicInputs<GF,C,2>=bincode::deserialize(&fs::read(input.join("key-proof.bin"))?)?;
    chain.key.g.minifier_chain.as_ref().unwrap().verify(key_proof.clone())?;
    ensure!(key_proof.public_inputs==PoseidonHash::two_to_one(action.0,chain.source.key_public_param.0).elements,"saved key proof exact signature and public key binding");
    let(db,_,_)=chain.seed_for_request(w,true).await?;
    let start=db.get_user_leaf_data(w.checkpoint,V).await?;
    ensure!(api.user_ec_input.core.checkpoint_id==f(w.checkpoint)
        &&public["checkpoint"]==w.checkpoint
        &&db.get_checkpoint_leaf_data(w.checkpoint).await?.qfhash::<PoseidonHash>()==context.checkpoint_leaf_hash
        &&db.get_checkpoint_tree_root(w.checkpoint).await?==context.checkpoint_tree_root
        &&api.user_ec_input.core.state_transition.checkpoint_tree_root_hash==context.checkpoint_tree_root,
        "exact current checkpoint and history root before saved-proof reuse");
    ensure!(start==context.start_user_leaf&&start.qfhash::<PoseidonHash>()==api.user_ec_input.core.state_transition.start_user_leaf_hash
        &&end.nonce==f(w.revision+1),"exact current starting identity/nonce/state before reuse");
    let mut next=w.clone();execute(&mut next,&chain.spec,&saved)?;
    let old=chain.base.last_leaf;chain.base.last_leaf=Some(end);
    // seed_identity independently rebuilds every VM contract root and checks
    // it against the accepted endpoint; a saved leaf is not injected as state.
    let endpoint=chain.base.seed_identity(&next,chain.key.g.get_fingerprint()).await;
    chain.base.last_leaf=old;endpoint?;
    let destination=std::path::Path::new(out).join(format!("{}-funding-grant",w.kind));fs::create_dir(&destination)?;
    for name in ["source.json","current.json","intent.json","plan.json","request.json","public-session.json","key-proof.bin"]{
        let path=input.join(name);ensure!(fs::symlink_metadata(&path)?.file_type().is_file(),"public regular file only");
        fs::write(destination.join(name),fs::read(path)?)?;
    }
    let original=fs::read(input.join("verification.json"))?;
    let mut row:Value=serde_json::from_slice(&original)?;
    row["originalProofSeconds"]=row["seconds"].clone();row["proofReused"]=json!(true);
    row["originalVerificationSha256"]=json!(format!("{:x}",Sha256::digest(&original)));
    row["exactRequestSha256"]=json!(format!("{:x}",Sha256::digest(&raw)));
    row["seconds"]=json!(started.elapsed().as_secs_f64());row["keySeconds"]=json!(0);
    row["endcapAndAuditSeconds"]=row["seconds"].clone();row["steps"]=json!([]);
    fs::write(destination.join("verification.json"),serde_json::to_vec_pretty(&row)?)?;
    chain.measurements.push(row);chain.base.last_leaf=Some(end);next.checkpoint+=1;*w=next;Ok(())
}

#[tokio::test]
#[ignore="bounded saved-grant replay guards; no new CFC or UPS proofs"]
async fn deterministic_saved_grant_reuse_rejects_changed_context()->Result<()> {
    let input=std::path::PathBuf::from(std::env::var("FUNDED_REPLAY_GUARD_INPUT")?);
    let out=std::env::var("FUNDED_REPLAY_GUARD_OUT")?;fs::create_dir(&out)?;
    let mut original=setup_with_sponsor("amm",false)?;original.set(OWNER,0,0,CAP+ESCROW);
    let mut chain=StreamChain::new(&original).await?;let key=registered(&chain);
    original.run(OWNER,M,"authorize_fee_budget",&[vec![V,1,CAP],key.to_vec()].concat())?;
    original.run(OWNER,0,"transfer",&[V,CAP])?;
    let(_,page)=SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
    let mut request=bound(basic(13,&page,&original),key);
    request.fields[21]=1;request.fields[22]=CAP;request.fields[23]=1;
    let before=original.slots.clone();let old_leaf=chain.base.last_leaf;
    for change in ["checkpoint","nonce","balance","key"]{
        let mut changed=original.clone();let mut plan=request.clone();
        match change{
            "checkpoint"=>changed.checkpoint+=1,
            "nonce"=>changed.revision+=1,
            "balance"=>{let amount=changed.state.get_contract_slot(V,0,0)?;changed.set(V,0,0,amount+1);},
            _=>plan.registered_key.as_mut().unwrap()[0]+=1,
        }
        let frozen=changed.slots.clone();let revision=changed.revision;
        ensure!(reuse_grant(&mut chain,&mut changed,plan,&input,&out).await.is_err()
            &&changed.slots==frozen&&changed.revision==revision&&chain.base.last_leaf==old_leaf,
            "changed context rejected without advancing or writing output");
    }
    ensure!(original.slots==before,"negative controls do not mutate original state");
    let blocked=std::path::Path::new(&out).join("existing-output");fs::create_dir(&blocked)?;
    fs::create_dir(blocked.join("amm-funding-grant"))?;
    ensure!(reuse_grant(&mut chain,&mut original,request.clone(),&input,blocked.to_str().context("output path")?).await.is_err()
        &&original.slots==before&&chain.base.last_leaf==old_leaf,
        "publication failure leaves both state and accepted leaf unchanged");
    reuse_grant(&mut chain,&mut original,request,&input,&out).await?;
    ensure!(original.val(V,"fee_cap",0)==CAP&&original.val(V,"fee_used",0)>0,"exact control advances verified grant");
    fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({
        "exactSavedGrantReused":true,"changedContextRejections":["checkpoint","nonce","balance","key"],
        "negativeStateAndLeafUnchanged":true,"existingOutputRejectsBeforeStateAdvance":true,
        "newCfcProofs":0,"newFullUps":0,"financialOperations":0,
        "scope":"Synthetic exact-proof resume and current-checkpoint guards; not broadcast, receipt recovery or ordinary wallet acceptance"
    }))?)?;Ok(())
}

#[tokio::test]
#[ignore="bounded v14 complete UPS continuation; no financial or RPC authority"]
async fn deterministic_funded_stream_complete_ups_continuation()->Result<()> {
    let out=std::env::var("FUNDED_STREAM_OUT")?;fs::create_dir(&out)?;
    for kind in ["amm","bondingcurve"] {
        // No legacy sponsor or pre-populated fee cap is used. Pool setup is
        // intentionally independent of the separately accepted first-use UPS.
        let mut w=setup_with_sponsor(kind,false)?;
        ensure!(w.val(V,"fee_cap",0)==0&&w.val(V,"fee_used",0)==0,"no implicit authorization");
        w.set(OWNER,0,0,CAP+ESCROW);
        let totals=[asset_total(&w,A)?,asset_total(&w,B)?];let native=native_total(&w)?;
        let mut chain=StreamChain::new(&w).await?;
        ensure!(chain.spec["version"]==14&&chain.spec["fee_owner"]==OWNER,"exact deterministic owner/profile");
        let key=registered(&chain);
        w.run(OWNER,M,"authorize_fee_budget",&[vec![V,1,CAP],key.to_vec()].concat())?;
        w.run(OWNER,0,"transfer",&[V,CAP])?;
        let (_,inactive)=SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
        let mut grant=bound(basic(13,&inactive,&w),key);
        grant.fields[21]=1;grant.fields[22]=CAP;grant.fields[23]=1;
        let reused=if let Ok(root)=std::env::var("FUNDED_STREAM_REUSE_GRANTS"){
            let path=std::path::Path::new(&root).join(format!("{kind}-funding-grant"));
            if path.join("request.json").exists(){reuse_grant(&mut chain,&mut w,grant.clone(),&path,&out).await?;true}else{false}
        }else{false};
        if !reused{chain.prove(&mut w,grant,&out,"funding-grant").await?;}
        conservation(&w,totals,native)?;

        // Funding confirmation advances the checkpoint. A fresh full inventory
        // must be authenticated at that new point before freezing/opening it.
        // Never relax source == execution checkpoint or reuse the older set.
        let db=chain.base.seed_identity_with_history(&w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;
        chain.source=snapshot(db,&w,&chain.review,chain.key.g.get_fingerprint()).await?;
        chain.source_checkpoint=w.checkpoint;
        ensure!(chain.source.accounts.iter().find(|account|account.leaf.user_id==f(V)).map(|account|account.leaf)
            ==chain.base.last_leaf,"fresh frozen source contains the exact accepted funding endpoint");
        let snapshot=chain.source.clone();
        let source=stream_source::prepare(&chain.review,&snapshot,snapshot.history.checkpoint_path.root)?;
        let queue=stream_source::priority(&chain.review,&snapshot,snapshot.history.checkpoint_path.root)?;
        ensure!(source.len()==2&&queue.members.len()==5,"bounded two-source-page five-order workload");
        let open=bound(basic(OPEN,&source[0],&w),key);
        chain.prove(&mut w,open,&out,"open").await?;
        let after_open=w.clone();let open_leaf=chain.base.last_leaf;
        w.run(203,M,"request_cancel",&[])?;
        for(i,page)in source.iter().enumerate(){
            let request=bound(basic(COVER,page,&w),key);
            chain.prove(&mut w,request,&out,&format!("source-{i}")).await?;
            conservation(&w,totals,native)?;
        }
        ensure!(w.val(V,"stream_phase",0)==3,"complete frozen source before settlement");
        let first=bound(settle_request(&w,&chain.review,&snapshot,&source[0],&queue,0)?,key);
        chain.prove(&mut w,first,&out,"settle-0").await?;
        let before_tail=w.clone();let tail_leaf=chain.base.last_leaf;
        let tail=bound(settle_request(&w,&chain.review,&snapshot,&source[0],&queue,4)?,key);
        chain.prove(&mut w,tail,&out,"settle-tail").await?;
        ensure!(w.val(V,"stream_phase",0)==7&&w.val(V,"stream_settled",0)==5,"all 4+1 members terminal");
        let ordinary_claims=claim_all(&mut w)?;conservation(&w,totals,native)?;
        let normal_fee=w.val(V,"fee_used",0);

        let mut timed=before_tail;timed.checkpoint=snapshot.fields[7]+1;
        chain.base.last_leaf=tail_leaf;
        let request=bound(settle_request(&timed,&chain.review,&snapshot,&source[0],&queue,4)?,key);
        chain.prove(&mut timed,request,&out,"timeout-tail").await?;
        ensure!(timed.val(V,"stream_phase",0)==7&&timed.val(V,"consumed",204)==1,"original tail timeout refund");
        claim_all(&mut timed)?;conservation(&timed,totals,native)?;

        let mut abandoned=after_open;abandoned.checkpoint=snapshot.fields[7]+1;
        chain.base.last_leaf=open_leaf;
        let request=bound(basic(ABORT_SOURCE,&source[0],&abandoned),key);
        chain.prove(&mut abandoned,request,&out,"abort-source").await?;
        ensure!(abandoned.val(V,"stream_phase",0)==7&&abandoned.val(V,"stream_aborted",0)==1
            &&(200..205).all(|u|abandoned.val(V,"consumed",u)==0),"unaccepted source abort cannot consume funding");
        conservation(&abandoned,totals,native)?;
        fs::write(format!("{out}/{kind}-REPORT.json"),serde_json::to_vec_pretty(&json!({
            "scope":"New v14 continuous deterministic complete UPSs on synthetic checkpoints; VM pool/setup/ordinary claims are not signed ordinary UPSs or network acceptance",
            "profile":chain.spec["profile"],"completeUps":8,"members":5,"sourcePages":2,"settlementPages":[4,1],
            "actualSyntheticFills":3,"cancelledRefund":true,"slippageRefund":true,"timeoutTailRefund":true,
            "unacceptedSourceAbort":true,"assetConservation":true,"nativeConservationIncludingFees":true,
            "normalFeeUsed":normal_fee,"lifetimeCap":CAP,"legacySponsor":false,"randomMode":false,
            "exactPriorGrantReused":reused,"sourceFrozenAfterFunding":true,"newFullUps":if reused{7}else{8},
            "keyFingerprint":chain.key.g.get_fingerprint(),"ordinaryClaimBytecode":ordinary_claims,
            "measurements":chain.measurements,"ordinaryWalletUps":false,"fullUpsVerified":true,
            "broadcast":false,"financialOperations":0
        }))?)?;
    }
    Ok(())
}
