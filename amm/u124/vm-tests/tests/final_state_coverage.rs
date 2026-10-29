//! Whole nonempty account set + final order/funding Merkle verification. No RPC or UPS.
use anyhow::{ensure, Result};
use psy_template_u124_markets::final_state_coverage::*;
#[path = "support/final_state_fixture.rs"]
mod fixture;
use plonky2::field::types::{Field, PrimeField64};
#[test]
fn leaf_path_inventory_matches_legacy_scope_with_fewer_discovery_reads() -> Result<()> {
    for kind in [1,2] {
        let (_,snapshot,_)=fixture::fixture(kind,false,false)?;
        let root=snapshot.history.roots.user_tree_root;
        let mut reads=0;
        let expected=discover_users(|d,i|{reads+=1;fixture::discovery_reader(&snapshot)?(d,i)},root,10000,64)?;
        let mut inv=psy_template_u124_markets::source_inventory::Inventory::new(root,32)?;
        while let Some(i)=inv.next(){inv.consume(&fixture::discovery_reader(&snapshot)?(32,i)?)?;}
        ensure!(inv.complete()&&inv.leaves().iter().map(|(&i,&h)|(i,h)).collect::<Vec<_>>()==expected,"same complete account universe");
        ensure!(inv.proofs()<reads,"fewer discovery operations; not a proving/TPS claim");
    }
    Ok(())
}
#[test]
fn complete_final_orders_and_authenticated_exclusions() -> Result<()> {
    for kind in [1, 2] {
        let (r, s, root) = fixture::fixture(kind, false, false)?;
        let out = verify_snapshot(&r, &s, root)?;
        let m = out.trading_manifest.as_ref().unwrap();
        ensure!(
            out.accounts == 18
                && m.members.iter().map(|m| m.owner).collect::<Vec<_>>()
                    == (200..209).collect::<Vec<_>>(),
            "nine final eligible owners"
        );
        ensure!(
            out.recovery_members
                .iter()
                .map(|m| m.owner)
                .collect::<Vec<_>>()
                == vec![209, 210, 211],
            "actual funded exclusion recovery"
        );
        for (owner, reason) in [
            (209, "cancelled"),
            (210, "expired"),
            (211, "funding-ineligible"),
            (212, "consumed"),
            (213, "other-vault"),
            (214, "closed"),
            (215, "no-market-state"),
        ] {
            ensure!(
                out.audit
                    .iter()
                    .find(|a| a.owner == owner)
                    .unwrap()
                    .disposition
                    == reason,
                "classified source disposition"
            );
        }
        ensure!(
            out.audit
                .iter()
                .find(|a| a.owner == 214)
                .unwrap()
                .paid_a
                .is_none(),
            "unread orphan funding cannot be reported as zero"
        );
        ensure!(
            !out.can_broadcast && !out.full_ups_verified && !out.finality_verified,
            "Merkle coverage is not live financial authority"
        );
    }
    Ok(())
}
#[test]
fn omission_of_unrelated_account_and_selected_member_both_reject() -> Result<()> {
    let (r, s, root) = fixture::fixture(1, false, false)?;
    for id in [5, 100, 200, 215] {
        let mut bad = s.clone();
        bad.accounts
            .retain(|a| a.leaf.user_id.to_canonical_u64() != id);
        ensure!(
            verify_snapshot(&r, &bad, root).is_err(),
            "account omission {id}"
        );
    }
    let mut bad = s.clone();
    bad.accounts.swap(2, 3);
    ensure!(
        verify_snapshot(&r, &bad, root).is_err(),
        "noncanonical duplicate hiding"
    );
    let mut bad = s.clone();
    bad.accounts.push(bad.accounts.last().unwrap().clone());
    ensure!(
        verify_snapshot(&r, &bad, root).is_err(),
        "duplicate account"
    );
    Ok(())
}
#[test]
fn wrong_source_root_network_key_and_forged_state_reject() -> Result<()> {
    let (r, s, root) = fixture::fixture(1, false, false)?;
    for i in [1, 3, 6, 9, 13, 21, 25, 29, 33, 37] {
        let mut bad = s.clone();
        bad.fields[i] += 1;
        ensure!(
            verify_snapshot(&r, &bad, root).is_err(),
            "source field substitution {i}"
        );
    }
    let mut bad = s.clone();
    let a = bad
        .accounts
        .iter_mut()
        .find(|a| a.leaf.user_id.to_canonical_u64() == 200)
        .unwrap();
    a.market.words[0].value.0.elements[0] += plonky2::field::goldilocks_field::GoldilocksField::ONE;
    ensure!(
        verify_snapshot(&r, &bad, root).is_err(),
        "forged order word"
    );
    let mut bad = s.clone();
    bad.contracts[0].leaf.state_tree_height +=
        plonky2::field::goldilocks_field::GoldilocksField::ONE;
    ensure!(
        verify_snapshot(&r, &bad, root).is_err(),
        "changed dependency"
    );
    let mut wrong = root;
    wrong.0.elements[0] += plonky2::field::goldilocks_field::GoldilocksField::ONE;
    ensure!(
        verify_snapshot(&r, &s, wrong).is_err(),
        "untrusted history root"
    );
    Ok(())
}
#[test]
fn u124_high_limb_and_authenticated_cursor_drift_stop_capture() -> Result<()> {
    for (kind, limb, drift) in [(1, true, false), (1, false, true), (2, true, false)] {
        let (r, s, root) = fixture::fixture(kind, limb, drift)?;
        ensure!(
            verify_snapshot(&r, &s, root).is_err(),
            "unsafe source accepted"
        );
    }
    Ok(())
}
#[test]
fn emitted_manifest_is_exactly_bound_and_cannot_choose_a_subset() -> Result<()> {
    let (r, s, root) = fixture::fixture(1, false, false)?;
    let out = verify_snapshot(&r, &s, root)?;
    let mut selected = s.clone();
    selected.fields = out.trading_manifest.unwrap().fields;
    verify_snapshot(&r, &selected, root)?;
    selected.fields[8] -= 1;
    ensure!(
        verify_snapshot(&r, &selected, root).is_err(),
        "selected count subset"
    );
    Ok(())
}
#[test]
fn subtree_discovery_authenticates_empty_ranges_and_cannot_stop_early() -> Result<()> {
    let (_, s, root) = fixture::fixture(1, false, false)?;
    let proof = fixture::discovery_reader(&s)?;
    let ids = discover_users(
        |level, index| proof(level, index),
        s.history.roots.user_tree_root,
        4096,
        64,
    )?;
    ensure!(
        ids.iter().map(|(i, _)| *i).collect::<Vec<_>>()
            == s.accounts
                .iter()
                .map(|a| a.leaf.user_id.to_canonical_u64())
                .collect::<Vec<_>>(),
        "complete authenticated source discovery"
    );
    ensure!(
        discover_users(
            |level, index| proof(level, index),
            s.history.roots.user_tree_root,
            1,
            64
        )
        .is_err(),
        "partial read budget masquerades as complete"
    );
    ensure!(
        discover_users(
            |level, index| proof(level, index),
            s.history.roots.user_tree_root,
            4096,
            2
        )
        .is_err(),
        "partial account budget masquerades as complete"
    );
    ensure!(
        discover_users(
            |level, index| {
                let mut p = proof(level, index)?;
                p.value.0.elements[0] += plonky2::field::goldilocks_field::GoldilocksField::ONE;
                Ok(p)
            },
            s.history.roots.user_tree_root,
            4096,
            64
        )
        .is_err(),
        "false empty subtree"
    );
    let _ = root;
    Ok(())
}
#[test]
#[ignore = "fresh public final-state certificate fixture export; no RPC or funds"]
fn export_authenticated_final_state_fixtures() -> Result<()> {
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::path::Path;
    let out = std::env::var("FINAL_STATE_OUT")?;
    fs::create_dir(&out)?;
    let original = std::env::var("FINAL_STATE_FIXTURES")?;
    for kind in [1, 2] {
        let (r, s, root) = fixture::fixture(kind, false, false)?;
        let name = if kind == 1 { "amm" } else { "bondingcurve" };
        let dir = Path::new(&out).join(name);
        fs::create_dir(&dir)?;
        let source = fs::read(
            Path::new(&original)
                .join(name)
                .join("compiled/compilation_artifact.json"),
        )?;
        fs::write(dir.join("artifact.json"), &source)?;
        let mut assets = vec![];
        for a in &r.assets {
            let file = if a.id == 0 {
                "native-artifact.json"
            } else {
                "token-artifact.json"
            };
            let raw = fs::read(Path::new(&original).join(if a.id == 0 {
                "native.json"
            } else {
                "token/compilation_artifact.json"
            }))?;
            fs::write(dir.join(file), &raw)?;
            assets.push(serde_json::json!({"id":a.id,"artifact":file,"artifact_sha256":format!("{:x}",Sha256::digest(&raw)),"function_root":a.function_root}));
        }
        let config = serde_json::json!({"schema":1,"artifact":"artifact.json","artifact_sha256":format!("{:x}",Sha256::digest(&source)),"market":r.market,"kind":r.kind,"function_root":r.function_root,"assets":assets,"unit":r.unit.to_string()});
        for (file, v) in [
            ("review.json", config),
            ("snapshot.json", serde_json::to_value(&s)?),
            ("history.json", serde_json::json!({"root":root.to_string()})),
            (
                "expected.json",
                serde_json::to_value(verify_snapshot(&r, &s, root)?)?,
            ),
        ] {
            fs::write(dir.join(file), serde_json::to_vec_pretty(&v)?)?;
        }
    }
    Ok(())
}

