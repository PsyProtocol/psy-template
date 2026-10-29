//! Shared reviewed-artifact loader for source verification and random planning.
use anyhow::{ensure,Context,Result};
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_common::data::qhashout::QHashOut;
use crate::final_state_coverage::{AssetBinding,Review};
use serde::{Serialize,Deserialize};
use sha2::{Digest,Sha256};
use std::{fs,io::Read,path::Path};
fn bounded(path:&Path,limit:u64)->Result<Vec<u8>>{let mut bytes=vec![];fs::File::open(path)?.take(limit+1).read_to_end(&mut bytes)?;ensure!(bytes.len()as u64<=limit,"bounded source review bytes");Ok(bytes)}
fn digest(bytes:&[u8])->String{format!("{:x}",Sha256::digest(bytes))}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssetConfig {
    pub id: u64,
    pub artifact: String,
    pub artifact_sha256: String,
    pub function_root: QHashOut<F>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub schema: u32,
    pub artifact: String,
    pub artifact_sha256: String,
    pub market: u64,
    pub kind: u64,
    pub function_root: QHashOut<F>,
    pub assets: [AssetConfig; 3],
    pub unit: String,
}
pub fn review(path: &Path) -> Result<(Review, Config, Vec<u8>)> {
    let raw = bounded(path, 1024 * 1024)?;
    let c: Config = serde_json::from_slice(&raw)?;
    ensure!(c.schema == 1, "source review version");
    let base = path.parent().context("config directory")?;
    let artifact = bounded(&base.join(&c.artifact), 128 * 1024 * 1024)?;
    ensure!(
        digest(&artifact) == c.artifact_sha256,
        "reviewed source artifact digest"
    );
    let unit = c.unit.parse::<u128>()?;
    ensure!(unit.to_string() == c.unit, "canonical reviewed unit");
    let mut assets = vec![];
    for a in &c.assets {
        let bytes = bounded(&base.join(&a.artifact), 128 * 1024 * 1024)?;
        ensure!(
            digest(&bytes) == a.artifact_sha256,
            "reviewed funding artifact digest"
        );
        assets.push(AssetBinding::from_artifact(
            a.id,
            &serde_json::from_slice(&bytes)?,
            a.function_root,
        )?);
    }
    let r = Review::from_artifact(
        c.market,
        c.kind,
        &serde_json::from_slice(&artifact)?,
        c.function_root,
        assets
            .try_into()
            .map_err(|_| anyhow::anyhow!("three source assets"))?,
        unit,
    )?;
    Ok((r, c, raw))
}
