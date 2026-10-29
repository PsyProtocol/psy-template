//! New undeployed stream candidates. Real bytecode and full UPSs on synthetic
//! checkpoints; no RPC, coordinator acceptance, ordinary-wallet signature claim
//! or finality conclusion is implied. Root is the sole proving owner.
use super::*;
use plonky2::plonk::config::Hasher;
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_crypto::hash::merkle::core::MerkleProofCore;
use psy_template_u124_markets::{
    checkpoint_stream::State,
    final_state_capture::{collect_snapshot, ReadBudget, SourceReader},
    final_state_coverage::{AssetBinding, ContractOpening, HistoryOpening, Review, Snapshot},
    stream_current::CurrentOpening,
    stream_policy::{self, MemberBinding, Request, StreamKey, ABORT_SOURCE, COVER, OPEN, SETTLE},
    stream_source::{self, Progress, SourcePage},
};
const CHAIN: [u64; 4] = [1234, 0, 0, 0];
struct Reader(Store);
impl SourceReader for Reader {
    async fn subtree(&mut self, c: u64, d: u8, i: u64) -> Result<MerkleProofCore<Q<GF>>> {
        self.0.get_user_sub_tree_merkle_proof(c, 0, d, i).await
    }
    async fn user(&mut self, c: u64, u: u64) -> Result<PsyUserLeaf<GF>> {
        self.0.get_user_leaf_data(c, u).await
    }
    async fn contract(&mut self, c: u64, u: u64, k: u64) -> Result<MerkleProofCore<Q<GF>>> {
        self.0
            .get_user_contract_tree_merkle_proof(c, u, k as u32)
            .await
    }
    async fn word(
        &mut self,
        c: u64,
        u: u64,
        k: u64,
        h: u8,
        i: u64,
    ) -> Result<MerkleProofCore<Q<GF>>> {
        self.0
            .get_user_contract_state_tree_merkle_proof(c, u, k as u32, h, i)
            .await
    }
}
fn empty_sort() -> State {
    let empty = Progress::empty().orders;
    State {
        seen: empty,
        ordered: empty,
        ..Default::default()
    }
}
fn read_progress(w: &World) -> Progress {
    let h = |n: &str| std::array::from_fn(|i| w.val(V, n, i as u64));
    Progress {
        accounts: w.val(V, "stream_accounts", 0),
        last_owner: w.val(V, "stream_last_owner", 0),
        users: h("stream_users"),
        orders: h("stream_orders"),
        recovery: h("stream_recovery"),
        order_count: w.val(V, "stream_order_count", 0),
        recovery_count: w.val(V, "stream_recovery_count", 0),
    }
}
fn read_sort(w: &World) -> State {
    State {
        cursor: w.val(V, "stream_queue_total", 0),
        seen: std::array::from_fn(|i| w.val(V, "stream_empty", i as u64)),
        ordered: std::array::from_fn(|i| w.val(V, "stream_remaining", i as u64)),
        last: std::array::from_fn(|i| w.val(V, "stream_last", i as u64)),
    }
}
fn execute(w: &mut World, spec: &Value, req: &Request) -> Result<()> {
    let mut next = w.clone();
    for c in stream_policy::calls(spec, req, false)? {
        let input = c["inputs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_u64().unwrap())
            .collect::<Vec<_>>();
        next.run(
            V,
            c["contract_id"].as_u64().unwrap(),
            c["method_name"].as_str().unwrap(),
            &input,
        )?;
    }
    next.revision += 1;
    *w = next;
    Ok(())
}
fn setup(kind: &str) -> Result<World> {
    let mut w = World::new(kind)?;
    for asset in [A, B] {
        w.run(
            I,
            asset,
            "transfer",
            &args(&[204], &[super::super::MAX / 16], &[]),
        )?;
        w.run(204, asset, "claim", &[I])?;
    }
    w.set(204, 0, 0, 1000 * ESCROW);
    if kind == "amm" {
        let n = 10u128.pow(24);
        for asset in [A, B] {
            w.pay(I, asset, n)?;
            w.run(V, asset, "claim", &[I])?;
        }
        for name in ["reserve_a", "reserve_b", "total_shares"] {
            for (i, x) in super::super::pair(n).into_iter().enumerate() {
                w.set(V, M, w.fields[name] + i as u64, x);
            }
        }
        for name in ["settled_a", "settled_b"] {
            for (i, x) in super::super::pair(n + 1).into_iter().enumerate() {
                w.set(V, M, w.fields[name] + 2 * I + i as u64, x);
            }
        }
    } else {
        w.fee(I)?;
        w.pay(I, A, 2_000_000 * 10u128.pow(18))?;
        w.operation_maintenance("initialize", 0, 0, 0, 0, 0, 0)?;
    }
    // Fourteen explicit, independently authorized fixture gas grants. Each grants
    // 2 F and the VM setup burns F; total synthetic grant budget is 28 F.
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
    for u in 200..205 {
        if kind == "amm" {
            let amount = (1u128 << 62) + 17;
            let min = if u == 204 { super::super::MAX } else { 1 };
            w.run(u, M, "open_swap", &args(&[V, 0], &[amount, min], &[200, 1]))?;
            w.pay(u, A, amount)?;
        } else {
            let amount = if u == 204 {
                10u128.pow(18) - 1
            } else {
                2 * 10u128.pow(18)
            };
            w.run(
                u,
                M,
                "open_limit_buy",
                &args(&[V, 1, 0], &[amount], &[200, 1]),
            )?;
            w.pay(u, B, amount)?;
        }
        w.fee(u)?;
    }
    Ok(w)
}
async fn review(base: &Chain, w: &World) -> Result<Review> {
    let root = std::env::var("BATCH_BUILD")?;
    let store = Store::new();
    let mut assets = vec![];
    for id in [0, A, if w.kind == "nftmarket" { NFT } else { B }] {
        let path = if id == 0 {
            "native.json".to_string()
        } else if id == NFT {
            "nft/compilation_artifact.json".to_string()
        } else {
            super::super::token_artifact(id)
        };
        let a: Value = serde_json::from_slice(&fs::read(format!("{root}/{path}"))?)?;
        let functions =
            store.set_contract_function_whitelist(w.checkpoint, id, &base.whitelists[&id])?;
        assets.push(if id == NFT {
            AssetBinding::collection(id, &a, functions)?
        } else {
            AssetBinding::from_artifact(id, &a, functions)?
        });
    }
    let a: Value = serde_json::from_slice(&fs::read(format!(
        "{root}/{}/compiled/compilation_artifact.json",
        w.kind
    ))?)?;
    let functions = store.set_contract_function_whitelist(w.checkpoint, M, &base.whitelists[&M])?;
    Review::from_artifact(
        M,
        match w.kind.as_str() {
            "amm" => 1,
            "bondingcurve" => 2,
            "orderbook" => 3,
            "nftmarket" => 4,
            _ => unreachable!(),
        },
        &a,
        functions,
        assets
            .try_into()
            .map_err(|_| anyhow::anyhow!("three source assets"))?,
        10u128.pow(18),
    )
}
fn anchor_leaf() -> PsyCheckpointLeaf<GF> {
    PsyCheckpointLeaf {
        global_chain_root: Q(HashOut {
            elements: CHAIN.map(f),
        }),
        stats: PsyCheckpointLeafStats::new_empty(),
    }
}
async fn snapshot(db: Store, w: &World, r: &Review, fingerprint: Q<GF>) -> Result<Snapshot> {
    let cp = w.checkpoint;
    let checkpoint = db.get_checkpoint_leaf_data(cp).await?;
    let roots = db.get_checkpoint_global_state_roots(cp).await?;
    let mut fields = vec![0; 41];
    fields[..9].copy_from_slice(&[
        1,
        PSY_NETWORK_MAGIC,
        r.kind,
        M,
        V,
        w.val(V, "stream_id", 0) + 1,
        cp,
        cp + 32,
        0,
    ]);
    for (start, h) in [
        (
            9,
            Q(HashOut {
                elements: CHAIN.map(f),
            }),
        ),
        (13, checkpoint.qfhash::<PoseidonHash>()),
        (21, checkpoint.stats.random_seed),
        (25, r.code_root),
        (29, r.layout_root),
        (33, fingerprint),
        (37, r.function_root),
    ] {
        fields[start..start + 4].copy_from_slice(&h.0.elements.map(|n| n.to_canonical_u64()));
    }
    let mut contracts = vec![];
    for id in [0, A, if w.kind == "nftmarket" { NFT } else { B }, M] {
        contracts.push(ContractOpening {
            id,
            leaf: db.get_contract_leaf_data(id).await?,
            path: db.get_contract_tree_merkle_proof(cp, id as u32).await?,
        });
    }
    let root = db.get_checkpoint_tree_root(cp).await?;
    let header = Snapshot {
        fields,
        history: HistoryOpening {
            anchor: db.get_checkpoint_leaf_data(1).await?,
            anchor_path: db.get_checkpoint_tree_merkle_proof(cp, 1).await?,
            checkpoint,
            checkpoint_path: db.get_checkpoint_tree_merkle_proof(cp, cp).await?,
            roots,
        },
        contracts,
        accounts: vec![],
        key_public_param: get_sd_key_public_key_param(&Q(HashOut {
            elements: [GF::ONE; 4],
        })),
    };
    let mut budget = ReadBudget::new(60, 8192)?;
    collect_snapshot(r, header, root, &mut Reader(db), &mut budget, 64).await
}
fn basic(mode: u64, page: &SourcePage, w: &World) -> Request {
    let mut fields = vec![0; 80];
    fields[0] = mode;
    fields[73] = 1_000_000_000;
    Request {
        fields,
        source: page.clone(),
        ledger: if mode == OPEN {
            Progress::empty()
        } else {
            read_progress(w)
        },
        sort: if mode == OPEN {
            empty_sort()
        } else {
            read_sort(w)
        },
        settled: w.val(V, "stream_settled", 0),
        members: vec![],
    }
}
fn sent(w: &World, u: u64, asset: u64) -> u128 {
    w.state
        .get_contract_slot(u, asset, 33554453 + 4 * V)
        .unwrap() as u128
        + (1u128 << 62)
            * w.state
                .get_contract_slot(u, asset, 33554454 + 4 * V)
                .unwrap() as u128
}
fn asset_total(w: &World, asset: u64) -> Result<u128> {
    let users = w
        .slots
        .keys()
        .filter(|(_, c, _)| *c == asset)
        .map(|(u, _, _)| *u)
        .collect::<std::collections::BTreeSet<_>>();
    let mut total = 0u128;
    for u in users {
        total = total
            .checked_add(w.balance(u, asset))
            .context("synthetic asset total overflow")?;
    }
    // sent[u -> v] is paired with claimed[v <- u]. Include pending Outboxes.
    for ((u, c, o), _) in &w.slots {
        if *c != asset
            || *o < 33554453
            || *o >= 33554453 + 4 * (1u64 << 24)
            || (*o - 33554453) % 4 != 0
        {
            continue;
        }
        let peer = (*o - 33554453) / 4;
        let value = |owner, offset| {
            w.state.get_contract_slot(owner, asset, offset).unwrap() as u128
                + (1u128 << 62)
                    * w.state.get_contract_slot(owner, asset, offset + 1).unwrap() as u128
        };
        let outgoing = value(*u, *o);
        let claimed = value(peer, 33554455 + 4 * u);
        ensure!(claimed <= outgoing, "overclaimed FT Outbox");
        total = total
            .checked_add(outgoing - claimed)
            .context("synthetic Outbox total overflow")?;
    }
    Ok(total)
}
fn sent_to(w: &World, u: u64, peer: u64, asset: u64) -> u128 {
    w.state
        .get_contract_slot(u, asset, 33554453 + 4 * peer)
        .unwrap() as u128
        + (1u128 << 62)
            * w.state
                .get_contract_slot(u, asset, 33554454 + 4 * peer)
                .unwrap() as u128
}
fn claim_all(w: &mut World) -> Result<Vec<Value>> {
    let mut rows = vec![];
    for u in 200..205 {
        ensure!(w.val(V, "consumed", u) == 1, "each source member terminal");
        for asset in [A, B] {
            let before = w.balance(u, asset);
            let outgoing = sent_to(w, V, u, asset);
            let claimed = w.state.get_contract_slot(u, asset, 33554455 + 4 * V)? as u128
                + (1u128 << 62) * w.state.get_contract_slot(u, asset, 33554456 + 4 * V)? as u128;
            ensure!(claimed <= outgoing, "claim cursor ahead of sender");
            let pending = outgoing - claimed;
            if pending > 0 {
                w.run(u, asset, "claim", &[V])?;
            }
            ensure!(
                w.balance(u, asset) == before + pending,
                "actual claimant balance delta"
            );
            rows.push(json!({"owner":u,"asset":asset,"claimed":pending.to_string(),"balanceDelta":(w.balance(u,asset)-before).to_string(),"scope":"ordinary claim bytecode only; no ordinary-wallet signature or network receipt"}));
        }
        let before = w.state.get_contract_slot(u, 0, 0)?;
        let sent = w.state.get_contract_slot(V, 0, 3 + 2 * u)?;
        let claimed = w.state.get_contract_slot(u, 0, 4 + 2 * V)?;
        ensure!(claimed <= sent, "native refund cursor");
        if sent > claimed {
            w.run(u, 0, "claim", &[V])?;
        }
        ensure!(
            w.state.get_contract_slot(u, 0, 0)? == before + sent - claimed,
            "native refund claim balance"
        );
        rows.push(json!({"owner":u,"asset":0,"claimed":(sent-claimed).to_string(),"scope":"native refund claim bytecode only"}));
    }
    Ok(rows)
}
fn original_binding(
    r: &Review,
    s: &Snapshot,
    member: &stream_source::PriorityMember,
    path: psy_template_u124_markets::checkpoint_stream::Path,
) -> Result<MemberBinding> {
    let vault = s.accounts.iter().find(|a| a.leaf.user_id == f(V)).unwrap();
    let read = |offset| -> Result<u64> {
        let p = vault
            .market
            .words
            .iter()
            .find(|p| p.index == offset / 4)
            .context("source consumed opening")?;
        Ok(p.value.0.elements[(offset % 4) as usize].to_canonical_u64())
    };
    let row = s
        .accounts
        .iter()
        .find(|a| a.leaf.user_id == f(member.member.owner))
        .unwrap();
    let paid = |asset: usize| -> Result<[u64; 2]> {
        if r.kind == 4 && asset == 1 {
            let send = row.asset_b.as_ref().unwrap();
            let receive = vault.asset_b.as_ref().unwrap();
            let value = |p: &psy_template_u124_markets::final_state_coverage::StateOpening,
                         offset: u64|
             -> Result<u64> {
                let proof = p
                    .words
                    .iter()
                    .find(|p| p.index == offset / 4)
                    .context("NFT source cursor")?;
                Ok(proof.value.0.elements[(offset % 4) as usize].to_canonical_u64())
            };
            let sent = if send.contract_path.value == Q::ZERO {
                0
            } else {
                value(send, 1214 + 35 * V)?
            };
            return Ok([sent - value(receive, 1215 + 35 * member.member.owner)?, 0]);
        }
        let opening = if asset == 0 {
            row.asset_a.as_ref().unwrap()
        } else {
            row.asset_b.as_ref().unwrap()
        };
        let offset = 33554453 + 4 * V;
        let p = opening
            .words
            .iter()
            .find(|p| p.index == offset / 4)
            .context("source sent opening")?;
        let n = p.value.0.elements.map(|v| v.to_canonical_u64());
        let base_offset =
            r.offsets[if asset == 0 { "settled_a" } else { "settled_b" }] + 2 * member.member.owner;
        let amount = n[(offset % 4) as usize] as u128
            + (1u128 << 62) * n[((offset + 1) % 4) as usize] as u128
            - (read(base_offset)? as u128 + (1u128 << 62) * read(base_offset + 1)? as u128);
        Ok(super::super::pair(amount))
    };
    Ok(MemberBinding {
        index: member.index,
        terms: member.member.terms,
        consumed: read(r.offsets["consumed"] + member.member.owner)?,
        paid_a: paid(0)?,
        paid_b: paid(1)?,
        fee: ESCROW,
        path,
    })
}
fn settle_request(
    w: &World,
    r: &Review,
    s: &Snapshot,
    source: &SourcePage,
    queue: &stream_source::PriorityTree,
    offset: usize,
) -> Result<Request> {
    let rows = &queue.members;
    let mut tree = queue.clone();
    for row in &rows[..offset] {
        tree.remove(row.index);
    }
    let mut req = basic(SETTLE, source, w);
    let page = &rows[offset..rows.len().min(offset + 4)];
    req.fields[2] = page.len() as u64;
    req.fields[4] = offset as u64;
    req.settled = offset as u64;
    let mut ri = if w.kind == "amm" {
        w.wide(V, "reserve_a")
    } else {
        0
    };
    let mut ro = if w.kind == "amm" {
        w.wide(V, "reserve_b")
    } else {
        0
    };
    let mut sold = if w.kind == "amm" {
        0
    } else {
        w.val(V, "sold_lots", 0)
    };
    for (i, row) in page.iter().enumerate() {
        let u = row.member.owner;
        let cancelled = w.val(u, "cancelled", 0) != 0
            || w.checkpoint > w.val(u, "deadline", 0)
            || w.checkpoint > source.scope[7];
        let op = if cancelled {
            let a = sent(w, u, A)
                - (w.val(V, "settled_a", 2 * u) as u128
                    + (1u128 << 62) * w.val(V, "settled_a", 2 * u + 1) as u128);
            let b = sent(w, u, B)
                - (w.val(V, "settled_b", 2 * u) as u128
                    + (1u128 << 62) * w.val(V, "settled_b", 2 * u + 1) as u128);
            let fee = w.state.get_contract_slot(u, 0, 3 + 2 * V)? - w.val(V, "settled_fee", u);
            let mask = u64::from(a > 0) + 2 * u64::from(b > 0) + 4 * u64::from(fee > 0);
            w.fields(
                &format!("refund_funding_{mask}"),
                u,
                0,
                a,
                b,
                0,
                fee,
                row.member.nonce,
                0,
            )
        } else if w.kind == "amm" {
            let input = w.wide(u, "x");
            let out = quote(input, ri, ro);
            if out < w.wide(u, "y") {
                w.fields("refund_swap_0", u, 0, input, out, 0, 0, row.member.nonce, 0)
            } else {
                ri += input;
                ro -= out;
                w.fields("swap_0", u, 0, input, out, 0, 0, row.member.nonce, 0)
            }
        } else {
            let unit = 10u128.pow(18);
            let price = unit + sold as u128 * 100_000_000_000_000;
            if price > w.wide(u, "x") {
                w.fields(
                    "refund_buy",
                    u,
                    0,
                    w.wide(u, "x"),
                    0,
                    price,
                    1,
                    row.member.nonce,
                    0,
                )
            } else {
                sold += 1;
                w.fields(
                    "settle_limit_buy_change",
                    u,
                    0,
                    price,
                    unit,
                    w.wide(u, "x") - price,
                    1,
                    row.member.nonce,
                    0,
                )
            }
        };
        req.fields[21 + 13 * i..34 + 13 * i].copy_from_slice(&op);
        req.members
            .push(original_binding(r, s, row, tree.proof(row.index))?);
        tree.remove(row.index);
    }
    let mut rank = (0..page.len()).collect::<Vec<_>>();
    rank.sort_by_key(|i| page[*i].member.owner);
    for i in page.len()..4 {
        rank.push(i);
    }
    for (i, r) in rank.into_iter().enumerate() {
        req.fields[17 + i] = r as u64;
    }
    Ok(req)
}

fn needed(spec: &Value) -> Vec<Value> {
    let mut out = spec["stream"]
        .as_object()
        .unwrap()
        .values()
        .cloned()
        .collect::<Vec<_>>();
    for op in spec["base"]["operations"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|o| {
            [
                "swap_0",
                "refund_swap_0",
                "settle_limit_buy_change",
                "refund_buy",
            ]
            .contains(&o["name"].as_str().unwrap())
                || o["name"].as_str().unwrap().starts_with("refund_funding_")
                || (spec["version"] == 7
                    && (o["name"].as_str().unwrap().starts_with("recover_funding_")
                        || o["name"] == "recover_nft"))
        })
    {
        out.extend(op["calls"].as_array().unwrap().iter().cloned());
    }
    out.push(spec["base"]["burn"].clone());
    out
}
fn read_spec(kind: &str) -> Result<Value> {
    Ok(serde_json::from_slice(&fs::read(format!(
        "{}/{kind}/stream-policy.json",
        std::env::var("BATCH_BUILD")?
    ))?)?)
}
#[test]
fn stream_bytecode_context_binding() -> Result<()> {
    for kind in ["amm", "bondingcurve"] {
        let mut w = setup(kind)?;
        let spec = read_spec(kind)?;
        let mut scope = vec![0; 41];
        scope[..9].copy_from_slice(&[
            3,
            PSY_NETWORK_MAGIC,
            if kind == "amm" { 1 } else { 2 },
            M,
            V,
            1,
            w.checkpoint,
            w.checkpoint + 32,
            0,
        ]);
        for i in 9..41 {
            scope[i] = i as u64;
        }
        let page = SourcePage {
            scope,
            facts: (0..5)
                .map(|i| [100 + i, 200 + i, 300 + i, 400 + i])
                .collect(),
            before: Progress::empty(),
            after: Progress::empty(),
            rows: vec![],
        };
        let req = basic(OPEN, &page, &w);
        execute(&mut w, &spec, &req)?;
        w.checkpoint = page.scope[7] + 1;
        let req = basic(ABORT_SOURCE, &page, &w);
        execute(&mut w, &spec, &req)?;
        ensure!(w.val(V, "stream_aborted", 0) == 1, "timeout exit");
    }
    Ok(())
}
#[tokio::test]
#[ignore = "new stream candidate bytecode, fixed frozen artifacts and fresh output"]
async fn stream_bytecode_continuation_and_refunds() -> Result<()> {
    let out = std::env::var("STREAM_VM_OUT")?;
    fs::create_dir(&out)?;
    for kind in ["amm", "bondingcurve"] {
        eprintln!("STREAM_SETUP {kind}");
        let mut w = setup(kind)?;
        let total_before = [asset_total(&w, A)?, asset_total(&w, B)?];
        let spec = read_spec(kind)?;
        let base = Chain::new(&w, &needed(&spec))?;
        let r = review(&base, &w).await?;
        let db = base
            .seed_identity_with_history(&w, base.key.get_fingerprint(), &[(1, anchor_leaf())])
            .await?;
        let s = snapshot(db, &w, &r, base.key.get_fingerprint()).await?;
        if let Ok(dir) = std::env::var("STREAM_CAPTURE_OUT") {
            fs::create_dir_all(&dir)?;
            fs::write(
                format!("{dir}/{kind}-snapshot.json"),
                serde_json::to_vec_pretty(&s)?,
            )?;
        }
        let history = s.history.checkpoint_path.root;
        let source = stream_source::prepare(&r, &s, history)?;
        let queue = stream_source::priority(&r, &s, history)?;
        ensure!(
            source.last().unwrap().after.order_count == 5 && queue.members.len() == 5,
            "five source orders exceed one settlement page"
        );
        let req = basic(OPEN, &source[0], &w);
        execute(&mut w, &spec, &req)?;
        let mut abandoned = w.clone();
        let premature = basic(ABORT_SOURCE, &source[0], &abandoned);
        let frozen = abandoned.slots.clone();
        ensure!(
            execute(&mut abandoned, &spec, &premature).is_err() && abandoned.slots == frozen,
            "premature source abort"
        );
        abandoned.checkpoint = s.fields[7] + 1;
        let abort = basic(ABORT_SOURCE, &source[0], &abandoned);
        execute(&mut abandoned, &spec, &abort)?;
        ensure!(
            abandoned.val(V, "stream_aborted", 0) == 1
                && abandoned.val(V, "stream_phase", 0) == 7
                && abandoned.val(V, "consumed", 200) == 0,
            "source abort cannot consume or claim funds"
        );
        w.checkpoint += 1;
        w.run(203, M, "request_cancel", &[])?;
        for p in &source {
            let req = basic(COVER, p, &w);
            execute(&mut w, &spec, &req)?;
            w.checkpoint += 1;
        }
        ensure!(
            w.val(V, "stream_phase", 0) == 3 && read_sort(&w).ordered == queue.root(),
            "complete source priority queue before spending"
        );
        let first = settle_request(&w, &r, &s, &source[0], &queue, 0)?;
        let before = w.slots.clone();
        let mut missing = first.clone();
        missing.fields[2] = 3;
        missing.members.truncate(3);
        ensure!(
            execute(&mut w, &spec, &missing).is_err() && w.slots == before,
            "short nonterminal page accepted"
        );
        let mut shifted = first.clone();
        shifted.settled = 1;
        shifted.fields[4] = 1;
        ensure!(
            execute(&mut w, &spec, &shifted).is_err() && w.slots == before,
            "shifted cursor accepted"
        );
        execute(&mut w, &spec, &first)?;
        w.checkpoint += 1;
        let before = w.slots.clone();
        ensure!(
            execute(&mut w, &spec, &first).is_err() && w.slots == before,
            "prior page replay"
        );
        let mut timeout = w.clone();
        timeout.checkpoint = s.fields[7] + 1;
        let refund = settle_request(&timeout, &r, &s, &source[0], &queue, 4)?;
        execute(&mut timeout, &spec, &refund)?;
        ensure!(
            timeout.val(V, "stream_phase", 0) == 7 && timeout.val(V, "stream_settled", 0) == 5,
            "timeout must preserve original tail and reach terminal"
        );
        let tail = settle_request(&w, &r, &s, &source[0], &queue, 4)?;
        execute(&mut w, &spec, &tail)?;
        ensure!(
            w.val(V, "stream_phase", 0) == 7 && w.val(V, "stream_settled", 0) == 5,
            "single member tail completes original stream"
        );
        let claims = claim_all(&mut w)?;
        ensure!(
            total_before == [asset_total(&w, A)?, asset_total(&w, B)?],
            "FT conservation including unclaimed Outboxes"
        );
        fs::write(
            format!("{out}/{kind}.json"),
            serde_json::to_vec_pretty(
                &json!({"scope":"actual candidate bytecode with synthetic authenticated source; no stream-key signature or full UPS acceptance in this test","accounts":source.last().unwrap().after.accounts,"members":5,"sourcePages":source.len(),"priorityTreeHeight":56,"settlementPages":[4,1],"cancelledOwner":203,"slippageOwner":204,"timeoutPreservedTail":true,"finalCursor":5,"shortPageRejected":true,"replayRejected":true,"fullUpsVerified":false,"ordinaryClaims":claims,"assetConservation":true,"broadcast":false}),
            )?,
        )?;
    }
    Ok(())
}
struct StreamChain {
    base: Chain,
    key: StreamKey,
    review: Review,
    spec: Value,
    source: Snapshot,
    source_checkpoint: u64,
    measurements: Vec<Value>,
}
impl StreamChain {
    async fn new(w: &World) -> Result<Self> {
        let started = Instant::now();
        let spec = read_spec(&w.kind)?;
        let base = Chain::new(w, &needed(&spec))?;
        let review = review(&base, w).await?;
        let key = StreamKey::build(&spec, &review, CHAIN)?;
        let db = base
            .seed_identity_with_history(w, key.g.get_fingerprint(), &[(1, anchor_leaf())])
            .await?;
        let source = snapshot(db, w, &review, key.g.get_fingerprint()).await?;
        Ok(Self {
            base,
            key,
            review,
            spec,
            source,
            source_checkpoint: w.checkpoint,
            measurements: vec![
                json!({"phase":"cold-stream-resource-build","seconds":started.elapsed().as_secs_f64()}),
            ],
        })
    }
    async fn seed(&self, w: &World) -> Result<(Store, Snapshot, MerkleProofCore<Q<GF>>)> {
        let history = if w.checkpoint == self.source_checkpoint {
            vec![(1, anchor_leaf())]
        } else {
            vec![
                (1, anchor_leaf()),
                (self.source_checkpoint, self.source.history.checkpoint),
            ]
        };
        let db = self
            .base
            .seed_identity_with_history(w, self.key.g.get_fingerprint(), &history)
            .await?;
        let mut source = self.source.clone();
        source.history.anchor_path = db.get_checkpoint_tree_merkle_proof(w.checkpoint, 1).await?;
        source.history.checkpoint_path = db
            .get_checkpoint_tree_merkle_proof(w.checkpoint, self.source_checkpoint)
            .await?;
        // Reconstruct original source metadata in an independent temporary database
        // for its exact user membership path; never substitute current state.
        let proof = source_vault_path(&source)?;
        Ok((db, source, proof))
    }
    async fn prove(
        &mut self,
        w: &mut World,
        mut req: Request,
        out: &str,
        label: &str,
    ) -> Result<()> {
        let start = Instant::now();
        let (db, source, vault_path) = self.seed(w).await?;
        let start_leaf = db.get_user_leaf_data(w.checkpoint, V).await?;
        let mut current_contracts = vec![];
        for id in [0, A, if w.kind == "nftmarket" { NFT } else { B }, M] {
            current_contracts.push(ContractOpening {
                id,
                leaf: db.get_contract_leaf_data(id).await?,
                path: db
                    .get_contract_tree_merkle_proof(w.checkpoint, id as u32)
                    .await?,
            });
        }
        let current = CurrentOpening {
            anchor: db.get_checkpoint_leaf_data(1).await?,
            anchor_path: db.get_checkpoint_tree_merkle_proof(w.checkpoint, 1).await?,
            checkpoint: db.get_checkpoint_leaf_data(w.checkpoint).await?,
            roots: db.get_checkpoint_global_state_roots(w.checkpoint).await?,
            contracts: current_contracts,
        };
        let dir = std::path::Path::new(out).join(format!("{}-{label}", w.kind));
        fs::create_dir(&dir)?;
        fs::write(dir.join("source.json"), serde_json::to_vec_pretty(&source)?)?;
        fs::write(
            dir.join("current.json"),
            serde_json::to_vec_pretty(&current)?,
        )?;
        fs::write(dir.join("intent.json"), serde_json::to_vec_pretty(&req)?)?;
        let mut cache = PsyCmdStoreWithCache::new(w.checkpoint, db);
        for (cid, code) in &self.base.code {
            let wl = &self.base.whitelists[cid];
            for i in 0..code.functions.len() {
                let index = (i * 2) as u32;
                let proof = ContractFunctionTreeStore::<Store>::get_leaf_sfc(
                    &cache.read_store,
                    w.checkpoint,
                    *cid,
                    index as u64,
                )?;
                ensure!(
                    proof.value == wl[i * 2]
                        && proof.siblings[0] == wl[i * 2 + 1]
                        && proof.verify::<PoseidonHash>(),
                    "exact raw function proof"
                );
                cache.cache.merkle_cmd_cache.insert(
                    QSRMerkleCmd::GetContractFunctionTreeMerkleProof(
                        QSRMerkleCmdGetContractFunctionTreeMerkleProof {
                            checkpoint_id: w.checkpoint,
                            contract_id: *cid as u32,
                            function_id: index,
                        },
                    ),
                    proof,
                );
            }
        }
        let lps = PsyLocalProvingSessionStore::new_at_with_cmd_store(
            cache,
            f(w.checkpoint),
            f(V),
            f(w.revision + 1),
            start_leaf.event_index,
            16,
        );
        let mut info = SessionCircuitInfoStore::new();
        self.base.cm.register_info(&mut info).await;
        let mut session = Manager::new(lps, info, self.base.cm.ups_circuit_whitelist_root).await?;
        session.prove_ups_start(&self.base.cm).await?;
        let calls = stream_policy::calls(&self.spec, &req, true)?;
        let mut steps = vec![];
        for c in &calls[..calls.len() - 1] {
            let t = Instant::now();
            let cid = c["contract_id"].as_u64().unwrap();
            let name = c["method_name"].as_str().unwrap();
            let (index, def) = self
                .base
                .cm
                .resolve_contract_function_by_method_name(cid, &self.base.code[&cid], name.into())
                .await?;
            session
                .prove_standard_call(
                    &self.base.cm,
                    f(cid),
                    index as u32,
                    &def,
                    c["inputs"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|v| f(v.as_u64().unwrap()))
                        .collect(),
                )
                .await
                .with_context(|| format!("stream CFC {label}/{name}"))?;
            eprintln!("STREAM_CFC {} {label}/{name}", w.kind);
            steps.push(json!({"contract":cid,"method":name,"seconds":t.elapsed().as_secs_f64()}));
        }
        let prefix = session.require_lps()?.get_total_modified_slots_for_fee();
        let native_changed = session.require_lps()?.has_positional_slot_update(0, 0);
        let native_current = session
            .require_lps_mut()?
            .get_contract_state_slot(GF::ZERO, GF::ZERO)
            .await?
            .value
            .0
            .elements
            .map(|n| n.to_canonical_u64());
        let initial = std::array::from_fn(|i| w.state.get_contract_slot(V, 0, i as u64).unwrap());
        let burn = stream_policy::completion_fee(prefix, native_changed, initial, native_current)?;
        req.fields[73] = burn;
        let (index, def) = self
            .base
            .cm
            .resolve_contract_function_by_method_name(0, &self.base.code[&0], "burn".into())
            .await?;
        session
            .prove_standard_call(&self.base.cm, GF::ZERO, index as u32, &def, vec![f(burn)])
            .await?;
        let slots = session.require_lps()?.get_total_slots_modified();
        ensure!(
            burn == GUTA_FEE + DA_FEE * slots.to_canonical_u64(),
            "final net-word fee"
        );
        let header = *session.get_current_ups_header();
        let logical = stream_policy::calls(&self.spec, &req, false)?;
        let infos=logical.iter().map(|c|{let cid=c["contract_id"].as_u64().unwrap();let def=&w.methods[&(cid,c["method_name"].as_str().unwrap().into())];psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(cid),f(def.method_id as u64),&c["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect::<Vec<_>>()).into()}).collect::<Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>>();
        let actual = infos
            .iter()
            .filter(|i| {
                i.contract_id != f(M)
                    || i.method_id != f(self.spec["noop"]["method_id"].as_u64().unwrap())
            })
            .copied()
            .collect::<Vec<_>>();
        ensure!(
            actual == session.sd_key_transaction_infos()
                && header.current_state.tx_count == f(actual.len() as u64),
            "actual full ordered call stack"
        );
        let fields = self
            .key
            .fields(&self.review, &source, &vault_path, &current, &req)?;
        let input = SDKeyCircuitWitnessInput {
            session_context: SDKeySessionContext {
                start_user_leaf: header.session_start_context.start_session_user_leaf,
                start_user_leaf_hash: header
                    .session_start_context
                    .start_session_user_leaf
                    .qfhash::<PoseidonHash>(),
                checkpoint_leaf_hash: header.session_start_context.checkpoint_leaf_hash,
                checkpoint_tree_root: header.session_start_context.checkpoint_tree_root,
                current_user_leaf: header.current_state.user_leaf,
                nonce: f(w.revision + 1),
            },
            circuit_inputs: fields.iter().copied().map(f).collect(),
            transaction_infos: infos,
            tx_stack_hash: header.current_state.tx_hash_stack,
            tx_count: header.current_state.tx_count,
            state_reader_results: None,
            secp256k1_slots: vec![],
            checkpoint_id: f(w.checkpoint),
            user_id: f(V),
        };
        let sig_hash = session.get_sighash(PSY_NETWORK_MAGIC, f(w.revision + 1));
        let key_started = Instant::now();
        let signature = self
            .key
            .g
            .prove(
                Q(HashOut {
                    elements: [GF::ONE; 4],
                }),
                &input,
                sig_hash,
            )
            .await
            .context("stream source/cursor/full-stack spending proof")?;
        let key_seconds = key_started.elapsed().as_secs_f64();
        // Alter actual circuit witnesses while retaining the genuine signed
        // session and stack. Rejection must come from the compiled key.
        let mut rejections = vec![];
        if label == "open" || label == "settle-0" || label == "refund-0" {
            let mut cases = vec![];
            let mut changed = input.clone();
            changed.circuit_inputs[80 + 9] += GF::ONE;
            cases.push(("chain-instance", changed));
            let mut changed = input.clone();
            changed.circuit_inputs[80 + 1] += GF::ONE;
            cases.push(("network-domain", changed));
            let mut changed = input.clone();
            changed.session_context.nonce += GF::ONE;
            cases.push(("session-nonce", changed));
            let mut changed = input.clone();
            changed.transaction_infos.swap(0, 1);
            cases.push(("ordered-call-stack", changed));
            let mut changed = input.clone();
            changed.circuit_inputs[73] += f(1000);
            cases.push(("unapproved-fee", changed));
            if label == "settle-0" || label == "refund-0" {
                for (name, index, value) in [
                    ("cursor", 4, input.circuit_inputs[4] + GF::ONE),
                    ("omitted-member", 2, f(3)),
                    ("payer-substitution", 22, input.circuit_inputs[22] + GF::ONE),
                    ("amount", 24, input.circuit_inputs[24] + GF::ONE),
                    ("u124-overflow", 24, f(1u64 << 62)),
                ] {
                    let mut changed = input.clone();
                    changed.circuit_inputs[index] = value;
                    cases.push((name, changed));
                }
            }
            for name in [
                "current-code-root",
                "current-layout-root",
                "current-function-root",
                "current-checkpoint",
            ] {
                let mut changed = current.clone();
                match name {
                    "current-code-root" => {
                        changed.contracts[3].leaf.code_root.0.elements[0] += GF::ONE
                    }
                    "current-layout-root" => {
                        changed.contracts[3].leaf.state_layout_root.0.elements[0] += GF::ONE
                    }
                    "current-function-root" => {
                        changed.contracts[3].leaf.function_tree_root.0.elements[0] += GF::ONE
                    }
                    _ => changed.checkpoint.global_chain_root.0.elements[0] += GF::ONE,
                };
                let assignment =
                    self.key
                        .fields(&self.review, &source, &vault_path, &changed, &req);
                if let Ok(fields) = assignment {
                    let mut changed = input.clone();
                    changed.circuit_inputs = fields.into_iter().map(f).collect();
                    ensure!(
                        self.key
                            .g
                            .prove(
                                Q(HashOut {
                                    elements: [GF::ONE; 4]
                                }),
                                &changed,
                                sig_hash
                            )
                            .await
                            .is_err(),
                        "key accepted {name}"
                    );
                }
                rejections.push(name);
            }
            for (name, changed) in cases {
                ensure!(
                    self.key
                        .g
                        .prove(
                            Q(HashOut {
                                elements: [GF::ONE; 4]
                            }),
                            &changed,
                            sig_hash
                        )
                        .await
                        .is_err(),
                    "key accepted {name}"
                );
                rejections.push(name);
            }
        }
        fs::write(dir.join("key-proof.bin"), bincode::serialize(&signature)?)?;
        fs::write(
            dir.join("public-session.json"),
            serde_json::to_vec_pretty(
                &json!({"projection":"public fields only: no private key or signing witness","session":input.session_context,"stack":input.transaction_infos,"txStackHash":input.tx_stack_hash,"txCount":input.tx_count,"checkpoint":input.checkpoint_id,"user":input.user_id,"sigHash":sig_hash,"actualCalls":stream_policy::calls(&self.spec,&req,true)?,"keyFingerprint":self.key.g.get_fingerprint()}),
            )?,
        )?;
        let t = Instant::now();
        let param = get_sd_key_public_key_param(&Q(HashOut {
            elements: [GF::ONE; 4],
        }));
        let proof = session
            .prove_end_cap(
                &self.base.cm,
                PSY_NETWORK_MAGIC,
                f(w.revision + 1),
                slots,
                self.key.g.get_fingerprint(),
                param,
                signature,
                self.key
                    .g
                    .minifier_chain
                    .as_ref()
                    .unwrap()
                    .get_verifier_data()
                    .clone(),
            )
            .await?;
        self.base.cm.ups_end_cap.verify_proof(proof.clone())?;
        psy_template_u124_markets::live_guard::verify_ups_profile(&self.base.cm)?;
        psy_template_u124_markets::fixed_verifier::with_verifier(|v| {
            v.verify(proof.clone())?;
            Ok(())
        })?;
        let api = session.get_api_input().await?;
        validate_endcap_binding(&api.core, &proof.public_inputs)?;
        let end = session.get_current_ups_header().current_state.user_leaf;
        ensure!(
            api.core.new_user_leaf == end && end.nonce == f(w.revision + 1),
            "exact final identity and nonce"
        );
        fs::write(
            dir.join("request.json"),
            serde_json::to_vec(&psy_provider::request::QSubmitEndCapRPCRequest {
                user_ec_input: api.clone(),
                proof: bincode::serialize(&proof)?,
            })?,
        )?;
        fs::write(dir.join("plan.json"), serde_json::to_vec_pretty(&req)?)?;
        let mut expected = w.clone();
        execute(&mut expected, &self.spec, &req)?;
        for ((u, c, o), want) in &expected.slots {
            if *u == V {
                let p = session
                    .require_lps_mut()?
                    .get_contract_state_slot(f(*c), f(*o / 4))
                    .await?;
                ensure!(
                    p.value.0.elements[(*o % 4) as usize].to_canonical_u64() == *want,
                    "stream VM/UPS state endpoint {c}/{o}"
                );
            }
        }
        let (updates, charged) = session.require_lps_mut()?.get_all_state_updates().await?;
        ensure!(
            charged as u64 == slots.to_canonical_u64(),
            "exact exported fee count"
        );
        let mut root = start_leaf.user_state_tree_root;
        for update in updates {
            ensure!(
                update
                    .user_contract_tree_update_proof
                    .verify::<PoseidonHash>()
                    && update.user_contract_tree_update_proof.old_root == root,
                "linked exported contract root"
            );
            root = update.user_contract_tree_update_proof.new_root;
            for change in update.contract_state_tree_updates {
                match change {
                    psy_client_data::guta::api::ContractStateUpdate::Positional { delta_proof } => {
                        ensure!(delta_proof.verify::<PoseidonHash>(), "exported slot delta")
                    }
                    _ => anyhow::bail!("unexpected nonpositional stream update"),
                }
            }
        }
        ensure!(root == end.user_state_tree_root, "exported final root");
        let row = json!({"phase":label,"seconds":start.elapsed().as_secs_f64(),"keySeconds":key_seconds,"endcapAndAuditSeconds":t.elapsed().as_secs_f64(),"calls":actual.len(),"logicalSlots":40,"fee":burn,"slots":slots.to_canonical_u64(),"startLeaf":start_leaf.qfhash::<PoseidonHash>().to_string(),"endLeaf":end.qfhash::<PoseidonHash>().to_string(),"sourceCheckpoint":self.source_checkpoint,"sourceRoot":self.source.history.checkpoint.global_chain_root.to_string(),"keyFingerprint":self.key.g.get_fingerprint().to_string(),"fullUpsVerified":true,"fixedVerifier":true,"keyAttackRejections":rejections,"steps":steps,"broadcast":false});
        fs::write(
            dir.join("verification.json"),
            serde_json::to_vec_pretty(&row)?,
        )?;
        self.measurements.push(row);
        self.base.last_leaf = Some(end);
        expected.checkpoint += 1;
        *w = expected;
        Ok(())
    }
}
fn source_vault_path(s: &Snapshot) -> Result<MerkleProofCore<Q<GF>>> {
    // All original account leaves are present; reconstruct the complete source
    // tree independently, without asking the current checkpoint for old metadata.
    use psy_crypto::hash::traits::hasher::{FieldQHasher, MerkleZeroHasher};
    let mut levels = vec![s
        .accounts
        .iter()
        .map(|a| {
            (
                a.leaf.user_id.to_canonical_u64(),
                a.leaf.qfhash::<PoseidonHash>(),
            )
        })
        .collect::<BTreeMap<_, _>>()];
    for h in 0..32 {
        let mut next = BTreeMap::new();
        for index in levels[h].keys() {
            let p = index / 2;
            let z = PoseidonHash::get_zero_hash(h);
            next.entry(p).or_insert_with(|| {
                PoseidonHash::q_two_to_one(
                    *levels[h].get(&(2 * p)).unwrap_or(&z),
                    *levels[h].get(&(2 * p + 1)).unwrap_or(&z),
                )
            });
        }
        levels.push(next);
    }
    let vault = s.fields[4];
    let leaf = s
        .accounts
        .iter()
        .find(|a| a.leaf.user_id == f(vault))
        .unwrap()
        .leaf;
    let path = MerkleProofCore::new_from_params::<PoseidonHash>(
        vault,
        leaf.qfhash::<PoseidonHash>(),
        (0..32)
            .map(|h| {
                *levels[h]
                    .get(&((vault >> h) ^ 1))
                    .unwrap_or(&PoseidonHash::get_zero_hash(h))
            })
            .collect(),
    );
    ensure!(
        path.root == s.history.roots.user_tree_root,
        "complete original source user root"
    );
    Ok(path)
}
#[tokio::test]
#[ignore = "bounded full stream UPSs; explicit synthetic fee budget and fresh output"]
async fn stream_complete_ups_continuation() -> Result<()> {
    let out = std::env::var("STREAM_FULL_UPS_OUT")?;
    fs::create_dir(&out)?;
    let selected = std::env::var("STREAM_MARKETS").unwrap_or_else(|_| "amm,bondingcurve".into());
    for kind in selected.split(',') {
        ensure!(
            ["amm", "bondingcurve"].contains(&kind),
            "reviewed stream market"
        );
        eprintln!("STREAM_SETUP {kind}");
        let mut w = setup(kind)?;
        let total_before = [asset_total(&w, A)?, asset_total(&w, B)?];
        let mut chain = StreamChain::new(&w).await?;
        let s = chain.source.clone();
        let r = &chain.review;
        let source = stream_source::prepare(r, &s, s.history.checkpoint_path.root)?;
        let queue = stream_source::priority(r, &s, s.history.checkpoint_path.root)?;
        let req = basic(OPEN, &source[0], &w);
        chain.prove(&mut w, req, &out, "open").await?;
        let after_open = w.clone();
        let open_leaf = chain.base.last_leaf;
        w.run(203, M, "request_cancel", &[])?;
        for (i, p) in source.iter().enumerate() {
            let req = basic(COVER, p, &w);
            chain
                .prove(&mut w, req, &out, &format!("source-{i}"))
                .await?;
        }
        ensure!(
            w.val(V, "stream_phase", 0) == 3,
            "source completeness before settlement"
        );
        let first = settle_request(&w, &chain.review, &s, &source[0], &queue, 0)?;
        chain.prove(&mut w, first, &out, "settle-0").await?;
        let old_leaf = chain.base.last_leaf;
        let before_tail = w.clone();
        let tail = settle_request(&w, &chain.review, &s, &source[0], &queue, 4)?;
        chain.prove(&mut w, tail, &out, "settle-tail").await?;
        ensure!(
            w.val(V, "stream_phase", 0) == 7 && w.val(V, "stream_settled", 0) == 5,
            "complete 4+1 settlement"
        );
        let claims = claim_all(&mut w)?;
        ensure!(
            total_before == [asset_total(&w, A)?, asset_total(&w, B)?],
            "full stream FT conservation"
        );
        let mut timed = before_tail;
        timed.checkpoint = s.fields[7] + 1;
        chain.base.last_leaf = old_leaf;
        let tail = settle_request(&timed, &chain.review, &s, &source[0], &queue, 4)?;
        chain.prove(&mut timed, tail, &out, "timeout-tail").await?;
        ensure!(
            timed.val(V, "stream_phase", 0) == 7 && timed.val(V, "consumed", 204) == 1,
            "original tail timeout refund"
        );
        let mut abandoned = after_open;
        abandoned.checkpoint = s.fields[7] + 1;
        chain.base.last_leaf = open_leaf;
        let abort = basic(ABORT_SOURCE, &source[0], &abandoned);
        chain
            .prove(&mut abandoned, abort, &out, "abort-source")
            .await?;
        ensure!(
            abandoned.val(V, "stream_phase", 0) == 7
                && abandoned.val(V, "stream_aborted", 0) == 1
                && abandoned.val(V, "consumed", 200) == 0,
            "unaccepted source abort endpoint"
        );
        fs::write(
            format!("{out}/{kind}-REPORT.json"),
            serde_json::to_vec_pretty(
                &json!({"scope":"complete source-covered deterministic stream proofs on synthetic checkpoints; initial pool, user actions and final claims not ordinary-wallet UPSs or network acceptance","members":5,"settlementPages":[4,1],"sourcePages":source.len(),"fixedVerifier":true,"fullUpsVerified":true,"feeBudgetFixtureGrants":28*ESCROW,"assetConservation":true,"ordinaryClaimBytecode":claims,"measurements":chain.measurements,"broadcast":false}),
            )?,
        )?;
    }
    Ok(())
}

/// Reuse the exact saved key proof; forge coherent alternative SDK signature
/// preimages to test priority authorization rather than merely stale sighashes.
#[tokio::test]
#[ignore = "requires saved public complete-UPS evidence and fresh output"]
async fn stream_key_exact_replay_and_coherent_priority_attacks() -> Result<()> {
    use psy_client_data::qdata::{
        ups_signature::PsyUserProvingSessionSignatureDataCompact, user_contract_state::SignContext,
    };
    use psy_template_u124_markets::market_key::compute_tx_stack_hash;
    let input_root = std::env::var("STREAM_KEY_EVIDENCE")?;
    let out = std::env::var("STREAM_KEY_REPLAY_OUT")?;
    fs::create_dir(&out)?;
    let selected =
        std::env::var("STREAM_KEY_REPLAY_MARKETS").unwrap_or_else(|_| "amm,bondingcurve".into());
    for kind in selected.split(',') {
        let paired = ["orderbook", "nftmarket"].contains(&kind);
        ensure!(
            ["amm", "bondingcurve", "orderbook", "nftmarket"].contains(&kind),
            "reviewed replay market"
        );
        let label = if paired { "refund-0" } else { "settle-0" };
        let dir = std::path::Path::new(&input_root).join(format!("{kind}-{label}"));
        let read = |name: &str| -> Result<Value> {
            Ok(serde_json::from_slice(&fs::read(dir.join(name))?)?)
        };
        let source: Snapshot = serde_json::from_value(read("source.json")?)?;
        let current: CurrentOpening = serde_json::from_value(read("current.json")?)?;
        let request: Request = serde_json::from_value(read("plan.json")?)?;
        let public = read("public-session.json")?;
        let report = read("verification.json")?;
        let spec = read_spec(kind)?;
        let root = std::env::var("BATCH_BUILD")?;
        let artifact = |path: &str| -> Result<Value> {
            Ok(serde_json::from_slice(&fs::read(format!(
                "{root}/{path}"
            ))?)?)
        };
        let mut assets = vec![];
        for id in [0, A, if kind == "nftmarket" { NFT } else { B }] {
            let c = current.contracts.iter().find(|c| c.id == id).unwrap();
            let path = if id == 0 {
                "native.json".into()
            } else if id == NFT {
                "nft/compilation_artifact.json".into()
            } else {
                super::super::token_artifact(id)
            };
            let a = artifact(&path)?;
            assets.push(if id == NFT {
                AssetBinding::collection(id, &a, c.leaf.function_tree_root)?
            } else {
                AssetBinding::from_artifact(id, &a, c.leaf.function_tree_root)?
            });
        }
        let r = Review::from_artifact(
            M,
            match kind {
                "amm" => 1,
                "bondingcurve" => 2,
                "orderbook" => 3,
                "nftmarket" => 4,
                _ => unreachable!(),
            },
            &artifact(&format!("{kind}/compiled/compilation_artifact.json"))?,
            current
                .contracts
                .iter()
                .find(|c| c.id == M)
                .unwrap()
                .leaf
                .function_tree_root,
            assets.try_into().map_err(|_| anyhow::anyhow!("assets"))?,
            10u128.pow(18),
        )?;
        let key = StreamKey::build(&spec, &r, CHAIN)?;
        ensure!(
            key.g.get_fingerprint().to_string() == report["keyFingerprint"].as_str().unwrap(),
            "reconstructed exact key"
        );
        let signature: plonky2::plonk::proof::ProofWithPublicInputs<GF, C, 2> =
            bincode::deserialize(&fs::read(dir.join("key-proof.bin"))?)?;
        key.g
            .minifier_chain
            .as_ref()
            .unwrap()
            .verify(signature.clone())?;
        let sig_hash: Q<GF> = serde_json::from_value(public["sigHash"].clone())?;
        let param = source.key_public_param;
        ensure!(
            signature.public_inputs == PoseidonHash::two_to_one(sig_hash.0, param.0).elements,
            "saved proof exact signature/public-key preimage"
        );
        let context: SDKeySessionContext = serde_json::from_value(public["session"].clone())?;
        let path = source_vault_path(&source)?;
        let queue = stream_source::priority(&r, &source, source.history.checkpoint_path.root)?;
        let w = World::new(kind)?;
        let mut rejected = vec![];
        let schedules = if paired {
            vec![
                ("later-member-first", vec![1, 0]),
                ("omitted-minimum", vec![1, 2]),
                ("duplicate-member", vec![0, 0]),
            ]
        } else {
            vec![
                ("later-member-first", vec![1, 0, 2, 3]),
                ("omitted-minimum", vec![1, 2, 3, 4]),
                ("duplicate-member", vec![0, 0, 2, 3]),
            ]
        };
        for (name, schedule) in schedules {
            let mut altered = request.clone();
            let mut remaining = queue.clone();
            altered.members.clear();
            for (i, index) in schedule.iter().copied().enumerate() {
                let u = queue.members[index].member.owner;
                // The last source member is a different refund branch. Use its
                // original payer row when present; synthetic row values remain
                // explicitly bound in the recomputed full call stack below.
                let old = (0..4)
                    .find(|j| request.fields[22 + 13 * j] == u)
                    .unwrap_or(if paired { 1 } else { 3 });
                altered.fields[21 + 13 * i..34 + 13 * i]
                    .copy_from_slice(&request.fields[21 + 13 * old..34 + 13 * old]);
                altered.fields[22 + 13 * i] = u;
                altered.fields[31 + 13 * i] = queue.members[index].member.nonce;
                altered.members.push(original_binding(
                    &r,
                    &source,
                    &queue.members[index],
                    remaining.proof(queue.members[index].index),
                )?);
                remaining.remove(queue.members[index].index);
            }
            if !paired {
                let mut ranks = (0..4).collect::<Vec<_>>();
                ranks.sort_by_key(|i| altered.fields[22 + 13 * i]);
                for (i, rank) in ranks.into_iter().enumerate() {
                    altered.fields[17 + i] = rank as u64;
                }
            }
            let logical = stream_policy::calls(&spec, &altered, false)?;
            let infos=logical.iter().map(|c|{let cid=c["contract_id"].as_u64().unwrap();let d=&w.methods[&(cid,c["method_name"].as_str().unwrap().into())];psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(cid),f(d.method_id as u64),&c["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect::<Vec<_>>()).into()}).collect::<Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>>();
            let actual = infos
                .iter()
                .filter(|i| {
                    i.contract_id != f(M)
                        || i.method_id != f(spec["noop"]["method_id"].as_u64().unwrap())
                })
                .copied()
                .collect::<Vec<_>>();
            let stack = compute_tx_stack_hash(&actual);
            let count = f(actual.len() as u64);
            let mut end = context.current_user_leaf;
            end.nonce = context.nonce;
            let action = PsyUserProvingSessionSignatureDataCompact {
                start_user_leaf_hash: context.start_user_leaf_hash,
                end_user_leaf_hash: end.qfhash::<PoseidonHash>(),
                checkpoint_leaf_hash: context.checkpoint_leaf_hash,
                tx_stack_hash: stack,
                tx_count: count,
            }
            .get_sig_action_for_user::<PoseidonHash>(
                PSY_NETWORK_MAGIC,
                context.start_user_leaf.user_id,
                context.nonce,
                SignContext {
                    checkpoint_tree_root: context.checkpoint_tree_root,
                    user_leaf: context.current_user_leaf,
                },
            )
            .get_qhash::<PoseidonHash>();
            let fields = key.fields(&r, &source, &path, &current, &altered)?;
            let witness = SDKeyCircuitWitnessInput {
                session_context: context.clone(),
                circuit_inputs: fields.into_iter().map(f).collect(),
                transaction_infos: infos,
                tx_stack_hash: stack,
                tx_count: count,
                state_reader_results: None,
                secp256k1_slots: vec![],
                checkpoint_id: context.current_user_leaf.last_checkpoint_id,
                user_id: context.start_user_leaf.user_id,
            };
            ensure!(
                key.g
                    .prove(
                        Q(HashOut {
                            elements: [GF::ONE; 4]
                        }),
                        &witness,
                        action
                    )
                    .await
                    .is_err(),
                "coherent alternative priority accepted: {name}"
            );
            rejected.push(name);
        }
        fs::write(
            format!("{out}/{kind}.json"),
            serde_json::to_vec_pretty(
                &json!({"scope":"verify exact existing key proof; reject coherent forged alternative stack/signature preimages, not new CFC/UPS proofs","keyFingerprint":key.g.get_fingerprint(),"exactProofReused":true,"coherentAttackRejections":rejected,"broadcast":false}),
            )?,
        )?;
    }
    Ok(())
}

#[path = "pair_stream_full_ups.rs"]
mod pair_stream;
