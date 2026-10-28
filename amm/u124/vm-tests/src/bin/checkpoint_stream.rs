//! Offline conditional set/order proof tool. No wallet, signing or RPC capability.
use anyhow::{ensure,Result};
use std::{fs,path::Path,io::{Read,Write}};
use bincode::Options;
use psy_template_u124_markets::checkpoint_stream::{Manifest,PageInput,PageCircuit,Proof,prepare,verify_chain};
fn save(path:&Path,v:&impl serde::Serialize)->Result<()>{save_bytes(path,&serde_json::to_vec_pretty(v)?)}
fn save_bytes(path:&Path,bytes:&[u8])->Result<()>{let mut file=fs::OpenOptions::new().write(true).create_new(true).open(path)?;file.write_all(bytes)?;file.sync_all()?;fs::File::open(path.parent().unwrap())?.sync_all()?;Ok(())}
fn bounded(path:&Path,max:u64)->Result<Vec<u8>>{let mut out=vec![];fs::File::open(path)?.take(max+1).read_to_end(&mut out)?;ensure!(out.len()as u64<=max,"bounded stream artifact");Ok(out)}
fn load_proof(path:&Path)->Result<Proof>{Ok(bincode::DefaultOptions::new().with_fixint_encoding().with_limit(2*1024*1024).reject_trailing_bytes().deserialize(&bounded(path,2*1024*1024)?)?)}
fn canonical(dir:&Path)->Result<(Manifest,Vec<PageInput>,[Vec<u8>;2])>{
 let bytes=[bounded(&dir.join("manifest.json"),4*1024*1024)?,bounded(&dir.join("pages.json"),64*1024*1024)?];
 let manifest:Manifest=serde_json::from_slice(&bytes[0])?;
 let pages:Vec<PageInput>=serde_json::from_slice(&bytes[1])?;
 let(m,expected)=prepare(manifest.clone())?;
 ensure!(m.fields==manifest.fields&&serde_json::to_value(&pages)?==serde_json::to_value(expected)?,"exact original stream preparation");Ok((manifest,pages,bytes))
}
fn main()->Result<()>{
 let args=std::env::args().collect::<Vec<_>>();ensure!(args.len()==4,"prepare INPUT FRESH_OUT | prove PREPARED_DIR PROOF_DIR | verify PROOF_DIR FRESH_REPORT");
 if args[1]=="prepare"{
  let bytes=bounded(Path::new(&args[2]),4*1024*1024)?;
  let(manifest,pages)=prepare(serde_json::from_slice::<Manifest>(&bytes)?)?;
  let out=Path::new(&args[3]);fs::create_dir(out)?;
  save(&out.join("manifest.json"),&manifest)?;save(&out.join("pages.json"),&pages)?;
  save(&out.join("scope.json"),&serde_json::json!({"version":1,"members":manifest.members.len(),"pages":pages.len(),"pageCapacity":4,"rawBlockCoverageAuthenticated":false,"canSign":false,"canBroadcast":false,"fullUpsVerified":false,"scope":"conditional finite-set proposal; no block-wide inclusion or financial authorization"}))?;
  return Ok(());
 }
 ensure!(["prove","verify"].contains(&args[1].as_str()),"offline action only");
 let input=Path::new(&args[2]);let(manifest,pages,captured)=canonical(input)?;
 let out=Path::new(&args[3]);
 if args[1]=="prove"{
  match fs::create_dir(out){Ok(())=>{},Err(e)if e.kind()==std::io::ErrorKind::AlreadyExists=>{},Err(e)=>return Err(e.into())}
  // This native ownership file survives termination. A second native process
  // cannot start overlapping proofs after its parent Executor has died.
  // An interrupted owner needs inspection; there is no automatic lock removal.
  save(&out.join("native-owner.json"),&serde_json::json!({"pid":std::process::id(),"purpose":"conditional stream proofs only; no funds or account nonce"}))?;
  for(name,bytes)in["manifest.json","pages.json"].iter().zip(&captured){
   let target=out.join(name);
   if target.exists(){ensure!(bounded(&target,64*1024*1024)?==*bytes,"original proof job changed");}else{save_bytes(&target,bytes)?;}
  }
 }
 let dir=if args[1]=="prove"{out}else{input};let c=PageCircuit::build();let mut proofs=vec![];let(mut generated,mut reused)=(0,0);
 for(i,page)in pages.iter().enumerate(){
  let path=dir.join(format!("page-{i}.bin"));
  let proof=if args[1]=="prove"&&!path.exists(){let p=c.prove(page)?;c.verify(page,p.clone())?;save_bytes(&path,&bincode::serialize(&p)?)?;generated+=1;p}else{let p=load_proof(&path)?;c.verify(page,p.clone())?;reused+=1;p};proofs.push(proof);
 }
 let state=verify_chain(&c,&manifest,&pages,proofs)?;
 for(name,bytes)in["manifest.json","pages.json"].iter().zip(&captured){ensure!(bounded(&dir.join(name),64*1024*1024)?==*bytes,"saved stream preparation changed during verification");}
 let report=serde_json::json!({"conditionalOrderChainVerified":true,"members":state.cursor,"orderedRoot":state.ordered,"rawBlockCoverageAuthenticated":false,"canSign":false,"canBroadcast":false,"fullUpsVerified":false,"networkAcceptance":false});
 if args[1]=="prove"{
  let target=out.join("verification.json");if target.exists(){let old:serde_json::Value=serde_json::from_slice(&bounded(&target,65536)?)?;ensure!(old==report,"saved stream verification changed");}else{save(&target,&report)?;}
  fs::remove_file(out.join("native-owner.json"))?;fs::File::open(out)?.sync_all()?;
 }else{save(out,&report)?;}
 println!("{}",serde_json::json!({"proofsGenerated":generated,"proofsReused":reused,"rawBlockCoverageAuthenticated":false,"canBroadcast":false}));Ok(())
}
