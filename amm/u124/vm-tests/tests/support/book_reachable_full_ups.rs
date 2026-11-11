//! Reachable public-FT Orderbook flow. Only the explicit QA genesis is seeded;
//! every subsequent account mutation is an ordinary or dedicated-key full UPS.
//! This is synthetic checkpoint acceptance, never a deployment or network receipt.
use super::*;
use psy_common_circuit::circuits::zk_signature3::core::PsyBasicZKSignatureCircuit;
use psy_crypto::signature::zk::wallet::SimplePsyPrivateKey;
use psy_template_u124_markets::pair_frontier::{self as frontier, Record, State};

const OWNER: u64 = 600;
const FIRST_CAP: u64 = 3 * ESCROW;
const FINAL_CAP: u64 = 30 * ESCROW;
#[path="book_reachable_prefix.rs"]
mod book_reachable_prefix;

fn call(contract: u64, method: &str, inputs: Vec<u64>) -> Value {
    json!({"contract_id":contract,"method_name":method,"inputs":inputs})
}
fn bound(mut request: Request, key: [u64; 4]) -> Request {
    request.registered_key = Some(key);
    request
}
async fn freeze_source(chain: &mut StreamChain, w: &World) -> Result<()> {
    let db = chain.base.seed_identity_with_history(
        w, chain.key.g.get_fingerprint(), &[(1, anchor_leaf())],
    ).await?;
    chain.source = snapshot(db, w, &chain.review, chain.key.g.get_fingerprint()).await?;
    chain.source_checkpoint = w.checkpoint;
    Ok(())
}
fn pending(w: &World, user: u64, asset: u64) -> Result<u128> {
    let read = |u, offset| w.state.get_contract_slot(u, asset, offset).map(u128::from);
    let (sent, claimed) = if asset == 0 {
        (read(V, 3 + 2 * user)?, read(user, 4 + 2 * V)?)
    } else {
        (read(V, 33554453 + 4 * user)? + (read(V, 33554454 + 4 * user)? << 62),
         read(user, 33554455 + 4 * V)? + (read(user, 33554456 + 4 * V)? << 62))
    };
    ensure!(sent >= claimed, "monotone original-recipient Outbox");
    Ok(sent - claimed)
}
fn claim_calls(w: &World, user: u64) -> Result<Vec<Value>> {
    let mut calls = Vec::new();
    for asset in [A, B, 0] {
        if pending(w, user, asset)? > 0 {
            calls.push(call(asset, "claim", vec![V]));
        }
    }
    ensure!(!calls.is_empty(), "actual pending output before ordinary claim");
    Ok(calls)
}

