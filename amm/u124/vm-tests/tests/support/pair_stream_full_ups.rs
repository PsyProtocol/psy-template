//! Complete source-set terminal refunds for paired markets. This does not
//! authorize live trading or substitute local ranking for global priority.
use super::*;
const R: u128 = 1u128 << 62;
fn setup_pair(kind: &str) -> Result<World> {
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
    for _ in 0..14 {
        w.run(
            S,
            M,
            "authorize_sponsor",
            &[V, 2 * ESCROW, w.val(S, "sponsor_nonce", 0) + 1, 2],
        )?;
        w.run(S, 0, "transfer", &[V, 2 * ESCROW])?;
        w.operation_maintenance("fund_gas", S, 0, 0, 0, 0, 2 * ESCROW)?;
    }
    let amount = (1u128 << 62) + 17;
    if kind == "orderbook" {
        for u in 200..205 {
            let side = u % 2;
            w.run(
                u,
                M,
                "open_sell",
                &args(&[V, side], &[amount, amount], &[200, 1]),
            )?;
            w.pay(u, if side == 0 { A } else { B }, amount)?;
            w.fee(u)?;
        }
    } else {
        for (s, b) in [(200, 201), (202, 203)] {
            w.run(s, NFT, "acknowledge", &[V])?;
            w.run(s, M, "open_listing", &args(&[V, 0], &[amount], &[200, 1]))?;
            w.fee(s)?;
            w.run(s, NFT, "transfer", &[0, V])?;
            w.run(b, M, "open_buy", &args(&[V, s, 1], &[amount], &[200, 1]))?;
            w.fee(b)?;
            w.pay(b, A, amount)?;
        }
        w.run(204, NFT, "acknowledge", &[V])?;
        w.run(
            204,
            M,
            "open_buy",
            &args(&[V, 200, 1], &[amount], &[200, 1]),
        )?;
        w.fee(204)?;
        w.pay(204, A, amount)?;
    }
    create_ineligible(&mut w)?;
    Ok(w)
}
pub(super) fn refund_page(
    w: &World,
    r: &Review,
    s: &Snapshot,
    p: &SourcePage,
    q: &stream_source::PriorityTree,
    start: usize,
) -> Result<Request> {
    let mut req = basic(SETTLE, p, w);
    let n = (q.members.len() - start).min(2);
    req.fields[2] = n as u64;
    req.fields[4] = start as u64;
    let mut remaining = q.clone();
    for m in &q.members[..start] {
        remaining.remove(m.index);
    }
    for (i, m) in q.members[start..start + n].iter().enumerate() {
        let u = m.member.owner;
        let (a, b, nft) = if w.kind == "nftmarket" {
            (
                sent(w, u, A)
                    - w.val(V, "settled_payment", 2 * u) as u128
                    - R * w.val(V, "settled_payment", 2 * u + 1) as u128,
                0,
                w.state.get_contract_slot(u, NFT, 1214 + 35 * V)?
                    - w.state.get_contract_slot(V, NFT, 1215 + 35 * u)?,
            )
        } else {
            (
                sent(w, u, A)
                    - w.val(V, "settled_a", 2 * u) as u128
                    - R * w.val(V, "settled_a", 2 * u + 1) as u128,
                sent(w, u, B)
                    - w.val(V, "settled_b", 2 * u) as u128
                    - R * w.val(V, "settled_b", 2 * u + 1) as u128,
                0,
            )
        };
        let fee = w.state.get_contract_slot(u, 0, 3 + 2 * V)? - w.val(V, "settled_fee", u);
        let mask = u64::from(a > 0)
            + 2 * u64::from(b > 0)
            + 4 * u64::from(fee > 0)
            + 8 * u64::from(nft > 0);
        let op = w.fields(
            &format!("refund_funding_{mask}"),
            u,
            0,
            a,
            b,
            0,
            fee,
            m.member.nonce,
            0,
        );
        req.fields[21 + 13 * i..34 + 13 * i].copy_from_slice(&op);
        req.members
            .push(original_binding(r, s, m, remaining.proof(m.index))?);
        remaining.remove(m.index);
    }
    Ok(req)
}
pub(super) fn nft_payload(w: &World, u: u64) -> Result<[u64; 8]> {
    let mut v = [0; 8];
    for j in 0..8 {
        v[j] =
            w.state
                .get_contract_slot(u, NFT, if j < 4 { 30 + j as u64 } else { 31 + j as u64 })?;
    }
    Ok(v)
}
fn claims(w: &mut World) -> Result<Vec<Value>> {
    let mut rows = vec![];
    for u in 200..205 {
        for asset in if w.kind == "nftmarket" {
            vec![0, A]
        } else {
            vec![0, A, B]
        } {
            let before = if asset == 0 {
                w.state.get_contract_slot(u, 0, 0)? as u128
            } else {
                w.balance(u, asset)
            };
            let amount = if asset == 0 {
                (w.state.get_contract_slot(V, 0, 3 + 2 * u)?
                    - w.state.get_contract_slot(u, 0, 4 + 2 * V)?) as u128
            } else {
                sent_to(w, V, u, asset)
                    - (w.state.get_contract_slot(u, asset, 33554455 + 4 * V)? as u128
                        + R * w.state.get_contract_slot(u, asset, 33554456 + 4 * V)? as u128)
            };
            if amount > 0 {
                w.run(u, asset, "claim", &[V])?;
            }
            let after = if asset == 0 {
                w.state.get_contract_slot(u, 0, 0)? as u128
            } else {
                w.balance(u, asset)
            };
            ensure!(after >= before, "claim cannot lose assets");
            ensure!(after - before == amount, "exact asset/native refund claim");
            rows.push(json!({"owner":u,"asset":asset,"amount":(after-before).to_string(),"ordinaryWalletSignature":false}));
        }
        if w.kind == "nftmarket" && [200, 202].contains(&u) {
            let nonce = w.state.get_contract_slot(V, NFT, 1214 + 35 * u)?;
            ensure!(nonce == 1, "one original NFT return");
            w.run(u, NFT, "claim", &[0, V])?;
            rows.push(json!({"owner":u,"collection":NFT,"payload":nft_payload(w,u)?,"nftClaimBytecode":true}));
        }
        ensure!(
            w.val(V, "consumed", u) == 1,
            "original order terminal exactly once"
        );
    }
    Ok(rows)
}
// A funded ineligible source order must have an executable, sender-enrolled
// cancellation recovery path even when only an NFT (and no fee) was deposited.
pub(super) fn create_ineligible(w: &mut World) -> Result<(Vec<u64>, Option<[u64; 8]>)> {
    let u = 205;
    let n = (1u128 << 62) + 17;
    w.set(u, 0, 0, 100 * ESCROW);
    let op;
    let payload;
    if w.kind == "nftmarket" {
        // The collection has already minted IDs 1, 2 and 3 in bootstrap.
        // Exercise its real sequential mint rule, never an arbitrary token ID.
        w.give_nft(u, 0, 4)?;
        w.run(u, NFT, "acknowledge", &[V])?;
        w.run(u, M, "open_listing", &args(&[V, 0], &[n], &[300, 1]))?;
        payload = Some(std::array::from_fn(|j| {
            w.val(
                u,
                &if j < 4 {
                    format!("token_id_{j}")
                } else {
                    format!("metadata_hash_{}", j - 4)
                },
                0,
            )
        }));
        w.run(u, NFT, "transfer", &[0, V])?;
        op = w.fields("recover_nft", u, 0, 0, 0, 0, 0, 0, 0);
    } else {
        w.run(I, A, "transfer", &args(&[u], &[n], &[]))?;
        w.run(u, A, "claim", &[I])?;
        w.run(u, M, "open_sell", &args(&[V, 0], &[n, n], &[300, 1]))?;
        w.pay(u, A, n)?;
        w.run(u, 0, "transfer", &[V, 17])?;
        op = w.fields("recover_funding_5", u, 0, n, 0, 0, 17, 0, 0);
        payload = None;
    }
    Ok((op, payload))
}
pub(super) fn prepare_ineligible_recovery(w: &mut World) -> Result<(Vec<u64>, Option<[u64; 8]>)> {
    let u = 205;
    let n = (1u128 << 62) + 17;
    ensure!(
        w.run(u, M, "request_recovery", &[V]).is_err(),
        "live uncancelled order cannot enroll recovery"
    );
    w.run(u, M, "request_cancel", &[])?;
    if w.kind == "nftmarket" {
        let payload = std::array::from_fn(|j| {
            w.val(
                u,
                &if j < 4 {
                    format!("token_id_{j}")
                } else {
                    format!("metadata_hash_{}", j - 4)
                },
                0,
            )
        });
        Ok((
            w.fields("recover_nft", u, 0, 0, 0, 0, 0, 0, 0),
            Some(payload),
        ))
    } else {
        Ok((w.fields("recover_funding_5", u, 0, n, 0, 0, 17, 0, 0), None))
    }
}
// Offline test continuation, never a broadcast retry. Verify the exact saved
// end-cap, expected starting leaf, signature identity, plan and VM endpoints.
// An incomplete/mismatched saved artifact is an error, not a reproving fallback.
pub(super) async fn step(
    chain: &mut StreamChain,
    w: &mut World,
    mut req: Request,
    out: &str,
    label: &str,
) -> Result<()> {
    let reuse = std::env::var("PAIR_STREAM_REUSE_ROOT")
        .ok()
        .map(|r| std::path::Path::new(&r).join(format!("{}-{label}", w.kind)));
    let Some(old) = reuse.filter(|p| p.join("verification.json").exists()) else {
        ensure!(
            std::env::var("PAIR_STREAM_REQUIRE_REUSE").as_deref() != Ok("1"),
            "missing required saved proof; proving disabled for reuse-only validation"
        );
        return chain.prove(w, req, out, label).await;
    };
    let t = Instant::now();
    let read = |n: &str| -> Result<Vec<u8>> { Ok(fs::read(old.join(n))?) };
    let saved: Request = serde_json::from_slice(&read("plan.json")?)?;
    req.fields[73] = saved.fields[73];
    ensure!(
        serde_json::to_value(&req)? == serde_json::to_value(&saved)?,
        "saved exact plan mismatch; no replacement operation"
    );
    let raw = read("request.json")?;
    let request: psy_provider::request::QSubmitEndCapRPCRequest<GF> = serde_json::from_slice(&raw)?;
    let proof: plonky2::plonk::proof::ProofWithPublicInputs<GF, C, 2> =
        bincode::deserialize(&request.proof)?;
    chain.base.cm.ups_end_cap.verify_proof(proof.clone())?;
    psy_template_u124_markets::fixed_verifier::with_verifier(|v| {
        v.verify(proof.clone())?;
        Ok(())
    })?;
    validate_endcap_binding(&request.user_ec_input.core, &proof.public_inputs)?;
    let (db, _, _) = chain.seed(w).await?;
    let start = db.get_user_leaf_data(w.checkpoint, V).await?;
    let core = &request.user_ec_input.core;
    ensure!(
        core.state_transition.checkpoint_tree_root_hash
            == db.get_checkpoint_tree_root(w.checkpoint).await?,
        "saved checkpoint-history root differs from reconstructed global context"
    );
    ensure!(
        core.state_transition.start_user_leaf_hash == start.qfhash::<PoseidonHash>()
            && core.checkpoint_id == f(w.checkpoint)
            && core.new_user_leaf.nonce == f(w.revision + 1)
            && core.new_user_leaf.public_key == start.public_key,
        "saved identity/state/nonce mismatch"
    );
    let public: Value = serde_json::from_slice(&read("public-session.json")?)?;
    ensure!(
        public["keyFingerprint"] == serde_json::to_value(chain.key.g.get_fingerprint())?
            && public["actualCalls"]
                == serde_json::to_value(stream_policy::calls(&chain.spec, &saved, true)?)?,
        "saved key or actual stack mismatch"
    );
    execute(w, &chain.spec, &saved)?;
    chain.base.last_leaf = Some(core.new_user_leaf);
    w.checkpoint += 1;
    // seed recomputes every contract root from the actual VM writes and rejects
    // any divergence from the exact saved proof endpoint.
    chain.seed(w).await?;
    let dest = std::path::Path::new(out).join(format!("{}-{label}", w.kind));
    fs::create_dir(&dest)?;
    for n in [
        "request.json",
        "plan.json",
        "source.json",
        "current.json",
        "public-session.json",
        "key-proof.bin",
    ] {
        fs::write(dest.join(n), read(n)?)?;
    }
    let mut report: Value = serde_json::from_slice(&read("verification.json")?)?;
    report["exactProofReused"] = json!(true);
    report["continuationVerificationSeconds"] = json!(t.elapsed().as_secs_f64());
    report["exactRequestSha256"] = json!(format!("{:x}", sha2::Sha256::digest(&raw)));
    fs::write(
        dest.join("verification.json"),
        serde_json::to_vec_pretty(&report)?,
    )?;
    chain.measurements.push(report);
    Ok(())
}
#[tokio::test]
#[ignore = "bounded offline paired-market full UPSs and fresh evidence directory"]
async fn pair_complete_source_and_continuous_refund_ups() -> Result<()> {
    let out = std::env::var("PAIR_STREAM_UPS_OUT")?;
    fs::create_dir(&out)?;
    let selected =
        std::env::var("PAIR_STREAM_MARKETS").unwrap_or_else(|_| "orderbook,nftmarket".into());
    for kind in selected.split(',') {
        ensure!(
            ["orderbook", "nftmarket"].contains(&kind),
            "paired candidate"
        );
        let mut w = setup_pair(kind)?;
        let total = [asset_total(&w, A)?, asset_total(&w, B)?];
        let payloads: Vec<(u64, [u64; 8])> = if kind == "nftmarket" {
            [200, 202]
                .into_iter()
                .map(|u| {
                    (
                        u,
                        std::array::from_fn(|j| {
                            w.val(
                                u,
                                &if j < 4 {
                                    format!("token_id_{j}")
                                } else {
                                    format!("metadata_hash_{}", j - 4)
                                },
                                0,
                            )
                        }),
                    )
                })
                .collect()
        } else {
            vec![]
        };
        let mut chain = StreamChain::new(&w).await?;
        let s = chain.source.clone();
        let pages = stream_source::prepare(&chain.review, &s, s.history.checkpoint_path.root)?;
        let queue = stream_source::priority(&chain.review, &s, s.history.checkpoint_path.root)?;
        ensure!(queue.members.len() == 5, "exact five-member source");
        ensure!(
            pages.last().unwrap().after.recovery_count == 1,
            "funded ineligible source member must be committed separately"
        );
        let req = basic(OPEN, &pages[0], &w);
        let mut global_context_rejected = false;
        if std::env::var("PAIR_STREAM_REQUIRE_REUSE").as_deref() == Ok("1") {
            let mut changed = w.clone();
            changed.set(S, 0, 0, changed.state.get_contract_slot(S, 0, 0)? + 1);
            let before = changed.slots.clone();
            let error = step(&mut chain, &mut changed, req.clone(), &out, "open")
                .await
                .expect_err("valid old proof must not authorize different global context");
            ensure!(
                error.to_string().contains("checkpoint-history root")
                    && changed.slots == before
                    && chain.base.last_leaf.is_none(),
                "global-context failure must precede VM execution or proof replacement"
            );
            global_context_rejected = true;
        }
        step(&mut chain, &mut w, req, &out, "open").await?;
        let abandoned = w.clone();
        let abandoned_leaf = chain.base.last_leaf;
        for (i, p) in pages.iter().enumerate() {
            let req = basic(COVER, p, &w);
            step(&mut chain, &mut w, req, &out, &format!("cover-{i}")).await?;
        }
        ensure!(
            w.val(V, "stream_phase", 0) == 3,
            "all source accounts before acceptance"
        );
        let early = refund_page(&w, &chain.review, &s, &pages[0], &queue, 0)?;
        let before = w.slots.clone();
        ensure!(
            execute(&mut w, &chain.spec, &early).is_err() && w.slots == before,
            "early refund rejected atomically"
        );
        w.checkpoint = s.fields[7] + 1;
        let mut attacks = vec!["early-refund"];
        for start in [0, 2, 4] {
            let req = refund_page(&w, &chain.review, &s, &pages[0], &queue, start)?;
            for name in [
                "cursor",
                "source-root",
                "recipient",
                "short-page",
                "duplicate",
            ] {
                let mut bad = req.clone();
                match name {
                    "cursor" => bad.settled += 1,
                    "source-root" => bad.ledger.orders[0] ^= 1,
                    "recipient" => bad.fields[22] = S,
                    "short-page" => {
                        if start == 0 {
                            bad.fields[2] = 1;
                            bad.members.truncate(1);
                        } else {
                            continue;
                        }
                    }
                    "duplicate" => {
                        if bad.members.len() == 2 {
                            bad.fields[35] = bad.fields[22];
                            bad.fields[44] = bad.fields[31];
                        } else {
                            continue;
                        }
                    }
                    _ => unreachable!(),
                };
                let before = w.slots.clone();
                ensure!(
                    execute(&mut w, &chain.spec, &bad).is_err() && w.slots == before,
                    "bytecode accepted {name}"
                );
                attacks.push(name);
            }
            step(
                &mut chain,
                &mut w,
                req.clone(),
                &out,
                &format!("refund-{start}"),
            )
            .await?;
            let before = w.slots.clone();
            ensure!(
                execute(&mut w, &chain.spec, &req).is_err() && w.slots == before,
                "exact page replay rejected"
            );
        }
        ensure!(
            w.val(V, "stream_phase", 0) == 7 && w.val(V, "stream_settled", 0) == 5,
            "complete two-plus-two-plus-one refund stream"
        );
        let claim_rows = claims(&mut w)?;
        ensure!(
            total == [asset_total(&w, A)?, asset_total(&w, B)?],
            "U124 conservation after all refunds and claims"
        );
        for (u, expected) in payloads {
            ensure!(
                nft_payload(&w, u)? == expected,
                "original token and metadata returned"
            );
        }
        let (op, payload) = prepare_ineligible_recovery(&mut w)?;
        let mut recovery = basic(4, &pages[0], &w);
        recovery.fields[21..34].copy_from_slice(&op);
        let before = w.slots.clone();
        ensure!(
            execute(&mut w, &chain.spec, &recovery).is_err() && w.slots == before,
            "cancelled but unenrolled recovery must fail atomically"
        );
        w.run(205, M, "request_recovery", &[V])?;
        step(&mut chain, &mut w, recovery, &out, "enrolled-recovery").await?;
        ensure!(
            w.val(V, "consumed", 205) == 1,
            "cancelled ineligible order terminalized"
        );
        let enrolled_recovery = if let Some(expected) = payload {
            w.run(205, NFT, "claim", &[0, V])?;
            ensure!(
                nft_payload(&w, 205)? == expected,
                "NFT-only recovery returns actual original asset"
            );
            w.run(205, M, "close_listing", &[])?;
            json!({"owner":205,"collection":NFT,"nftOnlyNoIncomingFee":true,"payload":expected,"fullUpsVerified":true,"ordinaryClaimSignature":false})
        } else {
            let token = w.balance(205, A);
            let native = w.state.get_contract_slot(205, 0, 0)?;
            w.run(205, A, "claim", &[V])?;
            w.run(205, 0, "claim", &[V])?;
            ensure!(
                w.balance(205, A) - token == (1u128 << 62) + 17
                    && w.state.get_contract_slot(205, 0, 0)? - native == 17,
                "partial-fee recovery exact quantities"
            );
            json!({"owner":205,"asset":A,"amount":((1u128<<62)+17).to_string(),"nativeReturned":17,"fullUpsVerified":true,"ordinaryClaimSignature":false})
        };
        ensure!(
            total == [asset_total(&w, A)?, asset_total(&w, B)?],
            "conservation after ineligible recovery and claims"
        );
        let mut exit = abandoned;
        exit.checkpoint = s.fields[7] + 1;
        chain.base.last_leaf = abandoned_leaf;
        let req = basic(ABORT_SOURCE, &pages[0], &exit);
        step(&mut chain, &mut exit, req, &out, "abort-unaccepted").await?;
        ensure!(
            exit.val(V, "stream_aborted", 0) == 1 && exit.val(V, "consumed", 200) == 0,
            "collection timeout preserves funding ownership"
        );
        fs::write(
            format!("{out}/{kind}-REPORT.json"),
            serde_json::to_vec_pretty(
                &json!({"scope":"offline synthetic authenticated checkpoints, actual bytecode, key and complete fixed-verifier UPS; ordinary claims VM-only","members":5,"sourcePages":pages.len(),"sourceRecoveryMembers":1,"refundPages":[2,2,1],"fills":0,"tradingEnabled":false,"globalTradingFrontierVerified":false,"fullUpsVerified":true,"fixedVerifier":true,"assetConservation":true,"attacks":attacks,"claims":claim_rows,"measurements":chain.measurements,"syntheticGasGrantBudget":28*ESCROW,"differentGlobalContextRejected":global_context_rejected,"enrolledRecovery":enrolled_recovery,"broadcast":false}),
            )?,
        )?;
    }
    Ok(())
}

