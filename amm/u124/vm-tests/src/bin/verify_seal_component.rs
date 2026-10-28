//! Exact saved membership-component proof verification only. The explicit
//! checkpoint root still needs an independent finality certificate.
use anyhow::{ensure,Result};
use bincode::Options;
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_template_u124_markets::{random_order::{decode_frozen_fields,frozen_root},seal_inclusion::SealLayout,seal_inclusion_circuit::SealCircuit};
use sha2::{Digest,Sha256};
use std::{fs,io::{Read,Write}};
fn read(path:&str,limit:u64)->Result<Vec<u8>>{let mut b=Vec::new();fs::File::open(path)?.take(limit+1).read_to_end(&mut b)?;ensure!(b.len()as u64<=limit,"public input limit");Ok(b)}
fn main()->Result<()>{
 let args=std::env::args().collect::<Vec<_>>();ensure!(args.len()==7,"FROZEN_FIELDS REVIEWED_LAYOUT EXPECTED_CHECKPOINT_ROOT SEAL_CHECKPOINT PROOF FRESH_REPORT");
 let input=read(&args[1],16384)?;let v=decode_frozen_fields(&input)?;let layout_bytes=read(&args[2],4096)?;let layout:SealLayout=serde_json::from_slice(&layout_bytes)?;
 let root:Q<F>=serde_json::from_value(serde_json::Value::String(args[3].clone()))?;ensure!(root.to_string()==args[3],"canonical expected checkpoint root");
 let cp=args[4].parse::<u64>()?;ensure!(cp.to_string()==args[4],"canonical seal checkpoint");let bytes=read(&args[5],2000000)?;
 let proof=bincode::DefaultOptions::new().with_fixint_encoding().with_limit(2000000).reject_trailing_bytes().deserialize(&bytes)?;
 SealCircuit::build(layout)?.verify_for(v,root,cp,proof)?;
 let report=serde_json::json!({"schema":1,"statementSha256":format!("{:x}",Sha256::digest(&input)),"layoutSha256":format!("{:x}",Sha256::digest(&layout_bytes)),"proofSha256":format!("{:x}",Sha256::digest(&bytes)),"membershipComponentProofVerified":true,"frozenRoot":frozen_root(&v)?.map(|n|n.to_string()),"checkpointRoot":root.to_string(),"sealCheckpoint":cp,"finalityVerified":false,"beaconUnpredictabilityVerified":false,"randomAuthorization":false,"fullUpsVerified":false,"financialOperations":0,"broadcast":false});
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&args[6])?;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.sync_all()?;Ok(())
}
