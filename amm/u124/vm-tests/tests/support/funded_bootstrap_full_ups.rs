//! New deterministic key/bytecode. Synthetic checkpoint actor prerequisites only.
use super::*;
const OWNER:u64=600;
const CAP:u64=100_000_000_000;
fn registered(chain:&StreamChain)->[u64;4]{
    PoseidonHash::two_to_one(chain.key.g.get_fingerprint().0,chain.source.key_public_param.0)
        .elements.map(|n|n.to_canonical_u64())
}
fn fund(w:&mut World,key:[u64;4])->Result<()> {
    fund_with_limit(w,key,CAP)
}
fn fund_with_limit(w:&mut World,key:[u64;4],limit:u64)->Result<()> {
    ensure!(!w.slots.keys().any(|(u,_,_)|*u==V)&&w.revision==0,"empty vault");
    w.set(OWNER,0,0,CAP+ESCROW);
    w.run(OWNER,M,"authorize_fee_budget",&[vec![V,1,limit],key.to_vec()].concat())?;
    w.run(OWNER,0,"transfer",&[V,CAP])?;
    w.fee(I)?;w.pay(I,A,1)?;w.pay(I,B,1)?;Ok(())
}

#[test]
fn deterministic_fee_owner_and_lifetime_budget_are_enforced()->Result<()> {
    for kind in ["amm","bondingcurve"] {
        let key=[11,22,33,44];
        let mut w=World::new_fixture(kind,false,false)?;fund(&mut w,key)?;
        for (actor,nonce,cap,identity) in [
            (I,2,CAP,key),(OWNER,1,CAP,key),(OWNER,2,CAP-1,key),
            (OWNER,2,CAP,[0;4]),(OWNER,2,1<<62,key),
        ] {
            let before=w.slots.clone();
            ensure!(w.run(actor,M,"authorize_fee_budget",&[vec![V,nonce,cap],identity.to_vec()].concat()).is_err()
                &&w.slots==before,"grant authorization fails without writes");
        }
        let before=w.slots.clone();
        ensure!(w.run(OWNER,M,"account_executor_fee",&[vec![1],key.to_vec()].concat()).is_err()
            &&w.slots==before,"fees-only owner cannot act as vault");

        // Available Native funding is deliberately much larger than the signed
        // lifetime cap. Funds alone must not authorize even the first fee.
        let mut limited=World::new_fixture(kind,false,false)?;
        fund_with_limit(&mut limited,key,1)?;
        let page=SourcePage{scope:vec![0;41],facts:vec![[0;4];5],before:Progress::empty(),after:Progress::empty(),rows:vec![]};
        let mut req=request(&page,&limited,key);req.fields[22]=1;
        let before=limited.slots.clone();
        ensure!(execute(&mut limited,&read_spec(kind)?,&req).is_err()&&limited.slots==before
            &&limited.revision==0,"insufficient lifetime cap rolls back activation, seed return and treasury claim");
    }
    Ok(())
}
fn request(page:&SourcePage,w:&World,key:[u64;4])->Request {
    let mut req=basic(14,page,w);req.registered_key=Some(key);
    req.fields[21]=1;req.fields[22]=CAP;req.fields[23]=1;req.fields[24]=I;req
}

#[test]
fn deterministic_bootstrap_atomic_seed_grant_and_cap_rollback()->Result<()> {
    for kind in ["amm","bondingcurve"] {
        let mut w=World::new_fixture(kind,false,false)?;let spec=read_spec(kind)?;
        ensure!(spec["version"]==14,"new deterministic funded profile only");
        let key=[11,22,33,44];fund(&mut w,key)?;
        let page=SourcePage{scope:vec![0;41],facts:vec![[0;4];5],before:Progress::empty(),after:Progress::empty(),rows:vec![]};
        let req=request(&page,&w,key);
        for mutation in ["nonce","cap","key","payer"] {
            let mut bad=req.clone();match mutation {
                "nonce"=>bad.fields[21]+=1,"cap"=>bad.fields[22]+=1,
                "key"=>bad.registered_key.as_mut().unwrap()[0]+=1,_=>bad.fields[24]=OWNER,
            }
            let before=w.slots.clone();ensure!(execute(&mut w,&spec,&bad).is_err()&&w.slots==before,"invalid bootstrap rollback");
        }
        for asset in [0,A,B] {
            let mut excess=w.clone();if asset==0{excess.run(I,0,"transfer",&[V,1])?;}else{excess.pay(I,asset,1)?;}
            let before=excess.slots.clone();ensure!(execute(&mut excess,&spec,&req).is_err()&&excess.slots==before,"exact seed rollback");
        }
        let exact=minimum_exact_fee(&w,&spec,req)?;execute(&mut w,&spec,&exact)?;
        ensure!(w.val(V,"batch_ready",0)==1&&w.balance(V,A)==0&&w.balance(V,B)==0,"returned exact FT seeds");
        let before=w.slots.clone();ensure!(execute(&mut w,&spec,&exact).is_err()&&w.slots==before,"bootstrap cannot replay");
        ensure!(w.state.get_contract_slot(V,0,0)?+w.val(V,"fee_used",0)==CAP+ESCROW,"native conservation");
    }Ok(())
}

