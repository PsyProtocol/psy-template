//! Undeployed candidate only. Synthetic checkpoint data is not qualified entropy.
use super::*;
use psy_client_common::traits::to_qfelts::ToQFelts;
use psy_template_u124_markets::checkpoint_processor::rank;

fn setup(kind:&str,count:usize)->Result<(World,Vec<u64>)>{
 ensure!((2..=4).contains(&count),"processor capacity");
 let mut w=World::new(kind)?;ensure!((w.policy["version"]==3||w.policy["version"]==4),"distinct processor fixtures required");
 if kind=="amm"{
  // Explicit synthetic pool prestate, not a liquidity-admission proof.
  let n=10u128.pow(24);for asset in[A,B]{w.pay(I,asset,n)?;w.run(V,asset,"claim",&[I])?;}
  for(name,value)in[("reserve_a",n),("reserve_b",n),("total_shares",n)]{let p=super::super::pair(value);for j in 0..2{w.set(V,M,w.fields[name]+j as u64,p[j]);}}
  for(asset,name)in[(A,"settled_a"),(B,"settled_b")]{let p=super::super::pair(n+1);let _=asset;for j in 0..2{w.set(V,M,w.fields[name]+2*I+j as u64,p[j]);}}
 }else{
  let unit=w.policy["config"]["unit"].as_str().unwrap().parse::<u128>()?;
  let lots=w.policy["config"]["cap"].as_u64().unwrap()+w.policy["config"]["liquidity"].as_u64().unwrap();
  w.fee(I)?;w.pay(I,A,lots as u128*unit)?;w.operation_maintenance("initialize",0,0,0,0,0,0)?;
 }
 let users=(200..200+count as u64).collect::<Vec<_>>();
 for u in &users{
  if kind=="amm"{let n=10u128.pow(20);w.run(*u,M,"open_swap",&args(&[V,0],&[n,1],&[200,1]))?;w.pay(*u,A,n)?;}
  else{let n=2*10u128.pow(18);w.run(*u,M,"open_limit_buy",&args(&[V,1,0],&[n],&[200,1]))?;w.pay(*u,B,n)?;}
  w.fee(*u)?;
 }
 w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;
 Ok((w,users))
}
fn commit(w:&World,users:&[u64])->Vec<u64>{let mut f=vec![0;80];f[0]=1;f[1]=w.val(V,"batch_id",0)+1;f[2]=users.len()as u64;f[3]=w.checkpoint+20;f[4]=S;f[73]=ESCROW;if w.policy["version"]==4{f[78]=psy_template_u124_markets::processor_policy::PREVIOUS_TAG;}for(i,u)in users.iter().enumerate(){f[5+i]=*u;f[9+i]=1;}f}
fn source(w:&mut World)->Result<[u64;4]>{
 let draw=w.val(V,"processor_draw",0);ensure!(draw==w.checkpoint,"fixture advances to exact draw");
 let seed=[11,22,33,44];let mut stats=PsyCheckpointLeafStats::new_empty();stats.random_seed=QHashOut(HashOut{elements:seed.map(f)});
 w.state.set_checkpoint_stats(draw,stats.to_qfelts().into_iter().map(|n|n.to_canonical_u64()).collect());Ok(seed)
}
fn settle(w:&World,seed:[u64;4])->Result<Vec<u64>>{
 let count=w.val(V,"batch_count",0)as usize;let mut owners=[0;4];let mut nonces=[0;4];let root=std::array::from_fn(|i|w.val(V,"batch_root",i as u64));for i in 0..count{owners[i]=w.val(V,"frozen_owner",i as u64);nonces[i]=w.val(V,"frozen_nonce",i as u64);}
 let draw=w.val(V,"processor_draw",0);let r=rank(M,w.val(V,"batch_id",0),root,seed,draw,owners,nonces,count)?;
 let mut req=w.request(2,vec![],r);req[2]=count as u64;req[3]=draw;req[17..21].copy_from_slice(&r);req[74..78].copy_from_slice(&seed);req[79]=count as u64*ESCROW-ESCROW;
 let(mut ri,mut ro)=(if w.kind=="amm"{w.wide(V,"reserve_a")}else{0},if w.kind=="amm"{w.wide(V,"reserve_b")}else{0});
 for(pos,row)in r[..count].iter().enumerate(){let row=*row as usize;let u=owners[row];let op=if w.kind=="amm"{let input=10u128.pow(20);let out=quote(input,ri,ro);ri+=input;ro-=out;w.fields("swap_0",u,0,input,out,0,0,1,0)}else{let unit=10u128.pow(18);let price=unit+pos as u128*100_000_000_000_000;w.fields("settle_limit_buy_change",u,0,price,unit,2*unit-price,1,1,0)};req[21+13*row..34+13*row].copy_from_slice(&op);}
 Ok(req)
}
fn prepared(kind:&str,count:usize)->Result<(World,Vec<u64>)>{let(mut w,users)=setup(kind,count)?;w.execute(&commit(&w,&users))?;w.checkpoint+=1;let seed=source(&mut w)?;let req=settle(&w,seed)?;Ok((w,req))}

