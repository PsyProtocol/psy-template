//! Triangular priority and authenticated early exits. No RPC or broadcast.
use super::*;
use sha2::{Digest,Sha256};
use psy_template_u124_markets::pair_frontier::{
    self as frontier, Page as FrontierPage, Record, State as FrontierState,
};
fn world(kind: &str) -> Result<World> {
    world_with_deadline(kind, 200)
}
pub(super) fn world_with_deadline(kind: &str, deadline: u64) -> Result<World> {
    let mut w = World::new(kind)?;
    for asset in [A, B] {
        w.run(
            I,
            asset,
            "transfer",
            &args(&[204], &[super::super::super::MAX / 16], &[]),
        )?;
        w.run(204, asset, "claim", &[I])?;
    }
    w.set(204, 0, 0, 1000 * ESCROW);
    for _ in 0..30 {
        w.run(
            S,
            M,
            "authorize_sponsor",
            &[V, 2 * ESCROW, w.val(S, "sponsor_nonce", 0) + 1, 2],
        )?;
        w.run(S, 0, "transfer", &[V, 2 * ESCROW])?;
        w.operation_maintenance("fund_gas", S, 0, 0, 0, 0, 2 * ESCROW)?;
    }
    let n = (1u128 << 62) + 17;
    if kind == "orderbook" {
        for (u, side, x, y, cp) in [
            (200, 0, n, 2 * n, 93),
            (201, 1, 3 * n, n, 95),
            (202, 0, n, n, 92),
            (203, 1, 3 * n, n, 94),
            (204, 0, n, 4 * n, 96),
        ] {
            w.checkpoint = cp;
            w.run(
                u,
                M,
                "open_sell",
                &args(&[V, side], &[x, y], &[deadline, 1]),
            )?;
            w.pay(u, if side == 0 { A } else { B }, x)?;
            w.fee(u)?;
        }
    } else {
        for u in [200, 202] {
            w.checkpoint = 90;
            w.run(u, NFT, "acknowledge", &[V])?;
            w.run(u, M, "open_listing", &args(&[V, 0], &[n], &[deadline, 1]))?;
            w.fee(u)?;
            w.run(u, NFT, "transfer", &[0, V])?;
        }
        for (u, s, cp) in [(203, 200, 92), (201, 200, 93), (204, 202, 94)] {
            w.checkpoint = cp;
            w.run(u, NFT, "acknowledge", &[V])?;
            w.run(u, M, "open_buy", &args(&[V, s, 1], &[n], &[deadline, 1]))?;
            w.pay(u, A, n)?;
            w.fee(u)?;
        }
    }
    w.checkpoint = 100;
    super::pair_stream::create_ineligible(&mut w)?;
    Ok(w)
}
fn read_frontier(w: &World, kind: u64, best: Option<frontier::Best>) -> FrontierState {
    FrontierState {
        outer: std::array::from_fn(|i| w.val(V, "frontier_outer", i as u64)),
        inner: std::array::from_fn(|i| w.val(V, "frontier_inner", i as u64)),
        best,
        cursor: w.val(V, "frontier_cursor", 0),
        complete: w.val(V, "frontier_complete", 0) == 1,
    }
}
fn request_scan(w: &World, p: &SourcePage, page: FrontierPage) -> Request {
    let mut r = basic(frontier::SCAN, p, w);
    r.frontier = Some(page);
    r
}
fn rejection(
    w: &World,
    r: &Review,
    s: &Snapshot,
    p: &SourcePage,
    q: &stream_source::PriorityTree,
    state: &FrontierState,
    owner: u64,
) -> Result<Request> {
    let m = q
        .members
        .iter()
        .find(|m| m.member.owner == owner)
        .context("original rejected member")?;
    let one = stream_source::PriorityTree::from_committed(&p.scope, vec![m.clone()])?;
    let mut req = super::pair_stream::refund_page(w, r, s, p, &one, 0)?;
    req.fields[1] = 1;
    req.fields[4] = w.val(V, "stream_settled", 0);
    req.settled = req.fields[4];
    req.members = vec![original_binding(r, s, m, q.proof(m.index))?];
    req.frontier = Some(FrontierPage {
        before: state.clone(),
        after: state.clone(),
        rows: vec![],
        head: None,
    });
    Ok(req)
}
async fn rejection_forks(
    chain: &mut StreamChain,
    w: &World,
    s: &Snapshot,
    p: &SourcePage,
    q: &stream_source::PriorityTree,
    records: &[Record],
    state: &FrontierState,
    out: &str,
    vm_only: bool,
) -> Result<()> {
    let leaf = chain.base.last_leaf;
    let owner = state.best.as_ref().unwrap().b.owner;
    let valid = rejection(w, &chain.review, s, p, q, state, owner)?;
    let mut unchanged = w.clone();
    let before = unchanged.slots.clone();
    ensure!(
        execute(&mut unchanged, &chain.spec, &valid).is_err() && unchanged.slots == before,
        "valid winner cannot be skipped"
    );
    let totals = [asset_total(w, A)?, asset_total(w, B)?];
    let mut fork = w.clone();
    fork.run(owner, M, "request_cancel", &[])?;
    let req = rejection(&fork, &chain.review, s, p, q, state, owner)?;
    step(
        chain,
        &mut fork,
        req.clone(),
        out,
        "cancel-winner-refund",
        vm_only,
    )
    .await?;
    let before = fork.slots.clone();
    ensure!(
        execute(&mut fork, &chain.spec, &req).is_err() && fork.slots == before,
        "rejected order replay"
    );
    let mut records = records.to_vec();
    let selected = records.iter().find(|r| r.owner == owner).unwrap().index;
    records.retain(|r| r.owner != owner);
    let mut q = q.clone();
    q.remove(selected);
    let mut next = FrontierState::initial(q.root());
    let mut i = 0;
    while !next.complete {
        let page =
            frontier::next_triangular_page(chain.review.kind, &s.fields, &q, &records, &next)?;
        let req = request_scan(&fork, p, page.clone());
        step(
            chain,
            &mut fork,
            req,
            out,
            &format!("cancel-rescan-{i}"),
            vm_only,
        )
        .await?;
        next = page.after;
        i += 1;
    }
    let winner = next
        .best
        .as_ref()
        .context("remaining global winner after cancellation")?;
    ensure!(
        (winner.a.owner, winner.b.owner) == (if w.kind == "orderbook" { 202 } else { 200 }, 201),
        "next exact global winner"
    );
    let req = request_trade(&fork, &chain.review, s, p, &q, &next)?;
    step(chain, &mut fork, req, out, "cancel-next-trade", vm_only).await?;
    records.retain(|r| r.owner != winner.a.owner && r.owner != winner.b.owner);
    let remaining = stream_source::PriorityTree::from_committed(
        &p.scope,
        q.members
            .iter()
            .filter(|m| records.iter().any(|r| r.index == m.index))
            .cloned()
            .collect(),
    )?;
    ensure!(
        remaining.root() == read_sort(&fork).ordered,
        "refund planner must preserve the exact source-v3 remaining root"
    );
    fork.checkpoint = s.fields[7] + 1;
    let mut refund = super::pair_stream::refund_page(&fork, &chain.review, s, p, &remaining, 0)?;
    refund.fields[4] = 3;
    refund.settled = 3;
    step(
        chain,
        &mut fork,
        refund,
        out,
        "cancel-remaining-refund",
        vm_only,
    )
    .await?;
    ensure!(
        fork.val(V, "stream_settled", 0) == 5 && fork.val(V, "stream_phase", 0) == 7,
        "cancel fork complete original set"
    );
    let asset = if w.kind == "orderbook" { B } else { A };
    let expected = if w.kind == "orderbook" { 3 } else { 1 } * ((1u128 << 62) + 17);
    let old = fork.balance(owner, asset);
    fork.run(owner, asset, "claim", &[V])?;
    ensure!(
        fork.balance(owner, asset) - old == expected,
        "cancelled sender exact original asset claim"
    );
    ensure!(
        totals == [asset_total(&fork, A)?, asset_total(&fork, B)?],
        "cancel fork conservation"
    );
    chain.base.last_leaf = leaf;
    // A current extra fee makes cutoff funding invalid; refund the actual delta.
    let mut funding = w.clone();
    funding.run(owner, 0, "transfer", &[V, 1])?;
    // Reconstruct the original tree from the still-preserved source members.
    let original = stream_source::PriorityTree::from_committed(&p.scope, q.members.clone())?;
    let req = rejection(&funding, &chain.review, s, p, &original, state, owner)?;
    step(
        chain,
        &mut funding,
        req,
        out,
        "funding-winner-refund",
        vm_only,
    )
    .await?;
    funding.run(owner, asset, "claim", &[V])?;
    funding.run(owner, 0, "claim", &[V])?;
    ensure!(
        totals == [asset_total(&funding, A)?, asset_total(&funding, B)?],
        "invalid funding conservation"
    );
    chain.base.last_leaf = leaf;
    let mut expired = w.clone();
    expired.checkpoint = 113;
    ensure!(
        expired.checkpoint <= s.fields[7],
        "order expires before source window"
    );
    let req = rejection(&expired, &chain.review, s, p, &original, state, owner)?;
    step(
        chain,
        &mut expired,
        req,
        out,
        "deadline-winner-refund",
        vm_only,
    )
    .await?;
    ensure!(
        totals == [asset_total(&expired, A)?, asset_total(&expired, B)?],
        "deadline refund conservation"
    );
    chain.base.last_leaf = leaf;
    Ok(())
}
pub(super) fn request_trade(
    w: &World,
    r: &Review,
    s: &Snapshot,
    p: &SourcePage,
    q: &stream_source::PriorityTree,
    state: &FrontierState,
) -> Result<Request> {
    let b = state.best.as_ref().context("global compatible winner")?;
    let mut req = basic(SETTLE, p, w);
    req.fields[2] = 2;
    req.fields[4] = w.val(V, "stream_settled", 0);
    let mut remaining = q.clone();
    let op = w.fields(
        if w.kind == "orderbook" {
            "match_orders"
        } else {
            "settle_sale"
        },
        b.a.owner,
        b.b.owner,
        if w.kind == "orderbook" {
            b.a.wide(r.kind, "x")
        } else {
            b.a.wide(r.kind, "price")
        },
        if w.kind == "orderbook" {
            b.b.wide(r.kind, "x")
        } else {
            0
        },
        0,
        0,
        b.a.value(r.kind, "nonce"),
        b.b.value(r.kind, "nonce"),
    );
    req.fields[21..34].copy_from_slice(&op);
    req.fields[35] = b.b.owner;
    req.fields[44] = b.b.value(r.kind, "nonce");
    for rec in [&b.a, &b.b] {
        let m = q
            .members
            .iter()
            .find(|m| m.index == rec.index)
            .context("global winner source member")?;
        req.members
            .push(original_binding(r, s, m, remaining.proof(m.index))?);
        remaining.remove(m.index);
    }
    req.frontier = Some(FrontierPage {
        before: state.clone(),
        after: state.clone(),
        rows: vec![],
        head: None,
    });
    Ok(req)
}
pub(super) fn claim_all(w: &mut World) -> Result<Vec<Value>> {
    let n = (1u128 << 62) + 17;
    let mut rows = vec![];
    for u in 200..205 {
        for asset in if w.kind == "nftmarket" {
            vec![0, A]
        } else {
            vec![0, A, B]
        } {
            let expected = if asset == 0 {
                if (w.kind == "orderbook" && [201, 203, 204].contains(&u))
                    || (w.kind == "nftmarket" && [200, 201, 202].contains(&u))
                {
                    ESCROW as u128
                } else {
                    0
                }
            } else if w.kind == "orderbook" {
                if asset == A && [201, 203, 204].contains(&u) {
                    n
                } else if asset == B && [200, 202].contains(&u) {
                    3 * n
                } else {
                    0
                }
            } else {
                if [200, 201, 202].contains(&u) {
                    n
                } else {
                    0
                }
            };
            let pending = if asset == 0 {
                (w.state.get_contract_slot(V, 0, 3 + 2 * u)?
                    - w.state.get_contract_slot(u, 0, 4 + 2 * V)?) as u128
            } else {
                sent_to(w, V, u, asset)
                    - (w.state.get_contract_slot(u, asset, 33554455 + 4 * V)? as u128
                        + (w.state.get_contract_slot(u, asset, 33554456 + 4 * V)? as u128)
                            * (1u128 << 62))
            };
            ensure!(
                pending == expected,
                "exact output/refund amount {u}/{asset}"
            );
            let before = if asset == 0 {
                w.state.get_contract_slot(u, 0, 0)? as u128
            } else {
                w.balance(u, asset)
            };
            if pending > 0 {
                w.run(u, asset, "claim", &[V])?;
            }
            let after = if asset == 0 {
                w.state.get_contract_slot(u, 0, 0)? as u128
            } else {
                w.balance(u, asset)
            };
            ensure!(after - before == expected, "ordinary claim delta");
            rows.push(json!({"owner":u,"asset":asset,"amount":expected.to_string(),"ordinaryWalletSignature":false}));
        }
        if w.kind == "nftmarket" && [203, 204].contains(&u) {
            w.run(u, NFT, "claim", &[0, V])?;
            let seller = if u == 203 { 200 } else { 202 };
            let expected = std::array::from_fn(|j| {
                w.val(
                    seller,
                    &if j < 4 {
                        format!("token_id_{j}")
                    } else {
                        format!("metadata_hash_{}", j - 4)
                    },
                    0,
                )
            });
            ensure!(
                super::pair_stream::nft_payload(w, u)? == expected,
                "exact original NFT token and metadata"
            );
            rows.push(json!({"owner":u,"collection":NFT,"payload":super::pair_stream::nft_payload(w,u)?,"ordinaryWalletSignature":false}));
        }
    }
    Ok(rows)
}
#[tokio::test]
#[ignore = "offline synthetic actual bytecode, key and fixed-verifier complete global paired UPSs"]
async fn pair_triangular_recovery_ups() -> Result<()> {
    let out = std::env::var("PAIR_TRIANGLE_OUT")?;
    fs::create_dir(&out)?;
    let selected =
        std::env::var("PAIR_TRIANGLE_MARKETS").unwrap_or_else(|_| "orderbook,nftmarket".into());
    let vm_only = std::env::var("PAIR_TRIANGLE_VM_ONLY").as_deref() == Ok("1");
    for kind in selected.split(',') {
        let mut w = world_with_deadline(kind, 112)?;
        let totals = [asset_total(&w, A)?, asset_total(&w, B)?];
        let mut chain = StreamChain::new(&w).await?;
        let s = chain.source.clone();
        let source_pages =
            stream_source::prepare(&chain.review, &s, s.history.checkpoint_path.root)?;
        let mut q = stream_source::priority(&chain.review, &s, s.history.checkpoint_path.root)?;
        ensure!(
            q.members.len() == 5 && source_pages.last().unwrap().after.recovery_count == 1,
            "complete source set"
        );
        let mut records = q
            .members
            .iter()
            .map(|m| Record::source(&chain.review, &s, m))
            .collect::<Result<Vec<_>>>()?;
        let scope = source_pages[0].scope.clone();
        let req = basic(OPEN, &source_pages[0], &w);
        step(&mut chain, &mut w, req, &out, "open", vm_only).await?;
        let abandoned = w.clone();
        let abandoned_leaf = chain.base.last_leaf;
        for (i, p) in source_pages.iter().enumerate() {
            let req = basic(COVER, p, &w);
            step(
                &mut chain,
                &mut w,
                req,
                &out,
                &format!("cover-{i}"),
                vm_only,
            )
            .await?;
        }
        let mut fills = vec![];
        let mut scan_counts = vec![];
        let mut attacks = vec![];
        for round in 0..2 {
            let mut state = FrontierState::initial(q.root());
            let mut count = 0;
            while !state.complete {
                let page = frontier::next_triangular_page(
                    chain.review.kind,
                    &scope,
                    &q,
                    &records,
                    &state,
                )?;
                let req = request_scan(&w, &source_pages[0], page.clone());
                // Before-state hash protects cursor/root replacement in actual bytecode.
                let mut bad = req.clone();
                bad.frontier.as_mut().unwrap().before.cursor += 1;
                let before = w.slots.clone();
                ensure!(
                    execute(&mut w, &chain.spec, &bad).is_err() && w.slots == before,
                    "frontier cursor must be exact"
                );
                attacks.push("frontier-cursor");
                step(
                    &mut chain,
                    &mut w,
                    req,
                    &out,
                    &format!("scan-{round}-{count}"),
                    vm_only,
                )
                .await?;
                state = page.after;
                ensure!(
                    read_frontier(&w, chain.review.kind, state.best.clone()) == state,
                    "actual frontier endpoint"
                );
                count += 1;
            }
            scan_counts.push(count);
            let best = state.best.as_ref().context("nonzero fill")?;
            let expected = if kind == "orderbook" {
                if round == 0 {
                    (202, 203)
                } else {
                    (200, 201)
                }
            } else {
                if round == 0 {
                    (200, 203)
                } else {
                    (202, 204)
                }
            };
            ensure!(
                (best.a.owner, best.b.owner) == expected,
                "global price/time or buyer priority"
            );
            if round == 0 {
                rejection_forks(
                    &mut chain,
                    &w,
                    &s,
                    &source_pages[0],
                    &q,
                    &records,
                    &state,
                    &out,
                    vm_only,
                )
                .await?;
            }
            let req = request_trade(&w, &chain.review, &s, &source_pages[0], &q, &state)?;
            let mut cancelled = w.clone();
            cancelled.run(best.a.owner, M, "request_cancel", &[])?;
            let before = cancelled.slots.clone();
            ensure!(
                execute(&mut cancelled, &chain.spec, &req).is_err() && cancelled.slots == before,
                "current cancellation rejects trade atomically"
            );
            attacks.push("current-cancellation");
            let mut expired = w.clone();
            expired.checkpoint = scope[7] + 1;
            let before = expired.slots.clone();
            ensure!(
                execute(&mut expired, &chain.spec, &req).is_err() && expired.slots == before,
                "expired frontier cannot authorize trade"
            );
            attacks.push("expired-trade");
            let mut inferior = req.clone();
            inferior
                .frontier
                .as_mut()
                .unwrap()
                .before
                .best
                .as_mut()
                .unwrap()
                .a
                .owner = 300;
            let before = w.slots.clone();
            ensure!(
                execute(&mut w, &chain.spec, &inferior).is_err() && w.slots == before,
                "actual frontier winner must be authenticated by CFC"
            );
            attacks.push("actual-best-binding");
            step(
                &mut chain,
                &mut w,
                req.clone(),
                &out,
                &format!("trade-{round}"),
                vm_only,
            )
            .await?;
            let before = w.slots.clone();
            ensure!(
                execute(&mut w, &chain.spec, &req).is_err() && w.slots == before,
                "trade replay"
            );
            fills.push(json!({"a":best.a.owner,"b":best.b.owner,"aNonce":best.a.value(chain.review.kind,"nonce"),"bNonce":best.b.value(chain.review.kind,"nonce")}));
            for rec in [&best.a, &best.b] {
                q.remove(rec.index);
            }
            records.retain(|r| r.index != best.a.index && r.index != best.b.index);
        }
        ensure!(
            w.val(V, "stream_settled", 0) == 4 && records.len() == 1,
            "exact cross-page cursor"
        );
        // Explicit fork proves no-match carry without moving or consuming its escrow.
        let checkpoint = w.clone();
        let checkpoint_leaf = chain.base.last_leaf;
        let page = frontier::next_triangular_page(
            chain.review.kind,
            &scope,
            &q,
            &records,
            &FrontierState::initial(q.root()),
        )?;
        ensure!(
            page.after.complete && page.after.best.is_none(),
            "no compatible pair remains"
        );
        let req = request_scan(&w, &source_pages[0], page.clone());
        step(&mut chain, &mut w, req, &out, "no-match-scan", vm_only).await?;
        let mut req = basic(frontier::CARRY, &source_pages[0], &w);
        req.frontier = Some(FrontierPage {
            before: page.after.clone(),
            after: page.after,
            rows: vec![],
            head: None,
        });
        step(&mut chain, &mut w, req, &out, "no-match-carry", vm_only).await?;
        ensure!(
            w.val(V, "stream_carried", 0) == 1 && w.val(V, "consumed", records[0].owner) == 0,
            "legal carry preserves original funds/order"
        );
        w = checkpoint;
        chain.base.last_leaf = checkpoint_leaf;
        // Expiry uses the same original remaining set, never a reselected order set.
        w.checkpoint = scope[7] + 1;
        let member = q
            .members
            .iter()
            .find(|m| m.index == records[0].index)
            .unwrap()
            .clone();
        let remaining = stream_source::PriorityTree::from_committed(&scope, vec![member])?;
        let mut req = super::pair_stream::refund_page(
            &w,
            &chain.review,
            &s,
            &source_pages[0],
            &remaining,
            0,
        )?;
        req.settled = 4;
        req.fields[4] = 4;
        step(&mut chain, &mut w, req, &out, "refund-tail", vm_only).await?;
        ensure!(
            w.val(V, "stream_phase", 0) == 7 && w.val(V, "stream_settled", 0) == 5,
            "all original members terminal"
        );
        let claims = claim_all(&mut w)?;
        ensure!(
            totals == [asset_total(&w, A)?, asset_total(&w, B)?],
            "FT conservation after actual fills and claims"
        );
        let (op, payload) = super::pair_stream::prepare_ineligible_recovery(&mut w)?;
        w.run(205, M, "request_recovery", &[V])?;
        let mut req = basic(4, &source_pages[0], &w);
        req.fields[21..34].copy_from_slice(&op);
        step(&mut chain, &mut w, req, &out, "enrolled-recovery", vm_only).await?;
        if let Some(p) = payload {
            w.run(205, NFT, "claim", &[0, V])?;
            ensure!(
                super::pair_stream::nft_payload(&w, 205)? == p,
                "NFT ineligible recovery"
            );
        } else {
            w.run(205, A, "claim", &[V])?;
            w.run(205, 0, "claim", &[V])?;
        }
        ensure!(
            totals == [asset_total(&w, A)?, asset_total(&w, B)?],
            "all FT assets conserved"
        );
        let mut exit = abandoned;
        exit.checkpoint = scope[7] + 1;
        chain.base.last_leaf = abandoned_leaf;
        let req = basic(ABORT_SOURCE, &source_pages[0], &exit);
        step(
            &mut chain,
            &mut exit,
            req,
            &out,
            "abort-unaccepted",
            vm_only,
        )
        .await?;
        fs::write(
            format!("{out}/{kind}-REPORT.json"),
            serde_json::to_vec_pretty(
                &json!({"scope":"offline synthetic source, actual bytecode; claims VM-only","fullUpsVerified":!vm_only,"sourceAccounts":source_pages.last().unwrap().after.accounts,"members":5,"recoveryMembers":1,"fills":fills,"scanPages":scan_counts,"unmatchedTailRefunded":true,"noMatchCarryVerified":true,"currentCancellationRejected":true,"actualBestCfcBinding":true,"conservation":true,"ordinaryWalletSignature":false,"claims":claims,"attacks":attacks,"measurements":chain.measurements,"broadcast":false}),
            )?,
        )?;
    }
    Ok(())
}

