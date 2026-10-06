//! Offline proof probe for a saved orderbook CFC witness. Never submits.

use std::{env, fs};

use anyhow::{Context, Result};
use plonky2::{
    field::goldilocks_field::GoldilocksField as F,
    iop::witness::{PartialWitness, WitnessWrite},
};
use psy_client_data::{config::store_config::{C, D}, qdata::contract::ContractCodeDefinition};
use psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit;
use psy_vm::{dpn::vm::def::DPNFunctionCircuitDefinition, vm::cfc_input::DapenContractFunctionCircuitInput};

fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    anyhow::ensure!(args.len() == 4, "usage: cfc_probe <witness.json> <code.json> <method>");
    let mut witness: DapenContractFunctionCircuitInput<F> = serde_json::from_slice(&fs::read(&args[1])?)?;
    let code_json: serde_json::Value = serde_json::from_slice(&fs::read(&args[2])?)?;
    let (mut definition, state_tree_height) = if code_json.is_array() {
        let definitions: Vec<DPNFunctionCircuitDefinition> = serde_json::from_value(code_json)?;
        (definitions.into_iter().find(|definition| definition.name == args[3]).context("method not found")?, 32)
    } else {
        let code: ContractCodeDefinition = serde_json::from_value(code_json["code_definition"].clone())?;
        let definition = code.functions.iter()
            .map(|function| serde_cbor::from_slice::<DPNFunctionCircuitDefinition>(&function.code))
            .collect::<std::result::Result<Vec<_>, _>>()?
            .into_iter().find(|definition| definition.name == args[3])
            .context("method not found")?;
        (definition, code.state_tree_height as usize)
    };
    if env::var("PROBE_SKIP_ASSERTIONS").as_deref() == Ok("1") {
        definition.assertions.clear();
    }
    if let Ok(limit) = env::var("PROBE_COMMAND_LIMIT") {
        let limit = limit.parse::<usize>()?;
        anyhow::ensure!(limit > 0 && limit <= definition.state_commands.len(), "invalid command limit");
        let definition_limit = definition.state_command_resolution_indices[limit - 1] as usize;
        definition.definitions.truncate(definition_limit);
        definition.state_commands.truncate(limit);
        definition.state_command_resolution_indices.truncate(limit);
        definition.assertions.clear();
        definition.circuit_outputs.clear();
        definition.events.clear();
        witness.cmd_witnesses.truncate(limit);
        if limit <= 10 {
            witness.tx_input_ctx.transaction_end_ctx.end_contract_state_tree_root =
                witness.tx_input_ctx.transaction_call_start_ctx.start_contract_state_tree_root;
        }
    }
    println!("{}: {} commands, {} witness commands, {} assertions", definition.name, definition.state_commands.len(), witness.cmd_witnesses.len(), definition.assertions.len());
    let circuit = DapenContractFunctionCircuit::<C, D>::new(&definition, state_tree_height, 16, false);
    let mut pw = PartialWitness::<F>::new();
    pw.set_target_arr(&circuit.inputs, &witness.inputs)?;
    println!("inputs: ok");
    pw.set_hash_target(circuit.fn_builder_gadget.session_proof_tree_root, witness.session_proof_tree_root.0)?;
    println!("proof tree root: ok");
    circuit.fn_builder_gadget.tx_ctx_header.set_witness(&mut pw, &witness.tx_input_ctx)?;
    println!("transaction context: ok");
    circuit.fn_builder_gadget.state_reader.set_witness(&mut pw, &witness, &definition)?;
    println!("state witnesses: ok");
    let proof = circuit.circuit_data.prove(pw)?;
    println!("base CFC proof: ok");
    circuit.circuit_data.verify(proof)?;
    println!("base CFC verification: ok");
    Ok(())
}
