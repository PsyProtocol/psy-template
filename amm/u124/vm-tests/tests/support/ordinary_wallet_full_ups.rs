//! Fresh ordinary-signature complete UPSs. Synthetic authenticated checkpoints,
//! real compiled market/FT/NFT/native bytecode, no RPC or network submission.
use super::*;
use psy_common_circuit::circuits::zk_signature3::core::PsyBasicZKSignatureCircuit;
use psy_crypto::signature::zk::wallet::SimplePsyPrivateKey;
use psy_provider::request::QSubmitEndCapRPCRequest;

#[tokio::test]
#[ignore="requires frozen fixtures and a fresh output directory; full proving"]
async fn four_market_ordinary_wallet_complete_ups() -> Result<()> {
 let output=std::env::var("ORDINARY_FULL_UPS_OUT")?;
 fs::create_dir(&output)?;
 let selected=std::env::var("ORDINARY_FULL_UPS_MARKETS").unwrap_or_else(|_|"amm,orderbook,bondingcurve,nftmarket".into());
 let mode=std::env::var("ORDINARY_FULL_UPS_MODE").unwrap_or_else(|_|"fund".into());
 ensure!(["fund","claim"].contains(&mode.as_str()),"ordinary action mode");
 let mut rows=Vec::new();
 for kind in selected.split(',') {
  ensure!(["amm","orderbook","bondingcurve","nftmarket"].contains(&kind),"reviewed market fixture only");
  let started=Instant::now();let mut w=World::new(kind)?;let user=201;let deadline=w.checkpoint+64;let qty=(1u128<<62)+17;
  let mut calls:Vec<Value>=Vec::new();
  if mode=="claim" {
   if kind=="nftmarket" {w.give_nft(V,0,4)?;w.run(V,NFT,"acknowledge",&[user])?;w.run(V,NFT,"transfer",&[0,user])?;calls.push(json!({"contract_id":NFT,"method_name":"claim","inputs":[0,V]}));}
   else {w.run(I,A,"transfer",&args(&[V],&[qty],&[]))?;w.run(V,A,"claim",&[I])?;w.run(V,A,"transfer",&args(&[user],&[qty],&[]))?;calls.push(json!({"contract_id":A,"method_name":"claim","inputs":[V]}));}
  } else if kind=="amm" {w.pool(10u128.pow(28))?;calls.push(json!({"contract_id":M,"method_name":"open_swap","inputs":args(&[V,0],&[qty,1],&[deadline,1])}));}
  else if kind=="orderbook" {calls.push(json!({"contract_id":M,"method_name":"open_sell","inputs":args(&[V,0],&[qty,1],&[deadline,1])}));}
  else if kind=="bondingcurve" {w.fee(I)?;w.pay(I,A,2_000_000*10u128.pow(18))?;w.operation_maintenance("initialize",0,0,0,0,0,0)?;calls.push(json!({"contract_id":M,"method_name":"open_limit_buy","inputs":args(&[V,1,0],&[(1u128<<110)+17],&[deadline,1])}));}
  else {
   w.run(200,M,"open_listing",&args(&[V,0],&[qty],&[deadline,1]))?;w.fee(200)?;w.run(200,NFT,"transfer",&[0,V])?;
   calls.push(json!({"contract_id":NFT,"method_name":"acknowledge","inputs":[V]}));
   calls.push(json!({"contract_id":M,"method_name":"open_buy","inputs":args(&[V,200,1],&[qty],&[deadline,1])}));
  }
  if mode=="fund" {calls.push(json!({"contract_id":0,"method_name":"transfer","inputs":[V,ESCROW]}));
  calls.push(json!({"contract_id":if kind=="bondingcurve"{B}else{A},"method_name":"transfer","inputs":args(&[V],&[if kind=="bondingcurve"{(1u128<<110)+17}else{qty}],&[])}));
  w.run(V,M,"start_epoch",&[w.val(V,"queue_epoch",0)+1,w.checkpoint+10])?;}
  rows.push(prove_ordinary_calls(&w,user,&calls,&output,kind,&mode,started).await?);
 }
 fs::write(format!("{output}/REPORT.json"),serde_json::to_vec_pretty(&json!({"schema":1,"rows":rows,"broadcast":false,"scope":"fresh complete ordinary signature UPSs; synthetic authenticated checkpoints; fixture setup VM-only; no RPC, live acceptance, TPS or wallet-extension acceptance"}))?)?;
 Ok(())
}

