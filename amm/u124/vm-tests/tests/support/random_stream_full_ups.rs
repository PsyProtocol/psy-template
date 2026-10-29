//! New candidate only. Real bytecode and full synthetic UPSs, not live receipts.
use super::*;
use psy_template_u124_markets::random_stream::{self,Page as RandomPage,EXPIRE};
use psy_client_common::traits::to_qfelts::ToQFelts;
const SEED:[u64;4]=[51,62,73,84];
async fn apply(chain:&mut StreamChain,w:&mut World,req:Request,out:&str,label:&str,vm:bool)->Result<()>{
 if vm{execute(w,&chain.spec,&req)}else{chain.prove(w,req,out,label).await}
}
fn seed(w:&mut World,source:u64){let mut stats=PsyCheckpointLeafStats::new_empty();stats.random_seed=Q(HashOut{elements:SEED.map(f)});w.state.set_checkpoint_stats(source+1,stats.to_qfelts().into_iter().map(|n|n.to_canonical_u64()).collect());}
fn fixed(mut r:Request,seed:[u64;4],refund_only:bool)->Request{r.random=Some(RandomPage::context(seed,refund_only));r}
#[tokio::test]
#[ignore="one historical-draw CFC probe, no complete UPS or broadcast"]
async fn random_stream_historical_draw_cfc_probe()->Result<()>{
 let out=std::env::var("RANDOM_STREAM_OUT")?;fs::create_dir(&out)?;
 let mut w=setup("amm")?;let chain=StreamChain::new(&w).await?;let s=chain.source.clone();
 let source=stream_source::prepare(&chain.review,&s,s.history.checkpoint_path.root)?;
 let original=stream_source::priority(&chain.review,&s,s.history.checkpoint_path.root)?;let (pages,_)=random_stream::prepare(&source[0].scope,&original,SEED)?;
 let req=basic(OPEN,&source[0],&w);execute(&mut w,&chain.spec,&req)?;seed(&mut w,s.fields[6]);w.checkpoint=s.fields[6]+1;
 chain.seed(&w).await?;
 for p in &source{let req=basic(COVER,p,&w);execute(&mut w,&chain.spec,&req)?;w.checkpoint+=1;}
 let (db,_,_)=chain.seed(&w).await?;
 let draw=db.get_checkpoint_leaf_data(s.fields[6]+1).await?;let roots=db.get_checkpoint_global_state_roots(s.fields[6]+1).await?;
 ensure!(roots.qfhash::<PoseidonHash>()==draw.global_chain_root&&draw.stats.random_seed==Q(HashOut{elements:SEED.map(f)}),"actual historical draw roots and seed");
 let old=db.get_user_leaf_data(w.checkpoint,V).await?;
 let lps=PsyLocalProvingSessionStore::new_at(db,f(w.checkpoint),f(V),f(w.revision+1),old.event_index,16);
 let mut info=SessionCircuitInfoStore::new();chain.base.cm.register_info(&mut info).await;let mut manager=Manager::new(lps,info,chain.base.cm.ups_circuit_whitelist_root).await?;
 manager.prove_ups_start(&chain.base.cm).await?;
 let mut req=basic(stream_policy::ORDER,&source[0],&w);req.random=Some(pages[0].page.clone());let calls=stream_policy::calls(&chain.spec,&req,true)?;
 let def=&w.methods[&(M,"begin_order_page".into())];let values=calls[0]["inputs"].as_array().unwrap().iter().map(|n|f(n.as_u64().unwrap())).collect();
 let witness=manager.exec_contract_call(f(M),def,values).await?;
 let circuit=DapenContractFunctionCircuit::<C,2>::new(def,31,16,false);let proof=circuit.prove_base(&witness)?;circuit.minifier_chain.verify(proof.clone())?;
 fs::write(format!("{out}/proof.bin"),bincode::serialize(&proof)?)?;
 fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&json!({"historicalRootsMatch":true,"drawCheckpoint":s.fields[6]+1,"currentCheckpoint":w.checkpoint,"cfcProofVerified":true,"fullUpsVerified":false,"broadcast":false}))?)?;Ok(())
}
#[tokio::test]
#[ignore="new v10 compiled candidates; bounded VM or full UPS run, fresh output required"]
async fn random_stream_complete_set_order_settlement_and_recovery()->Result<()>{
 let out=std::env::var("RANDOM_STREAM_OUT")?;fs::create_dir(&out)?;
 let vm=std::env::var("RANDOM_STREAM_VM_ONLY").as_deref()==Ok("1");
 for kind in std::env::var("STREAM_MARKETS").unwrap_or_else(|_|"amm,bondingcurve".into()).split(','){
  ensure!(["amm","bondingcurve"].contains(&kind),"explicit market");let mut w=setup(kind)?;let totals=[asset_total(&w,A)?,asset_total(&w,B)?];
  let mut chain=StreamChain::new(&w).await?;ensure!(chain.spec["version"]==10,"new random stream key required");
  let s=chain.source.clone();let source=stream_source::prepare(&chain.review,&s,s.history.checkpoint_path.root)?;
  let original=stream_source::priority(&chain.review,&s,s.history.checkpoint_path.root)?;
  let (pages,queue)=random_stream::prepare(&source[0].scope,&original,SEED)?;ensure!(pages.len()==2&&queue.members.len()==5,"whole 4+1 source permutation");
  for p in &pages{ensure!(random_stream::after(&source[0].scope,&p.before,&p.page)?==p.after,"planner exact endpoints");}
  let req=basic(OPEN,&source[0],&w);apply(&mut chain,&mut w,req,&out,"open",vm).await?;
  w.run(203,M,"request_cancel",&[])?;
  seed(&mut w,s.fields[6]);
  let before=w.slots.clone();let abort=basic(stream_policy::ABORT_SOURCE,&source[0],&w);ensure!(execute(&mut w,&chain.spec,&abort).is_err()&&w.slots==before,"sealed source cannot be abandoned and reopened");
  for(i,p)in source.iter().enumerate(){let req=basic(COVER,p,&w);apply(&mut chain,&mut w,req,&out,&format!("source-{i}"),vm).await?;}
  ensure!(w.val(V,"stream_phase",0)==2&&w.val(V,"stream_queue_total",0)==0,"all accounts covered before random ordering");
  let unseeded=w.clone();let unseeded_leaf=chain.base.last_leaf;
  w.checkpoint=w.checkpoint.max(s.fields[6]+1);
  let mut attacks=vec![];let mut prefix=None;
  for(i,p)in pages.iter().enumerate(){
   let mut req=basic(stream_policy::ORDER,&source[0],&w);req.random=Some(p.page.clone());
   let before=w.slots.clone();
   let calls=stream_policy::calls(&chain.spec,&req,false)?;
   let mut values=calls[0]["inputs"].as_array().unwrap().iter().map(|n|n.as_u64().unwrap()).collect::<Vec<_>>();values[5]+=1;let mut trial=w.clone();ensure!(trial.run(V,M,"begin_order_page",&values).is_err(),"actual seed intrinsic accepted fake seed");
   let mut wrong=req.clone();wrong.random.as_mut().unwrap().seed[0]+=1;
   ensure!(execute(&mut w,&chain.spec,&wrong).is_err()&&w.slots==before,"fake or reselected seed changed state");attacks.push(format!("page-{i}-seed-substitution"));
   if i>0{
    let mut repeat=req.clone();repeat.random=Some(pages[0].page.clone());ensure!(stream_policy::calls(&chain.spec,&repeat,false).is_err(),"repeated page accepted");
    let expiry=basic(EXPIRE,&source[0],&w);ensure!(execute(&mut w,&chain.spec,&expiry).is_err()&&w.slots==before,"installed seed was abandoned for unseeded recovery");
   }
   apply(&mut chain,&mut w,req,&out,&format!("order-{i}"),vm).await?;
   ensure!(read_sort(&w)==p.after,"persistent random ordering endpoint");if i==0{prefix=Some((w.clone(),chain.base.last_leaf));}
  }
  ensure!(w.val(V,"stream_phase",0)==3,"complete permutation before trading");
  let first=fixed(settle_request(&w,&chain.review,&s,&source[0],&queue,0)?,SEED,false);
  apply(&mut chain,&mut w,first,&out,"settle-0",vm).await?;
  let tail_start=w.clone();let tail_leaf=chain.base.last_leaf;
  let tail=fixed(settle_request(&w,&chain.review,&s,&source[0],&queue,4)?,SEED,false);
  apply(&mut chain,&mut w,tail,&out,"settle-tail",vm).await?;
  ensure!(w.val(V,"stream_phase",0)==7&&w.val(V,"stream_settled",0)==5,"all five members terminal");
  for u in 200..205{ensure!(w.val(V,"consumed",u)==1,"missing disposition");}
  let claims=claim_all(&mut w)?;ensure!(totals==[asset_total(&w,A)?,asset_total(&w,B)?],"normal asset conservation");
  let mut late=tail_start;late.checkpoint=s.fields[7]+1;chain.base.last_leaf=tail_leaf;
  let req=fixed(settle_request(&late,&chain.review,&s,&source[0],&queue,4)?,SEED,false);
  apply(&mut chain,&mut late,req,&out,"timeout-tail",vm).await?;claim_all(&mut late)?;
  ensure!(late.val(V,"stream_phase",0)==7&&totals==[asset_total(&late,A)?,asset_total(&late,B)?],"fixed-seed late refund conservation");
  let mut expired=unseeded;expired.checkpoint=s.fields[7]+1;chain.base.last_leaf=unseeded_leaf;
  let req=basic(EXPIRE,&source[0],&expired);apply(&mut chain,&mut expired,req,&out,"expire-unseeded",vm).await?;
  ensure!(expired.val(V,"stream_refund_only",0)==1,"timeout exit cannot trade");
  for offset in [0,4]{let req=fixed(settle_request(&expired,&chain.review,&s,&source[0],&original,offset)?,[0;4],true);apply(&mut chain,&mut expired,req,&out,&format!("unseeded-refund-{offset}"),vm).await?;}
  claim_all(&mut expired)?;ensure!(expired.val(V,"stream_phase",0)==7&&totals==[asset_total(&expired,A)?,asset_total(&expired,B)?],"unseeded complete refund conservation");
  for u in 200..205{ensure!(expired.val(V,"consumed",u)==1,"unseeded refund failed to retire authorization");}
  let (mut repair,repair_leaf)=prefix.unwrap();repair.checkpoint=s.fields[7]+1;chain.base.last_leaf=repair_leaf;
  let restart=fixed(basic(random_stream::RESTORE,&source[0],&repair),SEED,false);apply(&mut chain,&mut repair,restart,&out,"restart-expired-order",vm).await?;
  ensure!(repair.val(V,"stream_refund_only",0)==1&&repair.val(V,"stream_queue_total",0)==0,"same-seed refund restart endpoint");
  for(i,p)in pages.iter().enumerate(){let mut req=basic(stream_policy::ORDER,&source[0],&repair);let mut page=p.page.clone();page.refund_only=true;req.random=Some(page);apply(&mut chain,&mut repair,req,&out,&format!("recovery-order-{i}"),vm).await?;}
  for offset in [0,4]{let req=fixed(settle_request(&repair,&chain.review,&s,&source[0],&queue,offset)?,SEED,true);apply(&mut chain,&mut repair,req,&out,&format!("recovery-refund-{offset}"),vm).await?;}
  claim_all(&mut repair)?;ensure!(repair.val(V,"stream_phase",0)==7&&totals==[asset_total(&repair,A)?,asset_total(&repair,B)?],"same-seed prefix recovery asset conservation");
  fs::write(format!("{out}/{kind}-REPORT.json"),serde_json::to_vec_pretty(&json!({"profile":"source-covered-producer-random-stream-v1","fullUpsVerified":!vm,"vmOnly":vm,"producerInfluence":true,"qualifiedRandomness":false,"members":5,"sourcePages":source.len(),"orderingPages":[4,1],"settlementPages":[4,1],"singleSource":s.fields[6],"singleDraw":s.fields[6]+1,"seed":SEED,"permutationOwners":queue.members.iter().map(|r|r.member.owner).collect::<Vec<_>>(),"assetConservation":true,"sameSeedPrefixRecovery":true,"ordinaryWalletUps":false,"ordinaryClaimBytecode":claims,"bytecodeRejections":attacks,"measurements":chain.measurements,"broadcast":false}))?)?;
 }
 Ok(())
}
