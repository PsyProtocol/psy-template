//! Public full-source/random planning. No signing, RPC or broadcast command.
use anyhow::{ensure,Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F,types::PrimeField64};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::qdata::checkpoint::PsyCheckpointLeaf;
use psy_crypto::hash::{merkle::core::MerkleProofCore,traits::qhashable::QFieldHashable};
use psy_template_u124_markets::{final_state_coverage::{Snapshot,verify_snapshot},source_review::review,stream_source,stream_policy,random_stream};
use plonky2::hash::poseidon::PoseidonHash as H;
use serde::{Serialize,Deserialize};use serde_json::{Value,json};
use sha2::{Digest,Sha256};use std::{fs,io::{Read,Write},path::Path};
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Draw{checkpoint:PsyCheckpointLeaf<F>,path:MerkleProofCore<Q<F>>}
fn bytes(path:&str,limit:u64)->Result<Vec<u8>>{let mut b=vec![];fs::File::open(path)?.take(limit+1).read_to_end(&mut b)?;ensure!(b.len()as u64<=limit,"bounded planner input");Ok(b)}
fn sha(b:&[u8])->String{format!("{:x}",Sha256::digest(b))}
fn save(p:&Path,v:&impl Serialize)->Result<()>{let mut f=fs::OpenOptions::new().write(true).create_new(true).open(p)?;f.write_all(&serde_json::to_vec_pretty(v)?)?;f.write_all(b"\n")?;f.sync_all()?;fs::File::open(p.parent().unwrap())?.sync_all()?;Ok(())}
fn main()->Result<()>{
 let a=std::env::args().collect::<Vec<_>>();ensure!(a.len()==7,"REVIEW SNAPSHOT PINNED_HISTORY_ROOT DRAW_OPENING POLICY FRESH_OUT");
 let (r,_,rb)=review(Path::new(&a[1]))?;ensure!(r.kind<=2,"random ordering is AMM/Curve only");
 let sb=bytes(&a[2],64*1024*1024)?;let s:Snapshot=serde_json::from_slice(&sb)?;let history:Q<F>=a[3].parse()?;ensure!(history.to_string()==a[3],"canonical independently pinned history root");
 let db=bytes(&a[4],65536)?;let draw:Draw=serde_json::from_slice(&db)?;
 let pb=bytes(&a[5],4*1024*1024)?;let policy:Value=serde_json::from_slice(&pb)?;stream_policy::validate(&policy,&r)?;
 ensure!(policy["version"]==10&&s.fields[7]==s.fields[6]+policy["source_window_checkpoints"].as_u64().unwrap(),"reviewed random profile and exact window");
 let covered=verify_snapshot(&r,&s,history)?;
 ensure!(draw.path.index==s.fields[6]+1&&draw.path.root==history&&draw.path.value==draw.checkpoint.qfhash::<H>()&&draw.path.siblings.len()==32&&draw.path.verify::<H>(),"one authenticated future draw under the same pinned history");
 let source=stream_source::prepare(&r,&s,history)?;let scope=&source[0].scope;
 let original=stream_source::priority(&r,&s,history)?;let seed=draw.checkpoint.stats.random_seed.0.elements.map(|n|n.to_canonical_u64());
 let (pages,queue)=random_stream::prepare(scope,&original,seed)?;
 let out=Path::new(&a[6]);fs::create_dir(out)?;
 save(&out.join("source-pages.json"),&source)?;save(&out.join("ordering-pages.json"),&pages)?;save(&out.join("queue.json"),&queue.members)?;
 save(&out.join("plan.json"),&json!({"schema":1,"profile":"source-covered-producer-random-stream-v1","reviewSha256":sha(&rb),"snapshotSha256":sha(&sb),"drawSha256":sha(&db),"policySha256":sha(&pb),"historyRoot":history,"scope":scope,"sourceCheckpoint":scope[6],"drawCheckpoint":scope[6]+1,"expiry":scope[7],"accounts":covered.accounts,"earliestEligibleDeadline":covered.earliest_eligible_deadline,"recoveryMembers":covered.recovery_members.len(),"members":queue.members.len(),"sourcePages":source.len(),"orderingPages":pages.len(),"seed":seed,"sourceSetRoot":original.root(),"orderedRoot":queue.root(),"authenticatedSeedRelativeToHistory":true,"finalityVerified":false,"causalSealBeforeReleaseAuthenticated":false,"producerInfluence":true,"qualifiedRandomness":false,"fullUpsVerified":false,"canSign":false,"canBroadcast":false}))?;Ok(())
}
