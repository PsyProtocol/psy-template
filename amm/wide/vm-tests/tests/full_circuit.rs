//! Build full production CFCs to detect target conflicts; no state witness proof.
use anyhow::Result;
use plonky2::plonk::config::PoseidonGoldilocksConfig as C;
use psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit;
use psy_vm::dpn::vm::def::DPNFunctionCircuitDefinition;
use serde_json::Value;
use std::{fs,path::PathBuf};
#[test]
fn full_swap_add_and_remove_circuits_build_without_target_conflicts()->Result<()>{
 let path=std::env::var("AMM_WIDE_ARTIFACT").map(PathBuf::from).unwrap_or_else(|_|PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../verification-2026-10-11/compiled-final/compilation_artifact.json"));
 let a:Value=serde_json::from_slice(&fs::read(path)?)?;
 let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;
 for name in ["swap","add_liquidity","remove_liquidity"] {
  let def=defs.iter().find(|d|d.name==name).unwrap();
  let circuit=DapenContractFunctionCircuit::<C,2>::new(def,32,16,false);
  println!("full {name} CFC built: {} definitions, {} commands, base degree {}",def.definitions.len(),def.state_commands.len(),circuit.circuit_data.common.degree_bits());
 }
 Ok(())
}
