//! Read-only historical-source calibration; never a broadcast or resident mode.
//! Normal production sessions still use WalletSession::start_session.
use anyhow::{ensure, Context, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F, types::{Field,PrimeField64}}, hash::poseidon::PoseidonHash};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{config::store_config::{C,D,PsyHasher},qstore::controllers::proving_session::PsyLocalProvingSessionStore,traits::qdatastore::{qmetadata::QMetaDataStoreReaderSync,qtreedata::QTreeDataStoreReaderSync}};
use psy_config::network_constants::UPS_SESSION_PROOF_TREE_HEIGHT;
use psy_crypto::{common::user_id::get_registration_id_from_user_id,hash::traits::qhashable::QFieldHashable};
use psy_prover::session::session::WalletSession;
use psy_provider::session::TxStatus;
use psy_ups_circuit::session::UserProvingSessionManager;
pub const SOURCE_ENV:&str="PSY_MARKET_BENCH_SOURCE_CHECKPOINT";
fn parse_pin(action:&str,value:Option<&str>)->Result<Option<u64>>{
 let Some(value)=value else{return Ok(None)};
 ensure!(action=="preflight","source pin is read-only standalone preflight only");
 ensure!(!value.is_empty()&&value.bytes().all(|x|x.is_ascii_digit()),"canonical benchmark checkpoint");
 let cp:u64=value.parse()?;ensure!(cp>0&&cp<(1u64<<32)&&cp.to_string()==value,"bounded canonical benchmark checkpoint");Ok(Some(cp))
}
pub fn requested(action:&str)->Result<Option<u64>>{
 match std::env::var(SOURCE_ENV){Ok(v)=>parse_pin(action,Some(&v)),Err(std::env::VarError::NotPresent)=>Ok(None),Err(e)=>Err(e.into())}
}
fn bounds(cp:u64,realm:u64,coordinator:u64,last:u64,nonce:u64)->Result<()>{
 ensure!(realm<=coordinator&&cp<=realm&&cp>last&&nonce>0,"historical benchmark requires committed materialized unchanged account and a valid source checkpoint");Ok(())
}
pub async fn start_at(session:&WalletSession,key:QHashOut<F>,user:u64,cp:u64)->Result<()> {
 let provider=session.st_provider.with_user_id_owned(user);
 let realm=provider.get_latest_block_state().await?.checkpoint_id;
 let coordinator=session.st_provider.get_coordinator_latest_block_state().await?.checkpoint_id;
 let old=provider.get_user_leaf_data(cp,user).await?;
 bounds(cp,realm,coordinator,old.last_checkpoint_id.to_canonical_u64(),old.nonce.to_canonical_u64())?;
 let historic=provider.get_user_tree_leaf_hash(cp,user).await?;
 ensure!(historic!=QHashOut::ZERO&&old.public_key==key&&old.qfhash::<PsyHasher>()==historic,"benchmark historical own metadata/key binding");
 ensure!(provider.get_user_tree_leaf_hash(realm,user).await?==historic,"benchmark own anchor changed since selected source");
 ensure!(provider.get_user_registration_tree_leaf_hash(cp,get_registration_id_from_user_id(user)).await?!=QHashOut::ZERO,"benchmark source registration absent");
 let nonce=old.nonce.to_canonical_u64().checked_add(1).context("benchmark nonce overflow")?;
 ensure!(matches!(provider.get_tx_status(user,nonce).await?,TxStatus::Submittable),"benchmark nonce is not submittable");
 // New stores, header, state proofs and UPS-start proof; no user-session reuse.
 let lps=PsyLocalProvingSessionStore::<F,_,PoseidonHash>::new_at(provider,F::from_canonical_u64(cp),F::from_canonical_u64(user),F::from_canonical_u64(nonce),old.event_index,UPS_SESSION_PROOF_TREE_HEIGHT as usize);
 let circuits=session.wallet.random_circuit_manager();
 let mut manager=UserProvingSessionManager::<F,PoseidonHash,_,C,D>::new(lps,session.circuit_info.clone(),circuits.ups_circuit_whitelist_root().await?).await?;
 manager.prove_ups_start(circuits.as_ref()).await?;
 session.user_session_mgrs.insert(key,manager);Ok(())
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn source_pin_is_canonical_and_cannot_change_mutating_or_resident_modes(){
  assert_eq!(parse_pin("preflight",Some("123")).unwrap(),Some(123));
  for action in ["submit","register","broadcast-prepared","verify-prepared","serve-preflight","identity"]{assert!(parse_pin(action,Some("123")).is_err());}
  for value in ["0","01","+1"," 1","4294967296",""]{assert!(parse_pin("preflight",Some(value)).is_err());}
 }
 #[test]fn source_pin_cannot_use_future_unmaterialized_or_nonprogressing_state(){
  bounds(20,25,26,19,1).unwrap();
  for args in [(26,25,26,19,1),(20,25,24,19,1),(20,25,26,20,1),(20,25,26,19,0)]{assert!(bounds(args.0,args.1,args.2,args.3,args.4).is_err());}
 }
}