#[test]
fn processor_fee_accounts_for_balance_word_restoration()->Result<()>{
 use psy_template_u124_markets::processor_policy::completion_fee;
 // Preserved failure: 30 prefix words plus a new reward word estimated 31;
 // native word zero restores, and Endcap requires exactly 30 final words.
 ensure!(completion_fee(30,true,true,false)?==1_000_030_000,"restored native word was charged");
 ensure!(completion_fee(31,true,true,true)?==1_000_030_000,"existing reward word counted twice");
 ensure!(completion_fee(30,true,false,false).is_err(),"fee prefix prerequisite omitted");Ok(())
}

#[test]
fn processor_expiry_cannot_reroll_the_same_user_nonce()->Result<()>{
 for kind in["amm","bondingcurve"]{let(mut w,users)=setup(kind,2)?;w.execute(&commit(&w,&users))?;
  w.checkpoint=w.val(V,"batch_expiry",0)+1;w.execute(&w.request(3,vec![],[0;4]))?;
  w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;
  let before=w.slots.clone();ensure!(w.execute(&commit(&w,&users)).is_err()&&w.slots==before,"expired user nonce was re-sealed for another draw");
  for u in users{ensure!(w.val(V,"consumed",u)==1,"expiry must retire every accepted nonce, independent of executor refunds");}
 }Ok(())
}

