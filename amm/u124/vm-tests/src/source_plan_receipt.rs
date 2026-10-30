//! An owned-process byte receipt, not a ZK proof, runtime attestation or finality.
use anyhow::{ensure,Result};
use serde::Serialize;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::BTreeMap,fs,io::Write,path::Path};
pub const PREFIX:&str="PSY_SOURCE_STREAM_RECEIPT ";
pub fn save(path:&Path,value:&impl Serialize)->Result<String>{
 let mut bytes=serde_json::to_vec_pretty(value)?;bytes.push(b'\n');
 let mut file=fs::OpenOptions::new().create_new(true).write(true).open(path)?;
 file.write_all(&bytes)?;file.sync_all()?;fs::File::open(path.parent().ok_or_else(||anyhow::anyhow!("artifact parent required"))?)?.sync_all()?;
 Ok(format!("{:x}",Sha256::digest(&bytes)))
}
pub fn receipt(profile:&str,history:&str,inputs:BTreeMap<String,String>,outputs:BTreeMap<String,String>)->Result<Value>{
 let (pages,sealed)=match profile{
  "source-covered-producer-random-stream-v1"=>("ordering-pages",false),
  "source-covered-producer-minimum-stream-v1"=>("minimum-pages",false),
  "source-covered-producer-sealed-minimum-v1"=>("minimum-pages",true),
  _=>anyhow::bail!("explicit source planning receipt profile required"),
 };
 let mut expected_inputs=vec!["review","snapshot","draw","policy"];if sealed{expected_inputs.push("acceptedSeal");}
 let mut actual=inputs.keys().map(String::as_str).collect::<Vec<_>>();actual.sort_unstable();expected_inputs.sort_unstable();ensure!(actual==expected_inputs,"exact native input digest set required");
 let mut expected_outputs=vec!["plan","source-pages",pages,"queue"];expected_outputs.sort_unstable();ensure!(outputs.keys().map(String::as_str).collect::<Vec<_>>()==expected_outputs,"exact native output digest set required");
 let hex=|s:&str|s.len()==64&&s.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b));
 ensure!(hex(history)&&inputs.values().chain(outputs.values()).all(|s|hex(s)),"canonical public history/digests required");
 Ok(json!({"schema":1,"kind":"source-stream-plan-receipt-v1","profile":profile,"historyRoot":history,"inputs":inputs,"outputs":outputs,"financialOperations":0,"proofsGenerated":0,"canSign":false,"canBroadcast":false,"finalityVerified":false,"seedSecrecyAuthenticated":false,"qualifiedRandomness":false}))
}
pub fn emit(profile:&str,history:&str,inputs:BTreeMap<String,String>,outputs:BTreeMap<String,String>)->Result<()>{
 let receipt=receipt(profile,history,inputs,outputs)?;
 let mut stdout=std::io::stdout().lock();stdout.write_all(PREFIX.as_bytes())?;serde_json::to_writer(&mut stdout,&receipt)?;stdout.write_all(b"\n")?;stdout.flush()?;Ok(())
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn exact_profile_input_output_sets_are_bound_and_never_authorize_funds()->Result<()>{
  for (profile,pages,sealed) in [("source-covered-producer-random-stream-v1","ordering-pages",false),("source-covered-producer-minimum-stream-v1","minimum-pages",false),("source-covered-producer-sealed-minimum-v1","minimum-pages",true)]{
   let mut inputs=["review","snapshot","draw","policy"].into_iter().map(|k|(k.to_owned(),"a".repeat(64))).collect::<BTreeMap<_,_>>();if sealed{inputs.insert("acceptedSeal".into(),"b".repeat(64));}
   let outputs=["plan","source-pages",pages,"queue"].into_iter().map(|k|(k.to_owned(),"c".repeat(64))).collect::<BTreeMap<_,_>>();
   let r=receipt(profile,&"d".repeat(64),inputs.clone(),outputs.clone())?;for k in ["canSign","canBroadcast","finalityVerified","seedSecrecyAuthenticated","qualifiedRandomness"]{assert_eq!(r[k],false);}
   let mut bad=inputs.clone();bad.insert("seedOverride".into(),"a".repeat(64));assert!(receipt(profile,&"d".repeat(64),bad,outputs.clone()).is_err());
   let mut bad=outputs.clone();bad.remove("queue");assert!(receipt(profile,&"d".repeat(64),inputs,bad).is_err());
  }Ok(())
 }
}
