//! Read-only captured runtime resource comparison. No RPC or signing path.
use anyhow::{ensure, Result};
use std::{env,fs,io::Read,path::Path};
fn main() -> Result<()> {
    let a=env::args().collect::<Vec<_>>();
    ensure!(a.len()==3,"CAPTURED_CIRCUITS_ENVELOPE FRESH_REPORT");
    let path=Path::new(&a[1]);let metadata=fs::symlink_metadata(path)?;
    ensure!(metadata.is_file() && metadata.len()<=psy_template_u124_markets::public_runtime_resources::MAX_CAPTURE_BYTES as u64,"bounded regular capture required");
    let mut bytes=vec![];fs::File::open(path)?.take(psy_template_u124_markets::public_runtime_resources::MAX_CAPTURE_BYTES as u64+1).read_to_end(&mut bytes)?;
    let report=psy_template_u124_markets::public_runtime_resources::inspect(&bytes)?;
    psy_template_u124_markets::source_plan_receipt::save(Path::new(&a[2]),&report)?;
    println!("{}",serde_json::to_string(&report)?);Ok(())
}
