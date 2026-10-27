//! Verify a saved public request without signing, proving, RPC or broadcast.
use anyhow::{ensure, Result};
use psy_template_u124_markets::wallet_verification::{
    verify_market_request, PublicBundle, VerifierPack, WalletApproval,
};
use sha2::{Digest, Sha256};
use std::{env, fs, io::Write};
fn main() -> Result<()> {
    let a = env::args().collect::<Vec<_>>();
    ensure!(
        a.len() == 7,
        "usage: verify_market_public PACK PACK_SHA256 REQUEST APPROVAL BUNDLE REPORT"
    );
    let bytes = fs::read(&a[1])?;
    ensure!(
        format!("{:x}", Sha256::digest(&bytes)) == a[2],
        "verifier resources changed"
    );
    let pack: VerifierPack = serde_json::from_slice(&bytes)?;
    let approval: WalletApproval = serde_json::from_slice(&fs::read(&a[4])?)?;
    let bundle: PublicBundle = serde_json::from_slice(&fs::read(&a[5])?)?;
    let mut report = verify_market_request(&pack, &fs::read(&a[3])?, &approval, &bundle)?;
    report["verifierPackSha256"] = serde_json::json!(a[2]);
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&a[6])?;
    f.write_all(&serde_json::to_vec_pretty(&report)?)?;
    f.sync_all()?;
    Ok(())
}