#[tokio::test]
#[ignore = "two offline full UPSs with the complete captured native dependency; no RPC or funds"]
async fn pair_captured_native_binding_ups() -> Result<()> {
    let out=std::env::var("PAIR_CAPTURED_NATIVE_OUT")?;
    fs::create_dir(&out)?;
    let captured:Value=serde_json::from_slice(&fs::read(std::env::var("PAIR_CAPTURED_NATIVE_BINDING")?)?)?;
    ensure!(captured["entireFunctionWhitelistVerified"]==true&&captured["contractMembershipVerifiedRelativeToRoot"]==true,"full captured native binding required");
    let mut w=world_with_deadline("orderbook",112)?;
    let mut chain=StreamChain::new(&w).await?;
    let actual=chain.source.contracts.iter().find(|c|c.id==0).context("authenticated source native leaf")?.leaf;
    ensure!(serde_json::to_value(actual)?==captured["leaf"],"synthetic UPS must retain the entire captured native leaf, not selected method equivalence");
    let s=chain.source.clone();
    let source_dir=std::path::Path::new(&out).join("readiness-input");
    fs::create_dir(&source_dir)?;
    let build=std::env::var("BATCH_BUILD")?;
    let mut assets=vec![];
    for (id,path,name) in [(0,"native.json".to_string(),"native.json"),(A,"token/compilation_artifact.json".to_string(),"token-a.json"),(B,crate::token_artifact(B),"token-b.json")] {
        let bytes=fs::read(format!("{build}/{path}"))?;
        fs::write(source_dir.join(name),&bytes)?;
        let function_root=chain.review.assets.iter().find(|a|a.id==id).context("reviewed asset")?.function_root;
        assets.push(json!({"id":id,"artifact":name,"artifact_sha256":format!("{:x}",Sha256::digest(&bytes)),"function_root":function_root}));
    }
    let bytes=fs::read(format!("{build}/orderbook/compiled/compilation_artifact.json"))?;
    fs::write(source_dir.join("market.json"),&bytes)?;
    fs::write(source_dir.join("review.json"),serde_json::to_vec_pretty(&json!({"schema":1,"artifact":"market.json","artifact_sha256":format!("{:x}",Sha256::digest(&bytes)),"market":M,"kind":3,"function_root":chain.review.function_root,"assets":assets,"unit":chain.review.unit.to_string()}))?)?;
    fs::write(source_dir.join("snapshot.json"),serde_json::to_vec_pretty(&s)?)?;
    fs::write(source_dir.join("history.json"),serde_json::to_vec_pretty(&json!({"root":s.history.checkpoint_path.root.to_string()}))?)?;
    let pages=stream_source::prepare(&chain.review,&s,s.history.checkpoint_path.root)?;
    ensure!(pages.len()==3,"unchanged nine-account source fixture");
    let request=basic(OPEN,&pages[0],&w);
    step(&mut chain,&mut w,request,&out,"captured-native-open",false).await?;
    let request=basic(COVER,&pages[0],&w);
    step(&mut chain,&mut w,request,&out,"captured-native-cover",false).await?;
    fs::write(format!("{out}/SUMMARY.json"),serde_json::to_vec_pretty(&json!({
        "scope":"Synthetic account/checkpoint history with entire captured native code/layout/function leaf; not current-chain deployment or ordinary signed claim",
        "fullUps":2,"nativeLeaf":actual,"sourceAccounts":9,"sourcePagesCompleted":1,
        "allSourcePagesCompleted":false,"liveAuthorization":false,"financialOperations":0
    }))?)?;
    Ok(())
}

async fn step(
    chain: &mut StreamChain,
    w: &mut World,
    r: Request,
    out: &str,
    label: &str,
    vm_only: bool,
) -> Result<()> {
    if vm_only {
        execute(w, &chain.spec, &r)?;
        w.checkpoint += 1;
        Ok(())
    } else {
        super::pair_stream::step(chain, w, r, out, label).await
    }
}
