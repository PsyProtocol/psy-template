//! Operator-only evidence inspection, not a wallet verifier or finality oracle.
//! Links the already-locked Alloy libraries; no SDK/dependency change or RPC.
use anyhow::{ensure,Context,Result};
use alloy_primitives::{keccak256,Address,B256,Bytes,U256};
use alloy_rlp::Encodable;
use alloy_trie::{Nibbles,TrieAccount,proof::verify_proof};
use serde::Deserialize;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::BTreeSet,fs,io::{Read,Write},path::Path};

const SDK:&str="c92880c8b6e2c8d392f19368bc8801a2584fd427";
const LIMIT:u64=2_097_152;
fn digest(b:&[u8])->String{format!("{:x}",Sha256::digest(b))}
fn hex(s:&str,max:usize)->Result<Vec<u8>>{
 let text=s.strip_prefix("0x").context("0x-prefixed data required")?;
 ensure!(text.len()%2==0&&text.len()/2<=max&&text.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)),"canonical bounded lowercase data required");
 Ok((0..text.len()).step_by(2).map(|i|u8::from_str_radix(&text[i..i+2],16)).collect::<std::result::Result<Vec<_>,_>>()?)
}
fn data(s:&str,size:usize)->Result<Vec<u8>>{let b=hex(s,size)?;ensure!(b.len()==size,"data width");Ok(b)}
fn hash(s:&str)->Result<B256>{Ok(B256::from_slice(&data(s,32)?))}
fn quantity(s:&str)->Result<U256>{
 let t=s.strip_prefix("0x").context("quantity prefix")?;
 ensure!(!t.is_empty()&&t.len()<=64&&(t=="0"||!t.starts_with('0'))&&t.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)),"canonical uint256 quantity required");
 Ok(U256::from_str_radix(t,16)?)
}
fn slot(s:&str)->Result<U256>{
 // Storage proof providers may return full-width DATA rather than QUANTITY.
 if s.len()==66 {Ok(U256::from_be_slice(&data(s,32)?))}else{quantity(s)}
}
fn list(items:&[Vec<u8>])->Vec<u8>{
 let mut payload=vec![];for item in items{item.as_slice().encode(&mut payload);}
 let mut out=vec![];alloy_rlp::Header{list:true,payload_length:payload.len()}.encode(&mut out);out.extend(payload);out
}
// Field order: Ethereum execution Header through EIP-7685, then EIP-7928,
// then EIP-7843. Source/protocol references are recorded in the review report.
const FIELDS:[(&str,usize,bool);23]=[
 ("parentHash",32,false),("sha3Uncles",32,false),("miner",20,false),
 ("stateRoot",32,false),("transactionsRoot",32,false),("receiptsRoot",32,false),
 ("logsBloom",256,false),("difficulty",32,true),("number",8,true),
 ("gasLimit",8,true),("gasUsed",8,true),("timestamp",8,true),
 ("extraData",32,false),("mixHash",32,false),("nonce",8,false),
 ("baseFeePerGas",32,true),("withdrawalsRoot",32,false),("blobGasUsed",8,true),
 ("excessBlobGas",8,true),("parentBeaconBlockRoot",32,false),("requestsHash",32,false),
 ("blockAccessListHash",32,false),("slotNumber",8,true)
];
#[derive(Deserialize)]#[serde(deny_unknown_fields,rename_all="camelCase")]
struct Statement{
 schema:u64,kind:String,chain_id:u64,address:String,block_hash:String,
 block_number:String,state_root:String,slots:Vec<String>,original_anchor_replaced:bool,
 header_consensus_verified:bool,can_broadcast:bool,
}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct HeaderProjection{schema:u64,header:Value}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct ProofProjection{schema:u64,proof:AccountProof}
#[derive(Deserialize)]#[serde(deny_unknown_fields,rename_all="camelCase")]
struct AccountProof{address:String,account_proof:Vec<String>,balance:String,code_hash:String,nonce:String,storage_hash:String,storage_proof:Vec<StorageProof>}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
struct StorageProof{key:String,value:String,proof:Vec<String>}
#[derive(Deserialize)]#[serde(deny_unknown_fields,rename_all="camelCase")]
struct CodeProjection{schema:u64,block_hash:String,address:String,code:String}
fn header(v:&HeaderProjection)->Result<(B256,B256,B256)> {
 ensure!(v.schema==1,"header projection schema");
 let object=v.header.as_object().context("header object required")?;
 let expected=FIELDS.iter().map(|x|x.0).chain(["hash"]).collect::<BTreeSet<_>>();
 ensure!(object.keys().map(String::as_str).collect::<BTreeSet<_>>()==expected,"exact supported 23-field header required");
 let mut fields=vec![];
 for (name,width,is_quantity)in FIELDS{
  let s=object[name].as_str().context("header field string required")?;
  let b=if is_quantity{
   let n=quantity(s)?;let all=n.to_be_bytes::<32>();let start=all.iter().position(|&b|b!=0).unwrap_or(32);let b=all[start..].to_vec();ensure!(b.len()<=width,"header quantity width");b
  }else if name=="extraData"{hex(s,width)?}else{data(s,width)?};fields.push(b);
 }
 let computed=keccak256(list(&fields));let declared=hash(object["hash"].as_str().context("header hash required")?)?;
 ensure!(computed==declared,"execution header hash mismatch; never omit unsupported fork fields");
 Ok((computed,hash(object["stateRoot"].as_str().unwrap())?,keccak256(list(&fields[..21]))))
}
fn nodes(values:&[String])->Result<Vec<Bytes>>{
 ensure!(values.len()<=65,"proof node count limit");
 values.iter().map(|s|Ok(Bytes::from(hex(s,65_536)?))).collect()
}
fn inspect(s:&Statement,h:&HeaderProjection,p:&ProofProjection,c:&CodeProjection)->Result<Value>{
 ensure!(s.schema==1&&s.kind=="prospective-execution-state-statement-v1"&&s.chain_id==11155111,"explicit read-only Sepolia statement required");
 ensure!(!s.original_anchor_replaced&&!s.header_consensus_verified&&!s.can_broadcast,"observation cannot claim finality, replacement or broadcast");
 let(block,state,legacy)=header(h)?;
 ensure!(hash(&s.block_hash)?==block&&hash(&s.state_root)?==state&&quantity(&s.block_number)?==quantity(h.header["number"].as_str().unwrap())?,"statement/header binding");
 ensure!(p.schema==1&&c.schema==1&&c.block_hash==s.block_hash&&c.address==s.address,"proof/code snapshot binding");
 let address=Address::from_slice(&data(&s.address.to_lowercase(),20)?);
 ensure!(data(&p.proof.address.to_lowercase(),20)?==address.as_slice(),"account address substitution");
 let account=&p.proof;
 let nonce=quantity(&account.nonce)?;ensure!(nonce<=U256::from(u64::MAX),"account nonce width");
 let account_value=TrieAccount{nonce:nonce.to::<u64>(),balance:quantity(&account.balance)?,storage_root:hash(&account.storage_hash)?,code_hash:hash(&account.code_hash)?};
 let account_nodes=nodes(&account.account_proof)?;
 verify_proof(state,Nibbles::unpack(keccak256(address)),Some(alloy_rlp::encode(account_value)),&account_nodes).context("account MPT proof")?;
 ensure!(keccak256(hex(&c.code,1_048_576)?)==account_value.code_hash,"runtime bytecode differs from proven code hash");
 ensure!(!s.slots.is_empty()&&s.slots.len()<=16&&account.storage_proof.len()==s.slots.len(),"exact bounded requested slot count");
 let expected=s.slots.iter().map(|v|slot(v)).collect::<Result<BTreeSet<_>>>()?;
 ensure!(expected.len()==s.slots.len(),"duplicate requested slot");
 let mut actual=BTreeSet::new();let mut rows=vec![];
 for entry in &account.storage_proof{
  let key=slot(&entry.key)?;ensure!(expected.contains(&key)&&actual.insert(key),"extra or duplicate storage slot");
  let value=quantity(&entry.value)?;let proof=nodes(&entry.proof)?;
  let encoded=if value==U256::ZERO{None}else{Some(alloy_rlp::encode(value))};
  verify_proof(account_value.storage_root,Nibbles::unpack(keccak256(key.to_be_bytes::<32>())),encoded,&proof).context("storage MPT proof")?;
  rows.push(json!({"slot":format!("0x{key:064x}"),"valueWord":format!("0x{value:064x}"),"proofNodes":proof.len(),"storageMptVerified":true}));
 }
 ensure!(actual==expected,"missing storage slot");
 Ok(json!({"schema":1,"kind":"execution-state-inclusion-inspection-v1","sdkCommit":SDK,
  "chainIdClaim":s.chain_id,"blockHash":format!("{block:#x}"),"stateRoot":format!("{state:#x}"),
  "address":s.address,"headerProfile":"ethereum-amsterdam-23-v1","executionHeaderHashVerified":true,
  "legacy21FieldHash":format!("{legacy:#x}"),"legacy21FieldHashMatches":legacy==block,
  "accountMptVerified":true,"runtimeCodeHashVerified":true,"runtimeCodeHash":account.code_hash,"storage":rows,
  "headerConsensusVerified":false,"runtimeSourceIdentityVerified":false,"storageLayoutSemanticsVerified":false,
  "chainInstanceAuthenticated":false,"finalityVerified":false,"seedSecrecyAuthenticated":false,
  "qualifiedRandomness":false,"originalAnchorReplaced":false,"canSign":false,"canBroadcast":false,
  "proofsGenerated":0,"financialOperations":0}))
}
fn read(path:&Path)->Result<Vec<u8>>{let m=fs::symlink_metadata(path)?;ensure!(m.is_file()&&m.len()<=LIMIT,"bounded regular evidence file required");let mut b=vec![];fs::File::open(path)?.take(LIMIT+1).read_to_end(&mut b)?;ensure!(b.len()as u64<=LIMIT,"evidence file limit");Ok(b)}
fn main()->Result<()> {
 let a=std::env::args().collect::<Vec<_>>();ensure!(a.len()==7,"STATEMENT REVIEWED_STATEMENT_SHA256 HEADER_PROJECTION PROOF_PROJECTION CODE_PROJECTION FRESH_REPORT");
 let s=read(Path::new(&a[1]))?;ensure!(digest(&s)==a[2],"reviewed statement byte identity");
 let h=read(Path::new(&a[3]))?;let p=read(Path::new(&a[4]))?;let c=read(Path::new(&a[5]))?;
 // Reserve a durable rejection report even if input authentication fails later.
 let mut file=fs::OpenOptions::new().create_new(true).write(true).open(&a[6])?;
 let outcome=(||inspect(&serde_json::from_slice(&s)?,&serde_json::from_slice(&h)?,&serde_json::from_slice(&p)?,&serde_json::from_slice(&c)?))();
 let mut r=match &outcome{Ok(r)=>r.clone(),Err(e)=>json!({"schema":1,"kind":"execution-state-inclusion-inspection-v1","inspectionPassed":false,"error":format!("{e:#}"),"headerConsensusVerified":false,"finalityVerified":false,"qualifiedRandomness":false,"canSign":false,"canBroadcast":false,"financialOperations":0,"proofsGenerated":0})};
 r["inspectionPassed"]=json!(outcome.is_ok());r["statementSha256"]=json!(digest(&s));r["headerSha256"]=json!(digest(&h));r["proofSha256"]=json!(digest(&p));r["codeSha256"]=json!(digest(&c));
 file.write_all(&serde_json::to_vec_pretty(&r)?)?;file.write_all(b"\n")?;file.sync_all()?;fs::File::open(Path::new(&a[6]).parent().context("report parent")?)?.sync_all()?;
 println!("{}",serde_json::to_string(&r)?);outcome.map(|_|())
}

