//! Build verifier-only resources from exact reviewed local bytecode. No RPC,
//! private key, witness, proving job, deployment or broadcast.
use anyhow::{ensure, Result};
use plonky2::{
    field::goldilocks_field::GoldilocksField as F,
    hash::poseidon::PoseidonHash as H,
    plonk::config::PoseidonGoldilocksConfig as C,
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::qblock::cmds::deploy_contract::get_code_root_by_code_hashes;
use psy_client_data::qblock::cmds::deploy_contract::QBCDeployContractWithRoot;
use psy_client_data::qdata::contract::ContractCodeDefinition;
use psy_common_circuit::circuits::{
    traits::qstandard::QStandardCircuit, zk_signature3::core::PsyBasicZKSignatureCircuit,
};
use psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit;
use psy_template_u124_markets::{
    live_guard::LiveBinding,
    wallet_verification::{ContractVerifier, MethodVerifier},
    wallet_verifier_export::{encode_verifier, export_fixed_verifiers},
};
use psy_ups_circuit::circuit_manager::core::PsyUPSStepCircuitManager;
use psy_vm::dpn::{
    contract::{dapen_fc_to_cfc_code_definition, hash_dpn_function},
    vm::def::DPNFunctionCircuitDefinition,
};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, env, fs, io::Write, path::Path, time::Instant};
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ReviewedArtifact {
    file: String,
    sha256: String,
    binding: LiveBinding,
    methods: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReviewedContractArtifacts {
    artifacts: Vec<ReviewedArtifact>,
}
fn save(p: &Path, v: &impl serde::Serialize) -> Result<()> {
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(p)?;
    f.write_all(&serde_json::to_vec_pretty(v)?)?;
    f.sync_all()?;
    Ok(())
}
fn main() -> Result<()> {
    let args = env::args().collect::<Vec<_>>();
    ensure!(
        args.len() == 3,
        "REVIEWED_ARTIFACTS_JSON FRESH_VERIFIER_DIRECTORY"
    );
    let inputs: ReviewedContractArtifacts = serde_json::from_slice(&fs::read(&args[1])?)?;
    ensure!(
        !inputs.artifacts.is_empty() && inputs.artifacts.len() <= 16,
        "bounded exact reviewed source set"
    );
    let out = Path::new(&args[2]);
    fs::create_dir(out)?;
    let start = Instant::now();
    let cm = PsyUPSStepCircuitManager::<C, 2>::new_with_config(psy_config::PSY_NETWORK_MAGIC);
    let mut pack = export_fixed_verifiers(&cm, &PsyBasicZKSignatureCircuit::<C, 2>::new())?;
    let mut ids = BTreeSet::new();
    let mut sources = vec![];
    for source in &inputs.artifacts {
        let expected = &source.binding;
        let cid = expected.contract.contract_id;
        let height = expected.contract.state_tree_height;
        ensure!(
            cid < 16777216 && ids.insert(cid) && [30, 31, 32].contains(&height),
            "unique reviewed identity and supported height"
        );
        let bytes = fs::read(&source.file)?;
        ensure!(
            format!("{:x}", Sha256::digest(&bytes)) == source.sha256,
            "reviewed bytecode bytes changed"
        );
        let a: serde_json::Value = serde_json::from_slice(&bytes)?;
        let defs: Vec<DPNFunctionCircuitDefinition> =
            serde_json::from_value(a["circuit_definitions"].clone())?;
        ensure!(
            !defs.is_empty()
                && defs.len() <= 1024
                && a["state_tree_height"].as_u64() == Some(height as u64),
            "source function/state-height bounds"
        );
        ensure!(
            defs.iter()
                .map(|d| d.method_id)
                .collect::<BTreeSet<_>>()
                .len()
                == defs.len()
                && defs.iter().map(|d| &d.name).collect::<BTreeSet<_>>().len() == defs.len(),
            "duplicate source methods"
        );
        let code_root = get_code_root_by_code_hashes::<F, H>(
            &defs.iter().map(hash_dpn_function::<F>).collect::<Vec<_>>(),
            15,
        );
        ensure!(
            code_root.to_string() == expected.contract.code_root,
            "source code root differs from reviewed contract"
        );
        let (layout, fields, slots) = psy_template_u124_markets::contract_layout::artifact_layout(
            cid, height as usize, &a["abi"],
        )?;
        ensure!(
            layout.to_string() == expected.contract.layout_root
                && fields == expected.layout_field_count
                && slots == expected.layout_slot_count,
            "source layout differs from reviewed contract"
        );
        let selected = source.methods.iter().collect::<BTreeSet<_>>();
        ensure!(
            !selected.is_empty() && selected.len() == source.methods.len(),
            "unique selected source methods required"
        );
        ensure!(
            selected.iter().all(|n| defs.iter().any(|d| d.name.as_str() == n.as_str())),
            "selected source method absent"
        );
        let mut whitelist = vec![];
        let mut methods = vec![];
        for (index, d) in defs.iter().enumerate() {
            // Build every fingerprint for the complete source whitelist, but drop each
            // proving resource before the next method. Only verifier bytes are retained.
            let c = DapenContractFunctionCircuit::<C, 2>::new(d, height as usize, 16, false);
            let fingerprint = c.get_fingerprint();
            whitelist.push(fingerprint);
            whitelist.push(Q::from_values(
                d.method_id as u64,
                ((d.circuit_outputs.len() as u64) << 32) | d.circuit_inputs.len() as u64,
                0,
                0,
            ));
            if selected.contains(&d.name) {
                methods.push(MethodVerifier {
                    method_id: d.method_id,
                    name: d.name.clone(),
                    arity: d.circuit_inputs.len(),
                    outputs: d.circuit_outputs.len(),
                    function_index: index as u64,
                    fingerprint,
                    verifier_b64: encode_verifier(&c)?,
                });
            }
        }
        let deployment = QBCDeployContractWithRoot::new::<H>(
            0,
            ContractCodeDefinition {
                state_tree_height: height as u16,
                functions: defs.iter().map(dapen_fc_to_cfc_code_definition).collect(),
            },
            whitelist,
            code_root,
        )?;
        ensure!(
            deployment.function_whitelist_root.to_string() == expected.function_tree_root,
            "source whitelist differs from reviewed contract"
        );
        pack.contracts.push(ContractVerifier {
            contract_id: cid,
            code_root,
            layout_root: layout,
            function_root: deployment.function_whitelist_root,
            height: height as u64,
            fields,
            slots,
            methods,
        });
        sources.push(json!({"contractId":cid,"artifactSha256":source.sha256,"codeRoot":code_root.to_string(),"layoutRoot":layout.to_string(),"functionRoot":deployment.function_whitelist_root.to_string(),"methodCount":source.methods.len()}));
    }
    ensure!(ids.contains(&0), "native fee/balance resources required");
    save(&out.join("verifiers.json"), &pack)?;
    save(
        &out.join("BUILD.json"),
        &json!({"schema":1,"sdkManifestSha256":pack.sdk_manifest,"networkMagic":pack.network_magic.to_string(),"sourceInputsSha256":format!("{:x}",Sha256::digest(fs::read(&args[1])?)),"verifierPackSha256":format!("{:x}",Sha256::digest(fs::read(out.join("verifiers.json"))?)),"sources":sources,"wallSeconds":start.elapsed().as_secs_f64(),"runtimeAttested":false,"fullUpsVerified":false,"broadcast":false,"financialOperations":0}),
    )?;
    println!(
        "Source-derived verifier resources match all reviewed contract roots; no network action"
    );
    Ok(())
}
