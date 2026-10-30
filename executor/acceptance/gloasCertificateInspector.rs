//! Conditional Gloas certificate inspection against an UNREVIEWED bootstrap.
//! A self-consistent committee/signature is not an independent trust anchor.
//! No Node/SDK changes, network requests, signatures, wallet or broadcast path.
use anyhow::{ensure,Context,Result};
use blst::{min_pk::{PublicKey,Signature,AggregatePublicKey},BLST_ERROR};
use serde::Deserialize;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{fs,io::{Read,Write},path::Path};

type Root=[u8;32];
const GENESIS:&str="0xd8ea171f3c94aea21ebc42a1ed61052acf3f9209c00e4efbaaddac09ed9b8078";
const FORK:&str="0x90000076";
const GLOAS_SLOT:u64=353024*32;
const PERIOD:u64=32*256;
const DST:&[u8]=b"BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";
fn sha(b:&[u8])->Root{Sha256::digest(b).into()}
fn pair(a:Root,b:Root)->Root{let mut p=[0;64];p[..32].copy_from_slice(&a);p[32..].copy_from_slice(&b);sha(&p)}
fn text(b:&[u8])->String{format!("0x{}",b.iter().map(|b|format!("{b:02x}")).collect::<String>())}
fn digest(b:&[u8])->String{text(&sha(b))[2..].into()}
fn bytes(s:&str,n:usize)->Result<Vec<u8>>{
 let h=s.strip_prefix("0x").context("hex prefix required")?;
 ensure!(h.len()==2*n&&h.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)),"canonical fixed-width bytes required");
 Ok((0..h.len()).step_by(2).map(|i|u8::from_str_radix(&h[i..i+2],16)).collect::<std::result::Result<Vec<_>,_>>()?)
}
fn root(s:&str)->Result<Root>{Ok(bytes(s,32)?.try_into().unwrap())}
fn decimal(s:&str)->Result<u64>{ensure!(!s.is_empty()&&s.len()<=20&&(s=="0"||!s.starts_with('0'))&&s.bytes().all(|b|b.is_ascii_digit()),"canonical uint64 decimal required");Ok(s.parse()?)}
fn uint(n:u64)->Root{let mut r=[0;32];r[..8].copy_from_slice(&n.to_le_bytes());r}
fn merkle(mut leaves:Vec<Root>)->Root{assert!(leaves.len().is_power_of_two());while leaves.len()>1{leaves=leaves.chunks_exact(2).map(|p|pair(p[0],p[1])).collect();}leaves[0]}
fn branch(leaf:Root,path:&[String],mut index:u64,expected:Root)->Result<()> {
 ensure!(index>1&&path.len()==(63-index.leading_zeros())as usize,"exact generalized-index branch depth required");
 let mut r=leaf;for sibling in path{let s=root(sibling)?;r=if index&1==1{pair(s,r)}else{pair(r,s)};index>>=1;}
 ensure!(index==1&&r==expected,"SSZ Merkle branch differs");Ok(())
}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Beacon{slot:String,proposer_index:String,parent_root:String,state_root:String,body_root:String}
impl Beacon{fn hash(&self)->Result<Root>{Ok(merkle(vec![uint(decimal(&self.slot)?),uint(decimal(&self.proposer_index)?),root(&self.parent_root)?,root(&self.state_root)?,root(&self.body_root)?,[0;32],[0;32],[0;32]]))}}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Header{beacon:Beacon,execution_block_hash:String,execution_branch:Vec<String>}
impl Header{fn check(&self)->Result<Root>{ensure!(decimal(&self.beacon.slot)?>=GLOAS_SLOT,"Gloas-only header; fork transition requires a separate profile");branch(root(&self.execution_block_hash)?,&self.execution_branch,2856,root(&self.beacon.body_root)?)?;self.beacon.hash()}}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Committee{pubkeys:Vec<String>,aggregate_pubkey:String}
impl Committee{fn hash(&self)->Result<Root>{
 ensure!(self.pubkeys.len()==512,"exact mainnet-preset sync committee size");
 let hash_key=|s:&str|->Result<Root>{let key=bytes(s,48)?;let a:Root=key[..32].try_into().unwrap();let mut b=[0;32];b[..16].copy_from_slice(&key[32..]);Ok(pair(a,b))};
 Ok(pair(merkle(self.pubkeys.iter().map(|s|hash_key(s)).collect::<Result<Vec<_>>>()?),hash_key(&self.aggregate_pubkey)?))
}}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Bootstrap{header:Header,current_sync_committee:Committee,current_sync_committee_branch:Vec<String>}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct BootstrapEnvelope{version:String,data:Bootstrap}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Aggregate{sync_committee_bits:String,sync_committee_signature:String}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct Update{attested_header:Header,finalized_header:Header,finality_branch:Vec<String>,sync_aggregate:Aggregate,signature_slot:String}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct UpdateEnvelope{version:String,data:Update}
#[derive(Deserialize)]#[serde(deny_unknown_fields,rename_all="camelCase")]
struct Policy{schema:u64,kind:String,network:String,genesis_validators_root:String,fork_version:String,bootstrap_root:String,bootstrap_sha256:String,update_sha256:String,anchor_reviewed:bool,can_broadcast:bool}

