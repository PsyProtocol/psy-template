//! Offline CFC proof of a saved public VM witness. Never broadcasts.
use anyhow::{ensure,Context,Result};
use psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit;
use psy_vm::{dpn::vm::def::DPNFunctionCircuitDefinition,vm::cfc_input::DapenContractFunctionCircuitInput};
use psy_client_data::config::store_config::{C,D};
use psy_client_common::data::qhashout::QHashOut;
use plonky2::field::goldilocks_field::GoldilocksField as F;
use std::{env,fs,io::Write};
fn main()->Result<()>{
 let args:Vec<String>=env::args().collect();ensure!(args.len()==5,"usage: prove_saved_cfc <defs> <witness> <method> <new-result>");
 let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_slice(&fs::read(&args[1])?)?;
 let witness:DapenContractFunctionCircuitInput<F>=serde_json::from_slice(&fs::read(&args[2])?)?;
 let def=defs.iter().find(|d|d.name==args[3]).context("method missing")?;
 let circuit=DapenContractFunctionCircuit::<C,D>::new(def,32,16,false);
 let proof=circuit.prove_base(&witness)?;
 circuit.minifier_chain.verify(proof.clone())?;
 let result=serde_json::json!({"fullCfcVerified":true,"fullUpsVerified":false,"submitted":false,"method":args[3],"stateCommands":def.state_commands.len(),"fingerprint":QHashOut(circuit.minifier_chain.get_fingerprint()).to_string(),"proofBytes":proof.to_bytes().len()});
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&args[4])?;file.write_all(serde_json::to_vec_pretty(&result)?.as_slice())?;file.sync_all()?;
 println!("{result}");Ok(())
}