#[tokio::test]
#[ignore = "bounded standalone recovery CFC diagnostic; no signature, UPS or broadcast"]
async fn pair_recovery_cfc_diagnostic() -> Result<()> {
    let out = std::env::var("PAIR_CFC_DIAGNOSTICS")?;
    fs::create_dir(&out)?;
    let kind = std::env::var("PAIR_CFC_KIND").unwrap_or_else(|_| "orderbook".into());
    let mut w = setup_pair(&kind)?;
    let (op, _) = prepare_ineligible_recovery(&mut w)?;
    w.run(205, M, "request_recovery", &[V])?;
    let spec = read_spec(&kind)?;
    let role = spec["base"]["operations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["branch"] == op[0])
        .unwrap();
    let guard = role["calls"][0].clone();
    let base = Chain::new(&w, &[guard.clone()])?;
    let db = base.seed(&w).await?;
    let start = db.get_user_leaf_data(w.checkpoint, V).await?;
    let lps = PsyLocalProvingSessionStore::new_at(
        db,
        f(w.checkpoint),
        f(V),
        f(w.revision + 1),
        start.event_index,
        16,
    );
    let mut info = SessionCircuitInfoStore::new();
    base.cm.register_info(&mut info).await;
    let mut session = Manager::new(lps, info, base.cm.ups_circuit_whitelist_root).await?;
    session.prove_ups_start(&base.cm).await?;
    let name = guard["method_name"].as_str().unwrap();
    let def = &w.methods[&(M, name.into())];
    let args = guard["inputs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| {
            if let Some(i) = a["witness"].as_u64() {
                Ok(f(op[i as usize]))
            } else {
                Ok(f(a["constant"].as_str().context("constant")?.parse()?))
            }
        })
        .collect::<Result<Vec<_>>>()?;
    let witness = session.exec_contract_call(f(M), def, args).await?;
    // Local diagnostic only. No signing key/preimage is part of a CFC witness;
    // raw diagnostics are not included in the public bundle automatically.
    fs::write(
        std::path::Path::new(&out).join("witness.raw.json"),
        serde_json::to_vec_pretty(&witness)?,
    )?;
    fs::write(
        std::path::Path::new(&out).join("definition.json"),
        serde_json::to_vec_pretty(def)?,
    )?;
    let cfc = DapenContractFunctionCircuit::<C, 2>::new(def, 31, 16, false);
    let result = cfc.prove_base(&witness);
    fs::write(
        std::path::Path::new(&out).join("RESULT.json"),
        serde_json::to_vec_pretty(
            &json!({"method":name,"cfcProved":result.is_ok(),"error":result.as_ref().err().map(ToString::to_string),"scope":"standalone actual-bytecode CFC diagnostic, no signature or complete UPS","broadcast":false}),
        )?,
    )?;
    if let Ok(proof) = result {
        cfc.minifier_chain.verify(proof)?;
    }
    Ok(())
}

