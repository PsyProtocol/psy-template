//! Offline compiler wrapper; output directories must be new.
use anyhow::{ensure, Result};
use std::{env, fs, path::PathBuf};
#[path = "../../../../../compiler/private_context.rs"]
mod private_context;
fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    ensure!(args.len() == 3, "compile <source> <new-output-directory>");
    private_context::verify_selected_sdk()?;
    let artifact = private_context::compile(&fs::read_to_string(&args[1])?)?;
    let path = PathBuf::from(&args[2]);
    fs::create_dir(&path)?;
    fs::write(
        path.join("compilation_artifact.json"),
        artifact.to_compilation_artifact_json()?,
    )?;
    fs::write(path.join("abi.json"), artifact.abi_to_json()?)?;
    fs::write(
        path.join("circuit_defs.json"),
        serde_json::to_vec(&artifact.circuit_definitions)?,
    )?;
    fs::write(path.join("contract_code.bin"), artifact.to_bytes()?)?;
    fs::write(path.join("compiler-profile.json"), serde_json::to_vec(&serde_json::json!({
        "profile": private_context::PROFILE,
        "sdkCommit": "01b8f2b0a077367a7b9879baba1a72aea8ab5510",
        "clientCommit": "7058070057c3242b5d8b29e1a31d498aaa4202c0",
        "sdkSourcePatched": false,
        "checkpointRootRead": "GetGlobalStateRoots[8..12]",
        "sessionRootRead": "GetSessionProofTreeRoot",
        "fullUpsVerified": false,
        "broadcast": false
    }))?)?;
    println!(
        "Compiled {} token methods; state tree height {}",
        artifact.method_count(),
        artifact.state_tree_height()
    );
    Ok(())
}
