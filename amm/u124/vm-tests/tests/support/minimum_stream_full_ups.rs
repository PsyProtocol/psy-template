//! Replacement key only. Synthetic checkpoints and real bytecode/full UPSs;
//! ordinary grant signatures, live receipts and unbiased randomness are separate.
use super::*;
use psy_template_u124_markets::{random_minimum as minimum, random_stream};
const SEED: [u64; 4] = [51, 62, 73, 84];
const OWNER: u64 = 600;
const CAP: u64 = 100_000_000_000;
fn native_total(w: &World) -> Result<u128> {
    let users = w
        .slots
        .keys()
        .filter(|(_, c, _)| *c == 0)
        .map(|(u, _, _)| *u)
        .collect::<std::collections::BTreeSet<_>>();
    let mut total = 0u128;
    for u in users {
        total += w.state.get_contract_slot(u, 0, 0)? as u128;
    }
    for ((owner, c, o), sent) in &w.slots {
        if *c != 0 || *o < 3 || *o >= 3 + 2 * (1u64 << 24) || (*o - 3) % 2 != 0 {
            continue;
        }
        let peer = (*o - 3) / 2;
        let claimed = w.state.get_contract_slot(peer, 0, 4 + 2 * owner)?;
        ensure!(claimed <= *sent, "overclaimed Native outbox");
        total += (*sent - claimed) as u128;
    }
    Ok(total)
}
fn conservation(w: &World, totals: [u128; 2], native: u128) -> Result<()> {
    ensure!(
        totals == [asset_total(w, A)?, asset_total(w, B)?],
        "complete FT balance plus Outbox conservation"
    );
    ensure!(
        native_total(w)? + w.val(V, "fee_used", 0) as u128 == native,
        "Native balance plus Outbox plus exact fees conservation"
    );
    Ok(())
}