#[test]
#[ignore = "offline actual-bytecode split recovery regression, no UPS or broadcast"]
fn pair_selected_recovery_residuals() -> Result<()> {
    let mut rows = vec![];
    for reverse in [false, true] {
        let mut w = setup_pair("orderbook")?;
        let total = asset_total(&w, A)?;
        prepare_ineligible_recovery(&mut w)?;
        w.run(205, M, "request_recovery", &[V])?;
        let order = if reverse { [4, 1] } else { [1, 4] };
        for mask in order {
            let name = format!("recover_funding_{mask}");
            let op = w.fields(&name, 205, 0, if mask == 1 { (1u128<<62)+17 } else { 0 }, 0, 0, if mask == 4 {17} else {0}, 0, 0);
            let before = w.slots.clone();
            // Nonselected quantity cannot smuggle a claim, even though the
            // actual unused foreign subtree is absent in this fixture.
            let mut bad = op.clone();
            bad[5] = 1;
            ensure!(w.execute(&w.request(4,vec![bad],[0;4])).is_err() && w.slots==before,"unselected recovery tamper changed state");
            w.execute(&w.request(4,vec![op.clone()],[0;4]))?;
            let done = w.slots.clone();
            ensure!(w.execute(&w.request(4,vec![op],[0;4])).is_err() && w.slots==done,"selected component replay");
        }
        let token=w.balance(205,A);let native=w.state.get_contract_slot(205,0,0)?;
        w.run(205,A,"claim",&[V])?;w.run(205,0,"claim",&[V])?;
        ensure!(w.balance(205,A)-token==(1u128<<62)+17 && w.state.get_contract_slot(205,0,0)?-native==17 && asset_total(&w,A)?==total && w.val(V,"consumed",205)==1,"split recovery exact ownership and conservation");
        rows.push(json!({"order":order,"unselectedTamperRejected":true,"componentReplayRejected":true,"conservation":true}));
    }
    if let Ok(out)=std::env::var("PAIR_SPLIT_RECOVERY_REPORT") {fs::write(out,serde_json::to_vec_pretty(&json!({"scope":"actual-bytecode VM regression, not complete UPS or network acceptance","cases":rows,"broadcast":false}))?)?;}
    Ok(())
}