#[tokio::test]
#[ignore = "bounded complete Orderbook lifecycle; fresh output and minimal QA genesis required"]
async fn reachable_orderbook_ordinary_orders_fill_cancel_refund_and_claim() -> Result<()> {
    ensure!(std::env::var("BATCH_MINIMAL_GENESIS").as_deref() == Ok("1"),
        "explicit QA genesis, no post-genesis VM funding shortcuts");
    let out = std::env::var("BOOK_REACHABLE_OUT")?;
    fs::create_dir(&out)?;
    let mut w = World::new_fixture("orderbook", false, false)?;
    // Explicit test genesis balances. These public deterministic signing keys
    // never identify a live account and are never exported as wallet secrets.
    for user in [OWNER, 201] { w.set(user, 0, 0, 1000 * ESCROW); }
    ensure!(!w.slots.keys().any(|(user, _, _)| *user == V), "empty vault genesis");
    let totals = [asset_total(&w, A)?, asset_total(&w, B)?];
    let native = super::minimum_stream_full_ups::native_total(&w)?;
    let initial = [w.balance(200, A), w.balance(200, B)];
    let mut chain = StreamChain::new_with_maintenance(&w, true).await?;
    ensure!(chain.spec["version"] == 19 && chain.spec["fee_owner"] == OWNER,
        "current reviewed Orderbook v19 key and owner");
    chain.base.keep_history = true;
    let signature = PsyBasicZKSignatureCircuit::<C, 2>::new();
    let mut keys = BTreeMap::new();
    for user in [I, OWNER, 200, 201] {
        let private = Q(HashOut { elements: [f(user), f(20261111), GF::ZERO, GF::ONE] });
        chain.base.actor_keys.insert(user, SimplePsyPrivateKey::new(private)
            .get_public_key_for_fingerprint::<PoseidonHash>(signature.get_fingerprint()));
        keys.insert(user, private);
    }
    let db = chain.base.seed_identity_with_history(
        &w, chain.key.g.get_fingerprint(), &[(1, anchor_leaf())],
    ).await?;
    let header = snapshot_header(db, &w, &chain.review, chain.key.g.get_fingerprint()).await?;
    chain.source = SourcePage::inactive_maintenance(&chain.review, &header)?.0;
    let key = super::funded_bootstrap_full_ups::registered(&chain);
    let mut ordinary_fee = 0u128;
    let mut ordinary_count = 0usize;
    let prefix=book_reachable_prefix::Prefix::load()?;
    macro_rules! ordinary {
        ($user:expr, $calls:expr, $label:expr) => {{
            let user = $user;
            ordinary_fee += if let Some(saved)=prefix.as_ref().filter(|_|["owner-initial-authorization","issuer-exact-activation-seeds"].contains(&$label)) {
                saved.ordinary(&mut chain,&mut w,user,$calls,&out,$label).await?
            } else { super::funded_lifecycle_full_ups::ordinary(
                &mut chain, &mut w, &signature, keys[&user], user,
                $calls, &out, $label,
            ).await? } as u128;
            ordinary_count += 1;
        }};
    }
    ordinary!(OWNER, vec![
        call(M, "authorize_fee_budget", [vec![V, 1, FIRST_CAP], key.to_vec()].concat()),
        call(0, "transfer", vec![V, FIRST_CAP]),
    ], "owner-initial-authorization");
    ordinary!(I, vec![call(0, "transfer", vec![V, ESCROW]),
        call(A, "transfer", args(&[V], &[1], &[])),
        call(B, "transfer", args(&[V], &[1], &[]))], "issuer-exact-activation-seeds");
    let (_, inactive) = SourcePage::inactive_maintenance(&chain.review, &chain.source)?;
    let mut boot = bound(basic(14, &inactive, &w), key);
    boot.fields[21..25].copy_from_slice(&[1, FIRST_CAP, 1, I]);
    if let Some(saved)=&prefix { saved.bootstrap(&mut chain,&mut w,boot,&out).await?; }
    else { chain.prove(&mut w, boot, &out, "reachable-book-bootstrap").await?; }
    ensure!(w.val(V, "batch_ready", 0) == 1 && w.balance(V, A) == 0
        && w.balance(V, B) == 0, "activated empty vault returns exact seeds");

    let n = (1u128 << 62) + 17;
    ordinary!(I, vec![call(B, "transfer", args(&[201], &[2*n], &[])),
        call(A,"transfer",args(&[201],&[1],&[])),
        call(B,"transfer",args(&[200],&[1],&[]))],
        "issuer-funds-counterparty-outbox");
    ordinary!(201, vec![call(B, "claim", vec![I]),call(A,"claim",vec![I])], "counterparty-ordinary-funding-claim");
    ordinary!(200,vec![call(B,"claim",vec![I])],"maker-ordinary-receive-state-claim");
    ensure!(w.balance(201, B) == 2*n&&w.balance(201,A)==1&&w.balance(200,B)==initial[1]+1,
        "Outbox is claimed and both receiving FT partitions exist before spend");
    for (user, side, x, y, asset, label) in [
        (200, 0, n, 2*n, A, "maker-approved-order"),
        (201, 1, 2*n, n, B, "taker-approved-order"),
    ] {
        ordinary!(user, vec![call(M, "open_sell", args(&[V, side], &[x,y], &[500,1])),
            call(0, "transfer", vec![V, ESCROW]),
            call(asset, "transfer", args(&[V], &[x], &[]))], label);
    }
    freeze_source(&mut chain, &w).await?;
    let source = chain.source.clone();
    let pages = stream_source::prepare(&chain.review, &source, source.history.checkpoint_path.root)?;
    let queue = stream_source::priority(&chain.review, &source, source.history.checkpoint_path.root)?;
    fs::write(format!("{out}/source-eligibility.json"),serde_json::to_vec_pretty(
        &psy_template_u124_markets::final_state_coverage::verify_snapshot(&chain.review,&source,source.history.checkpoint_path.root)?)?)?;
    ensure!(pages.len() >= 2 && queue.members.len() == 2,
        "complete multi-page inventory with both authenticated orders");
    let open = bound(basic(OPEN, &pages[0], &w), key);
    chain.prove(&mut w, open, &out, "reachable-book-open").await?;
    let scope = (0..4).map(|i| w.val(V,"stream_scope",i)).collect::<Vec<_>>();
    let expiry = w.val(V,"stream_expiry",0);
    // The initial cap covers three maximum fees: bootstrap, open and the
    // first coverage page. Exhaustion must therefore target the fourth UPS,
    // not assume that the third exact fee already exceeds that cap.
    let first_cover=bound(basic(COVER,&pages[0],&w),key);
    chain.prove(&mut w,first_cover,&out,"reachable-book-cover-0").await?;
    let before = w.slots.clone();
    ensure!(minimum_exact_fee(&w, &chain.spec, bound(basic(COVER,&pages[1],&w),key)).is_err()
        && w.slots == before, "exhausted owner cap stops without state changes");
    ordinary!(OWNER, vec![
        call(M,"authorize_fee_budget",[vec![V,2,FINAL_CAP],key.to_vec()].concat()),
        call(0,"transfer",vec![V,FINAL_CAP-FIRST_CAP]),
    ], "owner-explicit-recovery-grant");
    let (_, maintenance) = SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
    let mut grant = bound(basic(13,&maintenance,&w),key);
    grant.fields[21..24].copy_from_slice(&[2,FINAL_CAP,1]);
    chain.prove(&mut w,grant,&out,"reachable-book-fee-recovery").await?;
    ensure!(expiry==w.val(V,"stream_expiry",0)
        && scope==(0..4).map(|i|w.val(V,"stream_scope",i)).collect::<Vec<_>>(),
        "fee recovery preserves the original frozen set and deadline");
    for (i,page) in pages.iter().enumerate().skip(1) {
        let request=bound(basic(COVER,page,&w),key);
        chain.prove(&mut w,request,&out,&format!("reachable-book-cover-{i}")).await?;
    }
    let records=queue.members.iter().map(|member|Record::source(&chain.review,&source,member))
        .collect::<Result<Vec<_>>>()?;
    let mut state=State::initial(queue.root());
    let mut scans=0;
    while !state.complete {
        let page=frontier::next_triangular_page(chain.review.kind,&pages[0].scope,&queue,&records,&state)?;
        let mut request=bound(basic(frontier::SCAN,&pages[0],&w),key);
        request.frontier=Some(page.clone());
        let mut bad=request.clone();bad.frontier.as_mut().unwrap().before.cursor+=1;
        let before=w.slots.clone();
        ensure!(execute(&mut w,&chain.spec,&bad).is_err()&&w.slots==before,
            "a changed scan cursor cannot skip global priority");
        chain.prove(&mut w,request,&out,&format!("reachable-book-priority-{scans}")).await?;
        state=page.after;scans+=1;
    }
    let trade=bound(super::pair_optimized::request_trade(
        &w,&chain.review,&source,&pages[0],&queue,&state)?,key);
    let repeat=trade.clone();
    chain.prove(&mut w,trade,&out,"reachable-book-fill").await?;
    let before=w.slots.clone();
    ensure!(execute(&mut w,&chain.spec,&repeat).is_err()&&w.slots==before,
        "one frozen pair cannot settle twice");
    for (user,label) in [(200,"maker-ordinary-final-claim"),(201,"taker-ordinary-final-claim")] {
        let calls=claim_calls(&w,user)?;ordinary!(user,calls,label);
        ensure!([A,B,0].into_iter().all(|asset|pending(&w,user,asset).unwrap()==0),
            "ordinary claimed every actual market output");
    }
    ensure!(w.balance(200,A)==initial[0]-n && w.balance(200,B)==initial[1]+1+2*n
        && w.balance(201,A)==n+1 && w.balance(201,B)==0, "exact whole-order fill amounts with separately conserved receive seeds");

    let refund_before=w.balance(200,A);
    ordinary!(200,vec![call(M,"close_0",vec![]),
        call(M,"open_sell",args(&[V,0],&[n,3*n],&[900,2])),
        call(0,"transfer",vec![V,ESCROW]),call(A,"transfer",args(&[V],&[n],&[]))],
        "maker-unmatched-order");
    freeze_source(&mut chain,&w).await?;
    let refund_source=chain.source.clone();
    let refund_pages=stream_source::prepare(&chain.review,&refund_source,refund_source.history.checkpoint_path.root)?;
    let refund_queue=stream_source::priority(&chain.review,&refund_source,refund_source.history.checkpoint_path.root)?;
    ensure!(refund_queue.members.len()==1,"new inventory contains exactly the unmatched order");
    let request=bound(basic(OPEN,&refund_pages[0],&w),key);
    chain.prove(&mut w,request,&out,"reachable-book-refund-open").await?;
    ordinary!(200,vec![call(M,"request_cancel",vec![])],"maker-cancels-after-seal");
    for (i,page) in refund_pages.iter().enumerate() {
        let request=bound(basic(COVER,page,&w),key);
        chain.prove(&mut w,request,&out,&format!("reachable-book-refund-cover-{i}")).await?;
    }
    // Waiting advances the synthetic checkpoint only, never order, asset or
    // nonce state. The original queue and expiry remain the recovery authority.
    w.checkpoint=refund_source.fields[7]+1;
    let request=bound(super::pair_stream::refund_page(
        &w,&chain.review,&refund_source,&refund_pages[0],&refund_queue,0)?,key);
    let repeat=request.clone();
    chain.prove(&mut w,request,&out,"reachable-book-timeout-refund").await?;
    let before=w.slots.clone();
    ensure!(execute(&mut w,&chain.spec,&repeat).is_err()&&w.slots==before,
        "terminal refund cannot be consumed twice");
    let mut calls=claim_calls(&w,200)?;calls.push(call(M,"close_0",vec![]));
    ordinary!(200,calls,"maker-ordinary-refund-claim");
    ensure!(w.balance(200,A)==refund_before && w.val(V,"consumed",200)==2,
        "cancelled whole order returns its original full U124 input");
    ensure!(totals==[asset_total(&w,A)?,asset_total(&w,B)?],"full FT and Outbox conservation");
    ensure!(super::minimum_stream_full_ups::native_total(&w)?+ordinary_fee
        +w.val(V,"fee_used",0) as u128==native,"ordinary and dedicated-key fees conserve");
    let vault_count=chain.measurements.iter().filter(|row|row.get("fee").is_some()).count();
    fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({
        "scope":"Complete ordinary and v19 SD-key UPSs on a reachable synthetic QA checkpoint chain; not network, deployment or browser acceptance",
        "ordinaryUps":ordinary_count,"sdKeyUps":vault_count,"completeUps":ordinary_count+vault_count,
        "prefixProofsReused":if prefix.is_some(){3}else{0},
        "newlyGeneratedCompleteUps":ordinary_count+vault_count-if prefix.is_some(){3}else{0},
        "fullUpsVerified":true,"emptyVaultAtStart":true,"noPostGenesisVmActorMutation":true,
        "ordinaryOrdersFundingAndClaims":true,"fundingClaimedBeforeSpend":true,
        "sourcePages":pages.len(),"globalPriceTimePriority":true,"wholeOrderFills":1,
        "originalSetAndExpiryPreserved":true,"feeExhaustionRejected":true,"explicitFeeRecovery":true,
        "cancelAfterSeal":true,"timeoutRefunds":1,"duplicateFillAndRefundRejected":true,
        "ordinaryFinalClaims":2,"ordinaryRefundClaims":1,"bothAmountLimbsNonzero":true,
        "assetConservation":true,"nativeConservationIncludingAllFees":true,
        "ordinaryFee":ordinary_fee.to_string(),"sdKeyFee":w.val(V,"fee_used",0),
        "financialOperations":0,"broadcast":false,"randomMode":false,
        "measurements":chain.measurements
    }))?)?;
    Ok(())
}
