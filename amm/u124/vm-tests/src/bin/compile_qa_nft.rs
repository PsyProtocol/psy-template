//! Compile only a fresh, canonical QA NFT with the frozen application SDK.
use anyhow::{ensure, Result};
use std::{env,fs,path::Path};
fn main()->Result<()> {
    let a:Vec<_>=env::args().collect();ensure!(a.len()==3,"SOURCE FRESH_OUTPUT");
    let source=fs::read_to_string(&a[1])?;
    let artifact=psy_compiler::compile(&source)?;
    ensure!(artifact.state_tree_height()==30,"canonical NFT layout height");
    psy_template_u124_markets::layout_preflight::verify_abi_layout(&artifact.abi_to_json()?)?;
    let out=Path::new(&a[2]);fs::create_dir(out)?;
    fs::write(out.join("compilation_artifact.json"),artifact.to_compilation_artifact_json()?)?;
    println!("Compiled {} fresh QA NFT methods; not deployed",artifact.method_count());Ok(())
}
