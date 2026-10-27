//! Decode a captured native code definition; never compile/update native code.
use anyhow::{ensure, Result};
use psy_client_data::qdata::contract::ContractCodeDefinition;
use std::{env, fs, io::Write};
fn main() -> Result<()> {
    let a = env::args().collect::<Vec<_>>();
    ensure!(a.len() == 3, "CAPTURED_NATIVE_CODE FRESH_OUTPUT");
    let input: serde_json::Value = serde_json::from_slice(&fs::read(&a[1])?)?;
    ensure!(
        input["jsonrpc"] == "2.0" && input["id"] == 1 && input.get("error").is_none(),
        "exact successful captured RPC envelope"
    );
    let code: ContractCodeDefinition = serde_json::from_value(input["result"].clone())?;
    ensure!(code.state_tree_height == 32, "native height");
    let definitions = code
        .functions
        .iter()
        .map(psy_vm::dpn::contract::cfc_code_definition_to_dapen_fc)
        .collect::<Result<Vec<_>>>()?;
    let output = serde_json::json!({"state_tree_height":32,"circuit_definitions":definitions,"abi":null,
  "scope":"decoded deployed native bytecode; not a compiler ABI, source approval, deployment request or complete proof"});
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&a[2])?;
    file.write_all(&serde_json::to_vec_pretty(&output)?)?;
    file.sync_all()?;
    Ok(())
}
