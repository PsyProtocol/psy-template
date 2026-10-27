//! Full authenticated-state UPSs on explicit synthetic checkpoints. No RPC,
//! deployment, coordinator admission, or chain TPS is implied by these tests.
use psy_template_u124_markets::market_key::get_sd_key_public_key_param;
use psy_template_u124_markets::market_key::{SDKeyCircuitWitnessInput,SDKeySessionContext};
use super::{World,M,A,B,NFT,V,I,S,F as ESCROW,args,quote};
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
use psy_template_u124_markets::{batch_compact,batch_policy,proof_binding::validate_endcap_binding};
use serde_json::{Value,json};
use psy_client_data::{config::store_config::{ContractFunctionTreeStore,UserRegistrationTreeStore},models::kvq_merkle::model::{KVQSemiFixedConfigMerkleTreeModelReaderCore,KVQFixedConfigMerkleTreeModelCore},qstore::imm::{cache::PsyCmdStoreWithCache,cmd::{QSRMerkleCmd,QSRMerkleCmdGetContractFunctionTreeMerkleProof}}};
use psy_client_data::qblock::cmds::deploy_contract::get_code_root_by_code_hashes;
use sha2::{Digest,Sha256};
fn f(n:u64)->GF{GF::from_canonical_u64(n)}
type Manager=UserProvingSessionManager<GF,PoseidonHash,Store,C,2>;
#[path="ordinary_wallet_full_ups.rs"] mod ordinary_wallet;
#[tokio::test]
async fn authenticated_commit_cfc_probe()->Result<()>{
 let kind=std::env::var("BATCH_CFC_KIND").unwrap_or_else(|_|"amm".into());let (mut w,participants,_,_)=trading_setup(&kind)?;
 w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;let db=Store::new();let cp=w.checkpoint;
 for(cid,height)in[(0,32),(M,31),(A,31),(B,31),(NFT,30)]{let mut leaf=PsyContractLeaf{state_tree_height:f(height),..Default::default()};
 if std::env::var_os("BATCH_CFC_METADATA").is_some(){let root=std::env::var("BATCH_BUILD")?;let path=match cid{0=>"native.json".to_string(),M=>format!("{kind}/compiled/compilation_artifact.json"),NFT=>"nft/compilation_artifact.json".to_string(),_=>super::token_artifact(cid)};let a:Value=serde_json::from_slice(&fs::read(format!("{root}/{path}"))?)?;let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;leaf.code_root=get_code_root_by_code_hashes::<GF,PoseidonHash>(&defs.iter().map(hash_dpn_function::<GF>).collect::<Vec<_>>(),15);
 if cid!=0{let m=psy_data::v1::qdata::contract::canonical_layout_manifest_from_compiler_abi_json::<parth_core::pgoldilocks::PoseidonHasher,GF,parth_core::pgoldilocks::QHashOut<GF>>(&serde_json::to_string(&a["abi"])?,psy_core::constants::protocol::STATE_LAYOUT_TREE_HEIGHT,psy_data::v1::qdata::contract::CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT)?;let l=m.layout.contract_layout;leaf.state_layout_root=QHashOut(HashOut{elements:l.state_layout_root.0.elements});leaf.state_layout_field_count=f(l.state_layout_field_count);leaf.state_layout_slot_count=f(l.state_layout_slot_count);}}
db.set_contract_leaf_data(cp,cid,&leaf)?;db.set_contract_tree_leaf_hash(cp,cid,leaf.qfhash::<PoseidonHash>())?;}
 let mut groups:BTreeMap<(u64,u64,u64),[GF;4]>=BTreeMap::new();let mut users=BTreeSet::new();for((u,c,o),n)in&w.slots{users.insert(*u);groups.entry((*u,*c,*o/4)).or_insert([GF::ZERO;4])[(*o%4)as usize]=f(*n);}
 let mut roots=BTreeMap::new();for((u,c,o),v)in groups{let p=db.set_user_state_tree_leaf_hash(cp,u,c as u32,if c==0{32}else if c==NFT{30}else{31},o,QHashOut(HashOut{elements:v}))?;roots.insert((u,c),p.new_root);}for((u,c),r)in roots{db.set_user_contract_tree_leaf_hash(cp,u,c as u32,r)?;}
 users.insert(V);for u in users{let leaf=PsyUserLeaf{public_key:QHashOut(HashOut{elements:[GF::ONE;4]}),user_id:f(u),user_state_tree_root:db.get_user_contract_tree_root(cp,u).await?,balance:GF::ZERO,nonce:f(if u==V{w.revision}else{0}),..Default::default()};db.set_user_leaf_data(cp,&leaf)?;db.set_user_tree_leaf_hash(cp,u,leaf.qfhash::<PoseidonHash>())?;}
 let roots=db.get_checkpoint_global_state_roots(cp).await?;let leaf=PsyCheckpointLeaf{global_chain_root:roots.qfhash::<PoseidonHash>(),stats:PsyCheckpointLeafStats::new_empty()};db.set_checkpoint_leaf_data(cp,&leaf)?;db.set_checkpoint_tree_leaf_hash(cp,leaf.qfhash::<PoseidonHash>())?;
 let lps=PsyLocalProvingSessionStore::new_at(db,f(cp),f(V),f(w.revision+1),GF::ZERO,16);let cm=PsyUPSStepCircuitManager::<C,2>::new_with_config(PSY_NETWORK_MAGIC);let mut info=SessionCircuitInfoStore::new();cm.register_info(&mut info).await;let mut session=Manager::new(lps,info,cm.ups_circuit_whitelist_root).await?;session.prove_ups_start(&cm).await?;let def=&w.methods[&(M,"commit_batch".into())];let mut values=vec![0;12];values[0..participants.len()].copy_from_slice(&participants);for(i,u)in participants.iter().enumerate(){values[4+i]=w.val(*u,"nonce",0);}values[8]=participants.len()as u64;values[9]=w.val(V,"batch_id",0)+1;values[10]=cp+20;values[11]=S;let input=values.into_iter().map(f).collect();let witness=session.exec_contract_call(f(M),def,input).await?;if let Ok(dir)=std::env::var("BATCH_CFC_DIAGNOSTICS"){fs::create_dir_all(&dir)?;fs::write(format!("{dir}/input.json"),serde_json::to_vec_pretty(&witness)?)?;}let circuit=DapenContractFunctionCircuit::<C,2>::new(def,31,16,false);let proof=circuit.prove_base(&witness)?;circuit.minifier_chain.verify(proof)?;Ok(())
}
struct Chain {compact:bool,cm:PsyUPSStepCircuitManager<C,2>,key:psy_template_u124_markets::market_key::SDKeyCircuitGadget,code:BTreeMap<u64,ContractCodeDefinition>,leaves:BTreeMap<u64,PsyContractLeaf<GF>>,whitelists:BTreeMap<u64,Vec<QHashOut<GF>>>,last_leaf:Option<PsyUserLeaf<GF>>,measurements:Vec<Value>}
#[tokio::test]
#[ignore="requires fresh admission NFT recovery fixtures and output"]
async fn full_ups_admitted_nft_missing_seller_refund()->Result<()>{
 ensure!(std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1"),"admission fixtures required");
 let out=std::env::var("BATCH_FULL_UPS_OUT")?;fs::create_dir(&out)?;
 for unrelated in [false,true]{
  let(mut w,_,_,_)=trading_setup_size("nftmarket",2)?;
  let users=if unrelated{vec![200,203]}else{vec![203]};super::admission::enroll(&mut w,&users)?;
  w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;
  let mut commit=vec![0;74];commit[0]=1;commit[1]=1;commit[2]=users.len()as u64;commit[3]=w.checkpoint+20;commit[4]=S;commit[73]=ESCROW;
  for(i,u)in users.iter().enumerate(){commit[5+i]=*u;commit[9+i]=1;}
  let refund=w.fields("refund_funding_5",203,0,w.wide(203,"price"),0,0,ESCROW,1,0);
  let mut needed=batch_policy::expected_calls(&w.policy,&commit)?;needed.extend(batch_policy::expected_calls(&w.policy,&w.request(2,vec![refund.clone()],[0;4]))?);
  let mut chain=Chain::new(&w,&needed)?;chain.prove(&mut w,commit).await?;
  let settle=w.request(2,vec![refund],[0;4]);chain.prove(&mut w,settle).await?;
  ensure!(w.val(V,"queue_phase",0)==3&&w.val(V,"consumed",203)==1,"buyer refund terminal");
  ensure!(w.val(V,"queue_outcome",(users.len()-1)as u64)==2,"refund disposition");
  fs::write(format!("{out}/missing-seller-unrelated-{unrelated}.json"),serde_json::to_vec_pretty(&json!({"market":"nftmarket","members":users,"unrelatedListingAtRowZero":unrelated,"fullUpsVerified":true,"measurements":chain.measurements,"scope":"synthetic authenticated source checkpoints; ordinary consent and admission VM-only; complete commit and refund UPSs","broadcast":false,"chainTps":null}))?)?;
 }
 Ok(())
}
impl Chain{
 fn new(w:&World,needed:&[Value])->Result<Self>{let started=Instant::now();let cm=PsyUPSStepCircuitManager::<C,2>::new_with_config(PSY_NETWORK_MAGIC);let profile=std::env::var("BATCH_PROOF_PROFILE").unwrap_or_else(|_|"fixed40".into());ensure!(["fixed40","compact-v1"].contains(&profile.as_str()),"known proof profile");let compact=profile=="compact-v1";let key=if compact{batch_compact::build(&w.policy)?}else{batch_policy::build(&w.policy)?};let root=std::env::var("BATCH_BUILD")?;let mut code=BTreeMap::new();let mut leaves=BTreeMap::new();let mut whitelists=BTreeMap::new();
  // Identical FT artifacts share verifier construction. Every function is
  // represented in the code root and whitelist, including unused functions.
  let needed_names=needed.iter().map(|c|c["method_name"].as_str().unwrap().to_owned()).collect::<BTreeSet<_>>();
  let mut built:HashMap<String,(Vec<QHashOut<GF>>,QHashOut<GF>,HashMap<usize,Arc<DapenContractFunctionCircuit<C,2>>>)>=HashMap::new();
  for(cid,height,path)in[(M,31,format!("{}/compiled/compilation_artifact.json",w.kind)),(A,31,"token/compilation_artifact.json".into()),(B,31,super::token_artifact(B)),(NFT,30,"nft/compilation_artifact.json".into()),(0,32,"native.json".into())]{
   if cid==NFT&&w.kind!="nftmarket"{continue;}if cid==B&&w.kind=="nftmarket"{continue;}
   let bytes=fs::read(format!("{root}/{path}"))?;let artifact:Value=serde_json::from_slice(&bytes)?;let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(artifact["circuit_definitions"].clone())?;let hash=format!("{:x}",Sha256::digest(&bytes));
   if !built.contains_key(&hash){let mut wl=vec![];let mut keep=HashMap::new();let mut hashes=vec![];
    for(i,d)in defs.iter().enumerate(){let c=Arc::new(DapenContractFunctionCircuit::<C,2>::new(d,height,16,false));wl.push(c.get_fingerprint());wl.push(QHashOut::from_values(d.method_id as u64,((d.circuit_outputs.len()as u64)<<32)|d.circuit_inputs.len()as u64,0,0));hashes.push(hash_dpn_function::<GF>(d));
     // All fingerprints remain authenticated; retain only called circuits.
     if needed_names.contains(&d.name){keep.insert(i,c);}
    }
    let root=get_code_root_by_code_hashes::<GF,PoseidonHash>(&hashes,15);built.insert(hash.clone(),(wl,root,keep));
   }
   let(wl,code_root,cache)=&built[&hash];for(i,c)in cache{cm.contract_circuits.insert((cid,*i as u32),c.clone());}
   let mut leaf=PsyContractLeaf{code_root:*code_root,state_tree_height:f(height as u64),..Default::default()};
   let (layout,fields,slots)=psy_template_u124_markets::contract_layout::artifact_layout(cid,height,&artifact["abi"])?;
   leaf.state_layout_root=layout;leaf.state_layout_field_count=f(fields);leaf.state_layout_slot_count=f(slots);
   code.insert(cid,ContractCodeDefinition{state_tree_height:height as u16,functions:defs.iter().map(dapen_fc_to_cfc_code_definition).collect()});leaves.insert(cid,leaf);whitelists.insert(cid,wl.clone());
  }
  if let Ok(expected)=std::env::var("BATCH_EXPECTED_MARKET_CODE_ROOT"){ensure!(leaves[&M].code_root.to_string()==expected,"exact candidate code root mismatch");}
  let measured=json!({"phase":"cold-circuit-build","elapsedMs":started.elapsed().as_secs_f64()*1000.});println!("FULL_UPS {} {measured}",w.kind);
  Ok(Self{compact,cm,key,code,leaves,whitelists,last_leaf:None,measurements:vec![measured]})
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
  let roots=db.get_checkpoint_global_state_roots(cp).await?;let checkpoint=PsyCheckpointLeaf{global_chain_root:roots.qfhash::<PoseidonHash>(),stats:PsyCheckpointLeafStats::new_empty()};db.set_checkpoint_leaf_data(cp,&checkpoint)?;db.set_checkpoint_tree_leaf_hash(cp,checkpoint.qfhash::<PoseidonHash>())?;let mut block=PsyBlockState::get_genesis_value();block.checkpoint_id=cp;block.next_user_id=1000;block.next_contract_id=1001;db.set_block_state(&block)?;Ok(db)
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
  let start_ms=stage.elapsed().as_secs_f64()*1000.;let calls=if self.compact{batch_compact::calls(&w.policy,&fields)?}else{batch_policy::expected_calls(&w.policy,&fields)?};let count=calls.len();let mut steps=vec![];
  for (i,c)in calls.iter().take(count-1).enumerate(){let t=Instant::now();let cid=c["contract_id"].as_u64().unwrap();let name=c["method_name"].as_str().unwrap();let code=&self.code[&cid];let(index,def)=self.cm.resolve_contract_function_by_method_name(cid,code,name.into()).await?;let inputs=c["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect();session.prove_standard_call(&self.cm,f(cid),index as u32,&def,inputs).await.with_context(||format!("UPS call {i}: {cid}/{name}"))?;println!("UPS_STEP {} mode {} call {} {}: {:.1}ms",w.kind,mode,i,name,t.elapsed().as_secs_f64()*1000.);steps.push(json!({"index":i,"contract":cid,"method":name,"ms":t.elapsed().as_secs_f64()*1000.}));}
  let stage=Instant::now();session.prove_burn_fee(&self.cm).await?;let burn=session.require_lps()?.last_transaction_record().call_data.call_data.inputs[0].to_canonical_u64();ensure!((1_000_000_000..=ESCROW).contains(&burn),"batch exceeds sponsor policy budget");fields[73]=burn;let burn_ms=stage.elapsed().as_secs_f64()*1000.;let stage=Instant::now();
  let h=*session.get_current_ups_header();ensure!(h.current_state.tx_count==f(count as u64),"whole-stack count");
  let actual_infos=session.sd_key_transaction_infos();
  let infos=if self.compact{
   let logical=batch_policy::expected_calls(&w.policy,&fields)?;
   let expanded=logical.iter().map(|c|{let cid=c["contract_id"].as_u64().unwrap();let name=c["method_name"].as_str().unwrap();let def=&w.methods[&(cid,name.into())];let inputs=c["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect::<Vec<_>>();psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(cid),f(def.method_id as u64),&inputs).into()}).collect::<Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>>();
   let selected=expanded.iter().filter(|c|c.contract_id!=f(w.policy["noop"]["contract_id"].as_u64().unwrap())||c.method_id!=f(w.policy["noop"]["method_id"].as_u64().unwrap())).copied().collect::<Vec<_>>();
   ensure!(selected.len()==actual_infos.len()&&psy_template_u124_markets::market_key::compute_tx_stack_hash(&selected)==psy_template_u124_markets::market_key::compute_tx_stack_hash(&actual_infos),"compact actual call sequence");expanded
  }else{actual_infos};let input=SDKeyCircuitWitnessInput{session_context:SDKeySessionContext{start_user_leaf:h.session_start_context.start_session_user_leaf,start_user_leaf_hash:h.session_start_context.start_session_user_leaf.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:h.session_start_context.checkpoint_leaf_hash,checkpoint_tree_root:h.session_start_context.checkpoint_tree_root,current_user_leaf:h.current_state.user_leaf,nonce},circuit_inputs:fields.iter().copied().map(f).collect(),transaction_infos:infos,tx_stack_hash:h.current_state.tx_hash_stack,tx_count:f(count as u64),state_reader_results:None,secp256k1_slots:vec![],checkpoint_id:f(w.checkpoint),user_id:f(V)};
  let sig=self.key.prove(QHashOut(HashOut{elements:[GF::ONE;4]}),&input,session.get_sighash(PSY_NETWORK_MAGIC,nonce)).await?;let sign_ms=stage.elapsed().as_secs_f64()*1000.;let stage=Instant::now();let slots=session.require_lps()?.get_total_slots_modified();let param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[GF::ONE;4]}));let proof=session.prove_end_cap(&self.cm,PSY_NETWORK_MAGIC,nonce,slots,self.key.get_fingerprint(),param,sig,self.key.minifier_chain.as_ref().unwrap().get_verifier_data().clone()).await?;
  self.cm.ups_end_cap.verify_proof(proof.clone())?;let fixed_profile=psy_template_u124_markets::live_guard::verify_ups_profile(&self.cm)?;psy_template_u124_markets::fixed_verifier::with_verifier(|v|{v.verify(proof.clone())?;Ok(())})?;let end=session.get_current_ups_header().current_state.user_leaf;
  let core=SubmitUserEndCapNonProofCoreInput{checkpoint_id:f(w.checkpoint),stats:GUTAStats{guta_fees_collected:f(GUTA_FEE),da_fees_collected:f(DA_FEE)*slots,user_ops_processed:GF::ONE,total_transactions:f(count as u64),slots_modified:slots},state_transition:UPSEndCapResultCompact{start_user_leaf_hash:if fresh{QHashOut::ZERO}else{start_leaf.qfhash::<PoseidonHash>()},end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_tree_root_hash:h.session_start_context.checkpoint_tree_root,user_id:f(V)},new_user_leaf:end};validate_endcap_binding(&core,&proof.public_inputs)?;
  if let Ok(out)=std::env::var("BATCH_FULL_UPS_OUT") {let api=session.get_api_input().await?;ensure!(serde_json::to_value(&api.core)?==serde_json::to_value(&core)?,"exported SDK endpoints differ from checked core");let path=format!("{out}/{}-{}-{}-request.json",w.kind,mode,self.measurements.len());let mut file=fs::OpenOptions::new().write(true).create_new(true).open(path)?;use std::io::Write;file.write_all(&serde_json::to_vec(&psy_provider::request::QSubmitEndCapRPCRequest{user_ec_input:api,proof:bincode::serialize(&proof)?})?)?;file.sync_all()?;}
  let mut altered=core;altered.new_user_leaf.nonce+=GF::ONE;ensure!(validate_endcap_binding(&altered,&proof.public_inputs).is_err(),"metadata substitution accepted");let endcap_ms=stage.elapsed().as_secs_f64()*1000.;let stage=Instant::now();
  // Compare all actual writes to an independently executed VM reference, then
  // carry the proven leaf and values forward to the next synthetic checkpoint.
  let mut expected=w.clone();expected.execute(&fields)?;let mut leaves=HashMap::new();for((u,c,o),want)in &expected.slots{if *u!=V{continue;}let key=(*c,*o/4);if !leaves.contains_key(&key){let p=session.require_lps_mut()?.get_contract_state_slot(f(*c),f(*o/4)).await?;leaves.insert(key,p.value);}let actual=leaves[&key].0.elements[(*o%4)as usize].to_canonical_u64();ensure!(actual==*want,"VM / UPS state mismatch {c}:{o}: {actual} != {want}");}
  let (updates,charged_slots)=session.require_lps_mut()?.get_all_state_updates().await?;ensure!(charged_slots as u64==slots.to_canonical_u64(),"export fee slot count");let mut exported_root=start_leaf.user_state_tree_root;
  for update in &updates{ensure!(update.user_contract_tree_update_proof.verify::<PoseidonHash>(),"export user contract Merkle path");ensure!(update.user_contract_tree_update_proof.old_root==exported_root,"export starts at proven root");exported_root=update.user_contract_tree_update_proof.new_root;for change in &update.contract_state_tree_updates{match change{psy_client_data::guta::api::ContractStateUpdate::Positional{delta_proof}=>ensure!(delta_proof.verify::<PoseidonHash>(),"export slot Merkle path"),_=>anyhow::bail!("unexpected IMT in positional markets")}}}
  ensure!(exported_root==end.user_state_tree_root,"export ends at proven root");
  let delta_ms=stage.elapsed().as_secs_f64()*1000.;let elapsed=started.elapsed().as_secs_f64()*1000.;let row=json!({"phase":if mode==1{"commit"}else if mode==2{"settle"}else if mode==3{"expire"}else{"maintenance"},"elapsedMs":elapsed,"proofBytes":bincode::serialize(&proof)?.len(),"slotsModified":slots.to_canonical_u64(),"burn":burn,"startLeaf":if fresh{QHashOut::<GF>::ZERO.to_string()}else{start_leaf.qfhash::<PoseidonHash>().to_string()},"firstUpsRegistration":fresh,"endLeaf":end.qfhash::<PoseidonHash>().to_string(),"fullUpsVerified":true,"fixedNodeVerifier":fixed_profile,"publicEndpointsBound":true,"exportedDeltasVerified":true,"profile":if self.compact{"compact-v1"}else{"fixed40"},"endStateRoot":end.user_state_tree_root.to_string(),"logicalSlots":40,"calls":count,"steps":steps,"overheadStagesMs":{"seedState":seed_ms,"sessionStart":start_ms,"burn":burn_ms,"sdKeySign":sign_ms,"endcapProveAndVerify":endcap_ms,"stateDeltaChecks":delta_ms},"broadcast":false});println!("FULL_UPS {} {}ms",w.kind,elapsed);self.measurements.push(row);self.last_leaf=Some(end);expected.checkpoint+=1;*w=expected;Ok(())
 }
}

pub(super) fn trading_setup(kind:&str)->Result<(World,Vec<u64>,Vec<Vec<u64>>,[u64;4])>{
 trading_setup_size(kind,2)
}

#[tokio::test]
#[ignore="fresh Curve candidate bytecode, exact identities and output required"]
async fn full_ups_curve_graduation_recipient_proof()->Result<()> {
 let out=std::env::var("CURVE_GRADUATION_UPS_OUT")?;
 ensure!(std::env::var("BATCH_FULL_UPS_OUT").as_deref()==Ok(out.as_str()),"exact public UPS request archive must use graduation output");
 fs::create_dir(&out)?;
 let mut w=World::new("bondingcurve")?;let cfg=w.policy["config"].clone();
 let target=cfg["target"].as_u64().context("configured recipient")?;
 let lots=cfg["cap"].as_u64().context("lot cap")?;
 let unit=cfg["unit"].as_str().context("unit")?.parse::<u128>()?;
 let base=cfg["base"].as_str().context("base")?.parse::<u128>()?;
 let step=cfg["step"].as_str().context("step")?.parse::<u128>()?;
 let quote=base*lots as u128+step*(lots as u128)*(lots as u128-1)/2;
 w.fee(I)?;w.pay(I,A,(lots+cfg["liquidity"].as_u64().unwrap())as u128*unit)?;
 w.operation_maintenance("initialize",0,0,0,0,0,0)?;
 w.run(200,M,"open_limit_buy",&args(&[V,lots,0],&[quote],&[200,1]))?;
 w.fee(200)?;w.pay(200,B,quote)?;w.commit(&[200])?;
 let buy=w.fields("settle_limit_buy_exact",200,0,quote,unit*lots as u128,0,lots,1,0);
 w.settle(vec![buy],[0;4])?;w.fee(I)?;
 let remaining=cfg["liquidity"].as_u64().unwrap()as u128*unit;
 let before=w.slots.clone();
 let wrong=if target==400{401}else{400};
 ensure!(w.run(V,M,"graduate",&args(&[wrong],&[quote,remaining],&[])).is_err(),"wrong graduation target accepted");
 ensure!(w.slots==before,"rejected graduation changed state");
 let op=w.fields("graduate",0,0,quote,remaining,0,0,0,0);
 let fields=w.request(4,vec![op],[0;4]);let needed=batch_policy::expected_calls(&w.policy,&fields)?;
 let mut chain=Chain::new(&w,&needed)?;chain.prove(&mut w,fields).await?;
 ensure!(w.val(V,"phase",0)==2&&w.wide(V,"quote_reserve")==0,"graduation terminal state");
 ensure!(w.balance(target,A)==0&&w.balance(target,B)==0,"Outbox prematurely spendable");
 w.run(target,A,"claim",&[V])?;w.run(target,B,"claim",&[V])?;
 ensure!(w.balance(target,A)==remaining&&w.balance(target,B)==quote,"wrong graduation amounts or recipient");
 fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({"marketCodeRoot":chain.leaves[&M].code_root.to_string(),"target":target,"issuer":I,"assetA":A,"assetB":B,"quoteReturned":quote.to_string(),"tokensReturned":remaining.to_string(),"wrongRecipientRejected":true,"rejectionPreservedState":true,"outboxNotSpendableBeforeClaim":true,"fullUpsVerified":true,"measurements":chain.measurements,"scope":"synthetic authenticated graduation UPS; setup, trading to cap and ordinary target claims are VM-only; no live acceptance","broadcast":false}))?)?;
 Ok(())
}
pub(super) fn trading_setup_size(kind:&str,size:usize)->Result<(World,Vec<u64>,Vec<Vec<u64>>,[u64;4])>{
 let ids=if std::env::var("BATCH_UPS_SPREAD_IDS").as_deref()==Ok("1"){[65536,861696,1283072,1882112]}else{[200,201,202,203]};trading_setup_with_ids(kind,size,ids)
}
fn trading_setup_with_ids(kind:&str,size:usize,ids:[u64;4])->Result<(World,Vec<u64>,Vec<Vec<u64>>,[u64;4])>{
 ensure!((1..=4).contains(&size)&&(["amm","bondingcurve"].contains(&kind)||size<=2),"market batch capacity");
  let mut w=World::new(kind)?;
 ensure!(ids.windows(2).all(|x|x[0]<x[1])&&ids.iter().all(|u|*u>0&&*u<16777216&&![V,I,S].contains(u)),"unique ascending fixture users");
 if ids!=[200,201,202,203]{for u in ids{w.set(u,0,0,1000*ESCROW);for asset in[A,B]{w.run(I,asset,"transfer",&args(&[u],&[super::MAX/32],&[]))?;w.run(u,asset,"claim",&[I])?;}}
 if kind=="nftmarket"{w.give_nft(ids[0],0,4)?;w.give_nft(ids[2],0,5)?;for u in ids{w.run(u,NFT,"acknowledge",&[V])?;}}}
 let n=10u128.pow(24);let users;let mut ops=vec![];let mut rank=[0;4];
  match kind{
   "amm"=>{w.pool(n)?;let input=10u128.pow(20);users=ids[..size].to_vec();let(mut ri,mut ro)=(n,n);for u in &users{let nonce=if *u==200{2}else{1};w.run(*u,M,"open_swap",&args(&[V,0],&[input,1],&[200,nonce]))?;w.fee(*u)?;w.pay(*u,A,input)?;let out=quote(input,ri,ro);ops.push(w.fields("swap_0",*u,0,input,out,0,0,nonce,0));ri+=input;ro-=out;}},
   "bondingcurve"=>{let unit=10u128.pow(18);w.fee(I)?;w.pay(I,A,2_000_000*unit)?;w.operation_maintenance("initialize",0,0,0,0,0,0)?;users=ids[..size].to_vec();for(i,u)in users.iter().enumerate(){w.run(*u,M,"open_limit_buy",&args(&[V,1,0],&[2*unit],&[200,1]))?;w.fee(*u)?;w.pay(*u,B,2*unit)?;let price=unit+i as u128*100_000_000_000_000;ops.push(w.fields("settle_limit_buy_change",*u,0,price,unit,2*unit-price,1,1,0));}},
   "orderbook"=>{for(u,side)in[(ids[0],0),(ids[1],0),(ids[2],1),(ids[3],1)]{w.run(u,M,"open_sell",&args(&[V,side],&[n,n],&[200,1]))?;w.fee(u)?;w.pay(u,if side==0{A}else{B},n)?;}users=ids.to_vec();rank=[0,1,2,3];ops.push(w.fields("match_orders",ids[0],ids[2],n,n,0,0,1,1));ops.push(w.fields("match_orders",ids[1],ids[3],n,n,0,0,1,1));},
   _=>{for(s,b)in[(ids[0],ids[1]),(ids[2],ids[3])]{w.run(s,NFT,"acknowledge",&[V])?;w.run(s,M,"open_listing",&args(&[V,0],&[n],&[200,1]))?;w.fee(s)?;w.run(s,NFT,"transfer",&[0,V])?;w.run(b,M,"open_buy",&args(&[V,s,1],&[n],&[200,1]))?;w.fee(b)?;w.pay(b,A,n)?;ops.push(w.fields("settle_sale",s,b,n,0,0,0,1,1));}users=ids.to_vec();}
  }
 Ok((w,users,ops,rank))
}

#[tokio::test]
async fn full_ups_four_market_commit_and_settle_proofs()->Result<()>{let out=std::env::var("BATCH_FULL_UPS_OUT").context("fresh BATCH_FULL_UPS_OUT directory required")?;fs::create_dir(&out)?;
 let kinds=std::env::var("BATCH_FULL_UPS_MARKETS").unwrap_or_else(|_|"amm,orderbook,bondingcurve,nftmarket".into());let selected=kinds.split(',').collect::<Vec<_>>();ensure!(!selected.is_empty()&&selected.iter().all(|k|["amm","orderbook","bondingcurve","nftmarket"].contains(k)),"benchmark markets");
 for kind in selected{
  let size=std::env::var("BATCH_FULL_UPS_SIZE").unwrap_or_else(|_|"2".into()).parse::<usize>()?;
  let (mut w,mut users,mut ops,rank)=trading_setup_size(kind,size)?;
  if size==1{ops.truncate(1);users=match kind{"orderbook"=>vec![users[0],users[2]],"nftmarket"=>vec![users[0],users[1]],_=>users};}
  if std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1"){super::admission::enroll(&mut w,&users)?;}
  w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;let mut f=vec![0;74];f[0]=1;f[1]=w.val(V,"batch_id",0)+1;f[2]=users.len()as u64;f[3]=w.checkpoint+20;f[4]=S;f[73]=ESCROW;for(i,u)in users.iter().enumerate(){f[5+i]=*u;f[9+i]=w.val(*u,"nonce",0);}
  let mut needed=batch_policy::expected_calls(&w.policy,&f)?;needed.extend(batch_policy::expected_calls(&w.policy,&w.request(2,ops.clone(),rank))?);let mut chain=Chain::new(&w,&needed)?;chain.prove(&mut w,f).await?;let settle=w.request(2,ops,rank);chain.prove(&mut w,settle).await?;ensure!(w.val(V,"batch_phase",0)==3,"batch terminal phase");fs::write(format!("{out}/{kind}.json"),serde_json::to_vec_pretty(&json!({"market":kind,"fixtureIdentities":{"market":M,"vault":V,"issuer":I,"assetA":A,"assetB":B,"nft":NFT},"marketCodeRoot":chain.leaves[&M].code_root.to_string(),"scope":"authenticated synthetic checkpoints, full UPS; no coordinator","measurements":chain.measurements,"broadcast":false,"fills":size,"members":users.len(),"chainTps":null}))?)?;
 }Ok(())}


#[tokio::test]
async fn full_ups_fresh_vault_activation()->Result<()>{let kind=std::env::var("BATCH_BOOTSTRAP_MARKET")?;ensure!(["amm","orderbook","bondingcurve","nftmarket"].contains(&kind.as_str()),"bootstrap market");let out=std::env::var("BATCH_FULL_UPS_OUT")?;fs::create_dir(&out)?;let mut w=World::new_with_bootstrap(&kind,false)?;w.fee(I)?;w.pay(I,A,1)?;if kind!="nftmarket"{w.pay(I,B,1)?;}
 let name=if kind=="nftmarket"{"activate"}else{"activate_batch_vault"};let op=w.fields(name,I,0,0,0,0,0,0,0);let fields=w.request(4,vec![op],[0;4]);let needed=batch_policy::expected_calls(&w.policy,&fields)?;let mut chain=Chain::new(&w,&needed)?;chain.prove(&mut w,fields).await?;ensure!(w.val(V,"batch_ready",0)==1,"fresh activation marker");fs::write(format!("{out}/{kind}-activation.json"),serde_json::to_vec_pretty(&json!({"market":kind,"fullUpsVerified":true,"scope":"fresh synthetic user, complete 40-call activation UPS and exported deltas","measurements":chain.measurements,"broadcast":false}))?)?;Ok(())}

fn check_refund_claims(w:&mut World,users:&[u64],expected:&[(u64,u128,u128,u64,bool)])->Result<()>{
 for &(u,a,b,fee,nft)in expected{let before_a=w.balance(u,A);let before_b=w.balance(u,B);let before_fee=w.balance(u,0);
   if a>0{w.run(u,A,"claim",&[V])?;ensure!(w.balance(u,A)==before_a+a,"asset A refund");}
   if b>0{w.run(u,B,"claim",&[V])?;ensure!(w.balance(u,B)==before_b+b,"asset B refund");}
   if fee>0{w.run(u,0,"claim",&[V])?;ensure!(w.balance(u,0)==before_fee+fee as u128,"native refund");}
   if nft{w.run(u,NFT,"claim",&[0,V])?;let index=users.iter().position(|x|*x==u).unwrap()as u64;for j in 0..8{let name=if j<4{format!("frozen_token_id_{j}")}else{format!("frozen_metadata_hash_{}",j-4)};ensure!(w.state.get_contract_slot(u,NFT,if j<4{30+j}else{31+j})?==w.val(V,&name,index),"returned NFT identity");}}
   ensure!(w.val(V,"consumed",u)==w.val(u,"nonce",0),"refunded order nonce");
 }
 Ok(())
}

// Exact proven end leaves link all four transitions. Ordinary cancellation and
// final recipient claims execute real bytecode, not ordinary-wallet UPS proofs.
#[tokio::test]
async fn full_ups_expire_refreeze_and_refund_four_markets()->Result<()>{
 let out=std::env::var("BATCH_FULL_UPS_OUT").context("fresh BATCH_FULL_UPS_OUT directory required")?;fs::create_dir(&out)?;
 let kinds=std::env::var("BATCH_FULL_UPS_MARKETS").unwrap_or_else(|_|"amm,orderbook,bondingcurve,nftmarket".into());
 for kind in kinds.split(','){
  ensure!(["amm","orderbook","bondingcurve","nftmarket"].contains(&kind),"recovery market");
  let size=if ["amm","bondingcurve"].contains(&kind){4}else{2};
  let(mut w,users,ops,rank)=trading_setup_size(kind,size)?;
  let commit_fields=|w:&mut World|->Result<Vec<u64>>{
   if std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1")&&w.val(V,"queue_phase",0)!=2{super::admission::enroll(w,&users)?;}
   w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;
   let mut f=vec![0;74];f[0]=1;f[1]=w.val(V,"batch_id",0)+1;f[2]=users.len()as u64;f[3]=w.checkpoint+20;f[4]=S;f[73]=ESCROW;
   for(i,u)in users.iter().enumerate(){f[5+i]=*u;f[9+i]=w.val(*u,"nonce",0);}Ok(f)
  };
  let first=commit_fields(&mut w)?;
  // Discover the required CFC cache without retaining every compiled circuit.
  let mut preview=w.clone();preview.execute(&first)?;for u in &users{preview.run(*u,M,"request_cancel",&[])?;}
  preview.checkpoint+=21;preview.execute(&preview.request(3,vec![],[0;4]))?;
  let second_preview=commit_fields(&mut preview)?;preview.execute(&second_preview)?;
  let mut refunds=vec![];let mut expected=vec![];
  for(i,u)in users.iter().enumerate(){let i=i as u64;let amount=|n:&str|preview.val(V,&format!("frozen_{n}_lo"),i)as u128+super::R*preview.val(V,&format!("frozen_{n}_hi"),i)as u128;
   let a=amount("paid_a");let b=amount("paid_b");let fee=preview.val(V,"frozen_fee_delta",i);
   let has_nft=kind=="nftmarket"&&preview.val(V,"frozen_nft_sent",i)>preview.val(V,"frozen_nft_claimed",i);
   let mask=u64::from(a>0)+2*u64::from(b>0)+4*u64::from(fee>0)+8*u64::from(has_nft);
   refunds.push(preview.fields(&format!("refund_funding_{mask}"),*u,0,a,b,0,fee,preview.val(*u,"nonce",0),0));
   expected.push((*u,a,b,fee,has_nft));
  }
  let mut reference=preview.clone();reference.settle(refunds.clone(),rank)?;ensure!(reference.val(V,"batch_phase",0)==3,"recovery reference must finish");check_refund_claims(&mut reference,&users,&expected)?;
  let mut needed=batch_policy::expected_calls(&w.policy,&first)?;
  needed.extend(batch_policy::expected_calls(&preview.policy,&preview.request(3,vec![],[0;4]))?);
  needed.extend(batch_policy::expected_calls(&preview.policy,&preview.request(2,refunds.clone(),rank))?);
  let mut chain=Chain::new(&w,&needed)?;chain.prove(&mut w,first).await?;
  let committed=w.slots.clone();let mut invalid=w.request(2,ops,rank);invalid[13]=(invalid[13]+1)%18446744069414584321;
  ensure!(w.execute(&invalid).is_err()&&w.slots==committed,"rejected settlement changed committed state");
  let mut premature=w.clone();ensure!(premature.execute(&premature.request(3,vec![],[0;4])).is_err(),"premature expiry accepted");
  for u in &users{w.run(*u,M,"request_cancel",&[])?;}
  w.checkpoint=w.val(V,"batch_expiry",0)+1;let expire=w.request(3,vec![],[0;4]);chain.prove(&mut w,expire).await?;
  ensure!(w.val(V,"batch_phase",0)==4,"expiry phase");
  for u in &users{ensure!(w.val(V,"consumed",*u)<w.val(*u,"nonce",0),"expiry consumed an order");}
  let second=commit_fields(&mut w)?;chain.prove(&mut w,second).await?;
  let settlement=w.request(2,refunds,rank);chain.prove(&mut w,settlement).await?;
  ensure!(w.val(V,"batch_phase",0)==3,"refund terminal phase");
  let terminal=w.slots.clone();ensure!(w.execute(&w.request(2,vec![],rank)).is_err()&&w.slots==terminal,"terminal replay accepted");
  check_refund_claims(&mut w,&users,&expected)?;
  fs::write(format!("{out}/{kind}-recovery.json"),serde_json::to_vec_pretty(&json!({"market":kind,"members":users.len(),"scope":"linked synthetic commit, expire, recommit, refund UPS proofs; ordinary cancel and recipient claim VM only","measurements":chain.measurements,"prematureExpiryRejected":true,"failedSettlementPreservedCommit":true,"failedSettlementScope":"VM rejected wrong root; no invalid proof broadcast","terminalReplayRejected":true,"allAssetsReturnedToPayers":true,"broadcast":false,"chainTps":null}))?)?;
 }
 Ok(())
}

// Vault admission steps are now complete UPSs, not unproven method stubs.
// Ordinary user consent/sponsor authorization still execute VM-only in this
// synthetic checkpoint fixture; real wallet/network acceptance is separate.
#[tokio::test]
async fn full_ups_authenticated_queue_admission_and_settlement()->Result<()>{
 ensure!(std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1"),"distinct admission build required");
 ensure!(std::env::var("BATCH_PROOF_PROFILE").as_deref()==Ok("compact-v1"),"explicit new compact key required");
 let out=std::env::var("BATCH_FULL_UPS_OUT")?;fs::create_dir(&out)?;
 for kind in std::env::var("BATCH_FULL_UPS_MARKETS").unwrap_or_else(|_|"amm,orderbook,bondingcurve,nftmarket".into()).split(','){
  let(mut w,users,ops,rank)=trading_setup_size(kind,if ["amm","bondingcurve"].contains(&kind){4}else{2})?;let epoch=w.val(V,"queue_epoch",0)+1;let cutoff=w.checkpoint+users.len()as u64+1;
  let request=|w:&World,name:&str,a:u64,b:u64|{let op=w.policy["operations"].as_array().unwrap().iter().find(|o|o["name"]==name).unwrap();let mut f=vec![0;13];f[0]=op["branch"].as_u64().unwrap();f[1]=S;f[2]=a;let uses_b=op["calls"].as_array().unwrap().iter().flat_map(|c|c["inputs"].as_array().unwrap()).any(|v|v["witness"].as_u64()==Some(3));if uses_b{f[3]=b;}w.request(4,vec![f],[0;4])};
  let mut needed=vec![];for(name,a,b)in [("start_epoch",epoch,cutoff),("admit_entry",users[0],w.val(users[0],"nonce",0)),("seal_epoch",epoch,0)]{needed.extend(batch_policy::expected_calls(&w.policy,&request(&w,name,a,b))?);}
  let mut placeholder=vec![0;74];placeholder[0]=1;placeholder[1]=w.val(V,"batch_id",0)+1;placeholder[2]=users.len()as u64;placeholder[3]=cutoff+20;placeholder[4]=S;placeholder[73]=ESCROW;for(i,u)in users.iter().enumerate(){placeholder[5+i]=*u;placeholder[9+i]=w.val(*u,"nonce",0);}needed.extend(batch_policy::expected_calls(&w.policy,&placeholder)?);needed.extend(batch_policy::expected_calls(&w.policy,&w.request(2,ops.clone(),rank))?);
  let mut chain=Chain::new(&w,&needed)?;
  let mut plan=vec![("start_epoch",epoch,cutoff)];for u in &users{plan.push(("admit_entry",*u,w.val(*u,"nonce",0)));}plan.push(("seal_epoch",epoch,0));
  for(name,a,b)in plan{
   if name=="admit_entry"{w.run(a,M,"request_admission",&[epoch,cutoff])?;}
   if name=="seal_epoch"{w.checkpoint=cutoff+1;}
   w.run(S,M,"authorize_sponsor",&[V,ESCROW,w.val(S,"sponsor_nonce",0)+1,2])?;w.run(S,0,"transfer",&[V,ESCROW])?;
   let req=request(&w,name,a,b);chain.prove(&mut w,req).await?;
  }
  ensure!(w.val(V,"queue_phase",0)==2&&w.val(V,"queue_count",0)==users.len()as u64,"sealed accepted universe");
  w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;placeholder[3]=w.checkpoint+20;chain.prove(&mut w,placeholder).await?;let settle=w.request(2,ops,rank);chain.prove(&mut w,settle).await?;
  ensure!(w.val(V,"queue_phase",0)==3,"complete accepted scope");for i in 0..users.len(){ensure!(w.val(V,"queue_outcome",i as u64)==1,"accepted trade disposition");}
  fs::write(format!("{out}/{kind}-admission.json"),serde_json::to_vec_pretty(&json!({"market":kind,"members":users.len(),"fills":if ["amm","bondingcurve"].contains(&kind){4}else{2},"scope":"synthetic authenticated checkpoint; all vault start/admit/seal/commit/settle steps complete UPSs; ordinary consent and sponsor authorization VM-only","measurements":chain.measurements,"completeAcceptedQueue":true,"globalMarketCompleteness":false,"broadcast":false,"chainTps":null}))?)?;
 }
 Ok(())
}

// New-key opt-in: all four authenticated admissions in one complete seven-call
// UPS. User consent and Sponsor authorization are VM-only in this fixture.
#[tokio::test]
#[ignore="requires fresh bulk fixtures and fresh output directory"]
async fn full_ups_bulk_four_authenticated_admission()->Result<()>{
 ensure!(std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1"),"distinct admission build required");
 ensure!(std::env::var("BATCH_PROOF_PROFILE").as_deref()==Ok("compact-v1"),"new compact key required");
 let out=std::env::var("BATCH_FULL_UPS_OUT")?;fs::create_dir(&out)?;
 for kind in std::env::var("BATCH_FULL_UPS_MARKETS").unwrap_or_else(|_|"amm,orderbook,bondingcurve,nftmarket".into()).split(','){
  let(mut w,users,_,_)=trading_setup_size(kind,if ["amm","bondingcurve"].contains(&kind){4}else{2})?;ensure!(users.len()==4,"all four distinct owners");
  let epoch=w.val(V,"queue_epoch",0)+1;let cutoff=w.checkpoint+20;
  w.run(V,M,"start_epoch",&[epoch,cutoff])?;
  for u in &users{w.run(*u,M,"request_admission",&[epoch,cutoff])?;}
  w.run(S,M,"authorize_sponsor",&[V,ESCROW,w.val(S,"sponsor_nonce",0)+1,2])?;
  w.run(S,0,"transfer",&[V,ESCROW])?;
  let branch=w.policy["operations"].as_array().unwrap().iter().find(|op|op["name"]=="admit_entries_4").context("explicit bulk fixture required")?["branch"].as_u64().unwrap();
  let mut row=vec![0;13];row[0]=branch;row[1]=S;
  for(i,u)in users.iter().enumerate(){row[2+2*i]=*u;row[3+2*i]=w.val(*u,"nonce",0);}
  let fields=w.request(4,vec![row],[0;4]);let calls=batch_compact::calls(&w.policy,&fields)?;
  ensure!(calls.len()==7,"entire stack includes funding, claim, four admits and burn");
  for label in ["missing-consent","duplicate-owner","wrong-nonce","expired"]{
   let mut bad=w.clone();let mut altered=fields.clone();
   match label{
    "missing-consent"=>bad.set(users[3],M,bad.fields["admission_nonce"],0),
    "duplicate-owner"=>{altered[29]=altered[27];altered[30]=altered[28];},
    "wrong-nonce"=>altered[24]+=1,
    "expired"=>bad.checkpoint=cutoff+1,
    _=>unreachable!(),
   }
   let before=bad.slots.clone();ensure!(bad.execute(&altered).is_err(),"invalid bulk request {label}");ensure!(bad.slots==before,"failed bulk request committed a prefix");
  }
  let mut chain=Chain::new(&w,&calls)?;chain.prove(&mut w,fields).await?;
  ensure!(w.val(V,"queue_count",0)==4&&w.val(V,"queue_phase",0)==1,"exact full open queue");
  for(i,u)in users.iter().enumerate(){ensure!(w.val(V,"queue_owner",i as u64)==*u&&w.val(V,"queue_nonce",i as u64)==w.val(*u,"nonce",0),"complete canonical authenticated members");}
  fs::write(format!("{out}/{kind}-bulk-admission.json"),serde_json::to_vec_pretty(&json!({"market":kind,"members":users,"actualCalls":7,"measurements":chain.measurements,"fullUpsVerified":true,"wholeStackSessionFeeAndEndpointsVerified":true,"invalidVmCases":["missing-consent","duplicate-owner","wrong-nonce","expired"],"scope":"synthetic authenticated checkpoint; complete seven-call vault UPS, ordinary consent and Sponsor VM-only; negative cases VM atomic model, not Node rejection","broadcast":false,"liveAcceptance":false,"chainTps":null}))?)?;
 }
 Ok(())
}

// Dense adjacent fixture IDs can under-count physical fee leaves. Exercise
// protocol-style aligned, distant IDs and a refund path before accepting cap=4.
#[test]
#[ignore = "requires distinct admission build and fresh fee report"]
fn vm_spread_member_fee_leaf_budget()->Result<()>{
 ensure!(std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1"),"admission build required");
 let mut rows=vec![];
 fn execute_trace(w:&mut World,fields:&[u64])->Result<usize>{
  let mut leaves=BTreeSet::new();for c in batch_compact::calls(&w.policy,fields)?{let input=c["inputs"].as_array().unwrap().iter().map(|n|n.as_u64().unwrap()).collect::<Vec<_>>();for(u,c,o)in w.run_traced(V,c["contract_id"].as_u64().unwrap(),c["method_name"].as_str().unwrap(),&input)?{ensure!(u==V,"single-user UPS wrote foreign state");leaves.insert((c,o/4));}}w.revision+=1;Ok(leaves.len())
 }
 for kind in ["amm","orderbook","bondingcurve","nftmarket"]{for cancelled in [false,true]{
  let(mut w,users,mut ops,rank)=trading_setup_with_ids(kind,if ["amm","bondingcurve"].contains(&kind){4}else{2},[65536,861696,1283072,1882112])?;
  if cancelled{for u in &users{w.run(*u,M,"request_cancel",&[])?;}}
  super::admission::enroll(&mut w,&users)?;w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;w.run(S,0,"transfer",&[V,2*ESCROW])?;
  let mut fields=vec![0;74];fields[0]=1;fields[1]=w.val(V,"batch_id",0)+1;fields[2]=4;fields[3]=w.checkpoint+20;fields[4]=S;fields[73]=ESCROW;for(i,u)in users.iter().enumerate(){fields[5+i]=*u;fields[9+i]=w.val(*u,"nonce",0);}
  let commit_leaves=execute_trace(&mut w,&fields)?;
  if cancelled{ops.clear();for(i,u)in users.iter().enumerate(){let amount=|n:&str|w.val(V,&format!("frozen_{n}_lo"),i as u64)as u128+super::R*w.val(V,&format!("frozen_{n}_hi"),i as u64)as u128;let a=amount("paid_a");let b=amount("paid_b");let fee=w.val(V,"frozen_fee_delta",i as u64);let nft=kind=="nftmarket"&&w.val(V,"frozen_nft_sent",i as u64)>w.val(V,"frozen_nft_claimed",i as u64);let mask=u64::from(a>0)+2*u64::from(b>0)+4*u64::from(fee>0)+8*u64::from(nft);ops.push(w.fields(&format!("refund_funding_{mask}"),*u,0,a,b,0,fee,w.val(*u,"nonce",0),0));}}
  let settle=w.request(2,ops,rank);let settle_leaves=execute_trace(&mut w,&settle)?;ensure!(commit_leaves<=100&&settle_leaves<=100,"spread IDs exceed 100-leaf fee budget");ensure!(w.val(V,"batch_phase",0)==3,"spread batch did not terminate");rows.push(json!({"market":kind,"cancelled":cancelled,"users":users,"commitLeaves":commit_leaves,"settleLeaves":settle_leaves,"feeBudgetLeaves":100,"fullUpsVerified":false}));
 }}
 let path=std::env::var("BATCH_SPREAD_FEES_OUT")?;use std::io::Write;let mut out=fs::OpenOptions::new().create_new(true).write(true).open(path)?;out.write_all(&serde_json::to_vec_pretty(&json!({"scope":"actual VM bytecode write-leaf count with spread IDs; not a proof or network test","rows":rows,"broadcast":false}))?)?;Ok(())
}

#[tokio::test]
async fn admitted_ordinary_open_and_exit_cfc_constraints()->Result<()>{
 ensure!(std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1"),"fresh admission fixtures");
 ensure!(std::env::var_os("BATCH_CFC_METADATA").is_some(),"actual layout metadata required");
 let out=std::env::var("BATCH_ORDINARY_CFC_OUT")?;fs::create_dir(&out)?;
 for kind in ["amm","orderbook","bondingcurve","nftmarket"]{
  let mut w=World::new(kind)?;
  let(name,values)=match kind{
   "amm"=>("open_swap",args(&[V,0],&[1,1],&[200,1])),
   "orderbook"=>("open_sell",args(&[V,0],&[1,1],&[200,1])),
   "bondingcurve"=>("open_buy",args(&[V,1,0],&[1],&[200,1])),
   _=>("open_listing",args(&[V,0],&[1],&[200,1])),
  };
  prove_ordinary_cfc(&w,kind,name,&values).await?;
  w.run(200,M,name,&values)?;
  let cutoff=w.checkpoint+2;w.run(V,M,"start_epoch",&[1,cutoff])?;w.run(200,M,"request_admission",&[1,cutoff])?;w.run(200,M,"request_cancel",&[])?;
  let close=match kind{"amm"=>"close_swap_0","orderbook"=>"close_0","bondingcurve"=>"close_buy",_=>"abandon_unfunded"};
  ensure!(prove_ordinary_cfc(&w,kind,close,&[]).await.is_err(),"historical nonmembership close proof must be rejected");
  w.checkpoint=cutoff+1;w.run(V,M,"abort_empty_epoch",&[1])?;
  prove_ordinary_cfc(&w,kind,close,&[]).await?;
  prove_ordinary_cfc(&w,kind,"release_unaccepted",&[]).await?;
  w.run(200,M,"release_unaccepted",&[])?;
  fs::write(format!("{out}/{kind}.json"),serde_json::to_vec_pretty(&json!({"market":kind,"caller":200,"methods":[name,close,"release_unaccepted"],"historicalNonmembershipCloseRejected":true,"terminalEpochUnlockProven":true,"functionCircuitProofsVerified":true,"actualCodeAndLayout":true,"scope":"synthetic authenticated CFC function proofs, not complete ordinary signature/end-cap or real network","broadcast":false}))?)?;
 }
 Ok(())
}
async fn prove_ordinary_cfc(w:&World,kind:&str,name:&str,values:&[u64])->Result<()>{
let db=Store::new();let cp=w.checkpoint;
 for(cid,height)in[(0,32),(M,31),(A,31),(B,31),(NFT,30)]{let mut leaf=PsyContractLeaf{state_tree_height:f(height),..Default::default()};
 if std::env::var_os("BATCH_CFC_METADATA").is_some(){let root=std::env::var("BATCH_BUILD")?;let path=match cid{0=>"native.json".to_string(),M=>format!("{kind}/compiled/compilation_artifact.json"),NFT=>"nft/compilation_artifact.json".to_string(),_=>super::token_artifact(cid)};let a:Value=serde_json::from_slice(&fs::read(format!("{root}/{path}"))?)?;let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;leaf.code_root=get_code_root_by_code_hashes::<GF,PoseidonHash>(&defs.iter().map(hash_dpn_function::<GF>).collect::<Vec<_>>(),15);
 if cid!=0{let m=psy_data::v1::qdata::contract::canonical_layout_manifest_from_compiler_abi_json::<parth_core::pgoldilocks::PoseidonHasher,GF,parth_core::pgoldilocks::QHashOut<GF>>(&serde_json::to_string(&a["abi"])?,psy_core::constants::protocol::STATE_LAYOUT_TREE_HEIGHT,psy_data::v1::qdata::contract::CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT)?;let l=m.layout.contract_layout;leaf.state_layout_root=QHashOut(HashOut{elements:l.state_layout_root.0.elements});leaf.state_layout_field_count=f(l.state_layout_field_count);leaf.state_layout_slot_count=f(l.state_layout_slot_count);}}
db.set_contract_leaf_data(cp,cid,&leaf)?;db.set_contract_tree_leaf_hash(cp,cid,leaf.qfhash::<PoseidonHash>())?;}
 let mut groups:BTreeMap<(u64,u64,u64),[GF;4]>=BTreeMap::new();let mut users=BTreeSet::new();for((u,c,o),n)in&w.slots{users.insert(*u);groups.entry((*u,*c,*o/4)).or_insert([GF::ZERO;4])[(*o%4)as usize]=f(*n);}
 let mut roots=BTreeMap::new();for((u,c,o),v)in groups{let p=db.set_user_state_tree_leaf_hash(cp,u,c as u32,if c==0{32}else if c==NFT{30}else{31},o,QHashOut(HashOut{elements:v}))?;roots.insert((u,c),p.new_root);}for((u,c),r)in roots{db.set_user_contract_tree_leaf_hash(cp,u,c as u32,r)?;}
 users.insert(V);for u in users{let leaf=PsyUserLeaf{public_key:QHashOut(HashOut{elements:[GF::ONE;4]}),user_id:f(u),user_state_tree_root:db.get_user_contract_tree_root(cp,u).await?,balance:GF::ZERO,nonce:f(if u==V{w.revision}else{0}),..Default::default()};db.set_user_leaf_data(cp,&leaf)?;db.set_user_tree_leaf_hash(cp,u,leaf.qfhash::<PoseidonHash>())?;}
 let roots=db.get_checkpoint_global_state_roots(cp).await?;let leaf=PsyCheckpointLeaf{global_chain_root:roots.qfhash::<PoseidonHash>(),stats:PsyCheckpointLeafStats::new_empty()};db.set_checkpoint_leaf_data(cp,&leaf)?;db.set_checkpoint_tree_leaf_hash(cp,leaf.qfhash::<PoseidonHash>())?;

 let lps=PsyLocalProvingSessionStore::new_at(db,f(cp),f(200),f(1),GF::ZERO,16);
 let cm=PsyUPSStepCircuitManager::<C,2>::new_with_config(PSY_NETWORK_MAGIC);let mut info=SessionCircuitInfoStore::new();cm.register_info(&mut info).await;
 let mut session=Manager::new(lps,info,cm.ups_circuit_whitelist_root).await?;session.prove_ups_start(&cm).await?;
 let def=&w.methods[&(M,name.into())];let witness=session.exec_contract_call(f(M),def,values.iter().copied().map(f).collect()).await.with_context(||format!("ordinary caller 200 {kind}/{name}"))?;
 let circuit=DapenContractFunctionCircuit::<C,2>::new(def,31,16,false);let proof=circuit.prove_base(&witness)?;circuit.minifier_chain.verify(proof)?;
 println!("ORDINARY_CFC {kind} {name} verified");Ok(())
}

#[path="market_wallet_verification.rs"] mod wallet_proof;
