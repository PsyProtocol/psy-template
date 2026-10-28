//! Native producer-seeded execution. No unbiased-beacon or finality assertion.
use super::{f,save,Guard};
use anyhow::{ensure,Context,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}},hash::poseidon::PoseidonHash};
use psy_client_common::{args::ContractCallData,data::qhashout::QHashOut};
use psy_client_data::{config::store_config::{C,D},qstore::{controllers::proving_session::{PsyLocalProvingSessionStore,PsyReadLocalProvingSessionStore},imm::{cmd::QSRCmdGetContractCodeDefinition,cmd_processor::PsyReadCommandProcessorSyncMut}},traits::qdatastore::{qmetadata::QMetaDataStoreReaderSync,qtreedata::QTreeDataStoreReaderSync}};
use psy_config::{DA_FEE,network_constants::{GUTA_FEE,UPS_SESSION_PROOF_TREE_HEIGHT}};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_prover::session::session::WalletSession;
use psy_provider::session::TxStatus;
use psy_ups_circuit::session::UserProvingSessionManager;
use psy_template_u124_markets::processor_policy;
use serde_json::{Value,json};
use std::path::Path;
pub fn previous(spec:&Value)->bool{processor_policy::previous(spec)}
pub async fn start(session:&WalletSession,key:QHashOut<F>,guard:&Guard,cp:u64)->Result<()>{
 let user=guard.identity.vault_id;let p=session.st_provider.with_user_id_owned(user);
 let realm=p.get_latest_block_state().await?.checkpoint_id;let coordinator=session.st_provider.get_coordinator_latest_block_state().await?.checkpoint_id;
 ensure!(cp>0&&cp<(1u64<<32)&&cp<=realm&&realm<=coordinator&&realm<=guard.valid_until_checkpoint,"fixed previous checkpoint unavailable or execution expired");
 let old=p.get_user_leaf_data(cp,user).await?;let anchor=p.get_user_tree_leaf_hash(cp,user).await?;
 ensure!(old.last_checkpoint_id.to_canonical_u64().checked_add(1)==Some(cp)&&old.nonce.to_canonical_u64()>0&&old.public_key==key&&old.qfhash::<PoseidonHash>()==anchor,"source must contain the original preceding-checkpoint commitment");
 ensure!(p.get_user_tree_leaf_hash(realm,user).await?==anchor,"vault changed after fixed source checkpoint");
 let roots=p.get_checkpoint_global_state_roots(cp).await?;let checkpoint=p.get_checkpoint_leaf_data(cp).await?;
 ensure!(roots.qfhash::<PoseidonHash>()==checkpoint.global_chain_root,"fixed source checkpoint metadata");
 for b in &guard.dependencies{
  b.check(&p).await?;let leaf=p.get_contract_leaf_data(b.contract.contract_id).await?;let proof=p.get_contract_tree_merkle_proof(cp,b.contract.contract_id as u32).await?;
  ensure!(proof.index==b.contract.contract_id&&proof.value==leaf.qfhash::<PoseidonHash>()&&proof.root==roots.contract_tree_root&&proof.verify::<PoseidonHash>(),"source dependency differs from reviewed current code/layout/functions");
 }
 let nonce=old.nonce.to_canonical_u64().checked_add(1).context("producer nonce overflow")?;
 ensure!(matches!(p.get_tx_status(user,nonce).await?,TxStatus::Submittable),"producer nonce unavailable; reconcile original request");
 let lps=PsyLocalProvingSessionStore::<F,_,PoseidonHash>::new_at(p,f(cp),f(user),f(nonce),old.event_index,UPS_SESSION_PROOF_TREE_HEIGHT as usize);
 let cm=session.wallet.random_circuit_manager();let mut manager=UserProvingSessionManager::<F,PoseidonHash,_,C,D>::new(lps,session.circuit_info.clone(),cm.ups_circuit_whitelist_root().await?).await?;
 manager.prove_ups_start(cm.as_ref()).await?;session.user_session_mgrs.insert(key,manager);Ok(())
}
pub async fn execute(session:&WalletSession,key:QHashOut<F>,spec:&Value,data:&ContractCallData,quote:bool,out:&Path)->Result<()>{
 ensure!(previous(spec)&&data.software_defined_call.inputs[0]==2,"producer settlement only");let fields=&data.software_defined_call.inputs;
 let cm=session.wallet.random_circuit_manager();let mut manager=session.user_session_mgrs.get_mut(&key).context("producer source session")?;
 for call in &data.contract_calls{
  let code=manager.require_lps_mut()?.resolve_get_contract_code_mut(&QSRCmdGetContractCodeDefinition{contract_id:call.contract_id}).await?;
  let(index,def)=cm.resolve_contract_function_by_method_name(call.contract_id,&code,call.method_name.clone()).await?;
  if quote{manager.trace_standard_call(cm.as_ref(),f(call.contract_id),index as u32,&def,call.inputs.iter().copied().map(f).collect()).await?;}
  else{manager.prove_standard_call(cm.as_ref(),f(call.contract_id),index as u32,&def,call.inputs.iter().copied().map(f).collect()).await?;}
 }
 if quote{
  let lps=manager.require_lps()?;ensure!(lps.has_positional_slot_update(0,0),"producer fee prefix must modify native balance");
  let final_slots=lps.get_total_modified_slots_for_fee().checked_sub(1).context("restored native word missing")?;
  let fee=GUTA_FEE+DA_FEE*final_slots as u64;ensure!((1_000_000_000..=1_000_100_000).contains(&fee),"producer fee budget");
  return save(&out.join("quote.json"),&json!({"fee":fee,"sourceCheckpoint":manager.get_current_ups_header().session_start_context.checkpoint_id,"startLeaf":manager.get_current_ups_header().session_start_context.start_session_user_leaf,"nonce":lps.get_nonce(),"proofVerified":false,"endcapSigned":false,"broadcast":false,"sourceTrust":"native producer-controlled seed","scope":"disposable trace proposal; complete UPS independently checks actual final fee"}));
 }
 let code=manager.require_lps_mut()?.resolve_get_contract_code_mut(&QSRCmdGetContractCodeDefinition{contract_id:0}).await?;
 let(index,def)=cm.resolve_contract_function_by_method_name(0,&code,spec["burn"]["method_name"].as_str().context("native burn")?.into()).await?;
 manager.prove_standard_call(cm.as_ref(),F::ZERO,index as u32,&def,vec![f(fields[73])]).await?;
 ensure!(fields[73]==GUTA_FEE+DA_FEE*manager.require_lps()?.get_total_slots_modified().to_canonical_u64(),"producer burn differs from final net changes");Ok(())
}