fn inspect(p:&Policy,b:&BootstrapEnvelope,u:&UpdateEnvelope)->Result<Value>{
 ensure!(p.schema==1&&p.kind=="unreviewed-gloas-certificate-inspection-v1"&&p.network=="sepolia","explicit unreviewed Sepolia policy required");
 ensure!(!p.anchor_reviewed&&!p.can_broadcast,"same-source bootstrap cannot promote trust or broadcasting");
 ensure!(p.genesis_validators_root==GENESIS&&p.fork_version==FORK,"compiled reference genesis/fork domain differs");
 ensure!(b.version=="gloas"&&u.version=="gloas","explicit Gloas envelope required");
 let b=&b.data;let u=&u.data;
 let bootstrap=b.header.check()?;ensure!(bootstrap==root(&p.bootstrap_root)?,"bootstrap root pin differs");
 branch(b.current_sync_committee.hash()?,&b.current_sync_committee_branch,2945,root(&b.header.beacon.state_root)?)?;
 let attested=u.attested_header.check()?;let finalized=u.finalized_header.check()?;
 let bs=decimal(&b.header.beacon.slot)?;let a=decimal(&u.attested_header.beacon.slot)?;let f=decimal(&u.finalized_header.beacon.slot)?;let sig=decimal(&u.signature_slot)?;
 ensure!(sig>a&&a>=f&&bs<=a&&sig>0&&sig-1>=GLOAS_SLOT,"certificate slot/fork order differs");
 ensure!(bs/PERIOD==sig/PERIOD,"committee transition is not implemented by this same-period profile");
 branch(finalized,&u.finality_branch,735,root(&u.attested_header.beacon.state_root)?)?;
 let bits=bytes(&u.sync_aggregate.sync_committee_bits,64)?;
 let mut public_keys=vec![];
 for k in &b.current_sync_committee.pubkeys{public_keys.push(PublicKey::key_validate(&bytes(k,48)?).map_err(|e|anyhow::anyhow!("sync committee public key: {e:?}"))?);}
 let refs=public_keys.iter().collect::<Vec<_>>();
 let aggregate=AggregatePublicKey::aggregate(&refs,true).map_err(|e|anyhow::anyhow!("aggregate committee key: {e:?}"))?.to_public_key();
 ensure!(aggregate.to_bytes().as_slice()==bytes(&b.current_sync_committee.aggregate_pubkey,48)?.as_slice(),"aggregate committee public key differs");
 // Repeated committee members are legitimate: preserve every selected position.
 let participants=public_keys.iter().enumerate().filter(|(i,_)|bits[i/8]&(1<<(i%8))!=0).map(|(_,key)|key).collect::<Vec<_>>();
 ensure!(participants.len()*3>=512*2,"sync committee supermajority required");
 let mut version=[0;32];version[..4].copy_from_slice(&bytes(FORK,4)?);
 let fork_root=pair(version,root(GENESIS)?);let mut domain=[0;32];domain[..4].copy_from_slice(&[7,0,0,0]);domain[4..].copy_from_slice(&fork_root[..28]);
 let signing_root=pair(attested,domain);
 let signature=Signature::sig_validate(&bytes(&u.sync_aggregate.sync_committee_signature,96)?,true).map_err(|e|anyhow::anyhow!("sync signature encoding: {e:?}"))?;
 ensure!(signature.fast_aggregate_verify(true,&signing_root,DST,&participants)==BLST_ERROR::BLST_SUCCESS,"sync committee signature rejected");
 Ok(json!({"schema":1,"kind":"conditional-gloas-certificate-inspection-v1","sdkCommit":"c92880c8b6e2c8d392f19368bc8801a2584fd427",
  "bootstrapRoot":text(&bootstrap),"attestedBeaconRoot":text(&attested),"finalizedBeaconRoot":text(&finalized),"signingRoot":text(&signing_root),
  "signatureSlot":sig.to_string(),"attestedSlot":a.to_string(),"finalizedSlot":f.to_string(),"committeePeriod":(sig/PERIOD).to_string(),"participation":participants.len(),
  "committeeMembershipVerifiedRelativeToBootstrap":true,"aggregateCommitteeKeyMatches":true,"syncSignatureVerifiedRelativeToCommittee":true,
  "finalityBranchVerifiedRelativeToAttestedHeader":true,"executionHashBranchesVerified":true,
  "conditionalFinalizedExecutionParentHash":u.finalized_header.execution_block_hash,
  "anchorReviewed":false,"independentAnchorAuthenticated":false,"committeeTransitionVerified":false,"freshnessVerified":false,
  "canonicalFinalityVerified":false,"checkpointResourcesAuthenticated":false,"seedSecrecyAuthenticated":false,"qualifiedRandomness":false,
  "canSign":false,"canBroadcast":false,"financialOperations":0,"newZkProofsGenerated":0,
  "scope":"cryptographic relations to supplied unreviewed bootstrap only; circular same-provider trust is not resolved"}))
}
fn read(path:&str)->Result<Vec<u8>>{let m=fs::symlink_metadata(path)?;ensure!(m.is_file()&&m.len()<=1_048_576,"bounded regular certificate file required");let mut b=vec![];fs::File::open(path)?.take(1_048_577).read_to_end(&mut b)?;ensure!(b.len()<=1_048_576,"certificate file limit");Ok(b)}
fn main()->Result<()> {
 let a=std::env::args().collect::<Vec<_>>();ensure!(a.len()==6,"POLICY REVIEWED_POLICY_SHA256 BOOTSTRAP FINALITY_UPDATE FRESH_REPORT");
 let p=read(&a[1])?;ensure!(digest(&p)==a[2],"reviewed policy bytes differ");let b=read(&a[3])?;let u=read(&a[4])?;
 let mut file=fs::OpenOptions::new().create_new(true).write(true).open(&a[5])?;
 let outcome=(||{let policy:Policy=serde_json::from_slice(&p)?;ensure!(policy.bootstrap_sha256==digest(&b)&&policy.update_sha256==digest(&u),"certificate byte bindings differ");inspect(&policy,&serde_json::from_slice(&b)?,&serde_json::from_slice(&u)?)})();
 let mut report=match &outcome{Ok(v)=>v.clone(),Err(e)=>json!({"schema":1,"kind":"conditional-gloas-certificate-inspection-v1","error":format!("{e:#}"),"anchorReviewed":false,"independentAnchorAuthenticated":false,"canonicalFinalityVerified":false,"checkpointResourcesAuthenticated":false,"seedSecrecyAuthenticated":false,"qualifiedRandomness":false,"canSign":false,"canBroadcast":false,"financialOperations":0,"newZkProofsGenerated":0})};
 report["inspectionPassed"]=json!(outcome.is_ok());report["policySha256"]=json!(digest(&p));report["bootstrapSha256"]=json!(digest(&b));report["updateSha256"]=json!(digest(&u));
 file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.write_all(b"\n")?;file.sync_all()?;fs::File::open(Path::new(&a[5]).parent().context("report parent")?)?.sync_all()?;
 println!("{}",serde_json::to_string(&report)?);outcome.map(|_|())
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn ssz_integer_uses_little_endian(){assert_eq!(&uint(256)[..4],&[0,1,0,0]);}
 #[test]fn generalized_index_is_not_a_caller_selected_depth()->Result<()>{let leaf=sha(b"leaf");let other=sha(b"other");let r=pair(leaf,other);branch(leaf,&[text(&other)],2,r)?;assert!(branch(leaf,&[text(&other)],3,r).is_err());assert!(branch(leaf,&[],2,r).is_err());Ok(())}
 #[test]fn fixed_encodings_reject_ambiguity(){for v in ["","01","-1","18446744073709551616"]{assert!(decimal(v).is_err());}assert!(bytes("0xAB",1).is_err());assert!(bytes("0x0",1).is_err());}
}
