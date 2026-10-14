use anyhow::{ensure, Result};
use plonky2::field::types::Field;
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::config::store_config::F;
use psy_compiler::output::serialize::CompilationArtifact;
use psy_template_token_wide_private::layout_preflight::{prepare_initial, verify_initial};
use std::{env, fs, io::Write};
fn save(p: &str, v: &impl serde::Serialize) -> Result<()> {
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(p)?;
    f.write_all(&serde_json::to_vec(v)?)?;
    f.sync_all()?;
    Ok(())
}
fn main() -> Result<()> {
    let a: Vec<String> = env::args().collect();
    ensure!([5,6].contains(&a.len()),"preflight_private_initial prepare <artifact> <public-deployer> <new-request> | verify <artifact> <public-deployer> <request> <new-report>");
    let artifact: CompilationArtifact = serde_json::from_slice(&fs::read(&a[2])?)?;
    let deployer = a[3].parse::<QHashOut<F>>()?;
    match a[1].as_str() {
        "prepare" => {
            ensure!(a.len() == 5, "prepare arguments");
            save(&a[4], &prepare_initial(artifact, deployer)?)?;
            println!("prepared initial deployment proof; not submitted");
        }
        "verify" | "audit" => {
            ensure!(a.len() == 6, "verify arguments");
            let cmd = serde_json::from_slice(&fs::read(&a[4])?)?;
            let report = verify_initial(&artifact, &cmd, deployer)?;
            if a[1] == "audit" {
                let mut bad = cmd.clone();
                bad.state_layout_field_count += 1;
                ensure!(
                    verify_initial(&artifact, &bad, deployer).is_err(),
                    "accepted wrong field count"
                );
                let mut bad = cmd.clone();
                bad.state_layout_slot_count += 1;
                ensure!(
                    verify_initial(&artifact, &bad, deployer).is_err(),
                    "accepted wrong slot count"
                );
                let mut bad = cmd.clone();
                bad.state_layout_root.0.elements[0] += F::ONE;
                ensure!(
                    verify_initial(&artifact, &bad, deployer).is_err(),
                    "accepted wrong layout root"
                );
                let mut bad = cmd.clone();
                bad.deploy_contract.code_root.0.elements[0] += F::ONE;
                ensure!(
                    verify_initial(&artifact, &bad, deployer).is_err(),
                    "accepted wrong code root"
                );
                let mut bad = cmd.clone();
                bad.deploy_contract.deployer.0.elements[0] += F::ONE;
                ensure!(
                    verify_initial(&artifact, &bad, deployer).is_err(),
                    "accepted wrong deployer"
                );
                let mut bad = cmd.clone();
                bad.deploy_contract.code_definition.state_tree_height = 31;
                ensure!(
                    verify_initial(&artifact, &bad, deployer).is_err(),
                    "accepted wrong height"
                );
                let mut bad = cmd.clone();
                let mut proof =
                    psy_plonky2_circuits::utils::proof_serialization::deserialize_plonky2_proof::<
                        psy_client_data::config::store_config::C,
                        2,
                    >(&bad.canonical_layout_proof)?;
                proof.public_inputs[6] = F::from_canonical_u64(14);
                bad.canonical_layout_proof =
                    psy_plonky2_circuits::utils::proof_serialization::serialize_plonky2_proof(
                        &proof,
                    )?;
                ensure!(
                    verify_initial(&artifact, &bad, deployer).is_err(),
                    "accepted nonempty old layout"
                );
                println!("rejected seven deployment mutations including a nonempty old layout");
            }
            save(&a[5], &report)?;
            println!("verified empty initial layout, deployer, code and ABI; not submitted");
        }
        _ => anyhow::bail!("initial deployments only"),
    };
    Ok(())
}
