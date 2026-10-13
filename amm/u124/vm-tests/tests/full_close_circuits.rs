//! Build production CFCs for transaction-local two-limb close readers.
use anyhow::{Context, Result};
use plonky2::plonk::config::PoseidonGoldilocksConfig as C;
use psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit;
use psy_vm::dpn::vm::def::DPNFunctionCircuitDefinition;
use serde_json::Value;
use std::{fs, path::PathBuf};
#[test]
fn full_close_circuits_build_with_transaction_local_single_readers() -> Result<()> {
    let root=PathBuf::from(std::env::var("U124_FULL_CFC_FIXTURES").context("explicit fresh U124_FULL_CFC_FIXTURES required")?);
    let mut count=0;
    for market in ["amm", "orderbook", "bondingcurve"] {
        let path=root.join(market).join("compiled/compilation_artifact.json");
        let artifact:Value=serde_json::from_slice(&fs::read(path)?)?;
        let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(artifact["circuit_definitions"].clone())?;
        for def in defs.iter().filter(|d|d.name.starts_with("close_")) {
            let circuit=DapenContractFunctionCircuit::<C,2>::new(def,31,16,false);
            println!("full {market}/{} CFC built: {} definitions, {} commands, degree {}",def.name,def.definitions.len(),def.state_commands.len(),circuit.circuit_data.common.degree_bits());
            count+=1;
        }
    }
    assert_eq!(count, 8, "all three markets' close circuits must build");
    Ok(())
}
