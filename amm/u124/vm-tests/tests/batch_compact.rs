//! New compact key: actual-stack/session binding and canonical logical padding.
use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::{hash_types::HashOut,poseidon::PoseidonHash}};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{dpn::{sd_key::{SDKeyTransactionInfo},proving_session::DPNProvingSessionCompactMethodCall},qdata::{user::PsyUserLeaf,user_contract_state::SignContext,ups_signature::PsyUserProvingSessionSignatureDataCompact}};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_config::{PSY_NETWORK_MAGIC,network_constants::DEFAULT_CALLER_CONTRACT_ID_U64};
use psy_template_u124_markets::market_key::{compute_tx_stack_hash,SDKeyCircuitGadget};
use psy_template_u124_markets::market_key::{SDKeyCircuitWitnessInput,SDKeySessionContext};
use psy_template_u124_markets::{batch_policy,batch_compact};
use serde_json::Value;
fn f(n:u64)->F{F::from_canonical_u64(n)}
fn infos(spec:&Value,fields:&[u64])->Result<Vec<SDKeyTransactionInfo<F>>>{
 let all=spec["branches"].as_array().unwrap().iter().flat_map(|b|b["calls"].as_array().unwrap()).chain([&spec["noop"],&spec["expire"]]).collect::<Vec<_>>();
 batch_policy::expected_calls(spec,fields)?.iter().map(|c|{let d=all.iter().find(|d|d["contract_id"]==c["contract_id"]&&d["method_name"]==c["method_name"]).unwrap();Ok(DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(DEFAULT_CALLER_CONTRACT_ID_U64),f(c["contract_id"].as_u64().unwrap()),f(d["method_id"].as_u64().unwrap()),&c["inputs"].as_array().unwrap().iter().map(|x|f(x.as_u64().unwrap())).collect::<Vec<_>>()).into())}).collect()
}
async fn prove(g:&SDKeyCircuitGadget,spec:&Value,fields:&[u64],attack:usize)->Result<()>{
 let mut logical=infos(spec,fields)?;
 let noop=|c:&SDKeyTransactionInfo<F>|c.contract_id==f(spec["noop"]["contract_id"].as_u64().unwrap())&&c.method_id==f(spec["noop"]["method_id"].as_u64().unwrap());
 let mut actual=logical.iter().filter(|c|!noop(c)).copied().collect::<Vec<_>>();
 let user=PsyUserLeaf{user_id:f(123),last_checkpoint_id:f(7),..Default::default()};let mut end=user;end.nonce=f(1);
 let mut start=user.qfhash::<PoseidonHash>();let mut cp=QHashOut(HashOut::ZERO);let mut tree=QHashOut(HashOut::ZERO);let mut domain=PSY_NETWORK_MAGIC;
 match attack{1=>actual[0].contract_id=f(999),2=>{actual.pop();},3=>{actual.push(actual[0]);},4=>end.nonce=f(2),5=>end.user_state_tree_root=QHashOut(HashOut{elements:[f(7);4]}),6=>start=QHashOut(HashOut{elements:[f(8);4]}),7=>cp=QHashOut(HashOut{elements:[f(9);4]}),8=>tree=QHashOut(HashOut{elements:[f(10);4]}),9=>domain+=1,10=>{let n=logical.iter().find(|c|noop(c)).unwrap();actual.insert(1,*n);},11=>{logical[0].caller_contract_id=f(12);actual[0].caller_contract_id=f(12);},12=>{actual.swap(0,1);},13=>{let n=logical.iter_mut().find(|c|noop(c)).unwrap();n.inputs_length=f(1);},_=>{}}
 let data=PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:start,end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:cp,tx_stack_hash:compute_tx_stack_hash(&actual),tx_count:f(actual.len()as u64)};
 let sig=data.get_sig_action_for_user::<PoseidonHash>(domain,f(123),end.nonce,SignContext::new(tree,user)).get_qhash::<PoseidonHash>();
 let input=SDKeyCircuitWitnessInput{session_context:SDKeySessionContext{start_user_leaf:user,start_user_leaf_hash:user.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:QHashOut(HashOut::ZERO),checkpoint_tree_root:QHashOut(HashOut::ZERO),current_user_leaf:user,nonce:f(1)},circuit_inputs:fields.iter().copied().map(f).collect(),transaction_infos:logical,tx_stack_hash:compute_tx_stack_hash(&actual),tx_count:f(actual.len()as u64),state_reader_results:None,secp256k1_slots:vec![],checkpoint_id:f(7),user_id:f(123)};
 let proof=g.prove(QHashOut(HashOut{elements:[F::ONE;4]}),&input,sig).await?;g.minifier_chain.as_ref().unwrap().verify(proof)?;Ok(())
}
#[tokio::test]
async fn compact_four_markets_reject_stack_and_session_substitutions()->Result<()>{
 let root=std::env::var("BATCH_BUILD")?;
 for market in ["amm","orderbook","bondingcurve","nftmarket"]{
  let spec:Value=serde_json::from_slice(&std::fs::read(format!("{root}/{market}/policy.json"))?)?;let g=batch_compact::build(&spec)?;
  let mut commit=vec![0;74];commit[0]=1;commit[1]=1;commit[2]=2;commit[3]=120;commit[4]=300;commit[5]=200;commit[6]=201;commit[9]=1;commit[10]=2;commit[73]=1_000_000_000;
  assert_eq!(batch_compact::calls(&spec,&commit)?.len(),3);prove(&g,&spec,&commit,0).await?;
  for attack in 1..=13{assert!(prove(&g,&spec,&commit,attack).await.is_err(),"{market}: accepted attack {attack}");}
  let mut expire=vec![0;74];expire[0]=3;expire[1]=1;expire[73]=1_000_000_000;assert_eq!(batch_compact::calls(&spec,&expire)?.len(),2);prove(&g,&spec,&expire,0).await?;
  for op in spec["operations"].as_array().unwrap(){
   let mut fields=vec![0;74];fields[0]=if op["maintenance"]==true{4}else{2};if fields[0]==2{fields[1]=1;}
   fields[21]=op["branch"].as_u64().unwrap();for c in op["calls"].as_array().unwrap(){for a in c["inputs"].as_array().unwrap(){if let Some(i)=a["witness"].as_u64(){fields[21+i as usize]=100+i;}}}fields[73]=1_000_000_000;
   prove(&g,&spec,&fields,0).await?;
  }
  println!("COMPACT_KEY {market}: fingerprint {}; all operation templates and 13 stack/session attacks checked",g.get_fingerprint());
 }
 Ok(())
}
