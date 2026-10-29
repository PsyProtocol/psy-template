//! Replay public account proofs against a pinned root. No client, keys or proofs generated.
use anyhow::{ensure, Result};
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_crypto::hash::merkle::core::MerkleProofCore;
use psy_template_u124_markets::source_inventory::Inventory;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{fs, io::Write};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    schema: u32,
    checkpoint: u64,
    user_tree_root: String,
    proofs: Vec<MerkleProofCore<Q<F>>>,
}
fn main() -> Result<()> {
    let a = std::env::args().collect::<Vec<_>>();
    ensure!(a.len() == 3, "TRANSCRIPT FRESH_REPORT");
    let raw = fs::read(&a[1])?;
    let input: Input = serde_json::from_slice(&raw)?;
    ensure!(
        input.schema == 1 && input.checkpoint > 0 && input.checkpoint <= u32::MAX as u64,
        "inventory checkpoint/version"
    );
    let root: Q<F> = input.user_tree_root.parse()?;
    ensure!(
        root.to_string() == input.user_tree_root,
        "canonical inventory root"
    );
    let mut inventory = Inventory::new(root, 32)?;
    for p in &input.proofs {
        inventory.consume(p)?;
    }
    let report = json!({"schema":1,"checkpoint":input.checkpoint,"userTreeRoot":input.user_tree_root,
        "transcriptSha256":format!("{:x}",Sha256::digest(&raw)),"completeRelativeToRoot":inventory.complete(),
        "verifiedProofs":inventory.proofs(),"nextUserId":inventory.next(),
        "occupiedAccounts":inventory.leaves().iter().map(|(id,leaf)|json!({"userId":id,"leafHash":leaf.to_string()})).collect::<Vec<_>>(),
        "scope":"All nonzero account leaves at the supplied global root; not all historical orders or transactions. Market eligibility still requires authenticated contract-state coverage.",
        "rootFinalityAuthenticated":false,"liveAuthorization":false,"financialOperations":0});
    let mut out = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&a[2])?;
    out.write_all(&serde_json::to_vec_pretty(&report)?)?;
    out.write_all(b"\n")?;
    out.sync_all()?;
    Ok(())
}
