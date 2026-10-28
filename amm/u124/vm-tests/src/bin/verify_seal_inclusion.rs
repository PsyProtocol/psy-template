//! Verify a historical opening against caller-owned statement, reviewed layout
//! and checkpoint root. Root finality is explicitly outside this component.
use anyhow::{ensure,Result};
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_template_u124_markets::{random_order::{decode_frozen_fields,frozen_root},seal_inclusion::{SealLayout,SealOpening,verify_seal_opening}};
use sha2::{Digest,Sha256};
use std::{fs,io::{Read,Write}};
fn read(path:&str,limit:u64)->Result<Vec<u8>>{let mut b=Vec::new();fs::File::open(path)?.take(limit+1).read_to_end(&mut b)?;ensure!(b.len()as u64<=limit,"public input limit");Ok(b)}
fn main()->Result<()>{
 let args=std::env::args().collect::<Vec<_>>();ensure!(args.len()==6,"FROZEN_FIELDS REVIEWED_LAYOUT EXPECTED_CHECKPOINT_ROOT OPENING FRESH_REPORT");
 let statement=read(&args[1],16384)?;let v=decode_frozen_fields(&statement)?;let layout_bytes=read(&args[2],4096)?;let layout:SealLayout=serde_json::from_slice(&layout_bytes)?;
 let root:Q<F>=serde_json::from_value(serde_json::Value::String(args[3].clone()))?;ensure!(root.to_string()==args[3],"canonical expected checkpoint root");
 let opening_bytes=read(&args[4],131072)?;let opening:SealOpening=serde_json::from_slice(&opening_bytes)?;
 verify_seal_opening(&v,layout,root,&opening)?;
 let report=serde_json::json!({"schema":1,"statementSha256":format!("{:x}",Sha256::digest(&statement)),"layoutSha256":format!("{:x}",Sha256::digest(&layout_bytes)),"openingSha256":format!("{:x}",Sha256::digest(&opening_bytes)),"sealMembershipVerified":true,"checkpointOrderBound":true,"frozenRoot":frozen_root(&v)?.map(|n|n.to_string()),"checkpointRoot":root.to_string(),"sealCheckpoint":opening.checkpoint_id,"drawCheckpoint":v[8],"finalityVerified":false,"beaconUnpredictabilityVerified":false,"randomAuthorization":false,"fullUpsVerified":false,"financialOperations":0,"broadcast":false});
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&args[5])?;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.sync_all()?;Ok(())
}
