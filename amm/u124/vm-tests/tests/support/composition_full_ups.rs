//! Complete synthetic authenticated composition UPSs. No RPC or deployment.
use psy_template_u124_markets::market_key::get_sd_key_public_key_param;
use psy_template_u124_markets::market_key::{SDKeyCircuitWitnessInput,SDKeySessionContext};
use super::world::{World,V,A,B,F as ESCROW};
use psy_vm::dpn::eval::executor::StateBackend;
use anyhow::{ensure,Context,Result};
use std::{collections::{BTreeMap,BTreeSet,HashMap},sync::Arc,time::Instant,fs};
use plonky2::{field::{goldilocks_field::GoldilocksField as GF,types::{Field,PrimeField64}},hash::{hash_types::HashOut,poseidon::PoseidonHash},plonk::config::PoseidonGoldilocksConfig as C};
use kvq::memory::simple::KVQSimpleMemoryBackingStore as Store;
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{qdata::{user::PsyUserLeaf,contract::{PsyContractLeaf,ContractCodeDefinition},checkpoint::{PsyCheckpointLeaf,PsyCheckpointLeafStats,PsyBlockState},ups_end_cap_result::UPSEndCapResultCompact},guta::{api::SubmitUserEndCapNonProofCoreInput,stats::GUTAStats},qstore::controllers::{session_info::SessionCircuitInfoStore,proving_session::{PsyLocalProvingSessionStore,PsyReadLocalProvingSessionStore}},traits::qdatastore::{qmetadata::{QMetaDataStoreReaderSync,QMetaDataStoreWriterSync},qtreedata::{QTreeDataStoreReaderSync,QTreeDataStoreWriterSync}}};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_crypto::signature::zk::data::ZKPublicKeyInfo;
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit;
use psy_ups_circuit::{circuit_manager::core::PsyUPSStepCircuitManager,session::UserProvingSessionManager};
use psy_vm::{ups::{circuit_manager::UPSCircuitManager},dpn::{contract::{dapen_fc_to_cfc_code_definition,hash_dpn_function},vm::def::DPNFunctionCircuitDefinition}};
use psy_config::{PSY_NETWORK_MAGIC,DA_FEE,network_constants::GUTA_FEE};
use psy_template_u124_markets::{batch_compact,batch_policy,composition_policy,proof_binding::validate_endcap_binding};
use serde_json::{Value,json};
use psy_client_data::{config::store_config::{ContractFunctionTreeStore,UserRegistrationTreeStore},models::kvq_merkle::model::{KVQSemiFixedConfigMerkleTreeModelReaderCore,KVQFixedConfigMerkleTreeModelCore},qstore::imm::{cache::PsyCmdStoreWithCache,cmd::{QSRMerkleCmd,QSRMerkleCmdGetContractFunctionTreeMerkleProof}}};
use psy_client_data::qblock::cmds::deploy_contract::get_code_root_by_code_hashes;
use sha2::{Digest,Sha256};
fn f(n:u64)->GF{GF::from_canonical_u64(n)}
type Manager=UserProvingSessionManager<GF,PoseidonHash,Store,C,2>;
struct Chain {cm:PsyUPSStepCircuitManager<C,2>,key:psy_template_u124_markets::market_key::SDKeyCircuitGadget,code:BTreeMap<u64,ContractCodeDefinition>,leaves:BTreeMap<u64,PsyContractLeaf<GF>>,whitelists:BTreeMap<u64,Vec<QHashOut<GF>>>,last_leaf:Option<PsyUserLeaf<GF>>,measurements:Vec<Value>}
impl Chain{
 fn new(w:&World,needed:&[Value])->Result<Self>{
  let started=Instant::now();let cm=PsyUPSStepCircuitManager::<C,2>::new_with_config(PSY_NETWORK_MAGIC);let key=composition_policy::build(&w.policy)?;
  let mut code=BTreeMap::new();let mut leaves=BTreeMap::new();let mut whitelists=BTreeMap::new();
  let needed_names=needed.iter().map(|c|c["method_name"].as_str().unwrap().to_owned()).collect::<BTreeSet<_>>();
  let mut built:HashMap<String,(Vec<QHashOut<GF>>,QHashOut<GF>,HashMap<usize,Arc<DapenContractFunctionCircuit<C,2>>>)>=HashMap::new();
  for(&cid,artifact)in &w.artifacts{
   let height=if cid==0{32}else{31};let bytes=serde_json::to_vec(artifact)?;let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(artifact["circuit_definitions"].clone())?;let hash=format!("{:x}",Sha256::digest(&bytes));
   if !built.contains_key(&hash){let mut wl=vec![];let mut keep=HashMap::new();let mut hashes=vec![];
    for(i,d)in defs.iter().enumerate(){let c=Arc::new(DapenContractFunctionCircuit::<C,2>::new(d,height,16,false));wl.push(c.get_fingerprint());wl.push(QHashOut::from_values(d.method_id as u64,((d.circuit_outputs.len()as u64)<<32)|d.circuit_inputs.len()as u64,0,0));hashes.push(hash_dpn_function::<GF>(d));if needed_names.contains(&d.name){keep.insert(i,c);}}
    built.insert(hash.clone(),(wl,get_code_root_by_code_hashes::<GF,PoseidonHash>(&hashes,15),keep));
   }
   let(wl,code_root,cache)=&built[&hash];for(i,c)in cache{cm.contract_circuits.insert((cid,*i as u32),c.clone());}
   let mut leaf=PsyContractLeaf{code_root:*code_root,state_tree_height:f(height as u64),..Default::default()};
   let(layout,fields,slots)=psy_template_u124_markets::contract_layout::artifact_layout(cid,height,&artifact["abi"])?;
   leaf.state_layout_root=layout;leaf.state_layout_field_count=f(fields);leaf.state_layout_slot_count=f(slots);
   code.insert(cid,ContractCodeDefinition{state_tree_height:height as u16,functions:defs.iter().map(dapen_fc_to_cfc_code_definition).collect()});leaves.insert(cid,leaf);whitelists.insert(cid,wl.clone());
  }
  Ok(Self{cm,key,code,leaves,whitelists,last_leaf:None,measurements:vec![json!({"phase":"cold-circuit-build","elapsedMs":started.elapsed().as_secs_f64()*1000.})]})
 }
 async fn seed(&self,w:&World)->Result<Store>{let db=Store::new();let cp=w.checkpoint;
  for(cid,code)in &self.code{db.set_contract_code_definition(cp,*cid,code)?;let mut leaf=self.leaves[cid];leaf.function_tree_root=db.set_contract_function_whitelist(cp,*cid,&self.whitelists[cid])?;db.set_contract_leaf_data(cp,*cid,&leaf)?;db.set_contract_tree_leaf_hash(cp,*cid,leaf.qfhash::<PoseidonHash>())?;}
  for(cid,wl)in &self.whitelists{for(i,want)in wl.iter().enumerate(){let actual=db.get_contract_function_tree_leaf_hash(cp,*cid as u32,i as u32).await?;ensure!(actual==*want,"whitelist seed mismatch {cid}/{i}");}}
  let mut groups:BTreeMap<(u64,u64,u64),[GF;4]>=BTreeMap::new();let mut users=BTreeSet::new();
  for((u,c,o),n)in &w.slots{if !self.code.contains_key(c){continue;}users.insert(*u);groups.entry((*u,*c,*o/4)).or_insert([GF::ZERO;4])[(*o%4)as usize]=f(*n);}
  let mut roots=BTreeMap::new();for((u,c,o),v)in groups{let height=self.code[&c].state_tree_height as u8;let p=db.set_user_state_tree_leaf_hash(cp,u,c as u32,height,o,QHashOut(HashOut{elements:v}))?;roots.insert((u,c),p.new_root);}
  for((u,c),r)in roots{db.set_user_contract_tree_leaf_hash(cp,u,c as u32,r)?;}
  let param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[GF::ONE;4]}));let pk=ZKPublicKeyInfo{public_key_param:param,fingerprint:self.key.get_fingerprint()}.qfhash::<PoseidonHash>();users.insert(V);
  let fresh=self.last_leaf.is_none()&&w.revision==0&&!w.slots.keys().any(|(u,_,_)|*u==V);if fresh{UserRegistrationTreeStore::<Store>::set_leaf_fc(&db,cp,psy_crypto::common::user_id::get_registration_id_from_user_id(V),pk)?;}
  for u in users{if u==V&&fresh{db.set_user_leaf_data(cp,&psy_client_data::qstore::controllers::register_helpers::get_new_empty_user_leaf(f(V),pk))?;continue;}let r=db.get_user_contract_tree_root(cp,u).await?;let leaf=if u==V{if let Some(last)=self.last_leaf{ensure!(last.user_state_tree_root==r,"linked proof endpoint root mismatch");last}else{PsyUserLeaf{public_key:pk,user_id:f(u),user_state_tree_root:r,balance:GF::ZERO,nonce:f(w.revision),last_checkpoint_id:f(cp-1),..Default::default()}}}else{PsyUserLeaf{public_key:QHashOut(HashOut{elements:[GF::ONE;4]}),user_id:f(u),user_state_tree_root:r,balance:GF::ZERO,..Default::default()}};db.set_user_leaf_data(cp,&leaf)?;db.set_user_tree_leaf_hash(cp,u,leaf.qfhash::<PoseidonHash>())?;}
  let roots=db.get_checkpoint_global_state_roots(cp).await?;let checkpoint=PsyCheckpointLeaf{global_chain_root:roots.qfhash::<PoseidonHash>(),stats:PsyCheckpointLeafStats::new_empty()};db.set_checkpoint_leaf_data(cp,&checkpoint)?;db.set_checkpoint_tree_leaf_hash(cp,checkpoint.qfhash::<PoseidonHash>())?;let mut block=PsyBlockState::get_genesis_value();block.checkpoint_id=cp;block.next_user_id=1000;block.next_contract_id=u32::try_from(self.code.keys().copied().max().unwrap()+1)?;db.set_block_state(&block)?;Ok(db)
 }
 async fn prove(&mut self,w:&mut World,mut fields:Vec<u64>)->Result<()> {
  let started=Instant::now();let mode=fields[0];let fresh=self.last_leaf.is_none()&&w.revision==0&&!w.slots.keys().any(|(u,_,_)|*u==V);let db=self.seed(w).await?;let start_leaf=db.get_user_leaf_data(w.checkpoint,V).await?;let seed_ms=started.elapsed().as_secs_f64()*1000.;let stage=Instant::now();let nonce=f(w.revision+1);
  // The in-memory trait getter retains a legacy *4 conversion. The edge RPC
  // returns raw leaf indices. Seed the public command cache with actual raw
  // Merkle paths, checked against the same authenticated whitelist root.
  let mut cache=PsyCmdStoreWithCache::new(w.checkpoint,db);
  for(cid,code)in &self.code{let wl=&self.whitelists[cid];for i in 0..code.functions.len(){let index=(i*2)as u32;let proof=ContractFunctionTreeStore::<Store>::get_leaf_sfc(&cache.read_store,w.checkpoint,*cid,index as u64)?;ensure!(proof.value==wl[i*2]&&proof.siblings[0]==wl[i*2+1],"raw function leaf binding");ensure!(proof.verify::<PoseidonHash>(),"raw function Merkle path");ensure!(proof.root==cache.read_store.get_contract_function_tree_root(w.checkpoint,*cid as u32).await?,"function proof root");
  cache.cache.merkle_cmd_cache.insert(QSRMerkleCmd::GetContractFunctionTreeMerkleProof(QSRMerkleCmdGetContractFunctionTreeMerkleProof{checkpoint_id:w.checkpoint,contract_id:*cid as u32,function_id:index}),proof);}}
  let mut lps=PsyLocalProvingSessionStore::new_at_with_cmd_store(cache,f(w.checkpoint),f(V),nonce,start_leaf.event_index,16);lps.set_is_new_user(fresh);let mut info=SessionCircuitInfoStore::new();self.cm.register_info(&mut info).await;
  let mut session=Manager::new(lps,info,self.cm.ups_circuit_whitelist_root).await?;session.prove_ups_start(&self.cm).await?;
  let start_ms=stage.elapsed().as_secs_f64()*1000.;let calls=composition_policy::calls(&w.policy,&fields)?;let count=calls.len();let mut steps=vec![];
  for (i,c)in calls.iter().take(count-1).enumerate(){let t=Instant::now();let cid=c["contract_id"].as_u64().unwrap();let name=c["method_name"].as_str().unwrap();let code=&self.code[&cid];let(index,def)=self.cm.resolve_contract_function_by_method_name(cid,code,name.into()).await?;let inputs=c["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect();if i==0&&std::env::var_os("COMPOSITION_CFC_DIAGNOSTICS").is_some(){
 let witness=session.exec_contract_call(f(cid),&def,inputs).await?;let dir=std::env::var("COMPOSITION_CFC_DIAGNOSTICS")?;fs::create_dir(&dir)?;fs::write(format!("{dir}/witness.json"),serde_json::to_vec_pretty(&witness)?)?;
 self.cm.prove_contract_call(cid,index as u32,&witness).await?;anyhow::bail!("diagnostic CFC passed; not a completed UPS");
 }session.prove_standard_call(&self.cm,f(cid),index as u32,&def,inputs).await.with_context(||format!("UPS call {i}: {cid}/{name}"))?;println!("UPS_STEP {} mode {} call {} {}: {:.1}ms","composition",mode,i,name,t.elapsed().as_secs_f64()*1000.);steps.push(json!({"index":i,"contract":cid,"method":name,"ms":t.elapsed().as_secs_f64()*1000.}));}
  let stage=Instant::now();session.prove_burn_fee(&self.cm).await?;let burn=session.require_lps()?.last_transaction_record().call_data.call_data.inputs[0].to_canonical_u64();ensure!((1_000_000_000..=ESCROW).contains(&burn),"batch exceeds sponsor policy budget");ensure!(fields[73]==burn&&fields[33]==burn,"derived fee differs from actual automatic burn");let burn_ms=stage.elapsed().as_secs_f64()*1000.;let stage=Instant::now();
  let h=*session.get_current_ups_header();ensure!(h.current_state.tx_count==f(count as u64),"whole-stack count");
  let actual_infos=session.sd_key_transaction_infos();
  let infos={
   let logical=batch_policy::expected_calls(&w.policy,&fields)?;
   let expanded=logical.iter().map(|c|{let cid=c["contract_id"].as_u64().unwrap();let name=c["method_name"].as_str().unwrap();let def=&w.methods[&(cid,name.into())];let inputs=c["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect::<Vec<_>>();psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(cid),f(def.method_id as u64),&inputs).into()}).collect::<Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>>();
   let selected=expanded.iter().filter(|c|c.contract_id!=f(w.policy["noop"]["contract_id"].as_u64().unwrap())||c.method_id!=f(w.policy["noop"]["method_id"].as_u64().unwrap())).copied().collect::<Vec<_>>();
   ensure!(selected.len()==actual_infos.len()&&psy_template_u124_markets::market_key::compute_tx_stack_hash(&selected)==psy_template_u124_markets::market_key::compute_tx_stack_hash(&actual_infos),"compact actual call sequence");expanded
  };let input=SDKeyCircuitWitnessInput{session_context:SDKeySessionContext{start_user_leaf:h.session_start_context.start_session_user_leaf,start_user_leaf_hash:h.session_start_context.start_session_user_leaf.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:h.session_start_context.checkpoint_leaf_hash,checkpoint_tree_root:h.session_start_context.checkpoint_tree_root,current_user_leaf:h.current_state.user_leaf,nonce},circuit_inputs:fields.iter().copied().map(f).collect(),transaction_infos:infos,tx_stack_hash:h.current_state.tx_hash_stack,tx_count:f(count as u64),state_reader_results:None,secp256k1_slots:vec![],checkpoint_id:f(w.checkpoint),user_id:f(V)};
  let sig=self.key.prove(QHashOut(HashOut{elements:[GF::ONE;4]}),&input,session.get_sighash(PSY_NETWORK_MAGIC,nonce)).await?;let sign_ms=stage.elapsed().as_secs_f64()*1000.;let stage=Instant::now();let slots=session.require_lps()?.get_total_slots_modified();let param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[GF::ONE;4]}));let proof=session.prove_end_cap(&self.cm,PSY_NETWORK_MAGIC,nonce,slots,self.key.get_fingerprint(),param,sig,self.key.minifier_chain.as_ref().unwrap().get_verifier_data().clone()).await?;
  self.cm.ups_end_cap.verify_proof(proof.clone())?;let end=session.get_current_ups_header().current_state.user_leaf;
  let core=SubmitUserEndCapNonProofCoreInput{checkpoint_id:f(w.checkpoint),stats:GUTAStats{guta_fees_collected:f(GUTA_FEE),da_fees_collected:f(DA_FEE)*slots,user_ops_processed:GF::ONE,total_transactions:f(count as u64),slots_modified:slots},state_transition:UPSEndCapResultCompact{start_user_leaf_hash:if fresh{QHashOut::ZERO}else{start_leaf.qfhash::<PoseidonHash>()},end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_tree_root_hash:h.session_start_context.checkpoint_tree_root,user_id:f(V)},new_user_leaf:end};validate_endcap_binding(&core,&proof.public_inputs)?;
  let mut altered=core;altered.new_user_leaf.nonce+=GF::ONE;ensure!(validate_endcap_binding(&altered,&proof.public_inputs).is_err(),"metadata substitution accepted");let endcap_ms=stage.elapsed().as_secs_f64()*1000.;let stage=Instant::now();
  // Compare all actual writes to an independently executed VM reference, then
  // carry the proven leaf and values forward to the next synthetic checkpoint.
  let mut expected=w.clone();expected.execute(&fields)?;let mut leaves=HashMap::new();for((u,c,o),want)in &expected.slots{if *u!=V{continue;}let key=(*c,*o/4);if !leaves.contains_key(&key){let p=session.require_lps_mut()?.get_contract_state_slot(f(*c),f(*o/4)).await?;leaves.insert(key,p.value);}let actual=leaves[&key].0.elements[(*o%4)as usize].to_canonical_u64();ensure!(actual==*want,"VM / UPS state mismatch {c}:{o}: {actual} != {want}");}
  let api=session.get_api_input().await?;ensure!(api.core==core,"exported API core differs");
  if let Ok(dir)=std::env::var("COMPOSITION_UPS_OUT"){
   let request=psy_provider::request::QSubmitEndCapRPCRequest{user_ec_input:api.clone(),proof:bincode::serialize(&proof)?};
   let path=std::path::Path::new(&dir).join(format!("request-nonce-{}.json",w.revision+1));
   use std::io::Write;let mut output=fs::OpenOptions::new().create_new(true).write(true).open(path)?;output.write_all(&serde_json::to_vec(&request)?)?;output.sync_all()?;
  }
  let updates=api.contract_state_updates;ensure!(api.core.stats.slots_modified==slots,"export fee slot count");let mut exported_root=start_leaf.user_state_tree_root;
  for update in &updates{ensure!(update.user_contract_tree_update_proof.verify::<PoseidonHash>(),"export user contract Merkle path");ensure!(update.user_contract_tree_update_proof.old_root==exported_root,"export starts at proven root");exported_root=update.user_contract_tree_update_proof.new_root;for change in &update.contract_state_tree_updates{match change{psy_client_data::guta::api::ContractStateUpdate::Positional{delta_proof}=>ensure!(delta_proof.verify::<PoseidonHash>(),"export slot Merkle path"),_=>anyhow::bail!("unexpected IMT in positional markets")}}}
  ensure!(exported_root==end.user_state_tree_root,"export ends at proven root");
  let delta_ms=stage.elapsed().as_secs_f64()*1000.;let elapsed=started.elapsed().as_secs_f64()*1000.;let row=json!({"phase":if mode==1{"commit"}else if mode==2{"settle"}else if mode==3{"expire"}else{"maintenance"},"elapsedMs":elapsed,"proofBytes":bincode::serialize(&proof)?.len(),"slotsModified":slots.to_canonical_u64(),"burn":burn,"startLeaf":if fresh{QHashOut::<GF>::ZERO.to_string()}else{start_leaf.qfhash::<PoseidonHash>().to_string()},"firstUpsRegistration":fresh,"endLeaf":end.qfhash::<PoseidonHash>().to_string(),"fullUpsVerified":true,"publicEndpointsBound":true,"exportedDeltasVerified":true,"profile":"composition-compact-v1","endStateRoot":end.user_state_tree_root.to_string(),"logicalSlots":40,"calls":count,"steps":steps,"overheadStagesMs":{"seedState":seed_ms,"sessionStart":start_ms,"burn":burn_ms,"sdKeySign":sign_ms,"endcapProveAndVerify":endcap_ms,"stateDeltaChecks":delta_ms},"broadcast":false});println!("FULL_UPS {} {}ms","composition",elapsed);self.measurements.push(row);self.last_leaf=Some(end);expected.checkpoint+=1;*w=expected;Ok(())
 }
}

