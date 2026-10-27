//! Dedicated composition key: real signature proofs, actual-stack/session and exact-fee rejection.
use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::{hash_types::HashOut,poseidon::PoseidonHash}};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{dpn::{sd_key::{SDKeyTransactionInfo},proving_session::DPNProvingSessionCompactMethodCall},qdata::{user::PsyUserLeaf,user_contract_state::SignContext,ups_signature::PsyUserProvingSessionSignatureDataCompact}};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_config::{PSY_NETWORK_MAGIC,network_constants::DEFAULT_CALLER_CONTRACT_ID_U64};
use psy_template_u124_markets::market_key::{compute_tx_stack_hash,SDKeyCircuitGadget};
use psy_template_u124_markets::market_key::{SDKeyCircuitWitnessInput,SDKeySessionContext};
use psy_template_u124_markets::{batch_policy,composition_policy};
use serde_json::Value;
fn f(n:u64)->F{F::from_canonical_u64(n)}
fn infos(spec:&Value,fields:&[u64])->Result<Vec<SDKeyTransactionInfo<F>>>{
 let all=spec["operations"].as_array().unwrap().iter().flat_map(|b|b["calls"].as_array().unwrap()).chain([&spec["noop"],&spec["expire"],&spec["burn"]]).collect::<Vec<_>>();
 batch_policy::expected_calls(spec,fields)?.iter().map(|c|{let d=all.iter().find(|d|d["contract_id"]==c["contract_id"]&&d["method_name"]==c["method_name"]).unwrap();Ok(DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(DEFAULT_CALLER_CONTRACT_ID_U64),f(c["contract_id"].as_u64().unwrap()),f(d["method_id"].as_u64().unwrap()),&c["inputs"].as_array().unwrap().iter().map(|x|f(x.as_u64().unwrap())).collect::<Vec<_>>()).into())}).collect()
}
async fn prove(g:&SDKeyCircuitGadget,spec:&Value,fields:&[u64],attack:usize)->Result<()>{
 let mut fields=fields.to_vec();if attack==14 {fields[33]+=1000;}if attack==15 {fields[0]=1;fields[21..73].fill(0);}
 let mut logical=infos(spec,&fields)?;
 let noop=|c:&SDKeyTransactionInfo<F>|c.contract_id==f(spec["noop"]["contract_id"].as_u64().unwrap())&&c.method_id==f(spec["noop"]["method_id"].as_u64().unwrap());
 let mut actual=logical.iter().filter(|c|!noop(c)).copied().collect::<Vec<_>>();
 let user=PsyUserLeaf{user_id:f(123),last_checkpoint_id:f(7),..Default::default()};let mut end=user;end.nonce=f(1);
 let mut fresh=user;fresh.last_checkpoint_id=f(0);fresh.user_state_tree_root=QHashOut(HashOut{elements:psy_config::DEFAULT_USER_STATE_TREE_ROOT_U64.map(f)});let correct_start=fresh.qfhash::<PoseidonHash>();let mut context_start=correct_start;let mut start=correct_start;let mut cp=QHashOut(HashOut::ZERO);let mut tree=QHashOut(HashOut::ZERO);let mut domain=PSY_NETWORK_MAGIC;
 match attack{1=>actual[0].contract_id=f(999),2=>{actual.pop();},3=>{actual.push(actual[0]);},4=>end.nonce=f(2),5=>end.user_state_tree_root=QHashOut(HashOut{elements:[f(7);4]}),6=>start=QHashOut(HashOut{elements:[f(8);4]}),7=>cp=QHashOut(HashOut{elements:[f(9);4]}),8=>tree=QHashOut(HashOut{elements:[f(10);4]}),9=>domain+=1,10=>{let n=logical.iter().find(|c|noop(c)).unwrap();actual.insert(1,*n);},11=>{logical[0].caller_contract_id=f(12);actual[0].caller_contract_id=f(12);},12=>{actual.swap(0,1);},13=>{let n=logical.iter_mut().find(|c|noop(c)).unwrap();n.inputs_length=f(1);},16=>actual[0].inputs_hash=QHashOut(HashOut{elements:[f(77);4]}),17=>{fresh.user_state_tree_root=QHashOut(HashOut{elements:[f(88);4]});context_start=fresh.qfhash::<PoseidonHash>();start=context_start;},18=>{fresh.nonce=f(1);context_start=fresh.qfhash::<PoseidonHash>();start=context_start;},_=>{}}
 let data=PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:start,end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:cp,tx_stack_hash:compute_tx_stack_hash(&actual),tx_count:f(actual.len()as u64)};
 let sig=data.get_sig_action_for_user::<PoseidonHash>(domain,f(123),end.nonce,SignContext::new(tree,user)).get_qhash::<PoseidonHash>();
 let input=SDKeyCircuitWitnessInput{session_context:SDKeySessionContext{start_user_leaf:fresh,start_user_leaf_hash:context_start,checkpoint_leaf_hash:QHashOut(HashOut::ZERO),checkpoint_tree_root:QHashOut(HashOut::ZERO),current_user_leaf:user,nonce:f(1)},circuit_inputs:fields.iter().copied().map(f).collect(),transaction_infos:logical,tx_stack_hash:compute_tx_stack_hash(&actual),tx_count:f(actual.len()as u64),state_reader_results:None,secp256k1_slots:vec![],checkpoint_id:f(7),user_id:f(123)};
 let proof=g.prove(QHashOut(HashOut{elements:[F::ONE;4]}),&input,sig).await?;g.minifier_chain.as_ref().unwrap().verify(proof)?;Ok(())
}

#[tokio::test]
async fn dedicated_composition_key_binds_all_templates_stack_session_and_exact_burn()->Result<()> {
 let root=std::env::var("COMPOSITION_BUILD")?;let spec:Value=serde_json::from_slice(&std::fs::read(format!("{root}/policy.json"))?)?;
 let g=composition_policy::build(&spec)?;let mut fund=vec![0;74];fund[0]=4;fund[21]=1;fund[22]=200;fund[23]=1;fund[33]=1_000_000_000;fund[73]=1_000_000_000;
 prove(&g,&spec,&fund,0).await?;for attack in 1..=18{assert!(prove(&g,&spec,&fund,attack).await.is_err(),"composition accepted stack/session/fee attack {attack}");}
 for op in spec["operations"].as_array().unwrap(){let mut fields=vec![0;74];fields[0]=4;fields[21]=op["branch"].as_u64().unwrap();for c in op["calls"].as_array().unwrap(){for a in c["inputs"].as_array().unwrap(){if let Some(i)=a["witness"].as_u64(){fields[21+i as usize]=100+i;}}}fields[33]=1_000_000_000;fields[73]=1_000_000_000;prove(&g,&spec,&fields,0).await?;}
 println!("COMPOSITION_KEY fingerprint {}; all 18 operation templates and 18 stack/session/fee/initialization attacks checked",g.get_fingerprint());Ok(())
}
