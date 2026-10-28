//! Inspect a candidate statement with the frozen Poseidon implementation.
//! Does not certify a seed, prove a market, sign or use any network service.
use anyhow::{ensure,Result};
use psy_template_u124_markets::random_order::{frozen_root,order_keys,permutation,decode_candidate_input};
use std::{fs,io::{Read,Write}};
fn main()->Result<()>{
 let args=std::env::args().collect::<Vec<_>>();ensure!(args.len()==3,"PUBLIC_INPUT FRESH_REPORT; candidate inspection only");
 let mut bytes=Vec::new();fs::File::open(&args[1])?.take(16385).read_to_end(&mut bytes)?;ensure!(bytes.len()<=16384,"bounded statement input");
 let (fields,seed)=decode_candidate_input(&bytes)?;
 let root=frozen_root(&fields)?;let keys=order_keys(&fields,seed)?;let rank=permutation(&fields,seed)?;
 let report=serde_json::json!({"schema":1,"frozenRoot":root.map(|n|n.to_string()),"keys":keys.map(|h|h.map(|n|n.to_string())),"rank":rank,"qualifiedSource":false,"sealInclusionVerified":false,"fullUpsVerified":false,"broadcast":false});
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&args[2])?;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.sync_all()?;Ok(())
}