// Fee prediction is only a local preparation pass. Full UPS burn/public stats
// below must agree; a mismatch rejects the proof rather than relaxing the key.
fn exact_fee(w:&World,mut fields:Vec<u64>,returning:bool)->Result<Vec<u64>> {
 for _ in 0..4 {
  let mut preview=w.clone();if returning{fields[32]=w.get(V,0,0).checked_sub(fields[73]).context("insufficient exit fee")?;}
  preview.execute(&fields)?;
  let keys=w.slots.keys().chain(preview.slots.keys()).filter(|(u,_,_)|*u==V).map(|(_,c,o)|(*c,*o/4)).collect::<BTreeSet<_>>();
  let changed=keys.into_iter().filter(|(c,o)|(0..4).any(|i|w.get(V,*c,o*4+i)!=preview.get(V,*c,o*4+i))).count();
  let fee=GUTA_FEE+DA_FEE*changed as u64;
  if fee==fields[73]{return Ok(fields);}fields[33]=fee;fields[73]=fee;
 }
 anyhow::bail!("fee preparation did not converge")
}
#[tokio::test]
#[ignore="explicit frozen compiled fixture and fresh output; expensive full proofs"]
async fn funded_controller_cancelled_exit_full_ups()->Result<()> {
 let out=std::env::var("COMPOSITION_UPS_OUT")?;fs::create_dir(&out)?;
 let mut w=World::new()?;if std::env::var_os("COMPOSITION_DIAGNOSTIC_EXISTING").is_some(){w.set(V,0,0,0);}
 let input=super::world::R+17;let p=super::world::pair(input);
 let fund=w.fields("fund",&[],ESCROW)?;let ret=w.fields("return-input",&[(3,p[0]),(4,p[1]),(11,18*ESCROW)],ESCROW)?;
 let mut needed=batch_policy::expected_calls(&w.policy,&fund)?;needed.extend(batch_policy::expected_calls(&w.policy,&ret)?);
 let mut chain=Chain::new(&w,&needed)?;
 let param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[GF::ONE;4]}));let pk=ZKPublicKeyInfo{public_key_param:param,fingerprint:chain.key.get_fingerprint()}.qfhash::<PoseidonHash>();w.key=pk.0.elements.map(|x|x.to_canonical_u64());
 w.request(input,7,5)?;w.seed_funding(input)?;
 let fund=exact_fee(&w,fund,false)?;chain.prove(&mut w,fund).await?;ensure!(w.at(V,"phase")==2,"funded phase");
 w.run(super::world::U,super::world::C,"request_cancel",&[1])?;
 let ret=exact_fee(&w,ret,true)?;chain.prove(&mut w,ret).await?;
 ensure!(w.at(V,"phase")==99&&w.wide(V,A,0)==0&&w.wide(V,B,0)==0&&w.get(V,0,0)==0,"terminal residual");
 w.run(super::world::U,A,"claim",&[V])?;w.run(super::world::U,0,"claim",&[V])?;
 ensure!(w.wide(super::world::U,A,0)==input,"actual input recovered");
 fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({"scope":"synthetic authenticated checkpoints: linked dedicated-key funding and cancelled exit UPSs; ordinary request, funding, cancel and final recipient claims execute bytecode only; no market trade, registration, coordinator or network acceptance", "fullUpsVerified":true,"requestBytesPreserved":true,"measurements":chain.measurements,"controllerPublicKeyHash":pk.to_string(),"fingerprint":chain.key.get_fingerprint().to_string(),"input":input.to_string(),"terminalControllerPhase":99,"residualA":0,"residualB":0,"residualNative":0,"recipientRecoveredInput":true,"broadcast":false,"productionReady":false}))?)?;
 Ok(())
}