#[tokio::test]
#[ignore="isolated public synthetic witness reproduction; not a UPS"]
async fn processor_key_stack_reproduction()->Result<()>{
 use psy_client_data::qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user_contract_state::SignContext};
 let(w,fields)=prepared("amm",4)?;let g=batch_compact::build(&w.policy)?;
 let logical=batch_policy::expected_calls(&w.policy,&fields)?.iter().map(|c|{let cid=c["contract_id"].as_u64().unwrap();let def=&w.methods[&(cid,c["method_name"].as_str().unwrap().into())];let inputs=c["inputs"].as_array().unwrap().iter().map(|n|f(n.as_u64().unwrap())).collect::<Vec<_>>();psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(cid),f(def.method_id as u64),&inputs).into()}).collect::<Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>>();
 for(i,c)in logical.iter().enumerate(){println!("PUBLIC_KEY_SLOT {i} method {} input hash {}",c.method_id,c.inputs_hash);}
 let actual=logical.iter().filter(|c|c.contract_id!=f(M)||c.method_id!=f(w.policy["noop"]["method_id"].as_u64().unwrap())).copied().collect::<Vec<_>>();
 let user=PsyUserLeaf{user_id:f(V),last_checkpoint_id:f(w.checkpoint),..Default::default()};let mut end=user;end.nonce=GF::ONE;
 let stack=psy_template_u124_markets::market_key::compute_tx_stack_hash(&actual);
 let data=PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:user.qfhash::<PoseidonHash>(),end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:QHashOut::ZERO,tx_stack_hash:stack,tx_count:f(actual.len()as u64)};
 let sig=data.get_sig_action_for_user::<PoseidonHash>(PSY_NETWORK_MAGIC,f(V),GF::ONE,SignContext::new(QHashOut::ZERO,user)).get_qhash::<PoseidonHash>();
 let input=SDKeyCircuitWitnessInput{session_context:SDKeySessionContext{start_user_leaf:user,start_user_leaf_hash:user.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:QHashOut::ZERO,checkpoint_tree_root:QHashOut::ZERO,current_user_leaf:user,nonce:GF::ONE},circuit_inputs:fields.into_iter().map(f).collect(),transaction_infos:logical,tx_stack_hash:stack,tx_count:f(actual.len()as u64),state_reader_results:None,secp256k1_slots:vec![],checkpoint_id:f(w.checkpoint),user_id:f(V)};
 let proof=g.prove(QHashOut(HashOut{elements:[GF::ONE;4]}),&input,sig).await?;g.minifier_chain.as_ref().unwrap().verify(proof)?;
 if w.policy["version"]==4{
  let mut bad=input.clone();bad.circuit_inputs[78]=GF::ZERO;ensure!(g.prove(QHashOut(HashOut{elements:[GF::ONE;4]}),&bad,sig).await.is_err(),"legacy profile tag accepted");
  let mut bad=input.clone();bad.checkpoint_id+=GF::ONE;bad.session_context.current_user_leaf.last_checkpoint_id+=GF::ONE;let mut end=bad.session_context.current_user_leaf;end.nonce=GF::ONE;
  let data=PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:bad.session_context.start_user_leaf_hash,end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:QHashOut::ZERO,tx_stack_hash:stack,tx_count:f(actual.len()as u64)};
  let changed=data.get_sig_action_for_user::<PoseidonHash>(PSY_NETWORK_MAGIC,f(V),GF::ONE,SignContext::new(QHashOut::ZERO,bad.session_context.current_user_leaf)).get_qhash::<PoseidonHash>();
  ensure!(g.prove(QHashOut(HashOut{elements:[GF::ONE;4]}),&bad,changed).await.is_err(),"different signed source checkpoint accepted");
 }Ok(())
}

#[test]
fn processor_bytecode_claims_first_and_checkpoint_binding()->Result<()>{
 for kind in["amm","bondingcurve"]{for count in[2,3,4]{let(mut w,req)=prepared(kind,count)?;let before=w.slots.clone();
  if w.policy["version"]==4{let mut late=w.clone();late.checkpoint+=1;ensure!(late.execute(&req).is_err()&&late.slots==before,"later source checkpoint changed the fixed block");let mut wrong=req.clone();wrong.swap(17,18);ensure!(w.execute(&wrong).is_err()&&w.slots==before,"incorrect complete permutation accepted");}
  for index in[3,13,17,74,79]{let mut bad=req.clone();bad[index]+=1;ensure!(w.execute(&bad).is_err(),"mutation {index} accepted");ensure!(w.slots==before,"rejected transaction changed state");}
  let mut duplicate=req.clone();duplicate[18]=duplicate[17];ensure!(w.execute(&duplicate).is_err(),"duplicate rank accepted");
  let calls=batch_compact::calls(&w.policy,&req)?;let first_guard=calls.iter().position(|c|c["method_name"]=="swap_0"||c["method_name"]=="settle_limit_buy").context("settlement guard")?;
  ensure!(calls[..first_guard].iter().filter(|c|c["method_name"]=="claim_batch_member").count()==count,"claims must precede settlement");
  w.execute(&req)?;ensure!(w.val(V,"batch_phase",0)==3,"terminal phase");let terminal=w.slots.clone();ensure!(w.execute(&req).is_err()&&w.slots==terminal,"replay accepted");
  for u in 200..200+count as u64{ensure!(w.val(V,"consumed",u)==1,"unconsumed member");w.run(u,if kind=="amm"{B}else{A},"claim",&[V])?;if kind=="bondingcurve"{w.run(u,B,"claim",&[V])?;}}
  w.run(600,0,"claim",&[V])?;ensure!(w.balance(600,0)==req[79]as u128,"fixed reward receiver");
 }}Ok(())
}

