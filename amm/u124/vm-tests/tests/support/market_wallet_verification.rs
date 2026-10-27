//! Real leaf proofs and complete ordinary UPS for the public wallet verifier.
//! All state is synthetic; the ephemeral private key is never persisted.
use super::*;
use base64::{Engine,engine::general_purpose::STANDARD as B64};
use psy_template_u124_markets::{wallet_verification::*,wallet_verifier_export::*};
use psy_common_circuit::circuits::zk_signature3::core::PsyBasicZKSignatureCircuit;
use psy_crypto::signature::zk::wallet::SimplePsyPrivateKey;
use psy_ups_circuit::session::TraceStandardStepInput;
async fn session_for(chain:&Chain,db:Store,cp:u64,user:u64,start:psy_client_data::qdata::user::PsyUserLeaf<GF>)->Result<Manager>{
 let mut cache=PsyCmdStoreWithCache::new(cp,db);
 for(cid,code)in &chain.code{for i in 0..code.functions.len(){let index=(i*2)as u32;let path=ContractFunctionTreeStore::<Store>::get_leaf_sfc(&cache.read_store,cp,*cid,index as u64)?;ensure!(path.value==chain.whitelists[cid][i*2],"source function proof");cache.cache.merkle_cmd_cache.insert(QSRMerkleCmd::GetContractFunctionTreeMerkleProof(QSRMerkleCmdGetContractFunctionTreeMerkleProof{checkpoint_id:cp,contract_id:*cid as u32,function_id:index}),path);}}
 let lps=PsyLocalProvingSessionStore::new_at_with_cmd_store(cache,f(cp),f(user),GF::ONE,start.event_index,16);
 let mut info=SessionCircuitInfoStore::new();chain.cm.register_info(&mut info).await;
 let mut s=Manager::new(lps,info,chain.cm.ups_circuit_whitelist_root).await?;s.prove_ups_start(&chain.cm).await?;Ok(s)
}
#[tokio::test]
#[ignore="real ordinary proof bundle; exact source bytecode and fresh output required"]
async fn full_stack_wallet_verifier_and_mutations()->Result<()>{
 let out=std::env::var("MARKET_WALLET_VERIFIER_OUT")?;fs::create_dir(&out)?;
 let mut w=World::new("bondingcurve")?;let user=201;let amount=(1u128<<110)+17;
 w.fee(I)?;w.pay(I,A,2_000_000*10u128.pow(18))?;w.operation_maintenance("initialize",0,0,0,0,0,0)?;
 let mut calls=vec![json!({"contract_id":M,"method_name":"open_limit_buy","inputs":args(&[V,1,0],&[amount],&[w.checkpoint+64,1])}),json!({"contract_id":0,"method_name":"transfer","inputs":[V,ESCROW]}),json!({"contract_id":B,"method_name":"transfer","inputs":args(&[V],&[amount],&[])})];
 let chain=Chain::new(&w,&calls)?;let signature=PsyBasicZKSignatureCircuit::<C,2>::new();let private=QHashOut::<GF>::rand();let key=SimplePsyPrivateKey::new(private);let pk=key.get_public_key_for_fingerprint::<PoseidonHash>(signature.get_fingerprint());
 let db=chain.seed(&w).await?;let mut start=db.get_user_leaf_data(w.checkpoint,user).await?;start.public_key=pk;start.nonce=GF::ZERO;db.set_user_leaf_data(w.checkpoint,&start)?;db.set_user_tree_leaf_hash(w.checkpoint,user,start.qfhash::<PoseidonHash>())?;
 let roots=db.get_checkpoint_global_state_roots(w.checkpoint).await?;let checkpoint=PsyCheckpointLeaf{global_chain_root:roots.qfhash::<PoseidonHash>(),stats:PsyCheckpointLeafStats::new_empty()};db.set_checkpoint_leaf_data(w.checkpoint,&checkpoint)?;db.set_checkpoint_tree_leaf_hash(w.checkpoint,checkpoint.qfhash::<PoseidonHash>())?;
 let mut trace=session_for(&chain,db.clone(),w.checkpoint,user,start).await?;
 let start_header=*trace.get_current_ups_header();let mut traced=vec![];
 for c in &calls{let cid=c["contract_id"].as_u64().unwrap();let (index,def)=chain.cm.resolve_contract_function_by_method_name(cid,&chain.code[&cid],c["method_name"].as_str().unwrap().into()).await?;let inputs=c["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect();traced.push(trace.trace_standard_call(&chain.cm,f(cid),index as u32,&def,inputs).await?);}
 chain.cm.resolve_contract_function_by_method_name(0,&chain.code[&0],"burn".into()).await?;
 traced.push(trace.trace_burn_fee(&chain.cm).await?);let burn=trace.require_lps()?.last_transaction_record().call_data.call_data.inputs[0].to_canonical_u64();calls.push(json!({"contract_id":0,"method_name":"burn","inputs":[burn]}));
 let slots=trace.require_lps()?.get_total_slots_modified();let mut prove=session_for(&chain,db,w.checkpoint,user,start).await?;
 let start_proof_b64=B64.encode(bincode::serialize(&prove.proof_tree_state.leaf_proofs.front().context("start proof")?.proof)?);
 let mut public_steps=vec![];let mut pack=export_fixed_verifiers(&chain.cm,&signature)?;
 for t in traced{
  ensure!(t.deferred.is_empty(),"no nested debt");let before=*prove.get_current_ups_header();
  let step=TraceStandardStepInput{contract_id:t.contract_id,fn_id:t.fn_id,cfc_witness:t.cfc_witness.clone(),state_delta:t.state_delta.clone(),cfc_inclusion_proof:t.cfc_inclusion_proof.clone(),end_header:t.end_header};
  let produced=prove.prove_step_standard(&chain.cm,prove.get_checkpoint_state(),&before,&step,None).await?;
  let known=prove.get_last_ups_step_proof_info().known_proof_tree_root;
  prove.set_previous_ups_header(before);prove.set_current_ups_header(t.end_header);
  let leaf=t.cfc_inclusion_proof.contract_inclusion_proof.contract_leaf;
  if !pack.contracts.iter().any(|c|c.contract_id==t.contract_id){pack.contracts.push(ContractVerifier{contract_id:t.contract_id,code_root:leaf.code_root,layout_root:leaf.state_layout_root,function_root:leaf.function_tree_root,height:leaf.state_tree_height.to_canonical_u64(),fields:leaf.state_layout_field_count.to_canonical_u64(),slots:leaf.state_layout_slot_count.to_canonical_u64(),methods:vec![]});}
  let contract=pack.contracts.iter_mut().find(|c|c.contract_id==t.contract_id).unwrap();
  if !contract.methods.iter().any(|m|m.method_id==t.method_id){let c=chain.cm.contract_circuits.get(&(t.contract_id,t.fn_id)).context("resolved fixed CFC")?;contract.methods.push(MethodVerifier{method_id:t.method_id,name:t.method_name.clone(),arity:c.fn_def.circuit_inputs.len(),outputs:c.fn_def.circuit_outputs.len(),function_index:t.fn_id as u64,fingerprint:c.get_fingerprint(),verifier_b64:encode_verifier(c.as_ref())?});}
  public_steps.push(PublicStep{contract_id:t.contract_id,method_id:t.method_id,method_name:t.method_name,cfc_session_root:t.cfc_witness.session_proof_tree_root,state_delta:t.state_delta,inclusion:t.cfc_inclusion_proof,end_header:t.end_header,cfc_proof_b64:B64.encode(bincode::serialize(&produced.cfc_proof)?),ups_proof_b64:B64.encode(bincode::serialize(&produced.ups_proof)?),ups_known_root:known});
 }
 let sighash=prove.get_sighash(PSY_NETWORK_MAGIC,GF::ONE);let sig=signature.prove_base(private,sighash)?;let sign_proof_b64=B64.encode(bincode::serialize(&sig)?);
 let end=prove.prove_end_cap(&chain.cm,PSY_NETWORK_MAGIC,GF::ONE,slots,signature.get_fingerprint(),key.get_public_key_param::<PoseidonHash>(),sig,signature.get_verifier_config_ref().clone()).await?;
 trace.set_current_ups_header(*prove.get_current_ups_header());let api=trace.get_api_input().await?;validate_endcap_binding(&api.core,&end.public_inputs)?;
 let request=PublicRequest{user_ec_input:api,proof:bincode::serialize(&end)?};let bytes=serde_json::to_vec(&request)?;
 let approved=calls.iter().map(|c|ApprovedCall{contract_id:c["contract_id"].as_u64().unwrap().to_string(),method_id:None,method_name:c["method_name"].as_str().unwrap().into(),inputs:c["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap().to_string()).collect()}).collect();
 let approval=WalletApproval{user_id:user,public_key:pk,nonce:1,checkpoint_min:w.checkpoint,checkpoint_max:w.checkpoint+64,start_leaf:start.qfhash::<PoseidonHash>(),max_fee:ESCROW,network_magic:PSY_NETWORK_MAGIC,sdk_manifest:pack.sdk_manifest.clone(),calls:approved};
 let checkpoint_state=trace.get_checkpoint_state();
 let bundle=PublicBundle{schema:1,anchor:PublicAnchor{start_checkpoint_id:w.checkpoint,checkpoint_leaf:checkpoint,global_state_roots:roots,ups_step_circuit_whitelist_root:chain.cm.ups_circuit_whitelist_root},start_header,start_proof_b64,steps:public_steps,sign_proof_b64,public_key_param:key.get_public_key_param::<PoseidonHash>(),sig_hash:sighash};

 for(name,v)in[("verifiers",serde_json::to_value(&pack)?),("approval",serde_json::to_value(&approval)?),("bundle",serde_json::to_value(&bundle)?)]{fs::write(format!("{out}/{name}.json"),serde_json::to_vec_pretty(&v)?)?;}
 fs::write(format!("{out}/request.json"),&bytes)?;
 let report=verify_market_request(&pack,&bytes,&approval,&bundle)?;fs::write(format!("{out}/verification.json"),serde_json::to_vec_pretty(&report)?)?;
 let av=serde_json::to_value(&approval)?;let bv=serde_json::to_value(&bundle)?;let mut rejected=vec![];
 for case in ["recipient","asset","amount-high-limb","call-order","nonce","network","start-leaf","expiry","fee-cap","cfc-proof","ups-proof","signature-proof","session-root","delta-root","code-root"]{
  let mut a=av.clone();let mut b=bv.clone();let mut p=serde_json::to_value(&pack)?;
  match case{
   "recipient"=>a["calls"][1]["inputs"][0]=json!("101"),"asset"=>a["calls"][2]["contract_id"]=json!(A.to_string()),"amount-high-limb"=>a["calls"][2]["inputs"][2]=json!("0"),"call-order"=>a["calls"].as_array_mut().unwrap().swap(0,1),"nonce"=>a["nonce"]=json!(2),"network"=>a["network_magic"]=json!(1),"start-leaf"=>a["start_leaf"]=json!(QHashOut::<GF>::ZERO.to_string()),"expiry"=>a["checkpoint_max"]=json!(w.checkpoint-1),"fee-cap"=>a["max_fee"]=json!(1),"cfc-proof"=>b["steps"][0]["cfc_proof_b64"]=json!("AA=="),"ups-proof"=>b["steps"][0]["ups_proof_b64"]=json!("AA=="),"signature-proof"=>b["sign_proof_b64"]=json!("AA=="),"session-root"=>b["steps"][0]["cfc_session_root"]=json!(QHashOut::<GF>::ZERO.to_string()),"delta-root"=>b["steps"][0]["state_delta"]["user_contract_tree_update_proof"]["new_root"]=json!(QHashOut::<GF>::ZERO.to_string()),_=>p["contracts"][0]["code_root"]=json!(QHashOut::<GF>::ZERO.to_string())};
  let a=serde_json::from_value(a)?;let b=serde_json::from_value(b)?;let p=serde_json::from_value(p)?;
  ensure!(verify_market_request(&p,&bytes,&a,&b).is_err(),"accepted mutation {case}");rejected.push(case);
 }
 fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({"completeProofAndAllCallsVerified":true,"calls":approval.calls.len(),"rejected":rejected,"broadcast":false,"scope":"real native proofs on synthetic authenticated state; ephemeral ordinary key; no wallet-extension or live acceptance"}))?)?;Ok(())
}
