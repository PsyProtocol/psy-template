//! Offline initial deployment preparation. Takes a PUBLIC deployer hash only.
use anyhow::{ensure,Result};
use std::{env,fs,io::Write};
use plonky2::{field::goldilocks_field::GoldilocksField as F,plonk::config::PoseidonGoldilocksConfig as C};
use psy_client_common::data::qhashout::QHashOut;
use psy_compiler::output::serialize::{CompilationArtifact,ContractOutput};
use psy_prover::session::{gen_contract_deploy_and_circuits_for_functions,compile_bridge::build_layout_aware_deploy_command};
fn main()->Result<()>{
 let args=env::args().collect::<Vec<_>>();
 ensure!(args.len()==4,"usage: prepare_deploy <artifact.json> <public-deployer-hash> <new-request.json>");
 ensure!(!std::path::Path::new(&args[3]).exists(),"output already exists");
 let a:CompilationArtifact=serde_json::from_slice(&fs::read(&args[1])?)?;
 ensure!(a.state_tree_height==32&&a.circuit_definitions.len()==14,"wrong wide AMM shape");
 let deployer=args[2].parse::<QHashOut<F>>()?;
 let (_,base)=gen_contract_deploy_and_circuits_for_functions::<C,2>(deployer,32,&a.circuit_definitions)?;
 let output=ContractOutput{contract_code:base.code_definition.clone(),circuit_definitions:a.circuit_definitions,abi:a.abi};
 let request=build_layout_aware_deploy_command(&output,base)?;
 request.validate_shape()?;
 let bytes=serde_json::to_vec(&request)?;
 let mut f=fs::OpenOptions::new().write(true).create_new(true).open(&args[3])?;f.write_all(&bytes)?;f.sync_all()?;
 println!("initial deployment prepared; code root {}, layout root {}, {} fields, {} slots, {} proof bytes; NOT submitted",request.deploy_contract.code_root,request.state_layout_root,request.state_layout_field_count,request.state_layout_slot_count,request.canonical_layout_proof.len());
 Ok(())
}
