//! Verify captured native layout and unchanged selected public methods. No RPC,
//! wallet, deployment, update, signing, proof generation or SDK source change.
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::PrimeField64},
    hash::poseidon::PoseidonHash as H,
};
use psy_client_data::{
    qblock::cmds::deploy_contract::get_code_root_by_code_hashes, qdata::contract::PsyContractLeaf,
};
use psy_vm::dpn::{contract::hash_dpn_function, vm::def::DPNFunctionCircuitDefinition};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, fs, io::Write};
fn main() -> Result<()> {
    let a = env::args().collect::<Vec<_>>();
    ensure!(a.len()==8,"NATIVE_LEAF_ENVELOPE DECODED_NATIVE LAYOUT_ABI PRIOR_NATIVE CIRCUITS_ENVELOPE FUNCTION_PROOF_CAPTURE FRESH_REPORT");
    let raw = fs::read(&a[1])?;
    let envelope: Value = serde_json::from_slice(&raw)?;
    ensure!(
        envelope["jsonrpc"] == "2.0" && envelope["id"] == 1 && envelope.get("error").is_none(),
        "captured native response"
    );
    let leaf: PsyContractLeaf<F> = serde_json::from_value(envelope["result"].clone())?;
    ensure!(
        leaf.deployer.to_canonical_u64() == 0 && leaf.state_tree_height.to_canonical_u64() == 32,
        "native identity/height"
    );
    let artifact: Value = serde_json::from_slice(&fs::read(&a[2])?)?;
    let defs: Vec<DPNFunctionCircuitDefinition> =
        serde_json::from_value(artifact["circuit_definitions"].clone())?;
    let root = get_code_root_by_code_hashes::<F, H>(
        &defs.iter().map(hash_dpn_function::<F>).collect::<Vec<_>>(),
        15,
    );
    ensure!(root == leaf.code_root, "captured native code root");
    let abi = fs::read(&a[3])?;
    let abi_value: Value = serde_json::from_slice(&abi)?;
    let (layout, fields, slots) =
        psy_template_u124_markets::contract_layout::artifact_layout(0, 32, &abi_value)?;
    ensure!(
        layout == leaf.state_layout_root
            && fields == leaf.state_layout_field_count.to_canonical_u64()
            && slots == leaf.state_layout_slot_count.to_canonical_u64(),
        "canonical native ABI layout mismatch"
    );
    let proxy_raw = fs::read(&a[5])?;
    let proxy: Value = serde_json::from_slice(&proxy_raw)?;
    ensure!(
        proxy["jsonrpc"] == "2.0" && proxy["id"] == 1 && proxy.get("error").is_none(),
        "captured circuit metadata response"
    );
    let remote: psy_provider::provider::LocalCommonCircuitsData<F> = serde_json::from_str(
        proxy["result"]
            .as_str()
            .context("SDK circuit response must contain encoded JSON")?,
    )?;
    let fingerprint = psy_template_u124_markets::fixed_verifier::with_verifier(|fixed| {
        use psy_client_data::config::store_config::C;
        use psy_plonky2_circuits::proof_minifier::pm_core::get_circuit_fingerprint_generic_q;
        let fp = get_circuit_fingerprint_generic_q::<2, F, C>(&fixed.verifier_only);
        ensure!(
            remote
                .ups_end_cap
                .verifier_config
                .to_verifier_data::<C, 2>()
                == fixed.verifier_only
                && remote.ups_end_cap.fingerprint.0.elements == fp.0.elements,
            "service Endcap differs from frozen verifier"
        );
        Ok(fp.to_string())
    })?;
    let prior: Value = serde_json::from_slice(&fs::read(&a[4])?)?;
    let proofs_raw = fs::read(&a[6])?;
    let capture: Value = serde_json::from_slice(&proofs_raw)?;
    let rows = capture["rows"]
        .as_array()
        .context("selected native function proofs")?;
    ensure!(rows.len() == 3, "exact selected native function proof set");
    let mut methods = vec![];
    for (name, id, arity) in [
        ("transfer", 2789897329u32, 2),
        ("claim", 3824212239u32, 1),
        ("burn", 3998182541u32, 1),
    ] {
        let d = defs
            .iter()
            .find(|d| d.name == name)
            .ok_or_else(|| anyhow::anyhow!("selected native method missing"))?;
        let old = prior["circuit_definitions"]
            .as_array()
            .context("prior native definitions")?
            .iter()
            .find(|v| v["name"] == name)
            .context("prior selected native method")?;
        ensure!(
            serde_json::to_value(d)? == *old
                && d.method_id == id
                && d.circuit_inputs.len() == arity
                && d.circuit_outputs.is_empty(),
            "selected public native method changed"
        );
        let index = defs
            .iter()
            .position(|f| f.name == name)
            .context("selected function index")?;
        let selected = rows
            .iter()
            .filter(|r| r["name"] == name)
            .collect::<Vec<_>>();
        ensure!(selected.len() == 1, "unique selected function proof");
        let row = selected[0];
        ensure!(
            row["httpStatus"] == 200
                && row["index"] == 2 * index
                && row["request"]["method"] == "psy_get_contract_function_tree_merkle_proof"
                && row["request"]["params"]["contract_id"] == 0
                && row["request"]["params"]["function_id"] == 2 * index,
            "captured function proof request binding"
        );
        let response = &row["response"];
        ensure!(
            response["jsonrpc"] == "2.0" && response["id"] == 1 && response.get("error").is_none(),
            "function proof response"
        );
        let proof: psy_crypto::hash::merkle::core::MerkleProofCore<
            psy_client_common::data::qhashout::QHashOut<F>,
        > = serde_json::from_value(response["result"].clone())?;
        use psy_client_data::config::store_config::C;
        use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
        let circuit = psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit::<C, 2>::new(
            d, 32, 16, false,
        );
        let fp = circuit.get_fingerprint();
        let descriptor = psy_client_common::data::qhashout::QHashOut::<F>::from_values(
            id as u64,
            arity as u64,
            0,
            0,
        );
        ensure!(
            proof.index == 2 * index as u64
                && proof.siblings.len() == 16
                && proof.value == fp
                && proof.siblings[0] == descriptor
                && proof.root == leaf.function_tree_root
                && proof.verify::<H>(),
            "selected native function membership differs from frozen bytecode circuit"
        );
        methods.push(json!({"name":name,"methodId":id,"definitionUnchanged":true,"codeHash":hash_dpn_function::<F>(d).to_string(),"fingerprint":fp.to_string(),"membershipVerified":true}));
    }
    let report = json!({"schema":1,"nativeCodeRoot":root.to_string(),"layoutRoot":leaf.state_layout_root.to_string(),"fields":fields,"slots":slots,"layoutAbiSha256":format!("{:x}",Sha256::digest(&abi)),"layoutVerified":true,"serviceEndcapVerifierMatches":true,"endcapFingerprint":fingerprint,"commonDataSource":"fixed frozen SDK; service does not publish common data","circuitsResponseSha256":format!("{:x}",Sha256::digest(&proxy_raw)),"selectedPublicMethods":methods,"abiScope":"state/type layout only; method ABI is not accepted as actual call descriptors","nativeFunctionWhitelistVerified":false,"selectedNativeFunctionMembershipVerified":true,"functionProofCaptureSha256":format!("{:x}",Sha256::digest(&proofs_raw)),"completeUpsVerified":false,"runtimeAttested":false,"financialOperations":0});
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&a[7])?;
    f.write_all(&serde_json::to_vec_pretty(&report)?)?;
    f.sync_all()?;
    Ok(())
}
