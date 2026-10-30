//! Fixed delayed draw with authenticated accepted seal and same-history CFC.
use super::*;
use psy_template_u124_markets::{stream_seal::{AcceptedSeal,DRAW_DELAY},random_minimum as minimum};
use psy_template_u124_markets::stream_policy::ORDER;
use psy_client_common::traits::to_qfelts::ToQFelts;
impl StreamChain {
 pub(super) async fn capture_accepted_seal(&mut self,w:&World)->Result<()> {
  ensure!(self.spec["version"]==13&&self.sealed.is_none(),"one new accepted seal only");
  ensure!(w.checkpoint>self.source_checkpoint&&w.checkpoint<self.source_checkpoint+DRAW_DELAY,"seal before fixed future draw");
  let db=self.base.seed_identity_with_history(w,self.key.g.get_fingerprint(),&[(1,anchor_leaf()),(self.source_checkpoint,self.source.history.checkpoint)]).await?;
  let opening=accepted_opening(self,db.clone(),w).await?;
  let vault=db.get_user_leaf_data(w.checkpoint,V).await?;
  self.sealed=Some(SealCache{opening,world:w.clone(),vault});Ok(())
 }
 pub(super) async fn seed_delayed(&self,w:&World,inactive:bool)->Result<(Store,Snapshot,MerkleProofCore<Q<GF>>)> {
  let mut history=vec![(1,anchor_leaf())];if self.source_checkpoint<w.checkpoint{history.push((self.source_checkpoint,self.source.history.checkpoint));}
  let mut db=Store::new();
  if let Some(s)=&self.sealed {if s.world.checkpoint<=w.checkpoint {
   db=self.base.seed_identity_into(&s.world,self.key.g.get_fingerprint(),&history,db,Some(s.vault)).await?;
   ensure!(db.get_checkpoint_leaf_data(s.world.checkpoint).await?.qfhash::<PoseidonHash>()==s.opening.snapshot.history.checkpoint.qfhash::<PoseidonHash>(),"original accepted-seal state and checkpoint");
   history.retain(|(i,_)|*i!=s.world.checkpoint);history.push((s.world.checkpoint,s.opening.snapshot.history.checkpoint));
  }}
  if let Some((cp,leaf,old,vault))=&*self.random_draw.borrow(){if *cp<w.checkpoint {
   db=self.base.seed_identity_into(old,self.key.g.get_fingerprint(),&history,db,Some(*vault)).await?;
   ensure!(db.get_checkpoint_leaf_data(*cp).await?.qfhash::<PoseidonHash>()==leaf.qfhash::<PoseidonHash>(),"original draw checkpoint retained");
   history.push((*cp,*leaf));
  }}
  history.sort_by_key(|(i,_)|*i);history.dedup_by_key(|(i,_)|*i);
  db=self.base.seed_identity_into(w,self.key.g.get_fingerprint(),&history,db,self.base.last_leaf).await?;
  if w.checkpoint==self.source_checkpoint+DRAW_DELAY&&self.random_draw.borrow().is_none(){*self.random_draw.borrow_mut()=Some((w.checkpoint,db.get_checkpoint_leaf_data(w.checkpoint).await?,w.clone(),db.get_user_leaf_data(w.checkpoint,V).await?));}
  let mut source=self.source.clone();source.history.anchor_path=db.get_checkpoint_tree_merkle_proof(w.checkpoint,1).await?;
  source.history.checkpoint_path=db.get_checkpoint_tree_merkle_proof(w.checkpoint,self.source_checkpoint).await?;
  let path=if inactive{stream_source::SourcePage::inactive_maintenance(&self.review,&source)?.1.rows[0].original.clone()}else{source_vault_path(&source)?};
  Ok((db,source,path))
 }
}
async fn accepted_opening(chain:&StreamChain,db:Store,w:&World)->Result<AcceptedSeal>{
  let mut snapshot=snapshot_header(db.clone(),w,&chain.review,chain.key.g.get_fingerprint()).await?;
  snapshot.fields[5]=chain.source.fields[5]; snapshot.fields[7]=chain.source.fields[7];
  let mut indices=psy_template_u124_markets::stream_seal::word_offsets(&chain.review)?.into_iter().map(|o|o/4).collect::<std::collections::BTreeSet<_>>();
  indices.insert(chain.review.offsets["batch_ready"]/4);indices.insert(chain.review.offsets["batch_phase"]/4);
  let mut words=vec![];for i in indices{words.push(db.get_user_contract_state_tree_merkle_proof(w.checkpoint,V,M as u32,31,i).await?);}
  let opening=|contract_path,words|psy_template_u124_markets::final_state_coverage::StateOpening{contract_path,words};
  let vault=db.get_user_leaf_data(w.checkpoint,V).await?;
  snapshot.accounts=vec![psy_template_u124_markets::final_state_coverage::Account{leaf:vault,
   market:opening(db.get_user_contract_tree_merkle_proof(w.checkpoint,V,M as u32).await?,words),
   native:Some(opening(db.get_user_contract_tree_merkle_proof(w.checkpoint,V,0).await?,vec![])),
   asset_a:Some(opening(db.get_user_contract_tree_merkle_proof(w.checkpoint,V,A as u32).await?,vec![])),
   asset_b:Some(opening(db.get_user_contract_tree_merkle_proof(w.checkpoint,V,B as u32).await?,vec![]))}];

 Ok(AcceptedSeal{snapshot,vault_path:db.get_user_tree_merkle_proof(w.checkpoint,V).await?})
}