#[tokio::test]
#[ignore="bounded source CFC probe; synthetic checkpoint, no live qualification"]
async fn processor_checkpoint_source_cfc()->Result<()>{
 let(w,req)=prepared("amm",4)?;let needed=batch_compact::calls(&w.policy,&req)?;let chain=Chain::new(&w,&needed)?;let db=chain.seed(&w).await?;
 let lps=PsyLocalProvingSessionStore::new_at(db,f(w.checkpoint),f(V),f(w.revision+1),GF::ZERO,16);let mut info=SessionCircuitInfoStore::new();chain.cm.register_info(&mut info).await;
 let mut session=Manager::new(lps,info,chain.cm.ups_circuit_whitelist_root).await?;session.prove_ups_start(&chain.cm).await?;
 let call=&needed[0];let def=&w.methods[&(M,"begin_checkpoint_batch".into())];let inputs=call["inputs"].as_array().unwrap().iter().map(|n|f(n.as_u64().unwrap())).collect();let witness=session.exec_contract_call(f(M),def,inputs).await?;
 let circuit=DapenContractFunctionCircuit::<C,2>::new(def,31,16,false);let proof=circuit.prove_base(&witness)?;circuit.minifier_chain.verify(proof.clone())?;
 if let Ok(dir)=std::env::var("PROCESSOR_SOURCE_OUT"){fs::create_dir(&dir)?;fs::write(format!("{dir}/proof.bin"),bincode::serialize(&proof)?)?;fs::write(format!("{dir}/result.json"),serde_json::to_vec_pretty(&json!({"sourceCfcVerified":true,"checkpoint":w.checkpoint,"qualifiedRandomness":false,"sealBeforeRelease":false,"broadcast":false}))?)?;}Ok(())
}

#[test]
fn processor_expiry_cancellation_and_exact_sender_recovery()->Result<()>{
 for kind in["amm","bondingcurve"]{
  let(mut w,users)=setup(kind,2)?;let before=users.iter().map(|u|(*u,w.balance(*u,A),w.balance(*u,B),w.balance(*u,0))).collect::<Vec<_>>();
  w.execute(&commit(&w,&users))?;w.run(200,M,"request_cancel",&[])?;
  ensure!(w.run(200,M,"request_recovery",&[V]).is_err(),"active sealed batch allowed recovery");
  ensure!(w.execute(&w.request(3,vec![],[0;4])).is_err(),"premature expiry accepted");
  w.checkpoint=w.val(V,"batch_expiry",0)+1;w.execute(&w.request(3,vec![],[0;4]))?;
  // Each recovery has a distinct bounded sponsor authorization. Its incoming
  // budget covers both the fund-gas UPS and the following refund UPS.
  for(u,a,b,native)in before{
   w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,2])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;
   w.operation_maintenance("fund_gas",S,0,0,0,0,2*ESCROW)?;
   w.run(u,M,"request_cancel",&[])?;w.run(u,M,"request_recovery",&[V])?;
   let amount=if kind=="amm"{10u128.pow(20)}else{2*10u128.pow(18)};
   let op=w.fields(if kind=="amm"{"recover_funding_5"}else{"recover_funding_6"},u,0,if kind=="amm"{amount}else{0},if kind=="amm"{0}else{amount},0,ESCROW,0,0);
   let mut stolen=op.clone();stolen[1]=u+10;let slots=w.slots.clone();ensure!(w.execute(&w.request(4,vec![stolen],[0;4])).is_err()&&w.slots==slots,"wrong recovery recipient accepted");
   w.execute(&w.request(4,vec![op.clone()],[0;4]))?;ensure!(w.val(V,"consumed",u)==1,"canceled nonce not consumed");
   let slots=w.slots.clone();ensure!(w.execute(&w.request(4,vec![op],[0;4])).is_err()&&w.slots==slots,"recovery replay accepted");
   w.run(u,if kind=="amm"{A}else{B},"claim",&[V])?;w.run(u,0,"claim",&[V])?;
   ensure!(w.balance(u,A)==a+if kind=="amm"{amount}else{0}&&w.balance(u,B)==b+if kind=="amm"{0}else{amount}&&w.balance(u,0)==native+ESCROW as u128,"exact refund conservation");
  }
 }Ok(())
}

