//! Bounded read-only diagnostic using the application's pinned reqwest graph.
//! It cannot dispatch a mutation or load wallet material.
use anyhow::{ensure,Result};
use serde_json::{json,Value};
use std::{fs,io::Write,path::Path,time::{Duration,Instant}};
fn save(path:&Path,bytes:&[u8])->Result<()>{let mut f=fs::OpenOptions::new().create_new(true).write(true).open(path)?;f.write_all(bytes)?;f.sync_all()?;Ok(())}
fn read_wire(bytes:&[u8])->Result<Vec<u8>>{
 ensure!(bytes.len()<=600000,"diagnostic request bound");let v:Value=serde_json::from_slice(bytes)?;
 ensure!(v["jsonrpc"]=="2.0"&&v["id"]==1&&v["method"]=="psy_get_latest_l2_block_state","read-only method required");
 ensure!(v["params"].as_object().is_some_and(|m|m.is_empty()),"read-only params required");
 ensure!(v.as_object().is_some_and(|m|m.len()==5&&m.contains_key("padding")),"exact probe envelope required");
 // Reconstruct the dispatch fields. Even differing duplicate-key parsers
 // cannot reinterpret an input file as a mutation: raw input is never sent.
 let wire=serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"method":"psy_get_latest_l2_block_state","params":{},"padding":v["padding"]}))?;
 ensure!(wire.len()<=600000,"canonical diagnostic request bound");Ok(wire)
}
#[tokio::main]
async fn main()->Result<()>{
 let a:Vec<_>=std::env::args().collect();ensure!(a.len()==4,"READ_JSON OUTPUT_DIRECTORY auto|http1");
 ensure!(matches!(a[3].as_str(),"auto"|"http1"),"invalid transport mode");
 let bytes=read_wire(&fs::read(&a[1])?)?;
 let out=Path::new(&a[2]);fs::create_dir(out)?;
 let mut builder=reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).retry(reqwest::retry::never()).connect_timeout(Duration::from_secs(10)).pool_max_idle_per_host(1).timeout(Duration::from_secs(120));
 if a[3]=="http1"{builder=builder.http1_only();}
 let start=Instant::now();let mut r=builder.build()?.post("https://realm1-stg.psy-protocol.xyz/").header("content-type","application/json").body(bytes.clone()).send().await?;
 let status=r.status().as_u16();let version=format!("{:?}",r.version());let headers=r.headers().iter().filter(|(k,_)|matches!(k.as_str(),"server"|"via"|"content-length"|"content-type")).map(|(k,v)|(k.to_string(),v.to_str().unwrap_or("invalid").to_string())).collect::<std::collections::BTreeMap<_,_>>();
 let mut body=Vec::new();while let Some(chunk)=r.chunk().await?{ensure!(body.len()+chunk.len()<=65536,"response bound");body.extend_from_slice(&chunk);}
 save(&out.join("response.body"),&body)?;let report=json!({"status":status,"httpVersion":version,"headers":headers,"requestBytes":bytes.len(),"milliseconds":start.elapsed().as_millis(),"automaticRetry":false,"mutationSubmitted":false,"mode":a[3]});save(&out.join("report.json"),&serde_json::to_vec_pretty(&report)?)?;println!("{}",report);Ok(())
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn mutation_or_nonempty_params_are_rejected(){for method in["psy_submit_user_end_cap","psy_update_contract","psy_get_user_leaf_data"]{assert!(read_wire(serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":{},"padding":""})).unwrap().as_slice()).is_err());}assert!(read_wire(br#"{"jsonrpc":"2.0","id":1,"method":"psy_get_latest_l2_block_state","params":{"user":1},"padding":""}"#).is_err());}
 #[test]fn duplicate_input_dispatch_fields_cannot_survive_on_the_wire(){let wire=read_wire(br#"{"jsonrpc":"2.0","id":1,"method":"psy_submit_user_end_cap","method":"psy_get_latest_l2_block_state","params":{"fake":"signed payload"},"params":{},"padding":""}"#).unwrap();let text=String::from_utf8(wire).unwrap();assert!(!text.contains("psy_submit_user_end_cap"));assert_eq!(text.matches("\"method\"").count(),1);assert_eq!(text.matches("\"params\"").count(),1);}
}