// Reuse the existing ordinary proof/verification path for reviewed candidate
// token bytecode. This is a synthetic checkpoint, never a live issuer signature.
async fn prove_ordinary_calls(w:&World,user:u64,calls:&[Value],output:&str,kind:&str,mode:&str,started:Instant)->Result<Value> {
  let chain=Chain::new(w,calls)?;
  let signature=PsyBasicZKSignatureCircuit::<C,2>::new();
  // Fresh ephemeral fixture key, never read from a wallet, logged or saved.
  let private=QHashOut::<GF>::rand();let key=SimplePsyPrivateKey::new(private);
  let pk=key.get_public_key_for_fingerprint::<PoseidonHash>(signature.get_fingerprint());
  let db=chain.seed(w).await?;
  let mut start=db.get_user_leaf_data(w.checkpoint,user).await?;start.public_key=pk;start.nonce=GF::ZERO;
  db.set_user_leaf_data(w.checkpoint,&start)?;db.set_user_tree_leaf_hash(w.checkpoint,user,start.qfhash::<PoseidonHash>())?;
  let roots=db.get_checkpoint_global_state_roots(w.checkpoint).await?;
  let checkpoint=PsyCheckpointLeaf{global_chain_root:roots.qfhash::<PoseidonHash>(),stats:PsyCheckpointLeafStats::new_empty()};
  db.set_checkpoint_leaf_data(w.checkpoint,&checkpoint)?;db.set_checkpoint_tree_leaf_hash(w.checkpoint,checkpoint.qfhash::<PoseidonHash>())?;
  let mut cache=PsyCmdStoreWithCache::new(w.checkpoint,db);
  for (cid,code) in &chain.code {for i in 0..code.functions.len(){let index=(i*2)as u32;
   let path=ContractFunctionTreeStore::<Store>::get_leaf_sfc(&cache.read_store,w.checkpoint,*cid,index as u64)?;
   ensure!(path.value==chain.whitelists[cid][i*2],"fixed function whitelist identity");
   cache.cache.merkle_cmd_cache.insert(QSRMerkleCmd::GetContractFunctionTreeMerkleProof(QSRMerkleCmdGetContractFunctionTreeMerkleProof{checkpoint_id:w.checkpoint,contract_id:*cid as u32,function_id:index}),path);
  }}
  let lps=PsyLocalProvingSessionStore::new_at_with_cmd_store(cache,f(w.checkpoint),f(user),GF::ONE,start.event_index,16);
  let mut info=SessionCircuitInfoStore::new();chain.cm.register_info(&mut info).await;
  let mut session=Manager::new(lps,info,chain.cm.ups_circuit_whitelist_root).await?;session.prove_ups_start(&chain.cm).await?;
  let mut reference=(*w).clone();
  for c in calls {
   let cid=c["contract_id"].as_u64().unwrap();let name=c["method_name"].as_str().unwrap();
   let input=c["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>();
   let (index,def)=chain.cm.resolve_contract_function_by_method_name(cid,&chain.code[&cid],name.into()).await?;
   session.prove_standard_call(&chain.cm,f(cid),index as u32,&def,input.iter().copied().map(f).collect()).await?;
   reference.run(user,cid,name,&input)?;
  }
  session.prove_burn_fee(&chain.cm).await?;
  let burn=session.require_lps()?.last_transaction_record().call_data.call_data.inputs[0].to_canonical_u64();
  reference.run(user,0,"burn",&[burn])?;
  let header=*session.get_current_ups_header();let nonce=GF::ONE;
  ensure!(header.current_state.tx_count==f(calls.len()as u64+1),"complete ordinary stack including burn");
  let sighash=session.get_sighash(PSY_NETWORK_MAGIC,nonce);
  let sig=signature.prove_base(private,sighash)?;
  let slots=session.require_lps()?.get_total_slots_modified();
  let proof=session.prove_end_cap(&chain.cm,PSY_NETWORK_MAGIC,nonce,slots,signature.get_fingerprint(),key.get_public_key_param::<PoseidonHash>(),sig,signature.get_verifier_config_ref().clone()).await?;
  chain.cm.ups_end_cap.verify_proof(proof.clone())?;
  let fixed_profile=psy_template_u124_markets::live_guard::verify_ups_profile(&chain.cm)?;
  psy_template_u124_markets::fixed_verifier::with_verifier(|v|{v.verify(proof.clone())?;Ok(())})?;
  let api=session.get_api_input().await?;validate_endcap_binding(&api.core,&proof.public_inputs)?;
  ensure!(api.core.new_user_leaf.public_key==pk&&api.core.new_user_leaf.nonce==nonce,"ordinary signer and nonce");
  ensure!(api.core.stats.guta_fees_collected.to_canonical_u64()+api.core.stats.da_fees_collected.to_canonical_u64()==burn,"exact actual fee");
  for ((u,c,o),want) in &reference.slots {if *u!=user||!chain.code.contains_key(c){continue;}
   let actual=session.require_lps_mut()?.get_contract_state_slot(f(*c),f(*o/4)).await?.value.0.elements[(*o%4)as usize].to_canonical_u64();ensure!(actual==*want,"ordinary reference state mismatch");
  }
  let mut rejection_cases=Vec::new();
  for case in ["nonce","signer","checkpoint","start-root","end-root","fees","call-count"] {
   let mut changed=api.core;
   match case {"nonce"=>changed.new_user_leaf.nonce+=GF::ONE,"signer"=>changed.new_user_leaf.public_key.0.elements[0]+=GF::ONE,"checkpoint"=>changed.checkpoint_id+=GF::ONE,"start-root"=>changed.state_transition.start_user_leaf_hash.0.elements[0]+=GF::ONE,"end-root"=>changed.state_transition.end_user_leaf_hash.0.elements[0]+=GF::ONE,"fees"=>changed.stats.da_fees_collected+=GF::ONE,_=>changed.stats.total_transactions+=GF::ONE};
   ensure!(validate_endcap_binding(&changed,&proof.public_inputs).is_err(),"modified public endpoint accepted");rejection_cases.push(case);
  }
  let mut changed=proof.clone();changed.public_inputs[0]+=GF::ONE;ensure!(chain.cm.ups_end_cap.verify_proof(changed).is_err(),"altered complete proof accepted");
  let request=QSubmitEndCapRPCRequest{user_ec_input:api,proof:bincode::serialize(&proof)?};
  let bytes=serde_json::to_vec(&request)?;let path=format!("{output}/{kind}-request.json");
  let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&path)?;use std::io::Write;file.write_all(&bytes)?;file.sync_all()?;
  let row=json!({"market":kind,"action":mode,"userId":user,"callsIncludingBurn":calls.len()+1,"actualFee":burn,"proofBytes":request.proof.len(),"fullUpsVerified":true,"fixedNodeVerifier":fixed_profile,"ordinarySignature":true,"sigHash":sighash.to_string(),"requestSha256":format!("{:x}",Sha256::digest(&bytes)),"sourceCheckpoint":w.checkpoint,"startUserLeafHash":request.user_ec_input.core.state_transition.start_user_leaf_hash.to_string(),"endUserLeafHash":request.user_ec_input.core.state_transition.end_user_leaf_hash.to_string(),"publicKeyHash":pk.to_string(),"rejectedMetadata":rejection_cases,"corruptProofRejected":true,"referenceBytecodeStateMatched":true,"elapsedMilliseconds":started.elapsed().as_secs_f64()*1000.,"broadcast":false});
  println!("ORDINARY_FULL_UPS {}",serde_json::to_string(&row)?);Ok(row)
}

