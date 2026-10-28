//! Complete final-state verification/capture. No signing or broadcast methods.
use anyhow::{ensure, Context, Result};
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::traits::qdatastore::{
    qmetadata::QMetaDataStoreReaderSync, qtreedata::QTreeDataStoreReaderSync,
};
use psy_provider::provider::RpcProvider;
use psy_template_u124_markets::{
    final_state_capture::{collect_snapshot, ReadBudget, RpcSourceReader},
    final_state_coverage::{
        verify_snapshot, AssetBinding, ContractOpening, HistoryOpening, Review, Snapshot,
    },
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct AssetConfig {
    id: u64,
    artifact: String,
    artifact_sha256: String,
    function_root: QHashOut<F>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Config {
    schema: u32,
    artifact: String,
    artifact_sha256: String,
    market: u64,
    kind: u64,
    function_root: QHashOut<F>,
    assets: [AssetConfig; 3],
    unit: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Capture {
    schema: u32,
    fields: Vec<u64>,
    key_public_param: QHashOut<F>,
    history_checkpoint: u64,
    max_accounts: usize,
    max_reads: usize,
    seconds: u64,
}
fn bounded(path: &Path, limit: u64) -> Result<Vec<u8>> {
    let mut bytes = vec![];
    fs::File::open(path)?
        .take(limit + 1)
        .read_to_end(&mut bytes)?;
    ensure!(
        bytes.len() as u64 <= limit,
        "bounded source certificate bytes"
    );
    Ok(bytes)
}
fn save(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    f.write_all(bytes)?;
    f.sync_all()?;
    fs::File::open(path.parent().unwrap())?.sync_all()?;
    Ok(())
}
fn json(path: &Path, v: &impl Serialize) -> Result<()> {
    save(path, &serde_json::to_vec_pretty(v)?)
}
fn digest(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}
fn review(path: &Path) -> Result<(Review, Config, Vec<u8>)> {
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
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let a = std::env::args().collect::<Vec<_>>();
    let capture = a.get(1).is_some_and(|s| s == "capture");
    ensure!(if capture{a.len()==7}else{a.len()==5},"REVIEWED_CONFIG SOURCE_SNAPSHOT PINNED_HISTORY_ROOT FRESH_OUT | capture REVIEWED_CONFIG CAPTURE_REQUEST RPC_CONFIG PINNED_HISTORY_ROOT FRESH_OUT");
    let (r, c, config_bytes) = review(Path::new(&a[if capture { 2 } else { 1 }]))?;
    let root_text = &a[if capture { 5 } else { 3 }];
    let history: QHashOut<F> = root_text.parse()?;
    ensure!(
        history.to_string() == *root_text,
        "canonical independently pinned history root"
    );
    let out = Path::new(&a[if capture { 6 } else { 4 }]);
    ensure!(!out.exists(), "source output must be fresh");
    let (s, source_bytes, reads, request) = if capture {
        let raw = bounded(Path::new(&a[3]), 1024 * 1024)?;
        let req: Capture = serde_json::from_slice(&raw)?;
        ensure!(
            req.schema == 1
                && req.fields.len() == 41
                && req.history_checkpoint >= req.fields[6]
                && req.history_checkpoint < 1 << 32
                && req.max_accounts <= 65536,
            "explicit source capture bounds"
        );
        let cfg = psy_config::PsyConfigGoldilocks::from_file(&a[4])?;
        ensure!(
            cfg.current_network_name() == "testnet",
            "isolated read-only staging profile"
        );
        let net = cfg.get_current_network()?;
        psy_template_u124_markets::live_guard::require_staging(net)?;
        let mut reader = RpcSourceReader(RpcProvider::new_with_config(net)?);
        let mut budget = ReadBudget::new(req.seconds, req.max_reads)?;
        let cp = req.fields[6];
        let anchor = budget.read(reader.0.get_checkpoint_leaf_data(1)).await?;
        let anchor_path = budget
            .read(
                reader
                    .0
                    .get_checkpoint_tree_merkle_proof(req.history_checkpoint, 1),
            )
            .await?;
        let checkpoint = budget.read(reader.0.get_checkpoint_leaf_data(cp)).await?;
        let checkpoint_path = budget
            .read(
                reader
                    .0
                    .get_checkpoint_tree_merkle_proof(req.history_checkpoint, cp),
            )
            .await?;
        let roots = budget
            .read(reader.0.get_checkpoint_global_state_roots(cp))
            .await?;
        let mut contracts = vec![];
        for id in r.assets.iter().map(|x| x.id).chain([r.market]) {
            let leaf = budget.read(reader.0.get_contract_leaf_data(id)).await?;
            let path = budget
                .read(reader.0.get_contract_tree_merkle_proof(cp, id.try_into()?))
                .await?;
            contracts.push(ContractOpening { id, leaf, path });
        }
        // Latest-only contract metadata must match the source proof. Upgrade drift
        // aborts; this collector never updates a contract to probe compatibility.
        let header = Snapshot {
            fields: req.fields,
            key_public_param: req.key_public_param,
            history: HistoryOpening {
                anchor,
                anchor_path,
                checkpoint,
                checkpoint_path,
                roots,
            },
            contracts,
            accounts: vec![],
        };
        let s = collect_snapshot(
            &r,
            header,
            history,
            &mut reader,
            &mut budget,
            req.max_accounts,
        )
        .await?;
        let bytes = serde_json::to_vec_pretty(&s)?;
        ensure!(
            bytes.len() <= 64 * 1024 * 1024,
            "bounded captured source bytes"
        );
        (s, bytes, budget.reads, Some(raw))
    } else {
        let bytes = bounded(Path::new(&a[2]), 64 * 1024 * 1024)?;
        let s: Snapshot = serde_json::from_slice(&bytes)?;
        (s, bytes, 0, None)
    };
    ensure!(s.accounts.len() <= 65536, "source account capture budget");
    let verified = verify_snapshot(&r, &s, history)?;
    fs::create_dir(out)?;
    json(&out.join("coverage.json"), &verified)?;
    save(&out.join("snapshot.json"), &source_bytes)?;
    save(&out.join("review.json"), &config_bytes)?;
    if let Some(raw) = request {
        save(&out.join("capture-request.json"), &raw)?;
    }
    if let Some(manifest) = &verified.trading_manifest {
        let (m, pages) = psy_template_u124_markets::checkpoint_stream::prepare(manifest.clone())?;
        json(&out.join("manifest.json"), &m)?;
        json(&out.join("pages.json"), &pages)?;
    }
    json(
        &out.join("source.json"),
        &serde_json::json!({"schema":1,"scope":"complete final-order/funding snapshot relative to pinned history; not finality or financial UPS authority","mode":if capture{"rpc-capture"}else{"offline-verification"},"logicalReads":reads,"logicalReadScope":"SDK operations; one operation can issue multiple wire RPCs; hard wall-clock budget applies","snapshotSha256":digest(&source_bytes),"reviewSha256":digest(&config_bytes),"artifactSha256":c.artifact_sha256,"historyRoot":history.to_string(),"accounts":verified.accounts,"eligible":verified.trading_manifest.as_ref().map(|m|m.members.len()).unwrap_or(0),"fundedRecoveryCandidates":verified.recovery_members.len(),"finalStateCoverageRelativeToPinnedRoot":true,"canSign":false,"canBroadcast":false,"fullUpsVerified":false}),
    )?;
    println!(
        "{}",
        serde_json::json!({"accounts":verified.accounts,"eligible":verified.trading_manifest.as_ref().map(|m|m.members.len()).unwrap_or(0),"canBroadcast":false})
    );
    Ok(())
}