#[cfg(test)]mod tests{
 use super::*;
 #[test]fn execution_header_rejects_missing_or_changed_fork_fields()->Result<()>{
  let mut object=serde_json::Map::new();for(name,width,q)in FIELDS{object.insert(name.into(),json!(if q{"0x0".into()}else{format!("0x{}","00".repeat(if name=="extraData"{0}else{width}))}));}
  let fields=FIELDS.iter().map(|(n,w,q)|if *q{vec![]}else{vec![0;if *n=="extraData"{0}else{*w}]}).collect::<Vec<_>>();
  object.insert("hash".into(),json!(format!("{:#x}",keccak256(list(&fields)))));
  let mut p=HeaderProjection{schema:1,header:Value::Object(object)};assert!(header(&p).is_ok());
  p.header["slotNumber"]=json!("0x1");assert!(header(&p).is_err());
  p.header["slotNumber"]=json!("0x0");p.header.as_object_mut().unwrap().remove("blockAccessListHash");assert!(header(&p).is_err());Ok(())
 }
 #[test]fn quantity_and_proof_bounds_fail_closed(){
  for s in ["0x","0x00","0x01","1","0xA","0x-1"]{assert!(quantity(s).is_err());}
  assert!(nodes(&vec!["0x80".into();66]).is_err());assert!(hex("0x01",0).is_err());
 }
 #[test]fn header_quantities_preserve_full_uint256()->Result<()>{
  assert_eq!(quantity(&format!("0x{}","f".repeat(64)))?,U256::MAX);
  assert!(quantity(&format!("0x1{}","0".repeat(64))).is_err());Ok(())
 }
}
