//! Independent complete-leaf reconstruction using the frozen SDK tree and
//! legacy traversal. Read-only; does not authenticate checkpoint finality.
use anyhow::{ensure, Context, Result};
use plonky2::{field::goldilocks_field::GoldilocksField as F, hash::poseidon::PoseidonHash as H};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_crypto::hash::merkle::utils::simple_merkle_tree::SimpleMerkleTree;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::Write};
fn main() -> Result<()> {
    let a = std::env::args().collect::<Vec<_>>();
    ensure!(
        a.len() == 4,
        "COMPLETE_NATIVE_REPORT EXPECTED_ROOT FRESH_REPORT"
    );
    let raw = fs::read(&a[1])?;
    let report: Value = serde_json::from_slice(&raw)?;
    let root: Q<F> = a[2].parse()?;
    ensure!(
        root.to_string() == a[2]
            && report["userTreeRoot"] == a[2]
            && report["completeRelativeToRoot"] == true,
        "complete report/pinned root required"
    );
    let rows = report["occupiedAccounts"]
        .as_array()
        .context("occupied account rows")?;
    ensure!(rows.len() <= 65536, "bounded inventory audit");
    let mut tree = SimpleMerkleTree::<H, Q<F>>::new(32);
    let mut previous = None;
    let mut expected = vec![];
    for row in rows {
        let id = row["userId"].as_u64().context("account id")?;
        ensure!(
            id < 1u64 << 32 && previous.is_none_or(|p| id > p),
            "unique ordered account IDs"
        );
        let text = row["leafHash"].as_str().context("account hash")?;
        let hash: Q<F> = text.parse()?;
        ensure!(
            hash.to_string() == text && hash != Q::ZERO,
            "canonical nonzero leaf"
        );
        tree.set_leaf(id, hash);
        expected.push((id, hash));
        previous = Some(id);
    }
    ensure!(
        tree.get_root() == root,
        "complete account set does not reconstruct pinned root"
    );
    let mut reads = 0;
    let legacy = psy_template_u124_markets::final_state_coverage::discover_users(
        |depth, index| {
            reads += 1;
            Ok(tree.get_leaf_in_subtree(0, depth, index))
        },
        root,
        2_000_000,
        65536,
    )?;
    ensure!(legacy == expected, "legacy discovery universe differs");
    let value = json!({"schema":1,"checkpoint":report["checkpoint"],"userTreeRoot":a[2],
        "nativeReportSha256":format!("{:x}",Sha256::digest(raw)),"occupiedAccounts":rows.len(),
        "independentSdkTreeRootReconstructed":true,"legacyTraversalSameUniverse":true,
        "legacyLogicalDiscoveryReads":reads,"leafPathProofs":report["verifiedProofs"],
        "scope":"Exact logical discovery counts over the reconstructed pinned tree, not matched network latency, UPS throughput or coverage-UPS reduction",
        "finalityAuthenticated":false,"financialOperations":0,"liveAuthorization":false});
    let mut out = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&a[3])?;
    out.write_all(&serde_json::to_vec_pretty(&value)?)?;
    out.write_all(b"\n")?;
    out.sync_all()?;
    Ok(())
}