#[tokio::test]
#[ignore="explicit current compiled fixture and fresh output; eight full controller UPSs"]
async fn two_pool_controller_workflow_full_ups()->Result<()> {
 use super::world::{R,pair,U};use super::market_vm;
 let out=std::env::var("COMPOSITION_UPS_OUT")?;fs::create_dir(&out)?;
 let mut w=World::new()?;w.load_markets()?;let input=R+17;
 let reserve=20u128*10u128.pow(18);let quote=|x:u128|((num_bigint::BigUint::from(x)*9970u64*num_bigint::BigUint::from(reserve))/(num_bigint::BigUint::from(reserve)*10000u64+num_bigint::BigUint::from(x)*9970u64)).to_u128().unwrap();
 use num_traits::ToPrimitive;let mid=quote(input);let final_out=quote(mid);
 let values=|amount:u128,minimum:u128|{let p=pair(amount);let q=pair(minimum);vec![(3,p[0]),(4,p[1]),(5,q[0]),(6,q[1]),(7,500),(8,1)]};
 let templates=[w.fields("fund",&[],ESCROW)?,w.fields("open-1",&values(input,mid),ESCROW)?,w.fields("consent-1",&[(9,2),(10,200)],ESCROW)?,w.fields("success-1",&[(3,pair(mid)[0]),(4,pair(mid)[1])],ESCROW)?,w.fields("open-2",&values(mid,final_out),ESCROW)?,w.fields("consent-2",&[(9,2),(10,200)],ESCROW)?,w.fields("success-2",&[(3,pair(final_out)[0]),(4,pair(final_out)[1])],ESCROW)?,w.fields("return-final",&[(3,pair(final_out)[0]),(4,pair(final_out)[1]),(11,1)],ESCROW)?];
 let mut needed=vec![];for f in &templates{needed.extend(batch_policy::expected_calls(&w.policy,f)?);}
 let mut chain=Chain::new(&w,&needed)?;let param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[GF::ONE;4]}));let pk=ZKPublicKeyInfo{public_key_param:param,fingerprint:chain.key.get_fingerprint()}.qfhash::<PoseidonHash>();w.key=pk.0.elements.map(|x|x.to_canonical_u64());
 w.request(input,mid,final_out)?;w.seed_funding(input)?;market_vm::pools(&mut w)?;
 let fund=exact_fee(&w,w.fields("fund",&[],ESCROW)?,false)?;chain.prove(&mut w,fund).await?;
 for(hop,amount,minimum,expected_output)in [(1,input,mid,mid),(2,mid,final_out,final_out)]{
  let f=exact_fee(&w,w.fields(&format!("open-{hop}"),&values(amount,minimum),ESCROW)?,false)?;chain.prove(&mut w,f).await?;
  let(m,vault)=market_vm::MARKETS[hop-1];let(epoch,cutoff)=market_vm::start(&mut w,m,vault)?;
  let consent=exact_fee(&w,w.fields(&format!("consent-{hop}"),&[(9,epoch),(10,cutoff)],ESCROW)?,false)?;chain.prove(&mut w,consent).await?;
  market_vm::admit_seal(&mut w,m,vault,V,1,epoch,cutoff)?;let observed=market_vm::swap(&mut w,hop,amount)?;ensure!(observed==expected_output,"independent static-pool quote");
  // The other vault's transfer is only an Outbox. It cannot be spent by V
  // until the separate authenticated claim/record UPS completes.
  ensure!(w.wide(V,if hop==1{B}else{A},0)==0,"outbox prematurely spendable");
  if hop==1{let invalid=w.fields("open-2",&values(observed,final_out),ESCROW)?;let before=w.slots.clone();ensure!(w.execute(&invalid).is_err()&&w.slots==before,"spent intermediate before its claim");}
  let p=pair(observed);let collect=exact_fee(&w,w.fields(&format!("success-{hop}"),&[(3,p[0]),(4,p[1])],ESCROW)?,false)?;chain.prove(&mut w,collect).await?;
 }
 let p=pair(final_out);let ret=exact_fee(&w,w.fields("return-final",&[(3,p[0]),(4,p[1]),(11,1)],ESCROW)?,true)?;chain.prove(&mut w,ret.clone()).await?;
 ensure!(w.at(V,"phase")==99&&w.wide(V,A,0)==0&&w.wide(V,B,0)==0&&w.get(V,0,0)==0,"final controller residual");let terminal=w.slots.clone();ensure!(w.execute(&ret).is_err()&&w.slots==terminal,"terminal replay");
 w.run(U,A,"claim",&[V])?;w.run(U,0,"claim",&[V])?;ensure!(w.wide(U,A,0)==final_out,"recipient final claim");
 fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({"scope":"eight linked controller UPSs on explicit synthetic authenticated checkpoints; two base markets execute actual activation, LP, admission, commit, exact-price settlement and transfers in VM only; ordinary owner request/funding/final claims VM only; no market UPS, chain inclusion, cross-vault atomicity or production claim", "fullControllerUpsVerified":true,"controllerUpsCount":8,"route":"A -> B -> A on two distinct pools","input":input.to_string(),"intermediate":mid.to_string(),"finalOutput":final_out.to_string(),"controllerPublicKeyHash":pk.to_string(),"measurements":chain.measurements,"recipientClaimBytecodeVerified":true,"intermediateRequiresClaim":true,"terminalReplayRejected":true,"allControllerBalancesZero":true,"atomicAcrossVaults":false,"broadcast":false,"chainTps":null,"productionReady":false}))?)?;
 Ok(())
}

