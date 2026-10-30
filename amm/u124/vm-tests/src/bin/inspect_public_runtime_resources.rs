//! Read-only captured runtime resource comparison. No RPC or signing path.
use anyhow::{ensure, Result};
use std::{env,fs,io::Read,path::Path};
#[tokio::main]
async fn main() -> Result<()> {
    let a=env::args().collect::<Vec<_>>();
    ensure!(a.len()==3 || (a.len()==4 && a[3]=="ordinary-ups"),"CAPTURED_CIRCUITS_ENVELOPE FRESH_REPORT [ordinary-ups]");
    let path=Path::new(&a[1]);let metadata=fs::symlink_metadata(path)?;
    ensure!(metadata.is_file() && metadata.len()<=psy_template_u124_markets::public_runtime_resources::MAX_CAPTURE_BYTES as u64,"bounded regular capture required");
    let mut bytes=vec![];fs::File::open(path)?.take(psy_template_u124_markets::public_runtime_resources::MAX_CAPTURE_BYTES as u64+1).read_to_end(&mut bytes)?;
    let result=if a.len()==4 {psy_template_u124_markets::public_runtime_resources::inspect_ordinary_ups(&bytes).await}
        else {psy_template_u124_markets::public_runtime_resources::inspect(&bytes)};
    let report=match &result {Ok(report)=>report.clone(),Err(error)=>serde_json::json!({"schema":1,"inspectionPassed":false,"error":format!("{error:#}"),"canSign":false,"canBroadcast":false,"completeTransactionProofVerified":false,"financialOperations":0,"proofsGenerated":0})};
    psy_template_u124_markets::source_plan_receipt::save(Path::new(&a[2]),&report)?;
    println!("{}",serde_json::to_string(&report)?);result.map(|_|())
}
