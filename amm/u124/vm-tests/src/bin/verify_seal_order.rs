//! Read-only verification of the preserved linked component proof. Never a
//! finality, beacon, SD-key, Endcap, settlement or broadcast authorization.
use anyhow::{ensure,Result};
use bincode::Options;
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_template_u124_markets::{random_order::{decode_candidate_input,frozen_root,permutation},seal_inclusion::SealLayout,seal_order::SealOrderCircuit};
use sha2::{Digest,Sha256};
use std::{fs,io::{Read,Write}};
fn read(path:&str,limit:u64)->Result<Vec<u8>>{let mut b=Vec::new();fs::File::open(path)?.take(limit+1).read_to_end(&mut b)?;ensure!(b.len()as u64<=limit,"public input limit");Ok(b)}
fn main()->Result<()>{
 let args=std::env::args().collect::<Vec<_>>();ensure!(args.len()==7,"CANDIDATE_INPUT REVIEWED_LAYOUT EXPECTED_CHECKPOINT_ROOT SEAL_CHECKPOINT LINKED_PROOF FRESH_REPORT");
 let input=read(&args[1],16384)?;let(fields,seed)=decode_candidate_input(&input)?;let layout_bytes=read(&args[2],4096)?;let layout:SealLayout=serde_json::from_slice(&layout_bytes)?;
 let root:Q<F>=serde_json::from_value(serde_json::Value::String(args[3].clone()))?;ensure!(root.to_string()==args[3],"canonical expected checkpoint root");let checkpoint=args[4].parse::<u64>()?;ensure!(checkpoint.to_string()==args[4],"canonical checkpoint");
 let bytes=read(&args[5],2000000)?;let proof=bincode::DefaultOptions::new().with_fixint_encoding().with_limit(2000000).reject_trailing_bytes().deserialize(&bytes)?;
 SealOrderCircuit::build(layout)?.verify_for(fields,seed,root,checkpoint,proof)?;
 let report=serde_json::json!({"schema":1,"inputSha256":format!("{:x}",Sha256::digest(&input)),"layoutSha256":format!("{:x}",Sha256::digest(&layout_bytes)),"proofSha256":format!("{:x}",Sha256::digest(&bytes)),"linkedComponentProofVerified":true,"frozenRoot":frozen_root(&fields)?.map(|n|n.to_string()),"checkpointRoot":root.to_string(),"sealCheckpoint":checkpoint,"seed":seed.map(|n|n.to_string()),"rank":permutation(&fields,seed)?,"finalityVerified":false,"beaconUnpredictabilityVerified":false,"marketSemanticsVerified":false,"randomAuthorization":false,"fullUpsVerified":false,"financialOperations":0,"broadcast":false});
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&args[6])?;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.sync_all()?;Ok(())
}
