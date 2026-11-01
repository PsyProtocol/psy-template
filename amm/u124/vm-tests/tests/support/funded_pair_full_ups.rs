//! Distinct v15 actual bytecode/key cohort. Funding/orders/claims are explicit
//! VM actor prerequisites, not ordinary signatures, receipts or browser QA.
use super::*;
use psy_template_u124_markets::pair_frontier::{self as frontier,State as FrontierState,Record};
const OWNER:u64=600;
const CAP:u64=100*ESCROW;
fn bound(mut r:Request,key:[u64;4])->Request{r.registered_key=Some(key);r}
// Exact offline continuation of this owned public test cohort only. No network
// request, cached verification flag or replacement signature is accepted.
async fn replay(chain:&mut StreamChain,w:&mut World,request:Request,input:&std::path::Path,out:&str,label:&str)->Result<()> {
    use psy_client_data::qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user_contract_state::SignContext};
    use psy_template_u124_markets::market_key::compute_tx_stack_hash;
    use sha2::{Digest,Sha256};
    let started=Instant::now();let saved:Request=serde_json::from_slice(&fs::read(input.join("plan.json"))?)?;
    ensure!(serde_json::to_value(&saved)?==serde_json::to_value(minimum_exact_fee(w,&chain.spec,request)?)?,"exact rebuilt request before replay");
    let inactive=[4,13,14].contains(&saved.fields[0]);let(db,source,_)=chain.seed_for_request(w,inactive).await?;
    ensure!(serde_json::to_value(&source)?==serde_json::from_slice::<Value>(&fs::read(input.join("source.json"))?)?,"exact source and history before replay");
    let current:CurrentOpening=serde_json::from_slice(&fs::read(input.join("current.json"))?)?;
    ensure!(current.checkpoint==db.get_checkpoint_leaf_data(w.checkpoint).await?&&current.anchor==db.get_checkpoint_leaf_data(1).await?
        &&current.roots==db.get_checkpoint_global_state_roots(w.checkpoint).await?,"exact current checkpoint roots before replay");
    for row in &current.contracts{ensure!(row.leaf==db.get_contract_leaf_data(row.id).await?,"exact current code/layout before replay");}
    let raw=fs::read(input.join("request.json"))?;let api:psy_provider::request::QSubmitEndCapRPCRequest<GF>=serde_json::from_slice(&raw)?;
    let proof:plonky2::plonk::proof::ProofWithPublicInputs<GF,C,2>=bincode::deserialize(&api.proof)?;
    psy_template_u124_markets::fixed_verifier::with_verifier(|v|{v.verify(proof.clone())?;Ok(())})?;
    validate_endcap_binding(&api.user_ec_input.core,&proof.public_inputs)?;
    let public:Value=serde_json::from_slice(&fs::read(input.join("public-session.json"))?)?;
    ensure!(public["keyFingerprint"]==chain.key.g.get_fingerprint().to_string(),"exact replay spending key");
    ensure!(public["actualCalls"]==serde_json::to_value(stream_policy::calls(&chain.spec,&saved,true)?)?,"exact replay public calls");
    let infos=psy_template_u124_markets::stream_execution::logical_infos(&chain.spec,&saved)?;
    ensure!(public["stack"]==serde_json::to_value(&infos)?,"exact replay ordered caller/parameter stack");
    let active=infos.iter().filter(|i|i.contract_id!=f(M)||i.method_id!=f(chain.spec["noop"]["method_id"].as_u64().unwrap())).copied().collect::<Vec<_>>();
    let stack=compute_tx_stack_hash(&active);let count=f(active.len()as u64);
    ensure!(public["txStackHash"]==serde_json::to_value(stack)?&&public["txCount"]==serde_json::to_value(count)?,"exact replay stack hash/count");
    let context:SDKeySessionContext=serde_json::from_value(public["session"].clone())?;
    let start=db.get_user_leaf_data(w.checkpoint,V).await?;let fresh=w.revision==0;
    ensure!(context.start_user_leaf==start&&context.start_user_leaf_hash==start.qfhash::<PoseidonHash>()
        &&context.nonce==f(w.revision+1)&&api.user_ec_input.core.checkpoint_id==f(w.checkpoint)
        &&api.user_ec_input.core.state_transition.start_user_leaf_hash==if fresh{Q::ZERO}else{start.qfhash::<PoseidonHash>()}
        &&context.checkpoint_leaf_hash==current.checkpoint.qfhash::<PoseidonHash>()
        &&context.checkpoint_tree_root==db.get_checkpoint_tree_root(w.checkpoint).await?
        &&context.checkpoint_tree_root==api.user_ec_input.core.state_transition.checkpoint_tree_root_hash,"exact replay identity/nonce/state/session");
    let mut end=context.current_user_leaf;end.nonce=context.nonce;ensure!(end==api.user_ec_input.core.new_user_leaf,"exact replay end leaf");
    let action=PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:context.start_user_leaf_hash,end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:context.checkpoint_leaf_hash,tx_stack_hash:stack,tx_count:count}.get_sig_action_for_user::<PoseidonHash>(PSY_NETWORK_MAGIC,start.user_id,context.nonce,SignContext{checkpoint_tree_root:context.checkpoint_tree_root,user_leaf:context.current_user_leaf}).get_qhash::<PoseidonHash>();
    ensure!(public["sigHash"]==serde_json::to_value(action)?,"exact replay signature domain");
    let key_proof:plonky2::plonk::proof::ProofWithPublicInputs<GF,C,2>=bincode::deserialize(&fs::read(input.join("key-proof.bin"))?)?;
    chain.key.g.minifier_chain.as_ref().unwrap().verify(key_proof.clone())?;
    ensure!(key_proof.public_inputs==PoseidonHash::two_to_one(action.0,source.key_public_param.0).elements,"exact replay key proof public binding");
    ensure!(api.user_ec_input.core.stats.guta_fees_collected+api.user_ec_input.core.stats.da_fees_collected==f(saved.fields[73]),"exact replay fee");
    let mut next=w.clone();execute(&mut next,&chain.spec,&saved)?;
    let old=chain.base.last_leaf;chain.base.last_leaf=Some(end);let checked=chain.base.seed_identity(&next,chain.key.g.get_fingerprint()).await;chain.base.last_leaf=old;checked?;
    let dest=std::path::Path::new(out).join(format!("{}-{label}",w.kind));fs::create_dir(&dest)?;
    for name in ["request.json","plan.json","intent.json","source.json","current.json","public-session.json","key-proof.bin"]{let p=input.join(name);ensure!(fs::symlink_metadata(&p)?.file_type().is_file(),"regular public replay artifact");fs::write(dest.join(name),fs::read(p)?)?;}
    let original=fs::read(input.join("verification.json"))?;let mut row:Value=serde_json::from_slice(&original)?;
    row["proofReused"]=json!(true);row["originalProofSeconds"]=row["seconds"].clone();row["seconds"]=json!(started.elapsed().as_secs_f64());row["originalVerificationSha256"]=json!(format!("{:x}",Sha256::digest(original)));row["exactRequestSha256"]=json!(format!("{:x}",Sha256::digest(raw)));
    row["keySeconds"]=json!(0);row["endcapAndAuditSeconds"]=row["seconds"].clone();row["steps"]=json!([]);
    fs::write(dest.join("verification.json"),serde_json::to_vec_pretty(&row)?)?;chain.measurements.push(row);
    chain.base.retained_history.insert(w.checkpoint,current.checkpoint);chain.base.last_leaf=Some(end);next.checkpoint+=1;*w=next;Ok(())
}
async fn step(chain:&mut StreamChain,w:&mut World,r:Request,out:&str,label:&str,vm:bool)->Result<()>{
    if vm{
        let db=chain.base.seed_identity_with_history(w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;
        let previous=db.get_checkpoint_leaf_data(w.checkpoint).await?;
        let r=minimum_exact_fee(w,&chain.spec,r)?;execute(w,&chain.spec,&r)?;
        chain.base.retained_history.insert(w.checkpoint,previous);w.checkpoint+=1;Ok(())
    }else{
        if let Ok(root)=std::env::var("FUNDED_PAIR_REPLAY"){
            let input=std::path::Path::new(&root).join(format!("{}-{label}",w.kind));
            if input.join("verification.json").exists(){return replay(chain,w,r,&input,out,label).await;}
        }
        chain.prove(w,r,out,label).await
    }
}
async fn source(chain:&mut StreamChain,w:&World)->Result<()> {
    let db=chain.base.seed_identity_with_history(w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;
    chain.source=snapshot(db,w,&chain.review,chain.key.g.get_fingerprint()).await?;chain.source_checkpoint=w.checkpoint;Ok(())
}
async fn recover(chain:&mut StreamChain,w:&mut World,key:[u64;4],out:&str,vm:bool)->Result<()> {
    let before_scope=(0..4).map(|i|w.val(V,"stream_scope",i)).collect::<Vec<_>>();let deadline=w.val(V,"stream_expiry",0);let used=w.val(V,"fee_used",0);
    w.run(OWNER,M,"authorize_fee_budget",&[vec![V,2,CAP],key.to_vec()].concat())?;
    w.run(OWNER,0,"transfer",&[V,ESCROW])?;
    let(_,page)=SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
    let mut r=bound(basic(13,&page,w),key);r.fields[21]=2;r.fields[22]=CAP;r.fields[23]=1;
    step(chain,w,r,out,"fee-recovery",vm).await?;
    ensure!(w.val(V,"fee_used",0)>used&&w.val(V,"stream_expiry",0)==deadline&&(0..4).map(|i|w.val(V,"stream_scope",i)).collect::<Vec<_>>()==before_scope,"recovery preserves set/deadline and never resets spending");Ok(())
}
fn claims(w:&mut World)->Result<Vec<Value>>{
    let mut claims=vec![];
    for u in [200,201]{for asset in if w.kind=="nftmarket"{vec![0,A]}else{vec![0,A,B]}{
        let read=|user,c,o|w.state.get_contract_slot(user,c,o).unwrap()as u128;
        let (sent,claimed)=if asset==0{(read(V,0,3+2*u),read(u,0,4+2*V))}else{
            (read(V,asset,33554453+4*u)+(read(V,asset,33554454+4*u)<<62),read(u,asset,33554455+4*V)+(read(u,asset,33554456+4*V)<<62))};
        ensure!(sent>=claimed,"monotone recipient outbox");let amount=sent-claimed;
        let before=if asset==0{w.state.get_contract_slot(u,0,0)?as u128}else{w.balance(u,asset)};
        if amount>0{w.run(u,asset,"claim",&[V])?;}
        let after=if asset==0{w.state.get_contract_slot(u,0,0)?as u128}else{w.balance(u,asset)};
        ensure!(after-before==amount,"exact original recipient claim");
        claims.push(json!({"owner":u,"asset":asset,"delta":(after-before).to_string(),"ordinaryWalletSignature":false,"unused":amount.to_string()}));
    }}Ok(claims)
}
#[tokio::test]
#[ignore="bounded new v15 spending cohort; explicit output/VM mode required"]
async fn paired_funded_bootstrap_priority_and_refunds()->Result<()> {
    let out=std::env::var("FUNDED_PAIR_OUT")?;fs::create_dir(&out)?;
    let vm=std::env::var("FUNDED_PAIR_VM_ONLY").as_deref()==Ok("1");
    let selected=std::env::var("FUNDED_PAIR_MARKETS").unwrap_or_else(|_|"orderbook,nftmarket".into());
    for kind in selected.split(','){
        let mut w=World::new_fixture(kind,false,false)?;w.set(OWNER,0,0,1000*ESCROW);
        ensure!(!w.slots.keys().any(|(u,_,_)|*u==V),"no preloaded vault");
        let mut chain=StreamChain::new_with_maintenance(&w,true).await?;chain.base.keep_history=true;
        ensure!(chain.spec["version"]==15,"distinct v15 only");
        let key=super::funded_bootstrap_full_ups::registered(&chain);
        let totals=[asset_total(&w,A)?,asset_total(&w,B)?];let native=super::minimum_stream_full_ups::native_total(&w)?;
        let initial=3*ESCROW;
        w.run(OWNER,M,"authorize_fee_budget",&[vec![V,1,initial],key.to_vec()].concat())?;w.run(OWNER,0,"transfer",&[V,CAP])?;
        w.fee(I)?;w.pay(I,A,1)?;if kind=="orderbook"{w.pay(I,B,1)?;}
        let db=chain.base.seed_identity_with_history(&w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;
        let header=snapshot_header(db,&w,&chain.review,chain.key.g.get_fingerprint()).await?;chain.source=SourcePage::inactive_maintenance(&chain.review,&header)?.0;
        let(_,inactive)=SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
        let mut boot=bound(basic(14,&inactive,&w),key);boot.fields[21]=1;boot.fields[22]=initial;boot.fields[23]=1;boot.fields[24]=I;
        let frozen=w.slots.clone();let mut bad=boot.clone();bad.registered_key.as_mut().unwrap()[0]^=1;
        ensure!(execute(&mut w,&chain.spec,&bad).is_err()&&w.slots==frozen,"wrong funding key rolls back activation/seed return");
        step(&mut chain,&mut w,boot,&out,"bootstrap",vm).await?;
        ensure!(w.val(V,"batch_ready",0)==1&&w.balance(V,A)==0,"activation returns FT seed");
        let n=(1u128<<62)+17;let mut payload=None;
        if kind=="orderbook"{
            for(u,side,x,y)in[(200,0,n,2*n),(201,1,2*n,n)]{w.run(u,M,"open_sell",&args(&[V,side],&[x,y],&[200,1]))?;w.fee(u)?;w.pay(u,if side==0{A}else{B},x)?;}
        }else{
            payload=Some(super::pair_stream::nft_payload(&w,200)?);
            w.run(200,NFT,"acknowledge",&[V])?;w.run(200,M,"open_listing",&args(&[V,0],&[n],&[200,1]))?;w.fee(200)?;w.run(200,NFT,"transfer",&[0,V])?;
            w.run(201,NFT,"acknowledge",&[V])?;w.run(201,M,"open_buy",&args(&[V,200,1],&[n],&[200,1]))?;w.fee(201)?;w.pay(201,A,n)?;
        }
        source(&mut chain,&w).await?;let original=chain.source.clone();let pages=stream_source::prepare(&chain.review,&original,original.history.checkpoint_path.root)?;
        let q=stream_source::priority(&chain.review,&original,original.history.checkpoint_path.root)?;ensure!(q.members.len()==2,"complete two-member source");
        let open=bound(basic(OPEN,&pages[0],&w),key);step(&mut chain,&mut w,open,&out,"open",vm).await?;
        let mut recovered=false;
        for(i,page)in pages.iter().enumerate(){let r=bound(basic(COVER,page,&w),key);
            if minimum_exact_fee(&w,&chain.spec,r.clone()).is_err(){ensure!(!recovered,"one declared recovery");recover(&mut chain,&mut w,key,&out,vm).await?;recovered=true;}
            step(&mut chain,&mut w,r,&out,&format!("cover-{i}"),vm).await?;
        }
        ensure!(recovered,"exercise cap exhaustion inside frozen source");
        let records=q.members.iter().map(|m|Record::source(&chain.review,&original,m)).collect::<Result<Vec<_>>>()?;
        let mut state=FrontierState::initial(q.root());let mut scans=0;
        while !state.complete{let page=frontier::next_triangular_page(chain.review.kind,&pages[0].scope,&q,&records,&state)?;let mut r=bound(basic(frontier::SCAN,&pages[0],&w),key);r.frontier=Some(page.clone());
            let mut bad=r.clone();bad.frontier.as_mut().unwrap().before.cursor+=1;let before=w.slots.clone();ensure!(execute(&mut w,&chain.spec,&bad).is_err()&&w.slots==before,"scan cursor replacement cannot skip priority");
            step(&mut chain,&mut w,r,&out,&format!("scan-{scans}"),vm).await?;scans+=1;state=page.after;
        }
        let trade=bound(super::pair_optimized::request_trade(&w,&chain.review,&original,&pages[0],&q,&state)?,key);
        step(&mut chain,&mut w,trade,&out,"fill",vm).await?;
        ensure!(w.val(V,"stream_phase",0)==7&&w.val(V,"stream_settled",0)==2,"all members terminal");
        let replay_open=bound(basic(OPEN,&pages[0],&w),key);let before=w.slots.clone();ensure!(execute(&mut w,&chain.spec,&replay_open).is_err()&&w.slots==before,"original source cannot reopen");
        let mut claims=claims(&mut w)?;
        if kind=="nftmarket"{w.run(201,NFT,"claim",&[0,V])?;ensure!(Some(super::pair_stream::nft_payload(&w,201)?)==payload,"exact NFT token and metadata ordinary bytecode delivery");claims.push(json!({"owner":201,"collection":NFT,"ordinaryWalletSignature":false}));
            w.fee(201)?;let(_,inactive)=SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
            let mut ack=bound(basic(4,&inactive,&w),key);ack.fields[21..34].copy_from_slice(&w.fields("ack_delivery",201,0,0,0,0,0,0,0));
            step(&mut chain,&mut w,ack,&out,"ack-delivered-buyer",vm).await?;
        }
        // A second fixed source has one unmatched funded order. It can exit
        // only through the original deadline, returning the actual FT or NFT.
        let refund_owner=if kind=="orderbook"{200}else{202};let mut refund_payload=None;
        if kind=="orderbook"{
            w.run(200,M,"close_0",&[])?;w.run(200,M,"open_sell",&args(&[V,0],&[n,2*n],&[200,2]))?;w.fee(200)?;w.pay(200,A,n)?;
        }else{
            refund_payload=Some(super::pair_stream::nft_payload(&w,202)?);
            w.run(202,NFT,"acknowledge",&[V])?;w.run(202,M,"open_listing",&args(&[V,0],&[n],&[200,1]))?;w.fee(202)?;w.run(202,NFT,"transfer",&[0,V])?;
        }
        source(&mut chain,&w).await?;let refund_source=chain.source.clone();let refund_pages=stream_source::prepare(&chain.review,&refund_source,refund_source.history.checkpoint_path.root)?;
        let refund_queue=stream_source::priority(&chain.review,&refund_source,refund_source.history.checkpoint_path.root)?;ensure!(refund_queue.members.len()==1,"complete unmatched recovery source");
        let req=bound(basic(OPEN,&refund_pages[0],&w),key);step(&mut chain,&mut w,req,&out,"refund-open",vm).await?;
        w.run(refund_owner,M,"request_cancel",&[])?;
        for(i,page)in refund_pages.iter().enumerate(){let req=bound(basic(COVER,page,&w),key);step(&mut chain,&mut w,req,&out,&format!("refund-cover-{i}"),vm).await?;}
        // Alternative history: a certified empty frontier may retain the
        // unmatched order. Never call this a refund or consume its nonce.
        let saved=w.clone();let saved_leaf=chain.base.last_leaf;let saved_history=chain.base.retained_history.clone();
        let records=refund_queue.members.iter().map(|m|Record::source(&chain.review,&refund_source,m)).collect::<Result<Vec<_>>>()?;
        let state=FrontierState::initial(refund_queue.root());let page=frontier::next_triangular_page(chain.review.kind,&refund_pages[0].scope,&refund_queue,&records,&state)?;
        ensure!(page.after.complete&&page.after.best.is_none(),"one unmatched order has no winner");
        let mut req=bound(basic(frontier::SCAN,&refund_pages[0],&w),key);req.frontier=Some(page.clone());
        step(&mut chain,&mut w,req,&out,"retention-scan-fork",vm).await?;
        let mut req=bound(basic(frontier::CARRY,&refund_pages[0],&w),key);req.frontier=Some(frontier::Page{before:page.after.clone(),after:page.after,rows:vec![],head:None});
        let consumed=w.val(V,"consumed",refund_owner);
        step(&mut chain,&mut w,req,&out,"retention-carry-fork",vm).await?;
        ensure!(w.val(V,"consumed",refund_owner)==consumed&&w.val(V,"stream_phase",0)==7,"legally retained order stays unconsumed");
        ensure!(super::minimum_stream_full_ups::native_total(&w)?+w.val(V,"fee_used",0)as u128==native,"retention branch fee conservation");
        w=saved;chain.base.last_leaf=saved_leaf;chain.base.retained_history=saved_history;
        w.checkpoint=refund_source.fields[7]+1;
        let req=bound(super::pair_stream::refund_page(&w,&chain.review,&refund_source,&refund_pages[0],&refund_queue,0)?,key);
        let replay=req.clone();step(&mut chain,&mut w,req,&out,"timeout-refund",vm).await?;
        let before=w.slots.clone();ensure!(execute(&mut w,&chain.spec,&replay).is_err()&&w.slots==before,"terminal refund cannot repeat");
        if kind=="orderbook"{let before=w.balance(200,A);w.run(200,A,"claim",&[V])?;ensure!(w.balance(200,A)==before+n,"exact unfilled FT input returned");}
        else{w.run(202,NFT,"claim",&[0,V])?;ensure!(Some(super::pair_stream::nft_payload(&w,202)?)==refund_payload,"exact unfilled NFT token and metadata returned");}
        w.run(refund_owner,0,"claim",&[V])?;
        if kind=="nftmarket"{
            w.fee(202)?;let(_,inactive)=SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
            let mut ack=bound(basic(4,&inactive,&w),key);ack.fields[21..34].copy_from_slice(&w.fields("ack_delivery",202,0,0,0,0,0,0,0));
            step(&mut chain,&mut w,ack,&out,"ack-refunded-seller",vm).await?;
        }
        ensure!(totals==[asset_total(&w,A)?,asset_total(&w,B)?]&&super::minimum_stream_full_ups::native_total(&w)?+w.val(V,"fee_used",0)as u128==native,"FT/Native conservation including fees");
        fs::write(format!("{out}/{kind}-REPORT.json"),serde_json::to_vec_pretty(&json!({"scope":"Conditional VM actor funding/order prerequisites; actual v15 vault UPSs when vmOnly=false. No RPC, ordinary signatures or network acceptance.","vmOnly":vm,"fullUpsVerified":!vm,"emptyVaultBootstrap":true,"feeExhaustionRecovery":recovered,"sourcePreserved":true,"globalPriority":true,"settled":2,"timeoutRefunds":1,"cancelAfterSeal":true,"scanPages":scans,"claims":claims,"assetConservation":true,"nativeConservation":true,"financialOperations":0,"measurements":chain.measurements}))?)?;
    }Ok(())
}
