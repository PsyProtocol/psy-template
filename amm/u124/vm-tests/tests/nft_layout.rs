//! Real canonical proof verification and adversarial endpoint/deployer tests.
use anyhow::Result;use std::fs;
use plonky2::field::{goldilocks_field::GoldilocksField as F,types::Field};
use psy_client_common::data::qhashout::QHashOut;
use psy_compiler::output::serialize::CompilationArtifact;
use psy_template_u124_markets::layout_preflight::{prepare_initial,verify_initial};
use psy_plonky2_circuits::utils::proof_serialization::{deserialize_plonky2_proof,serialize_plonky2_proof};
use psy_client_data::config::store_config::C;
#[test]fn initial_nft_and_market_proofs_bind_empty_old_layout_owner_code_and_types()->Result<()>{
 let root=std::env::var("NFT_MARKET_BUILD")?;let deployer="0000000000000001000000000000000100000000000000010000000000000001".parse::<QHashOut<F>>()?;
 for path in ["nft/compilation_artifact.json","market/compiled/compilation_artifact.json"]{
  let a:CompilationArtifact=serde_json::from_slice(&fs::read(format!("{root}/{path}"))?)?;let cmd=prepare_initial(a.clone(),deployer)?;let report=verify_initial(&a,&cmd,deployer)?;assert_eq!(report["oldFieldCount"],0);assert_eq!(report["oldSlotCount"],0);
  let mut bad=cmd.clone();bad.state_layout_field_count+=1;assert!(verify_initial(&a,&bad,deployer).is_err());
  let mut bad=cmd.clone();bad.state_layout_slot_count+=1;assert!(verify_initial(&a,&bad,deployer).is_err());
  let mut bad=cmd.clone();bad.state_layout_root.0.elements[0]+=F::ONE;assert!(verify_initial(&a,&bad,deployer).is_err());
  let mut bad=cmd.clone();bad.deploy_contract.deployer.0.elements[0]+=F::ONE;assert!(verify_initial(&a,&bad,deployer).is_err());
  let mut bad=cmd.clone();bad.deploy_contract.code_root.0.elements[0]+=F::ONE;assert!(verify_initial(&a,&bad,deployer).is_err());
  let mut bad=cmd.clone();bad.deploy_contract.code_definition.state_tree_height+=1;assert!(verify_initial(&a,&bad,deployer).is_err());
  let mut bad=cmd.clone();let mut proof=deserialize_plonky2_proof::<C,2>(&bad.canonical_layout_proof)?;proof.public_inputs[6]=F::from_canonical_u64(14);bad.canonical_layout_proof=serialize_plonky2_proof::<C,2>(&proof)?;assert!(verify_initial(&a,&bad,deployer).is_err());
  println!("verified {path} height {}, rejected seven endpoint/code/owner mutations",a.state_tree_height);
 }
 Ok(())
}
