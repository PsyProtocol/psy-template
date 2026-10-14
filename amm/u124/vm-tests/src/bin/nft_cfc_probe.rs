//! Read-only authenticated CFC probe. No keys, signatures or submission APIs.
use anyhow::{ensure, Context, Result};
use std::{env, fs, io::Write, path::Path};
use plonky2::{field::types::Field, iop::witness::{PartialWitness, WitnessWrite}};
use psy_client_common::{args::ContractCallArgs, data::qhashout::QHashOut};
use psy_client_data::{config::store_config::{F,C,D}, qstore::imm::cmd::QSRCmdGetContractCodeDefinition};
use psy_client_data::qstore::imm::cmd_processor::PsyReadCommandProcessorSyncMut;
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_compiler::output::serialize::CompilationArtifact;
use psy_config::PsyConfigGoldilocks;
use psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit;
use psy_prover::session::session::WalletSession;
use psy_client_data::{qdata::user::PsyUserLeaf,config::store_config::PsyHasher};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
fn save(out:&Path,name:&str,value:&impl serde::Serialize)->Result<()> {
 let mut f=fs::OpenOptions::new().write(true).create_new(true).open(out.join(name))?;
 f.write_all(&serde_json::to_vec(value)?)?;f.sync_all()?;Ok(())
}
#[tokio::main]
async fn main()->Result<()> {
 let a:Vec<_>=env::args().collect();
 if a.len()==4 && a[1]=="analyze" {
  let w:serde_json::Value=serde_json::from_slice(&fs::read(&a[2])?)?;let mut reads=Vec::new();
  for(i,cmd)in w["cmd_witnesses"].as_array().context("witness commands")?.iter().enumerate(){
   if let Some(other)=cmd["witness"].get("ReadOtherUserContractState"){
    let leaf:PsyUserLeaf<F>=serde_json::from_value(other["user_leaf_witness"]["user_leaf"].clone())?;
    let actual=leaf.qfhash::<PsyHasher>().to_string();let expected=&other["user_leaf_witness"]["user_tree_proof"]["value"];
    reads.push(serde_json::json!({"command":i,"userId":cmd["state_cmd"]["user_id"],"expectedUserLeafHash":expected,"computedUserLeafHash":actual,"userLeafMatches":*expected==actual,"contractLeaf":other["contract_state_proof"]["value"],"stateRoot":other["state_slot_proofs"][0]["root"]}));
   }
  }
  let mut f=fs::OpenOptions::new().write(true).create_new(true).open(&a[3])?;f.write_all(&serde_json::to_vec(&reads)?)?;f.sync_all()?;return Ok(());
 }
 ensure!(a.len()==6,"nft_cfc_probe <public-key-hash> <call.json> <rpc.json> <artifact.json> <fresh-output> | analyze <witness.json> <fresh-report>");
 let key=a[1].parse::<QHashOut<F>>()?;let call:ContractCallArgs=serde_json::from_slice(&fs::read(&a[2])?)?;
 let artifact:CompilationArtifact=serde_json::from_slice(&fs::read(&a[4])?)?;ensure!(artifact.state_tree_height==31,"market height");
 let reviewed=artifact.circuit_definitions.iter().find(|d|d.name==call.method_name).context("reviewed method missing")?;
 let out=Path::new(&a[5]);fs::create_dir(out)?;
 let config=PsyConfigGoldilocks::from_file(&a[3])?;let mut network=config.get_current_network()?.clone();network.prove_proxy_url.clear();
 let session=WalletSession::new(&network).await?;
 // Starting a public state session does not require a signing identity.
 session.start_session(key).await?;let cm=session.wallet.random_circuit_manager();
 let mut mgr=session.user_session_mgrs.get_mut(&key).context("public state session missing")?;
 let code=mgr.require_lps_mut()?.resolve_get_contract_code_mut(&QSRCmdGetContractCodeDefinition{contract_id:call.contract_id}).await?;
 let (fn_id,def)=cm.resolve_contract_function_by_method_name(call.contract_id,&code,call.method_name.clone()).await?;
 ensure!(serde_json::to_value(&def)?==serde_json::to_value(reviewed)?,"deployed definition differs from reviewed artifact");
 let step=mgr.trace_standard_call(cm.as_ref(),F::from_canonical_u64(call.contract_id),fn_id as u32,&def,call.inputs.iter().map(|x|F::from_noncanonical_u64(*x)).collect()).await?;
 save(out,"witness.json",&step.cfc_witness)?;save(out,"definition.json",&def)?;
 let cfc=DapenContractFunctionCircuit::<C,D>::new(&def,31,16,false);
 ensure!(cfc.get_fingerprint()==step.cfc_fingerprint,"local circuit differs from registered circuit");
 let mut pw=PartialWitness::new();
 pw.set_target_arr(&cfc.inputs,&step.cfc_witness.inputs)?;
 pw.set_hash_target(cfc.fn_builder_gadget.session_proof_tree_root,step.cfc_witness.session_proof_tree_root.0)?;
 cfc.fn_builder_gadget.tx_ctx_header.set_witness(&mut pw,&step.cfc_witness.tx_input_ctx)?;
 if let Err(e)=cfc.fn_builder_gadget.state_reader.set_witness(&mut pw,&step.cfc_witness,&def){
  save(out,"result.json",&serde_json::json!({"stage":"state-witness","authenticatedCfcVerified":false,"submitted":false,"error":format!("{e:#}")}))?;
  anyhow::bail!("state witness rejected: {e:#}");
 }
 match cfc.prove_base(&step.cfc_witness){
  Ok(proof)=>{cfc.minifier_chain.verify(proof)?;save(out,"result.json",&serde_json::json!({"stage":"verified","authenticatedCfcVerified":true,"submitted":false,"fingerprint":step.cfc_fingerprint.to_string()}))?;println!("authenticated CFC verified; no signature or broadcast");},
  Err(e)=>{save(out,"result.json",&serde_json::json!({"stage":"prove","authenticatedCfcVerified":false,"submitted":false,"error":format!("{e:#}")}))?;anyhow::bail!("CFC rejected: {e:#}");}
 }
 Ok(())
}
