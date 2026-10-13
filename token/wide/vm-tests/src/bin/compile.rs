//! Offline compiler wrapper; output directories must be new.
use anyhow::{ensure,Result};
use std::{env,fs,path::PathBuf};
fn main()->Result<()>{
 let args:Vec<String>=env::args().collect();ensure!(args.len()==3,"compile <source> <new-output-directory>");
 let artifact=psy_compiler::compile(&fs::read_to_string(&args[1])?)?;let path=PathBuf::from(&args[2]);fs::create_dir(&path)?;
 fs::write(path.join("compilation_artifact.json"),artifact.to_compilation_artifact_json()?)?;
 fs::write(path.join("abi.json"),artifact.abi_to_json()?)?;
 fs::write(path.join("circuit_defs.json"),serde_json::to_vec(&artifact.circuit_definitions)?)?;
 fs::write(path.join("contract_code.bin"),artifact.to_bytes()?)?;
 println!("Compiled {} public methods; state tree height {}",artifact.method_count(),artifact.state_tree_height());Ok(())
}
