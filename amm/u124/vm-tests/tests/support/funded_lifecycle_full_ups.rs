//! One reachable vault/ordinary-account state chain on synthetic genesis QA
//! assets. Every post-genesis mutation is a complete SDK UPS, not a VM shortcut.
use super::*;
use psy_common_circuit::circuits::zk_signature3::core::PsyBasicZKSignatureCircuit;
use psy_crypto::signature::zk::wallet::SimplePsyPrivateKey;
const OWNER: u64 = 600;

async fn ordinary(
    chain: &mut StreamChain,
    w: &mut World,
    signature: &PsyBasicZKSignatureCircuit<C, 2>,
    private: Q<GF>,
    user: u64,
    calls: Vec<Value>,
    out: &str,
    label: &str,
) -> Result<u64> {
    let started = Instant::now();
    let fp = chain.key.g.get_fingerprint();
    let db = chain
        .base
        .seed_identity_with_history(w, fp, &[(1, anchor_leaf())])
        .await?;
    let start = db.get_user_leaf_data(w.checkpoint, user).await?;
    let checkpoint = db.get_checkpoint_leaf_data(w.checkpoint).await?;
    let wallet = SimplePsyPrivateKey::new(private);
    ensure!(
        start.public_key
            == wallet.get_public_key_for_fingerprint::<PoseidonHash>(signature.get_fingerprint()),
        "actual ordinary signing identity"
    );
    let nonce = start.nonce.to_canonical_u64() + 1;
    let mut cache = PsyCmdStoreWithCache::new(w.checkpoint, db);
    for (cid, code) in &chain.base.code {
        for i in 0..code.functions.len() {
            let index = (i * 2) as u32;
            let proof = ContractFunctionTreeStore::<Store>::get_leaf_sfc(
                &cache.read_store,
                w.checkpoint,
                *cid,
                index as u64,
            )?;
            ensure!(
                proof.verify::<PoseidonHash>(),
                "raw ordinary function proof"
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
        f(user),
        f(nonce),
        start.event_index,
        16,
    );
    let mut info = SessionCircuitInfoStore::new();
    chain.base.cm.register_info(&mut info).await;
    let mut session = Manager::new(lps, info, chain.base.cm.ups_circuit_whitelist_root).await?;
    session.prove_ups_start(&chain.base.cm).await?;
    let initial = std::array::from_fn(|i| w.state.get_contract_slot(user, 0, i as u64).unwrap());
    let mut expected = w.clone();
    let mut all = calls;
    for call in &all {
        let cid = call["contract_id"].as_u64().unwrap();
        let name = call["method_name"].as_str().unwrap();
        let input = call["inputs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_u64().unwrap())
            .collect::<Vec<_>>();
        let (index, definition) = chain
            .base
            .cm
            .resolve_contract_function_by_method_name(cid, &chain.base.code[&cid], name.into())
            .await?;
        session
            .prove_standard_call(
                &chain.base.cm,
                f(cid),
                index as u32,
                &definition,
                input.iter().copied().map(f).collect(),
            )
            .await?;
        expected.run_traced_at(user, cid, name, &input, nonce)?;
    }
    let prefix = session.require_lps()?.get_total_modified_slots_for_fee();
    let changed = session.require_lps()?.has_positional_slot_update(0, 0);
    let current = session
        .require_lps_mut()?
        .get_contract_state_slot(GF::ZERO, GF::ZERO)
        .await?
        .value
        .0
        .elements
        .map(|n| n.to_canonical_u64());
    let fee = stream_policy::completion_fee(prefix, changed, initial, current)?;
    let (index, definition) = chain
        .base
        .cm
        .resolve_contract_function_by_method_name(0, &chain.base.code[&0], "burn".into())
        .await?;
    session
        .prove_standard_call(
            &chain.base.cm,
            GF::ZERO,
            index as u32,
            &definition,
            vec![f(fee)],
        )
        .await?;
    expected.run_traced_at(user, 0, "burn", &[fee], nonce)?;
    all.push(json!({"contract_id":0,"method_name":"burn","inputs":[fee]}));
    let infos=all.iter().map(|call|{let cid=call["contract_id"].as_u64().unwrap();let definition=&w.methods[&(cid,call["method_name"].as_str().unwrap().into())];psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(cid),f(definition.method_id as u64),&call["inputs"].as_array().unwrap().iter().map(|n|f(n.as_u64().unwrap())).collect::<Vec<_>>()).into()}).collect::<Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>>();
    let header = *session.get_current_ups_header();
    ensure!(
        infos == session.sd_key_transaction_infos()
            && psy_template_u124_markets::market_key::compute_tx_stack_hash(&infos)
                == header.current_state.tx_hash_stack,
        "actual approved ordinary stack/caller/amount"
    );
    let sig_hash = session.get_sighash(PSY_NETWORK_MAGIC, f(nonce));
    let sig = signature.prove_base(private, sig_hash)?;
    session
        .proof_tree_state
        .finalize_tree(&chain.base.cm)
        .await?;
    let slots = session.require_lps()?.get_total_slots_modified();
    ensure!(
        fee == GUTA_FEE + DA_FEE * slots.to_canonical_u64(),
        "ordinary exact fee"
    );
    let proof = session
        .prove_end_cap(
            &chain.base.cm,
            PSY_NETWORK_MAGIC,
            f(nonce),
            slots,
            signature.get_fingerprint(),
            wallet.get_public_key_param::<PoseidonHash>(),
            sig,
            signature.get_verifier_config_ref().clone(),
        )
        .await?;
    psy_template_u124_markets::fixed_verifier::with_verifier(|v| {
        v.verify(proof.clone())?;
        Ok(())
    })?;
    let api = session.get_api_input().await?;
    validate_endcap_binding(&api.core, &proof.public_inputs)?;
    ensure!(
        api.core.state_transition.start_user_leaf_hash == start.qfhash::<PoseidonHash>()
            && api.core.new_user_leaf.nonce == f(nonce),
        "ordinary nonce/start binding"
    );
    let old = chain.base.actor_leaves.insert(user, api.core.new_user_leaf);
    if let Err(error) = chain.base.seed_identity(&expected, fp).await {
        if let Some(old) = old {
            chain.base.actor_leaves.insert(user, old);
        } else {
            chain.base.actor_leaves.remove(&user);
        }
        return Err(error);
    }
    chain.base.retained_history.insert(w.checkpoint, checkpoint);
    expected.checkpoint += 1;
    *w = expected;
    let dir = std::path::Path::new(out).join(label);
    fs::create_dir(&dir)?;
    fs::write(
        dir.join("request.json"),
        serde_json::to_vec(&psy_provider::request::QSubmitEndCapRPCRequest {
            user_ec_input: api.clone(),
            proof: bincode::serialize(&proof)?,
        })?,
    )?;
    fs::write(
        dir.join("verification.json"),
        serde_json::to_vec_pretty(
            &json!({"user":user,"nonce":nonce,"calls":all,"fee":fee,"seconds":started.elapsed().as_secs_f64(),"startLeaf":api.core.state_transition.start_user_leaf_hash,"endLeaf":api.core.state_transition.end_user_leaf_hash,"fullUpsVerified":true,"actualApprovedStackVerified":true,"ordinarySignatureVerified":true,"broadcast":false,"privateKeyPersisted":false}),
        )?,
    )?;
    Ok(fee)
}
fn call(cid: u64, name: &str, input: Vec<u64>) -> Value {
    json!({"contract_id":cid,"method_name":name,"inputs":input})
}
fn bound(mut r: Request, key: [u64; 4]) -> Request {
    r.registered_key = Some(key);
    r
}

#[tokio::test]
#[ignore = "bounded twelve complete UPS lifecycle; fresh output and minimal genesis required"]
async fn fresh_curve_lifecycle_with_ordinary_claim_and_exhausted_fee_recovery() -> Result<()> {
    ensure!(
        std::env::var("BATCH_MINIMAL_GENESIS").as_deref() == Ok("1"),
        "explicit coherent four-account QA genesis"
    );
    let out = std::env::var("FUNDED_LIFECYCLE_OUT")?;
    fs::create_dir(&out)?;
    let mut w = World::new_fixture("bondingcurve", false, false)?;
    w.set(OWNER, 0, 0, 1000 * ESCROW);
    ensure!(
        !w.slots.keys().any(|(u, _, _)| *u == V),
        "no vault preloading"
    );
    // Public deterministic test keys are never live-wallet identities or secrets.
    let mut chain = StreamChain::new_with_maintenance(&w, true).await?;
    chain.base.keep_history = true;
    let signature = PsyBasicZKSignatureCircuit::<C, 2>::new();
    let mut secrets = BTreeMap::new();
    for user in [I, OWNER, 200] {
        let private = Q(HashOut {
            elements: [f(user), f(20261031), GF::ZERO, GF::ONE],
        });
        let wallet = SimplePsyPrivateKey::new(private);
        chain.base.actor_keys.insert(
            user,
            wallet.get_public_key_for_fingerprint::<PoseidonHash>(signature.get_fingerprint()),
        );
        secrets.insert(user, private);
    }
    let db = chain
        .base
        .seed_identity_with_history(&w, chain.key.g.get_fingerprint(), &[(1, anchor_leaf())])
        .await?;
    let header = snapshot_header(db, &w, &chain.review, chain.key.g.get_fingerprint()).await?;
    chain.source = SourcePage::inactive_maintenance(&chain.review, &header)?.0;
    let key = super::funded_bootstrap_full_ups::registered(&chain);
    let first = 3 * ESCROW;
    let ceiling = 10 * ESCROW;
    let mut ordinary_fees = 0u128;
    let totals = [asset_total(&w, A)?, asset_total(&w, B)?];
    let native = super::minimum_stream_full_ups::native_total(&w)?;
    ordinary_fees += ordinary(
        &mut chain,
        &mut w,
        &signature,
        secrets[&OWNER],
        OWNER,
        vec![
            call(
                M,
                "authorize_fee_budget",
                [vec![V, 1, first], key.to_vec()].concat(),
            ),
            call(0, "transfer", vec![V, first]),
        ],
        &out,
        "owner-initial-grant",
    )
    .await? as u128;
    ordinary_fees += ordinary(
        &mut chain,
        &mut w,
        &signature,
        secrets[&I],
        I,
        vec![
            call(0, "transfer", vec![V, ESCROW]),
            call(A, "transfer", args(&[V], &[1], &[])),
            call(B, "transfer", args(&[V], &[1], &[])),
        ],
        &out,
        "issuer-activation-seeds",
    )
    .await? as u128;
    let (_, inactive) = SourcePage::inactive_maintenance(&chain.review, &chain.source)?;
    let mut boot = bound(basic(14, &inactive, &w), key);
    boot.fields[21] = 1;
    boot.fields[22] = first;
    boot.fields[23] = 1;
    boot.fields[24] = I;
    chain
        .prove(&mut w, boot, &out, "reachable-bootstrap")
        .await?;
    ensure!(
        w.val(V, "batch_ready", 0) == 1 && w.balance(V, A) == 0 && w.balance(V, B) == 0,
        "exact seed return"
    );
    ordinary_fees += ordinary(
        &mut chain,
        &mut w,
        &signature,
        secrets[&I],
        I,
        vec![
            call(0, "transfer", vec![V, ESCROW]),
            call(
                A,
                "transfer",
                args(&[V], &[2_000_000 * 10u128.pow(18)], &[]),
            ),
        ],
        &out,
        "issuer-initialization-funding",
    )
    .await? as u128;
    let mut init = bound(basic(4, &inactive, &w), key);
    init.fields[21..34].copy_from_slice(&w.fields("initialize", 0, 0, 0, 0, 0, 0, 0, 0));
    chain
        .prove(&mut w, init, &out, "reachable-initialize")
        .await?;
    let before_a = w.balance(200, A);
    let before_b = w.balance(200, B);
    let paid = (1u128 << 62) + 17;
    ordinary_fees += ordinary(
        &mut chain,
        &mut w,
        &signature,
        secrets[&200],
        200,
        vec![
            call(M, "open_limit_buy", args(&[V, 1, 0], &[paid], &[200, 1])),
            call(0, "transfer", vec![V, ESCROW]),
            call(B, "transfer", args(&[V], &[paid], &[])),
        ],
        &out,
        "user-approved-order",
    )
    .await? as u128;
    let db = chain
        .base
        .seed_identity_with_history(&w, chain.key.g.get_fingerprint(), &[(1, anchor_leaf())])
        .await?;
    chain.source = snapshot(db, &w, &chain.review, chain.key.g.get_fingerprint()).await?;
    chain.source_checkpoint = w.checkpoint;
    let source = chain.source.clone();
    let pages =
        stream_source::prepare(&chain.review, &source, source.history.checkpoint_path.root)?;
    let queue =
        stream_source::priority(&chain.review, &source, source.history.checkpoint_path.root)?;
    ensure!(
        pages.len() == 1 && pages[0].after.accounts == 4 && queue.members.len() == 1,
        "whole declared four-account source"
    );
    let open = bound(basic(OPEN, &pages[0], &w), key);
    chain.prove(&mut w, open, &out, "reachable-open").await?;
    let cover = bound(basic(COVER, &pages[0], &w), key);
    let frozen = w.slots.clone();
    ensure!(
        minimum_exact_fee(&w, &chain.spec, cover.clone()).is_err() && w.slots == frozen,
        "exhausted cap cannot spend or alter frozen set"
    );
    let frozen_scope = (0..4)
        .map(|i| w.val(V, "stream_scope", i))
        .collect::<Vec<_>>();
    let expiry = w.val(V, "stream_expiry", 0);
    ordinary_fees += ordinary(
        &mut chain,
        &mut w,
        &signature,
        secrets[&OWNER],
        OWNER,
        vec![
            call(
                M,
                "authorize_fee_budget",
                [vec![V, 2, ceiling], key.to_vec()].concat(),
            ),
            call(0, "transfer", vec![V, ceiling - first]),
        ],
        &out,
        "owner-explicit-recovery-grant",
    )
    .await? as u128;
    let (_, recovery_page) = SourcePage::inactive_maintenance(&chain.review, &chain.source)?;
    let mut grant = bound(basic(13, &recovery_page, &w), key);
    grant.fields[21] = 2;
    grant.fields[22] = ceiling;
    grant.fields[23] = 1;
    chain
        .prove(&mut w, grant, &out, "reachable-fee-recovery")
        .await?;
    ensure!(
        w.val(V, "stream_expiry", 0) == expiry
            && (0..4)
                .map(|i| w.val(V, "stream_scope", i))
                .collect::<Vec<_>>()
                == frozen_scope,
        "grant preserves original source and deadline"
    );
    let cover = bound(basic(COVER, &pages[0], &w), key);
    chain.prove(&mut w, cover, &out, "reachable-cover").await?;
    let request = bound(
        settle_request(&w, &chain.review, &source, &pages[0], &queue, 0)?,
        key,
    );
    chain.prove(&mut w, request, &out, "reachable-fill").await?;
    ordinary_fees += ordinary(
        &mut chain,
        &mut w,
        &signature,
        secrets[&200],
        200,
        vec![call(A, "claim", vec![V]), call(B, "claim", vec![V])],
        &out,
        "ordinary-final-claim",
    )
    .await? as u128;
    ensure!(
        w.balance(200, A) == before_a + 10u128.pow(18)
            && w.balance(200, B) == before_b - 10u128.pow(18),
        "actual final ordinary wallet asset deltas"
    );
    ensure!(
        totals == [asset_total(&w, A)?, asset_total(&w, B)?],
        "complete asset and Outbox conservation"
    );
    ensure!(
        super::minimum_stream_full_ups::native_total(&w)?
            + ordinary_fees
            + w.val(V, "fee_used", 0) as u128
            == native,
        "all ordinary and SDK fees conserve"
    );
    fs::write(
        format!("{out}/REPORT.json"),
        serde_json::to_vec_pretty(
            &json!({"scope":"Twelve actual complete UPSs from explicitly prefunded QA genesis, including six ordinary signatures and a fresh registered SDK vault; synthetic checkpoint chain, not deployment/receipt/browser acceptance","completeUps":12,"ordinaryUps":6,"sdKeyUps":6,"emptyVaultAtStart":true,"noVaultStateInjection":true,"retainedAllProvenCheckpointLeaves":true,"ordinaryFinalClaim":true,"bothInputLimbsNonzero":true,"feeExhaustionRejected":true,"explicitOwnerRecovery":true,"originalSetAndExpiryPreserved":true,"assetConservation":true,"nativeConservationIncludingAllFees":true,"ordinaryFee":ordinary_fees.to_string(),"sdKeyFee":w.val(V,"fee_used",0),"financialOperations":0,"randomMode":false,"fullUpsVerified":true,"broadcast":false,"measurements":chain.measurements}),
        )?,
    )?;
    Ok(())
}
