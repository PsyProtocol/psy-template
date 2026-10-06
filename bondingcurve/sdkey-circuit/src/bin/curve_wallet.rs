//! Public bonding-curve vault. The registered circuit is the spending policy.

use std::{env, fs};

use anyhow::{bail, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::hash_types::HashOut,
};
use psy_client_common::{args::ContractCallData, data::qhashout::QHashOut};
use psy_client_data::{
    config::store_config::{C, D},
    traits::qdatastore::qmetadata::QMetaDataStoreReaderSync,
};
use psy_config::PsyConfigGoldilocks;
use psy_prover::session::session::WalletSession;
use psy_provider::provider::ProveProxyRpcProvider;
use psy_template_bondingcurve_sdkey::{build_curve_sd_key_circuit, LaunchConfig};
use psy_vm::dpn::vm::def::DPNFunctionCircuitDefinition;

fn usage() -> &'static str {
    "usage: curve_wallet <fingerprint|probe|register|add|witness|submit> <curve-contract-id> <launch-config.json> [calls.json] [rpc-config.json]"
}

#[tokio::main]
async fn main() -> Result<()> {
    let mut args = env::args().skip(1);
    let action = args.next().context(usage())?;
    let contract_id = args.next().context(usage())?.parse::<u64>()?;
    let launch_path = args.next().context(usage())?;
    let config: LaunchConfig = serde_json::from_slice(&fs::read(launch_path)?)?;
    let circuit = build_curve_sd_key_circuit(contract_id, config)?;
    let fingerprint = circuit.get_fingerprint();
    if action == "fingerprint" {
        println!("{fingerprint}");
        return Ok(());
    }
    let calls_path = if action == "submit" || action == "witness" {
        Some(args.next().context(usage())?)
    } else {
        None
    };
    let config_path = args
        .next()
        .unwrap_or_else(|| env::var("RPC_CONFIG").unwrap_or_else(|_| "config.json".into()));
    if args.next().is_some() {
        bail!(usage());
    }

    let psy_config = PsyConfigGoldilocks::from_file(&config_path)?;
    let mut network = psy_config.get_current_network()?.clone();
    if action == "probe" {
        for url in &network.prove_proxy_url {
            match ProveProxyRpcProvider::<C, D>::new_with_config(url.clone()).await {
                Ok(_) => println!("prove proxy compatible: {url}"),
                Err(error) => eprintln!("prove proxy incompatible at {url}: {error:#}"),
            }
        }
        return Ok(());
    }
    if env::var("CURVE_USE_LOCAL_PROVER").as_deref() == Ok("1") {
        network.prove_proxy_url.clear();
    }
    let mut session = WalletSession::new(&network).await?;
    session.wallet.insert_sd_key_circuit(fingerprint, circuit);
    let public_private_key = QHashOut(HashOut {
        elements: [F::from_canonical_u64(3); 4],
    });

    match action.as_str() {
        "register" => {
            let key = session
                .register_user(public_private_key, fingerprint)
                .await?;
            println!("registered public curve vault {key} with fingerprint {fingerprint}");
        }
        "add" => {
            let key = session.add_user(public_private_key, fingerprint).await?;
            println!("loaded public curve vault {key} with fingerprint {fingerprint}");
        }
        "witness" => {
            let path = calls_path.context(usage())?;
            let data: ContractCallData = serde_json::from_str(&fs::read_to_string(&path)?)?;
            let (witness_private_key, witness_fingerprint) =
                if let Ok(secret_path) = env::var("CURVE_WITNESS_WALLET") {
                    let raw = fs::read_to_string(secret_path)?;
                    let start = raw.find('{').context("wallet JSON missing")?;
                    let secret: serde_json::Value = serde_json::from_str(&raw[start..])?;
                    let private_key = secret["private_key"]
                        .as_str()
                        .context("private_key missing")?
                        .parse()?;
                    let fingerprint = secret["fingerprint"]
                        .as_str()
                        .context("fingerprint missing")?
                        .parse()?;
                    (private_key, fingerprint)
                } else {
                    (public_private_key, fingerprint)
                };
            let key = session
                .add_user(witness_private_key, witness_fingerprint)
                .await?;
            session.start_session(key).await?;
            let first = data
                .contract_calls
                .first()
                .context("missing contract call")?;
            anyhow::ensure!(
                first.contract_id == contract_id,
                "first call must be curve guard"
            );
            let definition = if let Ok(definitions_path) = env::var("CURVE_LOCAL_DEFS") {
                let definitions: Vec<DPNFunctionCircuitDefinition> =
                    serde_json::from_slice(&fs::read(definitions_path)?)?;
                definitions
                    .into_iter()
                    .find(|definition| definition.name == first.method_name)
                    .context("local method not found")?
            } else {
                let code = session
                    .st_provider
                    .get_contract_code_definition(contract_id)
                    .await?;
                let (_, definition) = session
                    .wallet
                    .random_circuit_manager()
                    .resolve_contract_function_by_method_name(
                        contract_id,
                        &code,
                        first.method_name.clone(),
                    )
                    .await?;
                definition
            };
            let inputs = first
                .inputs
                .iter()
                .copied()
                .map(F::from_noncanonical_u64)
                .collect();
            let witness = session
                .user_session_mgrs
                .get_mut(&key)
                .context("missing proving session")?
                .exec_contract_call(F::from_canonical_u64(contract_id), &definition, inputs)
                .await?;
            let output = env::var("CURVE_TRACE_OUTPUT")
                .unwrap_or_else(|_| "/private/tmp/psy-curve-debug-witness.json".into());
            fs::write(&output, serde_json::to_vec(&witness)?)?;
            println!("generated curve CFC witness at {output}");
        }
        "submit" => {
            let path = calls_path.context(usage())?;
            let mut data: ContractCallData = serde_json::from_str(&fs::read_to_string(&path)?)?;
            anyhow::ensure!(
                data.contract_calls.len() == 6,
                "curve submission needs six calls before fee burn"
            );
            anyhow::ensure!(
                data.software_defined_call.inputs.len() == 6,
                "curve policy needs six sign inputs"
            );
            let key = session.add_user(public_private_key, fingerprint).await?;
            session.start_session(key).await?;
            println!("curve stage=proving_calls explicit_calls=6");
            session
                .prove_contract_call(key, data.contract_calls)
                .await
                .context("curve call proving failed before signing or submission")?;
            println!("curve stage=calls_proved");
            if env::var("CURVE_PROVE_ONLY").as_deref() == Ok("1") {
                println!("curve contract calls proved without signing or submitting");
                return Ok(());
            }
            let actual_fee = {
                let mgr = session
                    .user_session_mgrs
                    .get(&key)
                    .context("missing vault proving session")?;
                let burn = &mgr
                    .require_lps()?
                    .last_transaction_record()
                    .call_data
                    .call_data;
                anyhow::ensure!(
                    burn.contract_id.to_canonical_u64() == 0
                        && burn.method_id.to_canonical_u64() == 2_923_993_647,
                    "last call is not the automatic PSY fee burn"
                );
                anyhow::ensure!(burn.inputs.len() == 1, "unexpected fee burn inputs");
                burn.inputs[0].to_canonical_u64()
            };
            let supplied = data.software_defined_call.inputs[5];
            anyhow::ensure!(
                supplied == 0 || supplied == actual_fee,
                "supplied fee differs from actual burn"
            );
            data.software_defined_call.inputs[5] = actual_fee;
            println!("curve stage=sign_and_submit fee_burn={actual_fee}");
            let tx = session
                .sign_and_submit(key, data.software_defined_call)
                .await?;
            println!("submitted curve vault transaction {tx}");
        }
        _ => bail!(usage()),
    }
    Ok(())
}
