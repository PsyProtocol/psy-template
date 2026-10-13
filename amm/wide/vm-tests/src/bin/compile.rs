//! Local compilation only. Refuse to reuse an output directory.
use anyhow::{ensure, Result};
use std::{env, fs, path::PathBuf};
fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    ensure!(args.len()==3, "usage: compile <source> <new-output-directory>");
    let output=psy_compiler::compile(&fs::read_to_string(&args[1])?)?;
    let path=PathBuf::from(&args[2]);
    fs::create_dir(&path)?;
    fs::write(path.join("compilation_artifact.json"), output.to_compilation_artifact_json()?)?;
    fs::write(path.join("abi.json"), output.abi_to_json()?)?;
    fs::write(path.join("circuit_defs.json"),serde_json::to_vec(&output.circuit_definitions)?)?;
    fs::write(path.join("contract_code.bin"),output.to_bytes()?)?;
    println!("Compiled {} methods, tree height {}, canonical layout included",output.method_count(),output.state_tree_height());
    Ok(())
}
