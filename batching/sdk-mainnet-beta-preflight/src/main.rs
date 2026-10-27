//! Offline native-protocol checks for the user-selected upstream SDK.
//! This consumer has no transport, signing, wallet, deploy or fee-spending path.
use anyhow::{ensure, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::PrimeField64},
    hash::poseidon::PoseidonHash,
};
use psy_client_data::{
    qblock::cmds::deploy_contract::get_code_root_by_code_hashes,
    qdata::contract::{ContractCodeDefinition, PsyContractLeaf},
};
use psy_config::network_constants::{CONTRACT_FUNCTION_TREE_HEIGHT, TOKEN_BURN_METHOD_ID};
use psy_vm::dpn::contract::{cfc_code_definition_to_dapen_fc, hash_dpn_function};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, io::Write};

fn envelope(bytes: &[u8]) -> Result<Value> {
    let value: Value = serde_json::from_slice(bytes)?;
    ensure!(value["jsonrpc"] == "2.0" && value["id"] == 1
        && value.get("error").is_none() && value.get("result").is_some(),
        "successful exact RPC envelope required");
    Ok(value["result"].clone())
}

fn verify_native(leaf_value: Value, code_value: Value) -> Result<Value> {
    let leaf: PsyContractLeaf<F> = serde_json::from_value(leaf_value)?;
    let code: ContractCodeDefinition = serde_json::from_value(code_value)?;
    ensure!(leaf.deployer.to_canonical_u64() == 0, "native owner must be zero");
    ensure!(leaf.state_tree_height.to_canonical_u64() == 32 && code.state_tree_height == 32,
        "native state height differs");
    let mut methods = vec![];
    let mut hashes = vec![];
    let mut ids = BTreeSet::new();
    for definition in &code.functions {
        ensure!(ids.insert(definition.method_id), "duplicate native method ID");
        let decoded = cfc_code_definition_to_dapen_fc(definition)?;
        ensure!(decoded.method_id == definition.method_id
            && decoded.circuit_inputs.len() == definition.num_inputs as usize
            && decoded.circuit_outputs.len() == definition.num_outputs as usize,
            "native bytecode metadata differs");
        methods.push(json!({"name":decoded.name,"methodId":decoded.method_id,
            "inputs":definition.num_inputs,"outputs":definition.num_outputs}));
        hashes.push(hash_dpn_function::<F>(&decoded));
    }
    let root = get_code_root_by_code_hashes::<F, PoseidonHash>(
        &hashes, CONTRACT_FUNCTION_TREE_HEIGHT - 1);
    ensure!(root == leaf.code_root, "recomputed native code root differs");
    for (name, inputs, id) in [("transfer",2,2789897329u32),
        ("claim",1,3824212239u32),("burn",1,TOKEN_BURN_METHOD_ID)] {
        ensure!(methods.iter().any(|m|m["name"] == name && m["methodId"] == id
            && m["inputs"] == inputs && m["outputs"] == 0),
            "required native method differs: {name}");
    }
    Ok(json!({"nativeLeafSchema":true,"numericDeployer":leaf.deployer.to_canonical_u64(),
        "nativeMethods":methods,"nativeCodeRoot":root.to_string(),"nativeCodeRootMatches":true,
        "sdkAutomaticBurnMethodId":TOKEN_BURN_METHOD_ID,"sdkAutomaticBurnSupported":true}))
}

fn main() -> Result<()> {
    let args = std::env::args().collect::<Vec<_>>();
    ensure!(args.len() == 4, "PUBLIC_NATIVE_LEAF PUBLIC_NATIVE_CODE FRESH_REPORT");
    let leaf = fs::read(&args[1])?;
    let code = fs::read(&args[2])?;
    let checked = verify_native(envelope(&leaf)?, envelope(&code)?);
    let report = json!({"schema":1,"sdkBranch":"mainnet-beta",
        "sdkCommit":"c92880c8b6e2c8d392f19368bc8801a2584fd427",
        "clientCommit":"b280d714a8f0930c61962c885374ea63ea63d274",
        "compiledNetwork":psy_config::CURRENT_NETWORK,
        "compiledNetworkMagic":psy_config::PSY_NETWORK_MAGIC.to_string(),
        "nativeLeafSha256":format!("{:x}",Sha256::digest(&leaf)),
        "nativeCodeSha256":format!("{:x}",Sha256::digest(&code)),
        "necessaryNativeChecksPassed":checked.is_ok(),
        "checks":checked.as_ref().ok(),"error":checked.as_ref().err().map(ToString::to_string),
        "financialReady":false,"fullUpsVerified":false,"runtimeKeyAttested":false,
        "financialOperations":0,"networkRequests":0,
        "scope":"Exact selected upstream native decoding only; no full SDK release, signature/circuit attestation or live deployment acceptance"});
    let mut out = fs::OpenOptions::new().write(true).create_new(true).open(&args[3])?;
    out.write_all(&serde_json::to_vec_pretty(&report)?)?;
    out.write_all(b"\n")?;
    out.sync_all()?;
    println!("{}",json!({"necessaryNativeChecksPassed":checked.is_ok(),"financialReady":false}));
    checked?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selected_sdk_uses_numeric_owner_and_new_burn_id() {
        let leaf = PsyContractLeaf::<F>::default();
        let value = serde_json::to_value(leaf).unwrap();
        assert_eq!(value["deployer"], 0);
        assert_eq!(TOKEN_BURN_METHOD_ID,3998182541);
        assert!(serde_json::from_value::<PsyContractLeaf<F>>(value).is_ok());
    }
    #[test]
    fn old_hash_owner_is_not_coerced_into_a_user_id() {
        let mut value = serde_json::to_value(PsyContractLeaf::<F>::default()).unwrap();
        value["deployer"] = json!("0000000000000000000000000000000000000000000000000000000000000000");
        assert!(serde_json::from_value::<PsyContractLeaf<F>>(value).is_err());
    }
    #[test]
    fn error_or_wrong_identity_cannot_become_an_rpc_result() {
        for value in [json!({"jsonrpc":"2.0","id":1,"error":{"code":-1}}),
            json!({"jsonrpc":"2.0","id":2,"result":{}})] {
            assert!(envelope(&serde_json::to_vec(&value).unwrap()).is_err());
        }
    }
}
