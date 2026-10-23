//! Non-authorizing fee preparation: execute the exact supplied calls in a
//! disposable local trace. Never signs an end-cap or broadcasts. The eventual
//! complete UPS must independently match actual burn and all state constraints.
use anyhow::{Context,Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F,types::Field};
use psy_client_common::{args::ContractCallData,data::qhashout::QHashOut};
use psy_client_data::{qstore::imm::{cmd::QSRCmdGetContractCodeDefinition,cmd_processor::PsyReadCommandProcessorSyncMut}};
use psy_prover::session::session::WalletSession;
use psy_client_data::qstore::controllers::proving_session::PsyReadLocalProvingSessionStore;
use std::path::Path;
pub async fn quote(session:&WalletSession,key:QHashOut<F>,data:&ContractCallData,out:&Path)->Result<()>{
 let cm=session.wallet.random_circuit_manager();
 let mut manager=session.user_session_mgrs.get_mut(&key).context("quote session")?;
 let start=*manager.get_current_ups_header();
 for call in &data.contract_calls{
  let code=manager.require_lps_mut()?.resolve_get_contract_code_mut(&QSRCmdGetContractCodeDefinition{contract_id:call.contract_id}).await?;
  let(index,def)=cm.resolve_contract_function_by_method_name(call.contract_id,&code,call.method_name.clone()).await?;
  manager.trace_standard_call(cm.as_ref(),F::from_canonical_u64(call.contract_id),index as u32,&def,call.inputs.iter().map(|n|F::from_canonical_u64(*n)).collect()).await?;
 }
 let slots=manager.require_lps()?.get_total_modified_slots_for_fee()+u32::from(!manager.require_lps()?.has_positional_slot_update(0,0));
 let fee=psy_config::network_constants::GUTA_FEE+psy_config::DA_FEE*slots as u64;
 super::save(&out.join("quote.json"),&serde_json::json!({"fee":fee,"sourceCheckpoint":start.session_start_context.checkpoint_id,"startLeaf":start.session_start_context.start_session_user_leaf,"nonce":manager.require_lps()?.get_nonce(),"actualBurnVerified":false,"endcapSigned":false,"broadcast":false,"scope":"VM fee proposal only; eventual complete UPS must prove exact fee, call stack, session and state endpoints"}))?;
 Ok(())
}
