//! Synthetic first-use registration and exact activation/grant order. No RPC.
use super::*;
const OWNER: u64 = 600;
const CAP: u64 = 100_000_000_000;
fn registered(chain: &StreamChain) -> [u64; 4] {
    PoseidonHash::two_to_one(
        chain.key.g.get_fingerprint().0,
        chain.source.key_public_param.0,
    )
    .elements
    .map(|x| x.to_canonical_u64())
}
#[tokio::test]
#[ignore = "bounded fresh bootstrap full UPS acceptance; fresh output only"]
async fn minimum_fresh_registration_activation_and_initialization() -> Result<()> {
    let out = std::env::var("MINIMUM_BOOTSTRAP_OUT")?;
    fs::create_dir(&out)?;
    for kind in ["amm", "bondingcurve"] {
        let mut w = World::new_fixture(kind, false, false)?;
        ensure!(
            !w.slots.keys().any(|(u, _, _)| *u == V) && w.revision == 0,
            "truly empty vault, no injected account state"
        );
        let mut chain = StreamChain::new_with_maintenance(&w, true).await?;
        let pk = registered(&chain);
        w.set(OWNER, 0, 0, CAP + ESCROW);
        w.run(
            OWNER,
            M,
            "authorize_fee_budget",
            &[vec![V, 1, CAP], pk.to_vec()].concat(),
        )?;
        w.run(OWNER, 0, "transfer", &[V, CAP])?;
        w.fee(I)?;
        w.pay(I, A, 1)?;
        w.pay(I, B, 1)?;
        // These are ordinary actor VM prerequisites. Their real signature and
        // network acceptance are explicitly outside this first-vault UPS test.
        let (_, page) =
            stream_source::SourcePage::inactive_maintenance(&chain.review, &chain.source)?;
        let mut req = basic(14, &page, &w);
        req.registered_key = Some(pk);
        req.fields[21] = 1;
        req.fields[22] = CAP;
        req.fields[23] = 1;
        req.fields[24] = I;
        let calls = stream_policy::calls(&chain.spec, &req, true)?;
        let activation = calls
            .iter()
            .position(|c| c["method_name"] == "activate_batch_vault")
            .unwrap();
        let treasury = calls
            .iter()
            .position(|c| c["method_name"] == "apply_fee_grant")
            .unwrap();
        ensure!(
            activation < treasury,
            "original exact seed precondition before treasury claim"
        );
        let before = w.slots.clone();
        let mut wrong = req.clone();
        wrong.fields[24] = OWNER;
        ensure!(
            execute(&mut w, &chain.spec, &wrong).is_err() && w.slots == before,
            "funding owner cannot be activation payer"
        );
        chain.prove(&mut w, req, &out, "fresh-bootstrap").await?;
        ensure!(
            w.revision == 1
                && w.val(V, "batch_ready", 0) == 1
                && w.val(V, "fee_grant_seen", 0) == 1
                && w.val(V, "fee_cap", 0) == CAP
                && w.val(V, "fee_used", 0) > 0,
            "registration/activation/grant endpoints"
        );
        ensure!(
            w.balance(V, A) == 0 && w.balance(V, B) == 0,
            "activation seeds returned, no initial trader liquidity"
        );
        let native = w.state.get_contract_slot(V, 0, 0)?;
        ensure!(
            native + w.val(V, "fee_used", 0) == CAP + ESCROW,
            "exact treasury plus seed less fee"
        );
        let frozen = w.slots.clone();
        let mut replay = basic(14, &page, &w);
        replay.registered_key = Some(pk);
        replay.fields[21] = 1;
        replay.fields[22] = CAP;
        replay.fields[23] = 1;
        replay.fields[24] = I;
        ensure!(
            execute(&mut w, &chain.spec, &replay).is_err() && w.slots == frozen,
            "activation cannot replay"
        );
        if kind == "bondingcurve" {
            w.fee(I)?;
            w.pay(I, A, 2_000_000 * 10u128.pow(18))?;
            let mut req = basic(4, &page, &w);
            req.registered_key = Some(pk);
            req.fields[21..34].copy_from_slice(&w.fields("initialize", 0, 0, 0, 0, 0, 0, 0, 0));
            chain.prove(&mut w, req, &out, "curve-initialize").await?;
            ensure!(w.val(V, "phase", 0) == 1, "actual curve initialization");
        }
        fs::write(
            format!("{out}/{kind}-REPORT.json"),
            serde_json::to_vec_pretty(&json!({
                "emptyVaultAtStart":true,"registrationProofPath":true,"fullUpsVerified":true,
                "ordinaryActorPrerequisites":"VM bytecode only; no ordinary actor signed UPS or receipt",
                "normalWalletClaims":false,"liveDeployments":0,"broadcast":false,"profile":chain.spec["profile"],
                "measurements":chain.measurements,"activationBeforeTreasury":true,"unchangedExactNativeSeedCheck":true,
                "activationReplayRejected":true,"fundingOwnerPayerRejected":true,"feeUsed":w.val(V,"fee_used",0),
                "keyFingerprint":chain.key.g.get_fingerprint(),"newUserNonce":1,
                "initialLiquidity":if kind=="amm"{"empty; LP admission still required"}else{"issuer inventory initialized"}
            }))?,
        )?;
    }
    Ok(())
}