impl StreamChain {
 pub(super) async fn reject_seal_attacks(&self,w:&World,db:Store,source:&Snapshot,path:&MerkleProofCore<Q<GF>>,current:&CurrentOpening,request:&Request,input:&SDKeyCircuitWitnessInput)->Result<Vec<&'static str>>{
  use psy_client_data::qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user_contract_state::SignContext};
  use psy_template_u124_markets::market_key::compute_tx_stack_hash;
  let mut cases=vec![];
  let mut bad=request.clone();bad.accepted_seal=None;ensure!(self.key.fields(&self.review,source,path,current,&bad).is_err(),"missing accepted seal allowed");
  let mut bad=request.clone();bad.accepted_seal=Some(accepted_opening(self,db,w).await?);cases.push(("draw-index-is-not-prior-seal",bad));
  let mut bad=request.clone();bad.accepted_seal.as_mut().unwrap().snapshot.history.anchor.global_chain_root.0.elements[0]+=GF::ONE;cases.push(("seal-wrong-chain",bad));
  let mut bad=request.clone();bad.accepted_seal.as_mut().unwrap().snapshot.history.checkpoint_path.root.0.elements[0]+=GF::ONE;cases.push(("seal-inconsistent-root-metadata",bad));
  let mut bad=request.clone();let foreign_path=&mut bad.accepted_seal.as_mut().unwrap().snapshot.history.checkpoint_path;
  let mut siblings=foreign_path.siblings.clone();siblings[0].0.elements[0]+=GF::ONE;
  *foreign_path=MerkleProofCore::new_from_params::<PoseidonHash>(foreign_path.index,foreign_path.value,siblings);cases.push(("seal-coherent-foreign-history",bad));
  let mut bad=request.clone();bad.accepted_seal.as_mut().unwrap().snapshot.fields[5]+=1;cases.push(("seal-wrong-epoch",bad));
  let mut rejected=vec!["missing-seal-opening"];
  for(name,bad)in cases{
   let assigned=self.key.fields(&self.review,source,path,current,&bad);
   if let Ok(fields)=assigned{
    let calls=stream_policy::calls(&self.spec,&bad,false)?;
    let infos=calls.iter().map(|c|{let cid=c["contract_id"].as_u64().unwrap();let d=&w.methods[&(cid,c["method_name"].as_str().unwrap().into())];psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(cid),f(d.method_id as u64),&c["inputs"].as_array().unwrap().iter().map(|v|f(v.as_u64().unwrap())).collect::<Vec<_>>()).into()}).collect::<Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>>();
    let active=infos.iter().filter(|i|i.contract_id!=f(M)||i.method_id!=f(self.spec["noop"]["method_id"].as_u64().unwrap())).copied().collect::<Vec<_>>();let stack=compute_tx_stack_hash(&active);let count=f(active.len()as u64);let context=input.session_context.clone();let mut end=context.current_user_leaf;end.nonce=context.nonce;
    let action=PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:context.start_user_leaf_hash,end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:context.checkpoint_leaf_hash,tx_stack_hash:stack,tx_count:count}.get_sig_action_for_user::<PoseidonHash>(PSY_NETWORK_MAGIC,context.start_user_leaf.user_id,context.nonce,SignContext{checkpoint_tree_root:context.checkpoint_tree_root,user_leaf:context.current_user_leaf}).get_qhash::<PoseidonHash>();
    let mut attack=input.clone();attack.circuit_inputs=fields.into_iter().map(f).collect();attack.transaction_infos=infos;attack.tx_stack_hash=stack;attack.tx_count=count;
    ensure!(self.key.g.prove(Q(HashOut{elements:[GF::ONE;4]}),&attack,action).await.is_err(),"coherent accepted-seal attack allowed: {name}");
   }rejected.push(name);
  }Ok(rejected)
 }
}

