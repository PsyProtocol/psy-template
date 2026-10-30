//! Operator-owned, read-only public delivery CLI. Never installs external keys.
use anyhow::{ensure,Result};
use psy_template_u124_markets::checkpoint_delivery::{self as delivery};
use std::{fs,io::Write,path::Path};
fn main()->Result<()>{
 let a=std::env::args().collect::<Vec<_>>();
 ensure!(a.len()==3||a.len()==5,"export FRESH_DIRECTORY | verify DELIVERY_DIRECTORY REVIEWED_MANIFEST_SHA256 FRESH_REPORT");
 if a.len()==3{ensure!(a[1]=="export","export action required");delivery::export(Path::new(&a[2]))?;return Ok(());}
 ensure!(a[1]=="verify","verify action required");
 // Reserve output before inspecting inputs. No secret/unknown input is echoed.
 let mut file=fs::OpenOptions::new().create_new(true).write(true).open(&a[4])?;
 let outcome=delivery::verify(Path::new(&a[2]),&a[3]);
 let mut report=match &outcome{Ok(v)=>v.clone(),Err(_)=>delivery::denied()};
 report["requestedManifestSha256"]=a[3].clone().into();
 if let Err(e)=&outcome{report["error"]=format!("{e:#}").into();}
 file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.write_all(b"\n")?;file.sync_all()?;
 outcome.map(|_|()).map_err(|_|anyhow::anyhow!("delivery rejected; immutable non-authorizing report saved"))
}
