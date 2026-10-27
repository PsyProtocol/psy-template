use anyhow::{ensure,Result};use std::{env,fs,io::Write};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::config::store_config::F;
use psy_compiler::output::serialize::CompilationArtifact;
use psy_template_u124_markets::layout_preflight::{prepare_initial,verify_initial};
fn save(p:&str,v:&impl serde::Serialize)->Result<()>{let mut f=fs::OpenOptions::new().write(true).create_new(true).open(p)?;f.write_all(&serde_json::to_vec(v)?)?;f.sync_all()?;Ok(())}
fn main()->Result<()>{let a:Vec<String>=env::args().collect();ensure!([5,6].contains(&a.len()),"preflight_nft_initial prepare <artifact> <deployer-user-id> <new-request> | verify <artifact> <deployer-user-id> <request> <new-report>");let artifact:CompilationArtifact=serde_json::from_slice(&fs::read(&a[2])?)?;let deployer=a[3].parse::<u64>()?;match a[1].as_str(){"prepare"=>{ensure!(a.len()==5,"prepare arguments");save(&a[4],&prepare_initial(artifact,deployer)?)?;println!("prepared initial deployment proof; not submitted");},"verify"=>{ensure!(a.len()==6,"verify arguments");let cmd=serde_json::from_slice(&fs::read(&a[4])?)?;save(&a[5],&verify_initial(&artifact,&cmd,deployer)?)?;println!("verified empty initial layout, deployer, code and ABI; not submitted");},_=>anyhow::bail!("initial deployments only")};Ok(())}