struct FixtureReader {
    snapshot: Snapshot,
    wrong_user: bool,
}
impl psy_template_u124_markets::final_state_capture::SourceReader for FixtureReader {
    async fn subtree(
        &mut self,
        _: u64,
        d: u8,
        i: u64,
    ) -> Result<
        psy_crypto::hash::merkle::core::MerkleProofCore<
            psy_client_common::data::qhashout::QHashOut<
                plonky2::field::goldilocks_field::GoldilocksField,
            >,
        >,
    > {
        fixture::discovery_reader(&self.snapshot)?(d, i)
    }
    async fn user(
        &mut self,
        _: u64,
        u: u64,
    ) -> Result<
        psy_client_data::qdata::user::PsyUserLeaf<
            plonky2::field::goldilocks_field::GoldilocksField,
        >,
    > {
        let mut a = fixture::account(&self.snapshot, u)?.leaf.clone();
        if self.wrong_user {
            a.nonce += plonky2::field::goldilocks_field::GoldilocksField::ONE;
        }
        Ok(a)
    }
    async fn contract(
        &mut self,
        _: u64,
        u: u64,
        k: u64,
    ) -> Result<
        psy_crypto::hash::merkle::core::MerkleProofCore<
            psy_client_common::data::qhashout::QHashOut<
                plonky2::field::goldilocks_field::GoldilocksField,
            >,
        >,
    > {
        Ok(fixture::state(&self.snapshot, u, k)?.contract_path.clone())
    }
    async fn word(
        &mut self,
        _: u64,
        u: u64,
        k: u64,
        _: u8,
        i: u64,
    ) -> Result<
        psy_crypto::hash::merkle::core::MerkleProofCore<
            psy_client_common::data::qhashout::QHashOut<
                plonky2::field::goldilocks_field::GoldilocksField,
            >,
        >,
    > {
        fixture::word_proof(&self.snapshot, u, k, i)
    }
}
#[tokio::test]
async fn collector_checks_every_untrusted_reply_and_budget() -> Result<()> {
    use psy_template_u124_markets::final_state_capture::{collect_snapshot, ReadBudget};
    for kind in [1, 2] {
        let (r, s, root) = fixture::fixture(kind, false, false)?;
        let mut header = s.clone();
        header.accounts.clear();
        let mut reader = FixtureReader {
            snapshot: s.clone(),
            wrong_user: false,
        };
        let mut budget = ReadBudget::new(120, 4096)?;
        let result =
            collect_snapshot(&r, header.clone(), root, &mut reader, &mut budget, 64).await?;
        let out = verify_snapshot(&r, &result, root)?;
        ensure!(
            out.trading_manifest.unwrap().members.len() == 9 && budget.reads > 100,
            "complete checkpoint capture"
        );
        let mut budget = ReadBudget::new(120, 1)?;
        ensure!(
            collect_snapshot(&r, header.clone(), root, &mut reader, &mut budget, 64)
                .await
                .is_err(),
            "partial traversal cannot authorize source"
        );
        let mut budget = ReadBudget::new(120, 4096)?;
        reader.wrong_user = true;
        ensure!(
            collect_snapshot(&r, header, root, &mut reader, &mut budget, 64)
                .await
                .is_err(),
            "data reader cannot declare substituted user valid"
        );
    }
    Ok(())
}
#[test]
fn unfinished_incremental_traversal_cannot_be_finalized() -> Result<()> {
    let (_, s, _) = fixture::fixture(1, false, false)?;
    let mut t = UserTraversal::new(s.history.roots.user_tree_root, 4096, 64)?;
    let _ = t.next_request()?;
    ensure!(
        t.finish().is_err(),
        "unanswered traversal cannot become complete"
    );
    Ok(())
}