#[tokio::test]
#[ignore="exact candidate QA bytecode, frozen fixtures and fresh output required; complete UPS"]
async fn exact_qa_token_initialization_complete_ups() -> Result<()> {
 let started=Instant::now();
 let output=std::env::var("QA_TOKEN_SETUP_OUT")?;
 fs::create_dir(&output)?;
 let root=std::env::var("BATCH_BUILD")?;
 ensure!(I>0 && I<16777216 && A!=B && A>=5 && B>=5,"explicit synthetic identity bounds");
 let mut methods=std::collections::HashMap::new();
 let mut artifacts=Vec::new();
 for(cid,path)in [(0,"native.json".to_string()),(A,"token/compilation_artifact.json".to_string()),(B,super::super::token_artifact(B))] {
  let bytes=fs::read(format!("{root}/{path}"))?;
  let artifact:Value=serde_json::from_slice(&bytes)?;
  let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(artifact["circuit_definitions"].clone())?;
  for d in defs {methods.insert((cid,d.name.clone()),d);}
  artifacts.push(json!({"contractId":cid,"artifactSha256":format!("{:x}",Sha256::digest(&bytes))}));
 }
 // Only the ordinary issuer's native balance exists initially. Neither token
 // has metadata, supply, balance, allowance or an outbox at this checkpoint.
 let policy:Value=serde_json::from_slice(&fs::read(format!("{root}/amm/policy.json"))?)?;
 let mut w=World{state:psy_vm::dpn::eval::executor::InMemoryStateBackend::new(),methods:std::sync::Arc::new(methods),fields:std::sync::Arc::new(std::collections::HashMap::new()),policy,checkpoint:100,slots:std::collections::BTreeMap::new(),revision:0,kind:"amm".into(),vault:V};
 w.set(I,0,0,100_000_000_000);
 let quantity=100*10u128.pow(18);
 let mut calls=Vec::new();
 for(cid,symbol)in [(A,super::super::SYMBOL_A),(B,super::super::SYMBOL_B)] {
  let before=w.slots.clone();
  ensure!(w.run(I+1,cid,"set_metadata",&[symbol,18]).is_err(),"wrong issuer accepted");
  ensure!(w.run(I,cid,"set_metadata",&[symbol+1,18]).is_err(),"wrong QA symbol accepted");
  ensure!(w.run(I,cid,"set_metadata",&[symbol,17]).is_err(),"wrong QA precision accepted");
  ensure!(w.slots==before,"rejected initialization modified state");
  calls.push(json!({"contract_id":cid,"method_name":"set_metadata","inputs":[symbol,18]}));
  calls.push(json!({"contract_id":cid,"method_name":"set_max_supply","inputs":super::super::pair(quantity)}));
  calls.push(json!({"contract_id":cid,"method_name":"mint","inputs":super::super::pair(quantity)}));
 }
 let mut reference=w.clone();
 for c in &calls {
  let values=c["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>();
  reference.run(I,c["contract_id"].as_u64().unwrap(),c["method_name"].as_str().unwrap(),&values)?;
 }
 for cid in [A,B] {
  ensure!(reference.balance(I,cid)==quantity,"exact initial supply");
  let before=reference.slots.clone();
  ensure!(reference.run(I,cid,"mint",&[1,0]).is_err(),"cap overflow accepted");
  ensure!(reference.run(I,cid,"set_max_supply",&[1,0]).is_err(),"cap reset accepted");
  ensure!(reference.slots==before,"rejected supply mutation changed state");
 }
 let proof=prove_ordinary_calls(&w,I,&calls,&output,"qa-token-setup","metadata-cap-mint",started).await?;
 let report=json!({"schema":1,"fullUpsVerified":true,"initialTokenStateEmpty":true,"issuerUserId":I,"amountPerToken":quantity.to_string(),"decimals":18,"candidateArtifacts":artifacts,"proof":proof,"negativeBytecodeCases":["wrong-issuer","wrong-symbol","wrong-precision","cap-overflow","cap-reset","failure-state-unchanged"],"scope":"Exact candidate bytecode and complete ordinary UPS at synthetic checkpoint and provisional contract IDs. No RPC, deployment, live identity signature or extension approval. Assigned live IDs require fresh checks and ordinary initialization proof before sending.","broadcast":false});
 fs::write(format!("{output}/REPORT.json"),serde_json::to_vec_pretty(&report)?)?;
 Ok(())
}
