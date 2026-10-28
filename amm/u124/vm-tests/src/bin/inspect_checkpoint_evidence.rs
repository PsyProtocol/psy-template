//! Source-owned proof resources; no caller-provided key, network access or finality claim.
use anyhow::{ensure,Result};
use psy_template_u124_markets::checkpoint_evidence::{CheckpointOpening,decode_proof,inspect,resource_inventory};
use sha2::{Digest,Sha256};
use std::{fs,io::{Read,Write}};
fn read(path:&str,limit:u64)->Result<Vec<u8>>{let mut b=Vec::new();fs::File::open(path)?.take(limit+1).read_to_end(&mut b)?;ensure!(b.len()as u64<=limit,"bounded checkpoint evidence input");Ok(b)}
fn main()->Result<()>{
 let a=std::env::args().collect::<Vec<_>>();ensure!(a.len()==3||a.len()==5,"resources FRESH_REPORT | OPENING CURRENT_PROOF PREVIOUS_PROOF_OR_DASH FRESH_REPORT");
 let mut failure=None;
 let(report,path)=if a.len()==3{ensure!(a[1]=="resources","resource action required");(resource_inventory()?,&a[2])}else{
  let opening_bytes=read(&a[1],131072)?;let opening:CheckpointOpening=serde_json::from_slice(&opening_bytes)?;let proof=read(&a[2],2000000)?;let previous_bytes=if a[3]=="-"{None}else{Some(read(&a[3],2000000)?)};let previous=previous_bytes.as_deref().map(decode_proof).transpose()?;
  let mut report=match inspect(&opening,decode_proof(&proof)?,previous){Ok(value)=>value,Err(e)=>{failure=Some(format!("{e:#}"));serde_json::json!({"schema":1,"scope":"failed checkpoint evidence inspection, not a finality or chain-validity conclusion","inspectionPassed":false,"error":format!("{e:#}"),"resources":resource_inventory()?,"checkpointCircuitProofVerified":false,"numericPredecessorAdjacencyVerified":false,"latestPositionVerified":false,"historyPrefixAnchored":false,"canonicalGenesisVerified":false,"chainDomainAuthenticated":false,"finalityVerified":false,"qualifiedSource":false,"causalSealVerified":false,"randomAuthorization":false,"financialOperations":0,"proofsGenerated":0,"broadcast":false})}};
  report["openingSha256"]=format!("{:x}",Sha256::digest(&opening_bytes)).into();report["proofSha256"]=format!("{:x}",Sha256::digest(&proof)).into();report["previousProofSha256"]=previous_bytes.as_ref().map(|b|format!("{:x}",Sha256::digest(b))).into();(report,&a[4])
 };
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(path)?;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.write_all(b"\n")?;file.sync_all()?;if let Some(error)=failure{anyhow::bail!("{error}; failed report preserved");}Ok(())
}