fn pk(c:&StreamChain)->[u64;4]{PoseidonHash::two_to_one(c.key.g.get_fingerprint().0,c.source.key_public_param.0).elements.map(|n|n.to_canonical_u64())}
#[tokio::test]
#[ignore="new delayed draw, complete UPSs, fresh outputs only"]
async fn sealed_history_random_full_ups()->Result<()> {
 let out=std::env::var("SEALED_STREAM_OUT")?;fs::create_dir(&out)?;
 for kind in ["amm","bondingcurve"] {
  let mut w=setup_with_sponsor(kind,false)?;let totals=[asset_total(&w,A)?,asset_total(&w,B)?];let mut chain=StreamChain::new(&w).await?;
  ensure!(chain.spec["version"]==13,"distinct delayed candidate");
  let key=pk(&chain);let cap=100_000_000_000;let owner=600;
  w.set(owner,0,0,cap+ESCROW);w.run(owner,M,"authorize_fee_budget",&[vec![V,1,cap],key.to_vec()].concat())?;w.run(owner,0,"transfer",&[V,cap])?;
  let db=chain.base.seed_identity_with_history(&w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;
  chain.source=snapshot(db,&w,&chain.review,chain.key.g.get_fingerprint()).await?;
  let (_,dummy)=stream_source::SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
  let native=super::minimum_stream_full_ups::native_total(&w)?;
  let mut grant=basic(minimum::GRANT_MODE,&dummy,&w);grant.registered_key=Some(key);grant.fields[21]=1;grant.fields[22]=cap;grant.fields[23]=1;
  chain.prove(&mut w,grant,&out,"sealed-grant").await?;
  let db=chain.base.seed_identity_with_history(&w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;
  chain.source=snapshot(db,&w,&chain.review,chain.key.g.get_fingerprint()).await?;chain.source_checkpoint=w.checkpoint;
  let pages=stream_source::prepare(&chain.review,&chain.source,chain.source.history.checkpoint_path.root)?;
  let sample=pages.iter().find(|p|p.after.order_count>p.before.order_count).context("eligible sample")?;
  let mut req=basic(OPEN,sample,&w);req.registered_key=Some(key);chain.prove(&mut w,req,&out,"open").await?;
  chain.capture_accepted_seal(&w).await?;
  for(i,p)in pages.iter().enumerate(){let mut req=basic(COVER,p,&w);req.registered_key=Some(key);chain.prove(&mut w,req,&out,&format!("sealed-source-{i}")).await?;}
  let unseeded=w.clone();let unseeded_leaf=chain.base.last_leaf;
  w.run(203,M,"request_cancel",&[])?;
  let draw=chain.source_checkpoint+DRAW_DELAY;w.checkpoint=draw;
  let seed=[51,62,73,84];let mut stats=PsyCheckpointLeafStats::new_empty();stats.random_seed=Q(HashOut{elements:seed.map(f)});w.state.set_checkpoint_stats(draw,stats.to_qfelts().into_iter().map(|n|n.to_canonical_u64()).collect());
  let tree=stream_source::priority(&chain.review,&chain.source,chain.source.history.checkpoint_path.root)?;
  let steps=minimum::prepare(&pages[0].scope,&tree,seed)?;
  let n=tree.members.len();let mut grouped=vec![];for half in [&steps[..n],&steps[n..]]{for rows in half.chunks(4){grouped.push(minimum::Page{seed,refund_only:false,current:rows[0].before.clone(),rows:rows.to_vec()});}}
  for(i,p)in grouped.iter().enumerate(){let mode=if p.rows[0].extract{minimum::EXTRACT_MODE}else{ORDER};let mut req=basic(mode,&pages[0],&w);req.registered_key=Some(key);req.minimum=Some(p.clone());req.accepted_seal=Some(chain.sealed.as_ref().unwrap().opening.clone());chain.prove(&mut w,req,&out,&format!("sealed-minimum-{i}")).await?;}
  let last=grouped.last().unwrap();let state=last.after(&pages[0].scope)?;
  let members=grouped.iter().filter(|p|p.rows[0].extract).flat_map(|p|p.rows.iter()).enumerate().map(|(i,row)|stream_source::PriorityMember{index:i as u64,member:psy_template_u124_markets::checkpoint_stream::Member{owner:row.node.owner,nonce:row.node.nonce,terms:row.node.terms}}).collect::<Vec<_>>();
  let ordered=stream_source::PriorityTree::from_committed(&pages[0].scope,members)?;
  ensure!(ordered.root()==state.queue,"exact sealed queue");
  for(page,chunk)in ordered.members.chunks(4).enumerate(){let mut req=settle_request(&w,&chain.review,&chain.source,&pages[0],&ordered,page*4)?;req.registered_key=Some(key);req.minimum=Some(minimum::Page::context(seed,false,state.clone()));chain.prove(&mut w,req,&out,&format!("sealed-settle-{page}")).await?;}
  let claims=claim_all(&mut w)?;
  super::minimum_stream_full_ups::conservation(&w,totals,native)?;
  // Preserve one unseeded timeout fork with the original S/C/D, never another
  // draw or a deterministic trading fallback. Ordinary claims remain VM-only.
  if kind=="amm" {
   let completed=w.clone();let completed_leaf=chain.base.last_leaf;let draw_cache=chain.random_draw.borrow().clone();
   w=unseeded;chain.base.last_leaf=unseeded_leaf;*chain.random_draw.borrow_mut()=None;w.checkpoint=chain.source.fields[7]+1;
   let initial=minimum::State::initial(&pages[0].scope);let mut req=basic(psy_template_u124_markets::random_stream::EXPIRE,&pages[0],&w);req.registered_key=Some(key);req.minimum=Some(minimum::Page::context([0;4],false,initial.clone()));chain.prove(&mut w,req,&out,"sealed-unseeded-expire").await?;
   for(page,chunk)in tree.members.chunks(4).enumerate(){let mut req=settle_request(&w,&chain.review,&chain.source,&pages[0],&tree,page*4)?;req.registered_key=Some(key);req.minimum=Some(minimum::Page::context([0;4],true,initial.clone()));chain.prove(&mut w,req,&out,&format!("sealed-unseeded-refund-{page}")).await?;}
   claim_all(&mut w)?;super::minimum_stream_full_ups::conservation(&w,totals,native)?;w=completed;chain.base.last_leaf=completed_leaf;*chain.random_draw.borrow_mut()=draw_cache;
  }
  fs::write(format!("{out}/{kind}-REPORT.json"),serde_json::to_vec_pretty(&json!({"fullUpsVerified":true,"profile":chain.spec["profile"],"source":chain.source_checkpoint,"acceptedSeal":chain.sealed.as_ref().unwrap().world.checkpoint,"draw":draw,"members":n,"orderingPages":grouped.len(),"settlementPages":ordered.members.chunks(4).count(),"ordinaryClaims":claims,"ordinaryWalletUps":false,"broadcast":false,"qualifiedRandomness":false,"finalityAuthenticated":false,"sealedHistoryOrderVerified":true,"seedSecrecyAuthenticated":false,"measurements":chain.measurements}))?)?;
 }
 Ok(())
}

#[test]
#[ignore="requires saved public v13 calls; no proving, wallet or RPC"]
fn sealed_draw_bytecode_replay_and_rejections()->Result<()> {
 let root=std::env::var("SEALED_STREAM_EVIDENCE")?;
 let out=std::env::var("SEALED_BYTECODE_OUT")?;fs::create_dir(&out)?;
 for kind in ["amm","bondingcurve"] {
  let read=|label:&str,name:&str|->Result<Value>{Ok(serde_json::from_slice(&fs::read(format!("{root}/{kind}-{label}/{name}.json"))?)?)};
  let grant:Request=serde_json::from_value(read("sealed-grant","plan")?)?;
  let key=grant.registered_key.context("registered key")?;
  let mut w=setup_with_sponsor(kind,false)?;w.set(600,0,0,100_000_000_000+ESCROW);
  w.run(600,M,"authorize_fee_budget",&[vec![V,1,100_000_000_000],key.to_vec()].concat())?;
  w.run(600,0,"transfer",&[V,100_000_000_000])?;
  let execute_calls=|w:&mut World,public:&Value|->Result<()>{w.checkpoint=public["checkpoint"].as_u64().context("public checkpoint")?;for c in public["actualCalls"].as_array().unwrap(){let values=c["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().context("public felt")).collect::<Result<Vec<_>>>()?;w.run(V,c["contract_id"].as_u64().unwrap(),c["method_name"].as_str().unwrap(),&values)?;}Ok(())};
  for label in ["sealed-grant","open","sealed-source-0","sealed-source-1"]{execute_calls(&mut w,&read(label,"public-session")?)?;}
  w.run(203,M,"request_cancel",&[])?;
  let first=read("sealed-minimum-0","public-session")?;w.checkpoint=first["checkpoint"].as_u64().unwrap();
  let request:Request=serde_json::from_value(read("sealed-minimum-0","plan")?)?;
  let seed=request.minimum.as_ref().unwrap().seed;
  let mut stats=PsyCheckpointLeafStats::new_empty();stats.random_seed=Q(HashOut{elements:seed.map(f)});w.state.set_checkpoint_stats(w.checkpoint,stats.to_qfelts().into_iter().map(|n|n.to_canonical_u64()).collect());
  let original=first["actualCalls"][0]["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>();
  let mut rejected=vec![];
  for name in ["wrong-seed","wrong-draw","draw-as-seal"] {
   let mut bad=original.clone();match name {"wrong-seed"=>bad[5]+=1,"wrong-draw"=>bad[4]-=1,_=>bad[9]=bad[4]};let before=w.slots.clone();
   ensure!(w.run(V,M,"begin_order_page",&bad).is_err()&&w.slots==before,"bytecode accepted {name} or mutated state");rejected.push(name);
  }
  execute_calls(&mut w,&first)?;
  let next=read("sealed-minimum-1","public-session")?;w.checkpoint=next["checkpoint"].as_u64().unwrap();
  let mut different_seal=next["actualCalls"][0]["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>();different_seal[9]+=1;
  let before=w.slots.clone();ensure!(w.run(V,M,"begin_order_page",&different_seal).is_err()&&w.slots==before,"accepted seal changed across pages");rejected.push("cross-page-seal-substitution");
  ensure!(w.run(V,M,"begin_order_page",&original).is_err()&&w.slots==before,"completed page replay");rejected.push("replayed-page");
  execute_calls(&mut w,&next)?;
  fs::write(format!("{out}/{kind}.json"),serde_json::to_vec_pretty(&json!({"scope":"actual bytecode replay of saved public calls; not new CFC/UPS proofs or live execution","validContinuationPassed":true,"rejections":rejected,"stateUnchangedOnRejection":true,"financialOperations":0,"broadcast":false}))?)?;
 }
 Ok(())
}