#[test]
fn minimum_bootstrap_vm_rollback_and_exact_seed_checks() -> Result<()> {
    for kind in ["amm", "bondingcurve"] {
        let mut w = World::new_fixture(kind, false, false)?;
        let spec = read_spec(kind)?;
        ensure!(spec["version"] == 12, "bootstrap profile only");
        let pk = [11, 22, 33, 44];
        w.set(OWNER, 0, 0, CAP + ESCROW);
        w.run(OWNER, M, "authorize_fee_budget", &[vec![V, 1, CAP], pk.to_vec()].concat())?;
        w.run(OWNER, 0, "transfer", &[V, CAP])?;
        w.fee(I)?; w.pay(I, A, 1)?; w.pay(I, B, 1)?;
        // No source authorization is claimed by this VM-only rollback test.
        let page = SourcePage { scope: vec![0;41], facts: vec![[0;4];5],
            before: Progress::empty(), after: Progress::empty(), rows: vec![] };
        let mut req = basic(14, &page, &w); req.registered_key = Some(pk);
        req.fields[21]=1; req.fields[22]=CAP; req.fields[23]=1; req.fields[24]=I;
        for kind in ["nonce", "cap", "key"] {
            let mut bad=req.clone();
            match kind { "nonce"=>bad.fields[21]=2, "cap"=>bad.fields[22]+=1,
                _=>bad.registered_key.as_mut().unwrap()[0]+=1 }
            let original=w.slots.clone();
            ensure!(execute(&mut w,&spec,&bad).is_err()&&w.slots==original,"post-activation failure must roll back all provisional claims and activation");
        }
        let mut excess=w.clone(); excess.run(I,0,"transfer",&[V,1])?;
        let original=excess.slots.clone();
        ensure!(execute(&mut excess,&spec,&req).is_err()&&excess.slots==original,"exact Native seed equality retained");
        for asset in [A,B] {
            let mut excess=w.clone();excess.pay(I,asset,1)?;let original=excess.slots.clone();
            ensure!(execute(&mut excess,&spec,&req).is_err()&&excess.slots==original,"exact FT seed equality retained");
        }
        let exact=minimum_exact_fee(&w,&spec,req)?;execute(&mut w,&spec,&exact)?;
        ensure!(w.val(V,"batch_ready",0)==1&&w.balance(V,A)==0&&w.balance(V,B)==0,"valid exact bootstrap");
        let original=w.slots.clone();
        ensure!(execute(&mut w,&spec,&exact).is_err()&&w.slots==original,"activation replay rollback");
    }
    Ok(())
}