#[tokio::test]
#[ignore="bounded deterministic bootstrap full UPSs; fresh output only"]
async fn deterministic_fresh_vault_bootstrap_complete_ups()->Result<()> {
    let out=std::env::var("FUNDED_BOOTSTRAP_OUT")?;fs::create_dir(&out)?;
    for kind in ["amm","bondingcurve"] {
        let mut w=World::new_fixture(kind,false,false)?;
        let mut chain=StreamChain::new_with_maintenance(&w,true).await?;
        ensure!(chain.spec["version"]==14,"new deterministic profile");
        let key=registered(&chain);fund(&mut w,key)?;
        let(_,page)=SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
        let req=request(&page,&w,key);
        chain.prove(&mut w,req,&out,"fresh-bootstrap").await?;
        ensure!(w.revision==1&&w.val(V,"batch_ready",0)==1&&w.val(V,"fee_cap",0)==CAP&&w.val(V,"fee_used",0)>0,"registered first-use endpoints");
        ensure!(w.balance(V,A)==0&&w.balance(V,B)==0,"seeds returned before treasury claim");
        if kind=="bondingcurve" {
            w.fee(I)?;w.pay(I,A,2_000_000*10u128.pow(18))?;
            let mut req=basic(4,&page,&w);req.registered_key=Some(key);
            req.fields[21..34].copy_from_slice(&w.fields("initialize",0,0,0,0,0,0,0,0));
            chain.prove(&mut w,req,&out,"deterministic-curve-initialize").await?;
            ensure!(w.val(V,"phase",0)==1,"actual curve initialization");
        }else{
            let used=w.val(V,"fee_used",0);
            w.run(OWNER,M,"authorize_fee_budget",&[vec![V,2,CAP+ESCROW],key.to_vec()].concat())?;
            let mut req=basic(13,&page,&w);req.registered_key=Some(key);req.fields[21]=2;req.fields[22]=CAP+ESCROW;
            chain.prove(&mut w,req,&out,"deterministic-fee-grant").await?;
            ensure!(w.val(V,"fee_grant_seen",0)==2&&w.val(V,"fee_used",0)>used,"fresh grant never resets fee use");
        }
        ensure!(w.state.get_contract_slot(V,0,0)?+w.val(V,"fee_used",0)==CAP+ESCROW+(if kind=="bondingcurve"{ESCROW}else{0}),"complete native fee conservation");
        fs::write(format!("{out}/{kind}-REPORT.json"),serde_json::to_vec_pretty(&json!({
            "profile":chain.spec["profile"],"emptyVaultAtStart":true,"fullUpsVerified":true,
            "registrationPathVerified":true,"randomMode":false,"seedSourceUsed":false,
            "measurements":chain.measurements,"keyFingerprint":chain.key.g.get_fingerprint(),
            "feeUsed":w.val(V,"fee_used",0),"grantSeen":w.val(V,"fee_grant_seen",0),
            "ordinaryActors":"VM prerequisites, not signed ordinary UPS or network receipts",
            "normalWalletClaims":false,"liveAcceptance":false,"financialOperations":0,
            "scope":"Actual bytecode, key and complete UPS on synthetic checkpoints; no network/finality/production claim"
        }))?)?;
    }Ok(())
}

#[tokio::test]
#[ignore="public failed-session replay; no new CFC, UPS or broadcast"]
async fn deterministic_saved_bootstrap_key_constraints()->Result<()> {
    let input=std::env::var("FUNDED_KEY_INPUT")?;let out=std::env::var("FUNDED_KEY_AUDIT_OUT")?;
    fs::create_dir(&out)?;
    let read=|name:&str|->Result<Value>{Ok(serde_json::from_slice(&fs::read(format!("{input}/{name}"))?)?)};
    let source:Snapshot=serde_json::from_value(read("source.json")?)?;
    let current:CurrentOpening=serde_json::from_value(read("current.json")?)?;
    let req:Request=serde_json::from_value(read("intent.json")?)?;
    ensure!([4,13,14].contains(&req.fields[0]),"inactive maintenance only");
    let public=read("public-session.json")?;
    let kind=std::env::var("FUNDED_KEY_MARKET").unwrap_or_else(|_|"amm".into());
    let w=World::new_fixture(&kind,false,false)?;
    let chain=StreamChain::new_with_maintenance(&w,true).await?;
    ensure!(chain.spec["version"]==14,"deterministic candidate only");
    ensure!(serde_json::to_value(chain.key.g.get_fingerprint())?==public["keyFingerprint"],"exact original key before replay");
    ensure!(serde_json::to_value(stream_policy::calls(&chain.spec,&req,true)?)?==public["actualCalls"],"exact original calls/fee");
    // SourceContext is disabled for this canonical inactive maintenance tape;
    // a zero path is not admitted as an authenticated source inventory.
    let path=MerkleProofCore::new_from_params::<PoseidonHash>(0,Q::ZERO,(0..32).map(|i|
        <PoseidonHash as psy_crypto::hash::traits::hasher::MerkleZeroHasher<Q<GF>>>::get_zero_hash(i)).collect());
    let context:SDKeySessionContext=serde_json::from_value(public["session"].clone())?;
    let input=SDKeyCircuitWitnessInput{session_context:context,
        circuit_inputs:chain.key.fields(&chain.review,&source,&path,&current,&req)?.into_iter().map(f).collect(),
        transaction_infos:serde_json::from_value(public["stack"].clone())?,tx_stack_hash:serde_json::from_value(public["txStackHash"].clone())?,
        tx_count:serde_json::from_value(public["txCount"].clone())?,state_reader_results:None,secp256k1_slots:vec![],
        checkpoint_id:serde_json::from_value(public["checkpoint"].clone())?,user_id:f(V)};
    let sig:Q<GF>=serde_json::from_value(public["sigHash"].clone())?;
    let proof=chain.key.g.prove(Q(HashOut{elements:[GF::ONE;4]}),&input,sig).await?;
    chain.key.g.minifier_chain.as_ref().unwrap().verify(proof)?;
    fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({"exactOriginalPublicSessionReplayed":true,
        "keyProofVerified":true,"newCfcProofs":0,"newFullUps":0,"financialOperations":0,"scope":"synthetic inactive maintenance only"}))?)?;
    Ok(())
}
