//! Read-only owned-QA call diagnosis. Proves calls in a local session, never
//! signs an end-cap, creates a broadcast request, or invokes a submit RPC.
use anyhow::{ensure,Context,Result};
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_common::{args::ContractCallData,data::qhashout::QHashOut};
use psy_config::{PsyConfigGoldilocks,PSY_NETWORK_MAGIC};
use psy_prover::session::session::WalletSession;
use psy_template_u124_markets::live_guard::{require_staging,LiveBinding};
use serde_json::{json,Value};use sha2::{Digest,Sha256};use std::{env,fs,path::Path,io::Write};
fn save(p:&Path,v:&Value)->Result<()>{let mut f=fs::OpenOptions::new().write(true).create_new(true).open(p)?;f.write_all(&serde_json::to_vec_pretty(v)?)?;f.sync_all()?;Ok(())}
async fn probe()->Result<()> {
 let a=env::args().collect::<Vec<_>>();ensure!(a.len()==5,"CONFIG OWN_SECRET INPUT FRESH_OUT");let out=Path::new(&a[4]);fs::create_dir(out)?;
 let config=PsyConfigGoldilocks::from_file(&a[1])?;ensure!(config.current_network_name()=="sepolia","isolated QA only");let mut net=config.get_current_network()?.clone();require_staging(&net)?;net.prove_proxy_url.clear();
 let mut s=WalletSession::new(&net).await?;let secret:Value=serde_json::from_slice(&fs::read(&a[2])?)?;ensure!(secret["schema"]=="isolated-market-wallet-v1"&&secret["networkMagic"]==PSY_NETWORK_MAGIC.to_string(),"owned QA identity");
 let private:QHashOut<F>=secret["privateKey"].as_str().context("missing own key")?.parse().map_err(|_|anyhow::anyhow!("key encoding"))?;
 let pk=s.get_zk_public_key(private).await?;let bytes=fs::read(&a[3])?;let input:Value=serde_json::from_slice(&bytes)?;let calls:ContractCallData=serde_json::from_value(input["calls"].clone())?;ensure!(calls.software_defined_call.inputs.is_empty()&&calls.contract_calls.len()<=16,"ordinary calls only");
 let bindings:Vec<LiveBinding>=serde_json::from_value(input["contracts"].clone())?;for b in &bindings{b.check(&s.st_provider).await?;}
 let key=s.add_user(private,pk.fingerprint).await?;s.start_session(key).await?;
 let mut rows=vec![];for(index,call)in calls.contract_calls.into_iter().enumerate(){let cid=call.contract_id;let started=std::time::Instant::now();let result=s.prove_contract_call(key,vec![call]).await;
  let failure=result.as_ref().err().map(|e|format!("{:x}",Sha256::digest(format!("{e:#}").as_bytes())));
  let row=json!({"index":index,"contractId":cid,"localCallProved":result.is_ok(),"elapsedMs":started.elapsed().as_millis(),"suppressedErrorSha256":failure,"broadcast":false});save(&out.join(format!("call-{index}.json")),&row)?;rows.push(row);
  if result.is_err(){save(&out.join("RESULT.json"),&json!({"calls":rows,"failedCallIndex":index,"inputSha256":format!("{:x}",Sha256::digest(&bytes)),"signedEndcap":false,"broadcast":false}))?;return Ok(());}
 }
 save(&out.join("RESULT.json"),&json!({"calls":rows,"failedCallIndex":null,"signedEndcap":false,"broadcast":false}))?;Ok(())
}
#[tokio::main]async fn main(){if let Err(e)=probe().await{eprintln!("read-only probe stopped; error suppressed SHA256 {:x}",Sha256::digest(format!("{e:#}").as_bytes()));std::process::exit(1);}}