#[tokio::test]
#[ignore="explicit current compiled fixture and fresh output; six full controller UPSs"]
async fn cancelled_inflight_hop_refund_full_ups()->Result<()> {
 use super::world::{R,pair,U};use super::market_vm;
 let out=std::env::var("COMPOSITION_UPS_OUT")?;fs::create_dir(&out)?;
 let mut w=World::new()?;w.load_markets()?;let input=R+17;let p=pair(input);
 let opening=vec![(3,p[0]),(4,p[1]),(5,1),(7,500),(8,1)];
 let templates=[w.fields("fund",&[],ESCROW)?,w.fields("open-1",&opening,ESCROW)?,w.fields("consent-1",&[(9,2),(10,200)],ESCROW)?,w.fields("cancel-1",&[],ESCROW)?,w.fields("refund-1",&[(3,p[0]),(4,p[1])],ESCROW)?,w.fields("return-input",&[(3,p[0]),(4,p[1]),(11,1)],ESCROW)?];
 let mut needed=vec![];for f in &templates{needed.extend(batch_policy::expected_calls(&w.policy,f)?);}
 let mut chain=Chain::new(&w,&needed)?;let param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[GF::ONE;4]}));let pk=ZKPublicKeyInfo{public_key_param:param,fingerprint:chain.key.get_fingerprint()}.qfhash::<PoseidonHash>();w.key=pk.0.elements.map(|x|x.to_canonical_u64());
 w.request(input,1,1)?;w.seed_funding(input)?;market_vm::pools(&mut w)?;
 for (name,values) in [("fund",vec![]),("open-1",opening)]{let f=exact_fee(&w,w.fields(name,&values,ESCROW)?,false)?;chain.prove(&mut w,f).await?;}
 let(m,vault)=market_vm::MARKETS[0];let(epoch,cutoff)=market_vm::start(&mut w,m,vault)?;
 let f=exact_fee(&w,w.fields("consent-1",&[(9,epoch),(10,cutoff)],ESCROW)?,false)?;chain.prove(&mut w,f).await?;
 market_vm::admit_seal(&mut w,m,vault,V,1,epoch,cutoff)?;w.run(U,super::world::C,"request_cancel",&[1])?;
 let before=w.slots.clone();let early=w.fields("return-input",&[(3,p[0]),(4,p[1]),(11,1)],ESCROW)?;ensure!(w.execute(&early).is_err()&&w.slots==before,"accepted principal unlocked before refund");
 let f=exact_fee(&w,w.fields("cancel-1",&[],ESCROW)?,false)?;chain.prove(&mut w,f).await?;
 market_vm::refund(&mut w,1,input)?;ensure!(w.wide(V,A,0)==0,"refund outbox prematurely spendable");
 let f=exact_fee(&w,w.fields("refund-1",&[(3,p[0]),(4,p[1])],ESCROW)?,false)?;chain.prove(&mut w,f).await?;
 ensure!(w.at(V,"phase")==7&&w.wide(V,A,0)==input,"actual principal not recovered");
 let f=exact_fee(&w,w.fields("return-input",&[(3,p[0]),(4,p[1]),(11,1)],ESCROW)?,true)?;chain.prove(&mut w,f).await?;
 w.run(U,A,"claim",&[V])?;w.run(U,0,"claim",&[V])?;ensure!(w.wide(U,A,0)==input&&w.wide(V,A,0)==0&&w.wide(V,B,0)==0&&w.get(V,0,0)==0,"refund recipient / residual");
 fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({"scope":"six linked full controller UPSs, synthetic authenticated checkpoints; base-market accepted cancellation/refund and ordinary owner actions VM-only; not network acceptance", "fullControllerUpsVerified":true,"controllerUpsCount":6,"acceptedPrincipalLockedUntilRefund":true,"escrowClaimVerified":true,"recipientRecoveredInput":true,"input":input.to_string(),"allControllerBalancesZero":true,"measurements":chain.measurements,"broadcast":false,"atomicAcrossVaults":false,"productionReady":false}))?)?;Ok(())
}
