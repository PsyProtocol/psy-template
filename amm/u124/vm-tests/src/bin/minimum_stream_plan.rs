//! Public minimum-frontier planning for explicit v11/v13 instances only. No signing, RPC
//! or broadcast command; a pinned history root is not a finality certificate.
use anyhow::{ensure, Context, Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F, types::PrimeField64};
use plonky2::hash::poseidon::PoseidonHash as H;
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::qdata::checkpoint::PsyCheckpointLeaf;
use psy_crypto::hash::{merkle::core::MerkleProofCore, traits::qhashable::QFieldHashable};
use psy_template_u124_markets::{
    checkpoint_stream::Member,
    final_state_coverage::{verify_snapshot, Snapshot},
    random_minimum,
    source_review::review,
    stream_policy, stream_source,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Draw {
    checkpoint: PsyCheckpointLeaf<F>,
    path: MerkleProofCore<Q<F>>,
}
fn bytes(path: &str, limit: u64) -> Result<Vec<u8>> {
    let mut b = vec![];
    fs::File::open(path)?.take(limit + 1).read_to_end(&mut b)?;
    ensure!(b.len() as u64 <= limit, "bounded planner input");
    Ok(b)
}
fn sha(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}
fn save(p: &Path, v: &impl Serialize) -> Result<()> {
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(p)?;
    f.write_all(&serde_json::to_vec_pretty(v)?)?;
    f.write_all(b"\n")?;
    f.sync_all()?;
    fs::File::open(p.parent().unwrap())?.sync_all()?;
    Ok(())
}
#[tokio::main]
async fn main() -> Result<()> {
    let a = std::env::args().collect::<Vec<_>>();
    if a.len() == 5 && a[1] == "--derive-synthetic-draw" {
        return derive_synthetic_draw(Path::new(&a[2]), Path::new(&a[3]), Path::new(&a[4])).await;
    }
    ensure!(
        a.len() == 7 || a.len() == 8,
        "REVIEW SNAPSHOT PINNED_HISTORY_ROOT DRAW_OPENING POLICY FRESH_OUT [ACCEPTED_SEAL]"
    );
    let (r, _, rb) = review(Path::new(&a[1]))?;
    ensure!(r.kind <= 2, "random ordering is AMM/Curve only");
    let sb = bytes(&a[2], 64 * 1024 * 1024)?;
    let s: Snapshot = serde_json::from_slice(&sb)?;
    let history: Q<F> = a[3].parse()?;
    ensure!(
        history.to_string() == a[3],
        "canonical independently pinned history root"
    );
    let db = bytes(&a[4], 65536)?;
    let draw: Draw = serde_json::from_slice(&db)?;
    let pb = bytes(&a[5], 4 * 1024 * 1024)?;
    let policy: Value = serde_json::from_slice(&pb)?;
    stream_policy::validate(&policy, &r)?;
    ensure!(
        (policy["version"] == 11 || policy["version"] == 13)
            && s.fields[7] == s.fields[6] + policy["source_window_checkpoints"].as_u64().unwrap(),
        "reviewed random profile and exact window"
    );
    let sealed = policy["version"] == 13;
    ensure!(a.len() == if sealed {8} else {7}, "explicit accepted-seal input for v13 only");
    let delay = if sealed {psy_template_u124_markets::stream_seal::DRAW_DELAY} else {1};
    let covered = verify_snapshot(&r, &s, history)?;
    ensure!(
        draw.path.index == s.fields[6] + delay
            && draw.path.root == history
            && draw.path.value == draw.checkpoint.qfhash::<H>()
            && draw.path.siblings.len() == 32
            && draw.path.verify::<H>(),
        "one authenticated future draw under the same pinned history"
    );
    let source = stream_source::prepare(&r, &s, history)?;
    let scope = &source[0].scope;
    let seal_bytes = if sealed {Some(bytes(&a[7],64*1024*1024)?)} else {None};
    let accepted = seal_bytes.as_ref().map(|b|serde_json::from_slice::<psy_template_u124_markets::stream_seal::AcceptedSeal>(b)).transpose()?;
    if let Some(p)=&accepted {psy_template_u124_markets::stream_seal::verify_accepted_seal(&r,&s,scope,history,p)?;}
    let original = stream_source::priority(&r, &s, history)?;
    let seed = draw
        .checkpoint
        .stats
        .random_seed
        .0
        .elements
        .map(|n| n.to_canonical_u64());
    ensure!(
        !original.members.is_empty(),
        "eligible admission sample required"
    );
    let steps = random_minimum::prepare(scope, &original, seed)?;
    let count = original.members.len();
    let mut pages = vec![];
    for group in [&steps[..count], &steps[count..]] {
        for rows in group.chunks(4) {
            let p = random_minimum::Page {
                seed,
                refund_only: false,
                current: rows[0].before.clone(),
                rows: rows.to_vec(),
            };
            p.after(scope)?;
            pages.push(p);
        }
    }
    let ordered = steps[count..]
        .iter()
        .map(|r| stream_source::PriorityMember {
            index: r.append.index,
            member: Member {
                owner: r.node.owner,
                nonce: r.node.nonce,
                terms: r.node.terms,
            },
        })
        .collect();
    let queue = stream_source::PriorityTree::from_committed(scope, ordered)?;
    ensure!(
        steps.last().unwrap().after.queue == queue.root(),
        "exact complete minimum extraction root"
    );
    let out = Path::new(&a[6]);
    fs::create_dir(out)?;
    save(&out.join("source-pages.json"), &source)?;
    save(&out.join("minimum-pages.json"), &pages)?;
    save(&out.join("queue.json"), &queue.members)?;
    save(
        &out.join("plan.json"),
        &json!({"schema":1,"profile":policy["profile"],"acceptedSealSha256":seal_bytes.as_ref().map(|b|sha(b)),"acceptedSealCheckpoint":accepted.as_ref().map(|p|p.snapshot.fields[6]),"sealedHistoryOrderVerified":sealed,"seedSecrecyAuthenticated":false,"reviewSha256":sha(&rb),"snapshotSha256":sha(&sb),"drawSha256":sha(&db),"policySha256":sha(&pb),"historyRoot":history,"scope":scope,"sourceCheckpoint":scope[6],"drawCheckpoint":scope[6]+delay,"expiry":scope[7],"accounts":covered.accounts,"earliestEligibleDeadline":covered.earliest_eligible_deadline,"recoveryMembers":covered.recovery_members.len(),"members":queue.members.len(),"sourcePages":source.len(),"minimumBuildPages":count.div_ceil(4),"minimumExtractionPages":count.div_ceil(4),"minimumPages":pages.len(),"noReset":true,"feeOwner":policy["fee_owner"],"seed":seed,"sourceSetRoot":original.root(),"orderedRoot":queue.root(),"authenticatedSeedRelativeToHistory":true,"finalityVerified":false,"causalSealBeforeReleaseAuthenticated":false,"producerInfluence":true,"qualifiedRandomness":false,"fullUpsVerified":false,"canSign":false,"canBroadcast":false}),
    )?;
    Ok(())
}

// Reconstruct only the public checkpoint tree of the bounded synthetic UPS
// fixture. This cannot turn arbitrary RPC observations into a finality proof.
async fn derive_synthetic_draw(head_dir: &Path, draw_dir: &Path, out: &Path) -> Result<()> {
    use kvq::memory::simple::KVQSimpleMemoryBackingStore as Store;
    use psy_client_data::traits::qdatastore::{
        qmetadata::QMetaDataStoreWriterSync,
        qtreedata::{QTreeDataStoreReaderSync, QTreeDataStoreWriterSync},
    };
    use psy_template_u124_markets::stream_current::CurrentOpening;
    let s: Snapshot = serde_json::from_slice(&bytes(
        head_dir
            .join("source.json")
            .to_str()
            .context("source path")?,
        64 * 1024 * 1024,
    )?)?;
    ensure!(s.fields[9..13] == [1234, 0, 0, 0], "synthetic chain only");
    let read = |p: &Path| -> Result<Value> { Ok(serde_json::from_slice(&fs::read(p)?)?) };
    let head: CurrentOpening = serde_json::from_value(read(&head_dir.join("current.json"))?)?;
    let draw: CurrentOpening = serde_json::from_value(read(&draw_dir.join("current.json"))?)?;
    let hp = read(&head_dir.join("public-session.json"))?["checkpoint"]
        .as_u64()
        .context("head checkpoint")?;
    let intent=read(&head_dir.join("intent.json"))?;
    let accepted=intent.get("accepted_seal").filter(|v|!v.is_null()).map(|v|serde_json::from_value::<psy_template_u124_markets::stream_seal::AcceptedSeal>(v.clone())).transpose()?;
    let delay=if accepted.is_some(){psy_template_u124_markets::stream_seal::DRAW_DELAY}else{1};
    let dp = read(&draw_dir.join("public-session.json"))?["checkpoint"]
        .as_u64()
        .context("draw checkpoint")?;
    ensure!(
        dp == s.fields[6] + delay && hp > dp,
        "fixed synthetic source/draw/head"
    );
    let db = Store::new();
    // The versioned store must receive checkpoint leaves chronologically.
    let mut leaves=vec![(1,s.history.anchor),(s.fields[6],s.history.checkpoint)];
    if let Some(p)=&accepted {leaves.push((p.snapshot.fields[6],p.snapshot.history.checkpoint));}
    leaves.extend([(dp,draw.checkpoint),(hp,head.checkpoint)]);
    leaves.sort_by_key(|(cp,_)|*cp);
    for pair in leaves.windows(2) {ensure!(pair[0].0!=pair[1].0 || pair[0].1==pair[1].1,"conflicting synthetic checkpoint leaf");}
    leaves.dedup_by_key(|(cp,_)|*cp);
    for (cp, leaf) in leaves {
        db.set_checkpoint_leaf_data(cp, &leaf)?;
        db.set_checkpoint_tree_leaf_hash(cp, leaf.qfhash::<H>())?;
    }
    let source = db.get_checkpoint_tree_merkle_proof(hp, s.fields[6]).await?;
    ensure!(
        source == s.history.checkpoint_path,
        "exact original public synthetic history; no substituted root"
    );
    let path = db.get_checkpoint_tree_merkle_proof(hp, dp).await?;
    fs::create_dir(out)?;
    save(
        &out.join("draw.json"),
        &json!({"checkpoint":draw.checkpoint,"path":path}),
    )?;
    if let Some(p)=&accepted {save(&out.join("acceptedSeal.json"),p)?;}
    save(
        &out.join("DERIVATION.json"),
        &json!({"syntheticOnly":true,"checkpointIds":[1,s.fields[6],dp,hp],"historyRoot":source.root,"sameOriginalSourcePath":true,"finalityVerified":false,"canBroadcast":false}),
    )?;
    Ok(())
}