#[tokio::test]
#[ignore="up to four full UPS proofs; explicit offline budget and fresh output"]
async fn processor_complete_claims_first_ups()->Result<()>{
 ensure!(std::env::var("BATCH_PROOF_PROFILE").as_deref()==Ok("compact-v1"),"compact profile required");let out=std::env::var("BATCH_FULL_UPS_OUT")?;fs::create_dir(&out)?;
 for kind in["amm","bondingcurve"]{let(mut w,users)=setup(kind,4)?;let commit=commit(&w,&users);let mut preview=w.clone();preview.execute(&commit)?;preview.checkpoint+=1;let seed=source(&mut preview)?;let req=settle(&preview,seed)?;
  let mut needed=batch_compact::calls(&w.policy,&commit)?;needed.extend(batch_compact::calls(&w.policy,&req)?);let mut chain=Chain::new(&w,&needed)?;
  if kind=="amm"&&std::env::var_os("PROCESSOR_RESUME_COMMIT").is_some(){
   let bytes=fs::read(std::env::var("PROCESSOR_RESUME_COMMIT")?)?;let request:psy_provider::request::QSubmitEndCapRPCRequest<GF>=serde_json::from_slice(&bytes)?;
   let proof:plonky2::plonk::proof::ProofWithPublicInputs<GF,C,2>=bincode::deserialize(&request.proof)?;psy_template_u124_markets::fixed_verifier::with_verifier(|v|{v.verify(proof.clone())?;Ok(())})?;validate_endcap_binding(&request.user_ec_input.core,&proof.public_inputs)?;
   let core=request.user_ec_input.core;let db=chain.seed(&w).await?;let old=db.get_user_leaf_data(w.checkpoint,V).await?;
   ensure!(core.checkpoint_id==f(w.checkpoint)&&core.state_transition.checkpoint_tree_root_hash==db.get_checkpoint_tree_root(w.checkpoint).await?&&core.state_transition.start_user_leaf_hash==old.qfhash::<PoseidonHash>()&&core.new_user_leaf.nonce==f(w.revision+1)&&core.new_user_leaf.public_key==old.public_key,"exact preserved synthetic commitment identity and authenticated code/layout context");
   let mut restore=commit;restore[73]=(core.stats.guta_fees_collected+core.stats.da_fees_collected).to_canonical_u64();w.execute(&restore)?;w.checkpoint+=1;chain.last_leaf=Some(core.new_user_leaf);let _=chain.seed(&w).await?;
   chain.measurements.push(json!({"phase":"preserved-commit-reverified","requestSha256":format!("{:x}",Sha256::digest(&bytes)),"newProofGenerated":false}));
  }else{chain.prove(&mut w,commit).await?;}
  let seed=source(&mut w)?;let req=settle(&w,seed)?;chain.prove(&mut w,req).await?;ensure!(w.val(V,"batch_phase",0)==3,"full UPS terminal state");
  for u in users{ensure!(w.val(V,"consumed",u)==1,"all members consumed");w.run(u,if kind=="amm"{B}else{A},"claim",&[V])?;if kind=="bondingcurve"{w.run(u,B,"claim",&[V])?;}}
  fs::write(format!("{out}/{kind}-processor.json"),serde_json::to_vec_pretty(&json!({"measurements":chain.measurements,"members":4,"fullUpsVerified":true,"recipientClaims":"real bytecode only; no ordinary-wallet UPS or network","scope":"synthetic checkpoints and initial pool; no source qualification, finality or actual pre-release inclusion proof","liveAuthorization":false,"broadcast":false}))?)?;
 }Ok(())
}
