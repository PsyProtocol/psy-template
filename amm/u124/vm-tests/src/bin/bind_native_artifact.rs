//! Reconstruct the entire captured native dependency, never a selected-method proxy.
//! No network, signing, deployment or authorization is performed.
use anyhow::{ensure, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::PrimeField64},
    hash::poseidon::PoseidonHash as H,
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::{
    config::store_config::C,
    qblock::cmds::deploy_contract::get_code_root_by_code_hashes,
    qdata::contract::{ContractCodeDefinition, PsyContractLeaf},
};
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_vm::dpn::contract::{cfc_code_definition_to_dapen_fc, hash_dpn_function};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, io::Write};
fn write(path: &std::path::Path, v: &Value) -> Result<()> {
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    f.write_all(&serde_json::to_vec_pretty(v)?)?;
    f.write_all(b"\n")?;
    f.sync_all()?;
    Ok(())
}
fn envelope(raw: &[u8]) -> Result<Value> {
    let v: Value = serde_json::from_slice(raw)?;
    ensure!(
        v["jsonrpc"] == "2.0" && v["id"] == 1 && v.get("error").is_none(),
        "exact captured RPC envelope"
    );
    Ok(v["result"].clone())
}
fn main() -> Result<()> {
    let a = std::env::args().collect::<Vec<_>>();
    ensure!(a.len()==7,"NATIVE_LEAF_ENVELOPE NATIVE_CODE_ENVELOPE CANONICAL_LAYOUT_ABI SOURCE_ROOTS_ENVELOPE CONTRACT_MEMBERSHIP_ENVELOPE FRESH_DIRECTORY");
    let leaf_raw = fs::read(&a[1])?;
    let code_raw = fs::read(&a[2])?;
    let abi_raw = fs::read(&a[3])?;
    let leaf: PsyContractLeaf<F> = serde_json::from_value(envelope(&leaf_raw)?)?;
    ensure!(
        leaf.deployer.to_canonical_u64() == 0 && leaf.state_tree_height.to_canonical_u64() == 32,
        "native deployer/height"
    );
    let code: ContractCodeDefinition = serde_json::from_value(envelope(&code_raw)?)?;
    ensure!(
        code.state_tree_height == 32 && !code.functions.is_empty(),
        "complete native code"
    );
    let defs = code
        .functions
        .iter()
        .map(cfc_code_definition_to_dapen_fc)
        .collect::<Result<Vec<_>>>()?;
    let mut ids = BTreeSet::new();
    for (d, c) in defs.iter().zip(&code.functions) {
        ensure!(
            ids.insert(d.method_id)
                && d.method_id == c.method_id
                && d.circuit_inputs.len() == c.num_inputs as usize
                && d.circuit_outputs.len() == c.num_outputs as usize,
            "native bytecode descriptors"
        );
    }
    let code_root = get_code_root_by_code_hashes::<F, H>(
        &defs.iter().map(hash_dpn_function::<F>).collect::<Vec<_>>(),
        15,
    );
    ensure!(
        code_root == leaf.code_root,
        "complete native code root differs"
    );
    let abi: Value = serde_json::from_slice(&abi_raw)?;
    let (layout, fields, slots) =
        psy_template_u124_markets::contract_layout::artifact_layout(0, 32, &abi)?;
    ensure!(
        layout == leaf.state_layout_root
            && fields == leaf.state_layout_field_count.to_canonical_u64()
            && slots == leaf.state_layout_slot_count.to_canonical_u64(),
        "complete native layout endpoints differ"
    );
    let roots_raw = fs::read(&a[4])?;
    let path_raw = fs::read(&a[5])?;
    let roots: psy_client_data::qdata::checkpoint::PsyCheckpointGlobalStateRoots<F> =
        serde_json::from_value(envelope(&roots_raw)?)?;
    let proof: psy_crypto::hash::merkle::core::MerkleProofCore<Q<F>> =
        serde_json::from_value(envelope(&path_raw)?)?;
    let binding = psy_template_u124_markets::live_guard::LiveBinding {
        contract: psy_template_u124_markets::submission_guard::ContractBinding {
            contract_id: 0,
            code_root: leaf.code_root.to_string(),
            layout_root: leaf.state_layout_root.to_string(),
            state_tree_height: 32,
        },
        function_tree_root: leaf.function_tree_root.to_string(),
        layout_field_count: fields,
        layout_slot_count: slots,
    };
    binding.check_membership(&leaf, &proof, roots.contract_tree_root, 0)?;
    let mut whitelist = vec![];
    let mut methods = vec![];
    for d in &defs {
        let circuit = psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit::<C, 2>::new(
            d, 32, 16, false,
        );
        let fingerprint = circuit.get_fingerprint();
        whitelist.push(fingerprint);
        whitelist.push(Q::from_values(
            d.method_id as u64,
            ((d.circuit_outputs.len() as u64) << 32) | d.circuit_inputs.len() as u64,
            0,
            0,
        ));
        methods.push(json!({"name":d.name,"methodId":d.method_id,"inputs":d.circuit_inputs.len(),"outputs":d.circuit_outputs.len(),"fingerprint":fingerprint.to_string()}));
    }
    let function_root = get_code_root_by_code_hashes::<F, H>(&whitelist, 16);
    ensure!(
        function_root == leaf.function_tree_root,
        "entire native function whitelist differs"
    );
    let artifact = json!({"state_tree_height":32,"abi":abi,"circuit_definitions":defs,"scope":"complete captured native dependency; no deployment or spending authorization"});
    let dir = std::path::Path::new(&a[6]);
    fs::create_dir(dir)?;
    write(&dir.join("native.json"), &artifact)?;
    write(
        &dir.join("BINDING.json"),
        &json!({"schema":1,"sdkCommit":"c92880c8b6e2c8d392f19368bc8801a2584fd427","contractId":0,"leaf":leaf,"codeRootVerified":true,"layoutEndpointsVerified":true,"entireFunctionWhitelistVerified":true,"contractMembershipVerifiedRelativeToRoot":true,"contractTreeRoot":roots.contract_tree_root.to_string(),"sourceRootsEnvelopeSha256":format!("{:x}",Sha256::digest(roots_raw)),"contractPathEnvelopeSha256":format!("{:x}",Sha256::digest(path_raw)),"methods":methods,"artifactSha256":format!("{:x}",Sha256::digest(fs::read(dir.join("native.json"))?)),"leafEnvelopeSha256":format!("{:x}",Sha256::digest(leaf_raw)),"codeEnvelopeSha256":format!("{:x}",Sha256::digest(code_raw)),"layoutAbiSha256":format!("{:x}",Sha256::digest(abi_raw)),"completeUpsVerified":false,"checkpointFinalityAuthenticated":false,"financialOperations":0,"liveAuthorization":false}),
    )?;
    Ok(())
}