fn key(chain: &StreamChain) -> [u64; 4] {
    PoseidonHash::two_to_one(
        chain.key.g.get_fingerprint().0,
        chain.source.key_public_param.0,
    )
    .elements
    .map(|n| n.to_canonical_u64())
}
fn bind(mut req: Request, pk: [u64; 4], page: Option<minimum::Page>) -> Request {
    req.registered_key = Some(pk);
    req.minimum = page;
    req
}
async fn apply(
    chain: &mut StreamChain,
    w: &mut World,
    req: Request,
    out: &str,
    label: &str,
    vm: bool,
) -> Result<()> {
    if vm {
        let req = minimum_exact_fee(w, &chain.spec, req)?;
        execute(w, &chain.spec, &req)?;
        w.checkpoint += 1;
        Ok(())
    } else {
        chain.prove(w, req, out, label).await
    }
}
fn seed(w: &mut World, source: u64) {
    use psy_client_common::traits::to_qfelts::ToQFelts;
    let mut stats = PsyCheckpointLeafStats::new_empty();
    stats.random_seed = Q(HashOut {
        elements: SEED.map(f),
    });
    w.state.set_checkpoint_stats(
        source + 1,
        stats
            .to_qfelts()
            .into_iter()
            .map(|n| n.to_canonical_u64())
            .collect(),
    );
}
fn context(seed: [u64; 4], refund: bool, state: &minimum::State) -> Option<minimum::Page> {
    Some(minimum::Page::context(seed, refund, state.clone()))
}
async fn refresh(chain: &mut StreamChain, w: &World) -> Result<()> {
    let db = chain
        .base
        .seed_identity_with_history(w, chain.key.g.get_fingerprint(), &[(1, anchor_leaf())])
        .await?;
    chain.source = snapshot(db, w, &chain.review, chain.key.g.get_fingerprint()).await?;
    chain.source_checkpoint = w.checkpoint;
    *chain.random_draw.borrow_mut() = None;
    Ok(())
}
#[tokio::test]
#[ignore = "bounded replacement-key VM or full UPS acceptance; fresh outputs only"]
async fn minimum_stream_owner_funding_complete_order_and_recovery() -> Result<()> {
    let out = std::env::var("MINIMUM_STREAM_OUT")?;
    fs::create_dir(&out)?;
    let vm = std::env::var("MINIMUM_STREAM_VM_ONLY").as_deref() == Ok("1");
    for kind in std::env::var("STREAM_MARKETS")
        .unwrap_or_else(|_| "amm,bondingcurve".into())
        .split(',')
    {
        ensure!(
            ["amm", "bondingcurve"].contains(&kind),
            "explicit replacement market"
        );
        let mut w = setup_with_sponsor(kind, false)?;
        ensure!(
            w.state.get_contract_slot(V, 0, 0)? == 0,
            "no unrelated Native float for replacement bootstrap"
        );
        let totals = [asset_total(&w, A)?, asset_total(&w, B)?];
        let mut chain = StreamChain::new(&w).await?;
        ensure!(
            chain.spec["version"] == 11 && chain.spec["fee_owner"] == OWNER,
            "new minimum key only"
        );
        let pk = key(&chain);
        let mut attacks = vec![];
        let grant = [vec![V, 1, CAP], pk.to_vec()].concat();
        let frozen = w.slots.clone();
        ensure!(
            w.run(200, M, "authorize_fee_budget", &grant).is_err() && w.slots == frozen,
            "foreign funding grant"
        );
        attacks.push("foreign-owner-grant");
        let (method, values) = if kind == "amm" {
            ("open_swap", args(&[V, 0], &[1, 1], &[200, 1]))
        } else {
            ("open_limit_buy", args(&[V, 1, 0], &[1], &[200, 1]))
        };
        ensure!(
            w.run(OWNER, M, method, &values).is_err() && w.slots == frozen,
            "funding owner is not a trader"
        );
        attacks.push("funding-owner-cannot-trade");
        w.set(OWNER, 0, 0, CAP + 1_000_000_000);
        w.run(OWNER, M, "authorize_fee_budget", &grant)?;
        w.run(OWNER, 0, "transfer", &[V, CAP])?;
        // Prior ordinary-owner authorization is explicit synthetic setup. This
        // does not stand in for a normal wallet signature or a network receipt.
        let native = native_total(&w)?;
        refresh(&mut chain, &w).await?;
        let source = stream_source::prepare(
            &chain.review,
            &chain.source,
            chain.source.history.checkpoint_path.root,
        )?;
        let sample = source
            .iter()
            .find(|p| p.after.order_count > p.before.order_count)
            .context("eligible admission sample")?;
        let mut req = bind(basic(minimum::GRANT_MODE, sample, &w), pk, None);
        req.fields[21] = 1;
        req.fields[22] = CAP;
        req.fields[23] = 1;
        let mut wrong = req.clone();
        wrong.registered_key.as_mut().unwrap()[0] ^= 1;
        let frozen = w.slots.clone();
        ensure!(
            execute(&mut w, &chain.spec, &wrong).is_err() && w.slots == frozen,
            "unapproved registered key"
        );
        attacks.push("wrong-granted-key");
        let wrong_call = [vec![1, CAP], pk.to_vec(), vec![OWNER + 1, 1]].concat();
        ensure!(
            w.run(V, M, "apply_fee_grant", &wrong_call).is_err() && w.slots == frozen,
            "spec cannot redirect native claim owner"
        );
        attacks.push("wrong-funding-owner");
        apply(&mut chain, &mut w, req.clone(), &out, "funding-grant", vm).await?;
        ensure!(
            w.val(V, "fee_cap", 0) == CAP
                && w.val(V, "fee_used", 0) > 0
                && w.val(V, "settled_fee", OWNER) == CAP,
            "atomic fee grant, claim and cursor"
        );
        let frozen = w.slots.clone();
        ensure!(
            execute(&mut w, &chain.spec, &req).is_err() && w.slots == frozen,
            "grant nonce replay"
        );
        attacks.push("grant-replay");
        refresh(&mut chain, &w).await?;
        let s = chain.source.clone();
        let source = stream_source::prepare(&chain.review, &s, s.history.checkpoint_path.root)?;
        let sample = source
            .iter()
            .find(|p| p.after.order_count > p.before.order_count)
            .unwrap();
        let original = stream_source::priority(&chain.review, &s, s.history.checkpoint_path.root)?;
        ensure!(original.members.len() == 5, "five authenticated orders");
        let steps = minimum::prepare(&sample.scope, &original, SEED)?;
        let mut pages = vec![];
        for group in [&steps[..5], &steps[5..]] {
            for rows in group.chunks(4) {
                pages.push(minimum::Page {
                    seed: SEED,
                    refund_only: false,
                    current: rows[0].before.clone(),
                    rows: rows.to_vec(),
                });
            }
        }
        let (_, queue) = random_stream::prepare(&sample.scope, &original, SEED)?;
        ensure!(
            pages.len() == 4 && pages[3].after(&sample.scope)?.queue == queue.root(),
            "same full-hash random permutation"
        );
        let final_state = steps.last().unwrap().after.clone();
        let req = bind(basic(OPEN, sample, &w), pk, None);
        apply(&mut chain, &mut w, req, &out, "open", vm).await?;
        w.run(203, M, "request_cancel", &[])?;
        seed(&mut w, s.fields[6]);
        for (i, p) in source.iter().enumerate() {
            let req = bind(basic(COVER, p, &w), pk, None);
            apply(&mut chain, &mut w, req, &out, &format!("source-{i}"), vm).await?;
        }
        ensure!(
            w.val(V, "stream_phase", 0) == 2 && w.val(V, "stream_total", 0) == 5,
            "coverage closes before ordering"
        );
        let unseeded = w.clone();
        let unseeded_leaf = chain.base.last_leaf;
        let mut prefix = None;
        for (i, p) in pages.iter().enumerate() {
            let mode = if p.rows[0].extract {
                minimum::EXTRACT_MODE
            } else {
                stream_policy::ORDER
            };
            let req = bind(basic(mode, sample, &w), pk, Some(p.clone()));
            let mut wrong = req.clone();
            wrong.minimum.as_mut().unwrap().seed[0] ^= 1;
            let frozen = w.slots.clone();
            ensure!(
                execute(&mut w, &chain.spec, &wrong).is_err() && w.slots == frozen,
                "foreign seed cannot advance minimum root"
            );
            attacks.push("seed-replacement");
            apply(&mut chain, &mut w, req, &out, &format!("minimum-{i}"), vm).await?;
            ensure!(
                std::array::from_fn::<_, 4, _>(|j| w.val(V, "minimum_root", j as u64))
                    == minimum::state_hash(&p.after(&sample.scope)?),
                "on-chain minimum endpoint"
            );
            if i == 0 {
                prefix = Some((w.clone(), chain.base.last_leaf));
            }
        }
        ensure!(
            w.val(V, "stream_phase", 0) == 3 && read_sort(&w).ordered == final_state.queue,
            "only complete extraction opens trading"
        );
        let first = bind(
            settle_request(&w, &chain.review, &s, sample, &queue, 0)?,
            pk,
            context(SEED, false, &final_state),
        );
        apply(&mut chain, &mut w, first, &out, "settle-0", vm).await?;
        let tail = w.clone();
        let tail_leaf = chain.base.last_leaf;
        let req = bind(
            settle_request(&w, &chain.review, &s, sample, &queue, 4)?,
            pk,
            context(SEED, false, &final_state),
        );
        apply(&mut chain, &mut w, req, &out, "settle-tail", vm).await?;
        ensure!(
            w.val(V, "stream_phase", 0) == 7 && w.val(V, "stream_settled", 0) == 5,
            "five terminal members"
        );
        let claims = claim_all(&mut w)?;
        ensure!(
            totals == [asset_total(&w, A)?, asset_total(&w, B)?],
            "normal asset conservation"
        );
        conservation(&w, totals, native)?;
        let fills = (200..205)
            .filter(|u| sent_to(&w, V, *u, if kind == "amm" { B } else { A }) > 0)
            .count();
        ensure!(
            fills == 3,
            "three fills plus cancellation and slippage refunds"
        );
        let normal_fee_used = w.val(V, "fee_used", 0);
        // A confirmed prefix is never reset. It has exactly one canonical build
        // continuation and one minimum extraction order, including after expiry.
        let (mut partial, leaf) = prefix.unwrap();
        partial.checkpoint = s.fields[7] + 1;
        chain.base.last_leaf = leaf;
        for (i, p) in pages.iter().enumerate().skip(1) {
            let mode = if p.rows[0].extract {
                minimum::EXTRACT_MODE
            } else {
                stream_policy::ORDER
            };
            let req = bind(basic(mode, sample, &partial), pk, Some(p.clone()));
            apply(
                &mut chain,
                &mut partial,
                req,
                &out,
                &format!("late-minimum-{i}"),
                vm,
            )
            .await?;
        }
        for offset in [0, 4] {
            let req = bind(
                settle_request(&partial, &chain.review, &s, sample, &queue, offset)?,
                pk,
                context(SEED, false, &final_state),
            );
            apply(
                &mut chain,
                &mut partial,
                req,
                &out,
                &format!("late-refund-{offset}"),
                vm,
            )
            .await?;
        }
        claim_all(&mut partial)?;
        ensure!(
            partial.val(V, "stream_phase", 0) == 7
                && totals == [asset_total(&partial, A)?, asset_total(&partial, B)?],
            "same-prefix same-seed timeout recovery conservation"
        );
        conservation(&partial, totals, native)?;
        let mut late = tail;
        late.checkpoint = s.fields[7] + 1;
        chain.base.last_leaf = tail_leaf;
        let req = bind(
            settle_request(&late, &chain.review, &s, sample, &queue, 4)?,
            pk,
            context(SEED, false, &final_state),
        );
        apply(&mut chain, &mut late, req, &out, "timeout-tail", vm).await?;
        claim_all(&mut late)?;
        ensure!(
            late.val(V, "stream_phase", 0) == 7
                && totals == [asset_total(&late, A)?, asset_total(&late, B)?],
            "confirmed-fill remainder refund"
        );
        conservation(&late, totals, native)?;
        let mut expired = unseeded;
        expired.checkpoint = s.fields[7] + 1;
        chain.base.last_leaf = unseeded_leaf;
        let initial = steps[0].before.clone();
        let req = bind(
            basic(random_stream::EXPIRE, sample, &expired),
            pk,
            context([0; 4], false, &initial),
        );
        apply(&mut chain, &mut expired, req, &out, "expire-unseeded", vm).await?;
        for offset in [0, 4] {
            let req = bind(
                settle_request(&expired, &chain.review, &s, sample, &original, offset)?,
                pk,
                context([0; 4], true, &initial),
            );
            apply(
                &mut chain,
                &mut expired,
                req,
                &out,
                &format!("unseeded-refund-{offset}"),
                vm,
            )
            .await?;
        }
        claim_all(&mut expired)?;
        ensure!(
            expired.val(V, "stream_phase", 0) == 7
                && totals == [asset_total(&expired, A)?, asset_total(&expired, B)?],
            "unseeded refund conservation"
        );
        conservation(&expired, totals, native)?;
        let proof_count = chain
            .measurements
            .iter()
            .filter(|r| r["fullUpsVerified"] == true)
            .count();
        ensure!(
            proof_count == if vm { 0 } else { 19 },
            "declared nineteen full UPSs per market"
        );
        // Exhaustion cannot silently raise the owner's cap, and a fresh owner
        // grant remains available after timeout. These are bytecode checks only.
        let mut exhausted = expired.clone();
        exhausted.set(
            V,
            M,
            exhausted.fields["fee_cap"],
            exhausted.val(V, "fee_used", 0),
        );
        let frozen = exhausted.slots.clone();
        let fee = [vec![1_000_000_000], pk.to_vec()].concat();
        ensure!(
            exhausted.run(V, M, "account_executor_fee", &fee).is_err() && exhausted.slots == frozen,
            "exhausted lifetime budget"
        );
        attacks.push("fee-cap-exhaustion");
        let grant2 = [vec![V, 2, CAP + 1_000_000_000], pk.to_vec()].concat();
        exhausted.run(OWNER, M, "authorize_fee_budget", &grant2)?;
        exhausted.run(
            V,
            M,
            "apply_fee_grant",
            &[vec![2, CAP + 1_000_000_000], pk.to_vec(), vec![OWNER, 0]].concat(),
        )?;
        ensure!(
            exhausted.val(V, "fee_cap", 0) == CAP + 1_000_000_000,
            "explicit owner recovery grant after timeout"
        );
        fs::write(
            format!("{out}/{kind}-REPORT.json"),
            serde_json::to_vec_pretty(&json!({
                "profile":"source-covered-producer-minimum-stream-v1","fullUpsVerified":!vm,"vmOnly":vm,"newFullUps":if vm{0}else{19},
                "sourcePages":source.len(),"members":5,"minimumBuildPages":[4,1],"minimumPopPages":[4,1],"settlementPages":[4,1],
                "source":s.fields[6],"draw":s.fields[6]+1,"expiry":s.fields[7],"seed":SEED,"permutation":queue.members.iter().map(|r|r.member.owner).collect::<Vec<_>>(),
                "prefixRecoveryWithoutReset":true,"allRecoveryConservation":true,"actualSyntheticFills":fills,"nativeConservationIncludingFees":true,"normalFeeUsed":normal_fee_used,"lifetimeCap":CAP,"fundingOwner":OWNER,
                "ordinaryGrantSetup":"VM only; real wallet signature not claimed","ordinaryClaimBytecode":claims,"ordinaryWalletUps":false,
                "bytecodeRejections":attacks,"measurements":chain.measurements,"qualifiedRandomness":false,"producerInfluence":true,"broadcast":false
            }))?,
        )?;
    }
    Ok(())
}
