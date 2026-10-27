//! Real batch + token + NFT + native bytecode. Local atomic state commits and
//! races are explicit models, not coordinator admission or chain throughput.
use anyhow::{bail,ensure,Context,Result};
use psy_vm::dpn::{eval::executor::{ExecutionContext,InMemoryStateBackend,StateBackend,VmExecutor},vm::def::DPNFunctionCircuitDefinition};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_template_u124_markets::batch_policy::expected_calls;
use serde_json::{Value,json};
use std::{collections::{BTreeMap,HashMap},sync::Arc,fs};
use num_bigint::BigUint;use num_traits::ToPrimitive;
const M:u64=1000;const A:u64=42;const B:u64=43;const NFT:u64=41;const V:u64=100;const I:u64=5;const S:u64=300;const F:u64=1_000_100_000;
const R:u128=1u128<<62;const MAX:u128=(1u128<<124)-1;
#[path="support/batch_full_ups.rs"] mod full_ups;
#[path="support/batch_admission.rs"] mod admission;
fn pair(n:u128)->[u64;2]{[(n%R)as u64,(n/R)as u64]}
fn args(prefix:&[u64],amounts:&[u128],suffix:&[u64])->Vec<u64>{let mut v=prefix.to_vec();for n in amounts{v.extend(pair(*n));}v.extend(suffix);v}
fn quote(n:u128,ri:u128,ro:u128)->u128{((BigUint::from(n)*9970u64*BigUint::from(ro))/(BigUint::from(ri)*10000u64+BigUint::from(n)*9970u64)).to_u128().unwrap()}
#[derive(Clone)]struct World{state:InMemoryStateBackend,methods:Arc<HashMap<(u64,String),DPNFunctionCircuitDefinition>>,fields:Arc<HashMap<String,u64>>,policy:Value,checkpoint:u64,slots:BTreeMap<(u64,u64,u64),u64>,revision:u64,kind:String,vault:u64}
impl World{
 fn new(kind:&str)->Result<Self>{Self::new_with_bootstrap(kind,true)}
 fn new_with_bootstrap(kind:&str,bootstrap:bool)->Result<Self>{let root=std::env::var("BATCH_BUILD")?;let read=|p:&str|->Result<Value>{Ok(serde_json::from_slice(&fs::read(format!("{root}/{p}"))?)?)};let market=read(&format!("{kind}/compiled/compilation_artifact.json"))?;let policy=read(&format!("{kind}/policy.json"))?;
  let mut methods=HashMap::new();for(cid,a)in[(M,market.clone()),(A,read("token/compilation_artifact.json")?),(B,read("token/compilation_artifact.json")?),(NFT,read("nft/compilation_artifact.json")?),(0,read("native.json")?)]{let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;for d in defs{methods.insert((cid,d.name.clone()),d);}}
  let fields=market["abi"]["contract"]["state"].as_array().unwrap().iter().map(|f|(f["name"].as_str().unwrap().to_owned(),f["offset"].as_u64().unwrap())).collect();
  let mut w=Self{state:InMemoryStateBackend::new(),methods:Arc::new(methods),fields:Arc::new(fields),policy,checkpoint:100,slots:BTreeMap::new(),revision:0,kind:kind.into(),vault:V};
  for u in[I,S,200,201,202,203]{w.set(u,0,0,1000*F);}
  for c in[A,B]{w.run(I,c,"set_metadata",&[123,18])?;w.run(I,c,"mint",&pair(MAX/2))?;for u in[200,201,202,203]{w.run(I,c,"transfer",&args(&[u],&[MAX/16],&[]))?;w.run(u,c,"claim",&[I])?;}}
  if kind!="nftmarket"&&bootstrap{w.fee(I)?;w.pay(I,A,1)?;w.pay(I,B,1)?;w.operation_maintenance("activate_batch_vault",I,0,0,0,0,0)?;}
  if kind=="nftmarket"{w.run(I,NFT,"set_collection_metadata",&[123,0,0,0,0])?;w.give_nft(200,0,1)?;w.give_nft(202,0,2)?;w.run(I,NFT,"mint",&[0,3,0,0,0,0])?;if bootstrap{w.fee(I)?;w.pay(I,A,1)?;w.operation_maintenance("activate",I,0,0,0,0,0)?;for u in[200,201,202,203]{w.run(u,NFT,"acknowledge",&[V])?;}}}
  Ok(w)
 }
 fn set(&mut self,u:u64,c:u64,o:u64,n:u64){self.state.set_slot(u,c,o,n);self.slots.insert((u,c,o),n);}
 fn run(&mut self,u:u64,c:u64,name:&str,input:&[u64])->Result<()>{self.run_traced(u,c,name,input).map(|_|())}
 fn run_traced(&mut self,u:u64,c:u64,name:&str,input:&[u64])->Result<Vec<(u64,u64,u64)>>{let mut vm=VmExecutor::new(self.state.clone());let d=self.methods.get(&(c,name.into())).ok_or_else(||anyhow::anyhow!("missing {name}"))?;let r=vm.execute(d,&ExecutionContext{user_id:u,contract_id:c,caller_contract_id:DEFAULT_CALLER_CONTRACT_ID_U64,checkpoint_id:self.checkpoint,nonce:self.revision+1,user_public_key_hash:[0;4],session_proof_tree_root:[0;4],transaction_log:vec![],transaction_stack_hash:[0;4]},input)?;if !r.success{bail!("{name}: {}",r.failure.unwrap().message);}let writes=vm.write_overlay();self.state.apply_overlay(writes);self.slots.extend(writes.iter().map(|(k,v)|(*k,*v)));self.state.apply_imt_overlay(vm.imt_write_overlay());Ok(writes.keys().copied().collect())}
 fn val(&self,u:u64,f:&str,i:u64)->u64{self.state.get_contract_slot(u,M,self.fields[f]+i).unwrap()}
 fn wide(&self,u:u64,f:&str)->u128{self.val(u,f,0)as u128+R*self.val(u,f,1)as u128}
 fn balance(&self,u:u64,c:u64)->u128{self.state.get_contract_slot(u,c,0).unwrap()as u128+R*self.state.get_contract_slot(u,c,1).unwrap()as u128}
 fn fee(&mut self,u:u64)->Result<()>{self.run(u,0,"transfer",&[self.vault,F])}
 fn pay(&mut self,u:u64,c:u64,n:u128)->Result<()>{self.run(u,c,"transfer",&args(&[self.vault],&[n],&[]))}
 fn fields(&self,name:&str,p:u64,peer:u64,x:u128,y:u128,z:u128,lots:u64,nonce:u64,peer_nonce:u64)->Vec<u64>{let id=self.policy["operations"].as_array().unwrap().iter().find(|o|o["name"]==name).unwrap()["branch"].as_u64().unwrap();let mut f=vec![id,p,peer];f.extend(pair(x));f.extend(pair(y));f.extend(pair(z));f.extend([lots,nonce,peer_nonce,0]);
  // The policy's operation has canonical unused fields. Normalize only the
  // fixture constructor; request/circuit validation must reject mutations.
  let op=&self.policy["operations"][id as usize-1];let mut used=std::collections::BTreeSet::from([0]);for c in op["calls"].as_array().unwrap(){for a in c["inputs"].as_array().unwrap(){if let Some(i)=a["witness"].as_u64(){used.insert(i as usize);}}}for(i,v)in f.iter_mut().enumerate(){if !used.contains(&i){*v=0;}}f
 }
 fn request(&self,mode:u64,ops:Vec<Vec<u64>>,rank:[u64;4])->Vec<u64>{let mut f=vec![0;74];f[0]=mode;if mode==2||mode==3{f[1]=self.val(self.vault,"batch_id",0);}if mode==2{for i in 0..4{f[13+i]=self.val(self.vault,"batch_root",i as u64);}if self.kind=="orderbook"{f[17..21].copy_from_slice(&rank);}}for(i,o)in ops.iter().enumerate(){f[21+13*i..34+13*i].copy_from_slice(o);}f[73]=F;f}
 fn execute(&mut self,f:&[u64])->Result<()>{let calls=expected_calls(&self.policy,f)?;let mut next=self.clone();for c in calls{let input=c["inputs"].as_array().unwrap().iter().map(|x|x.as_u64().unwrap()).collect::<Vec<_>>();next.run(self.vault,c["contract_id"].as_u64().unwrap(),c["method_name"].as_str().unwrap(),&input)?;}next.revision+=1;*self=next;Ok(())}
 fn operation_maintenance(&mut self,name:&str,p:u64,peer:u64,x:u128,y:u128,z:u128,lots:u64)->Result<()>{let op=self.fields(name,p,peer,x,y,z,lots,0,0);self.execute(&self.request(4,vec![op],[0;4]))}
 fn commit(&mut self,users:&[u64])->Result<()>{if std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1") && self.val(V,"queue_phase",0)!=2 {admission::enroll(self,users)?;}self.run(S,M,"authorize_sponsor",&[self.vault,2*F,self.val(S,"sponsor_nonce",0)+1,1])?;self.run(S,0,"transfer",&[self.vault,2*F])?;let mut f=vec![0;74];f[0]=1;f[1]=self.val(self.vault,"batch_id",0)+1;f[2]=users.len()as u64;f[3]=self.checkpoint+20;f[4]=S;for(i,u)in users.iter().enumerate(){f[5+i]=*u;f[9+i]=if self.kind=="nftmarket"&&(self.val(*u,"kind",0)==0||self.val(*u,"nonce",0)<=self.val(self.vault,"consumed",*u)||users.iter().any(|buyer|buyer!=u&&self.val(*buyer,"kind",0)==2&&self.val(*buyer,"seller",0)==*u&&self.val(*u,"kind",0)!=1)){0}else{self.val(*u,"nonce",0)};}f[73]=F; self.execute(&f)}
 fn settle(&mut self,ops:Vec<Vec<u64>>,rank:[u64;4])->Result<()>{self.execute(&self.request(2,ops,rank))}
 fn give_nft(&mut self,u:u64,slot:u64,id:u64)->Result<()>{let source=(0..128).find(|i|self.state.get_contract_slot(I,NFT,34+9*i).unwrap()==0).context("issuer NFT capacity")?;self.run(I,NFT,"mint",&[source,id,11,id,33,44])?;self.run(I,NFT,"acknowledge",&[u])?;self.run(I,NFT,"transfer",&[source,u])?;self.run(u,NFT,"claim",&[slot,I])}
 fn pool(&mut self,n:u128)->Result<()>{self.run(200,M,"open_add",&args(&[self.vault],&[n,n,n-1000],&[200,1]))?;self.fee(200)?;self.pay(200,A,n)?;self.pay(200,B,n)?;self.commit(&[200])?;let op=self.fields("add_liquidity",200,0,n,n,n-1000,0,1,0);self.settle(vec![op],[0;4])?;self.run(200,M,"close_add",&[])}
}

#[test]fn amm_two_orders_recompute_shared_reserves_and_reject_reordering_omission_replay()->Result<()>{let mut w=World::new("amm")?;let n=10u128.pow(28);let input=10u128.pow(26);w.pool(n)?;
 for(u,nonce)in[(200,2),(201,1)]{w.run(u,M,"open_swap",&args(&[V,0],&[input,1],&[200,nonce]))?;w.fee(u)?;w.pay(u,A,input)?;}
 w.commit(&[200,201])?;let out0=quote(input,n,n);let out1=quote(input,n+input,n-out0);let a=w.fields("swap_0",200,0,input,out0,0,0,2,0);let b=w.fields("swap_0",201,0,input,out1,0,0,1,0);
 let before=w.slots.clone();assert!(w.settle(vec![b.clone(),a.clone()],[0;4]).is_err());assert_eq!(w.slots,before);assert!(w.settle(vec![a.clone()],[0;4]).is_err());assert_eq!(w.slots,before);
 w.settle(vec![a.clone(),b.clone()],[0;4])?;assert_eq!(w.wide(V,"reserve_a"),n+2*input);assert_eq!(w.wide(V,"reserve_b"),n-out0-out1);assert!(w.settle(vec![a,b],[0;4]).is_err());w.run(200,B,"claim",&[V])?;w.run(201,B,"claim",&[V])?;Ok(())}

#[test]fn committed_cancellation_boundary_and_expiry_recovery_are_explicit()->Result<()>{let mut w=World::new("amm")?;let n=10u128.pow(24);let input=10u128.pow(20);w.pool(n)?;w.run(201,M,"open_swap",&args(&[V,0],&[input,1],&[200,1]))?;w.fee(201)?;w.pay(201,A,input)?;w.commit(&[201])?;w.run(201,M,"request_cancel",&[])?;
 let out=quote(input,n,n);let refund=w.fields("refund_swap_0",201,0,input,out,0,0,1,0);assert!(w.settle(vec![refund],[0;4]).is_err());let sale=w.fields("swap_0",201,0,input,out,0,0,1,0);w.settle(vec![sale],[0;4])?;
 let mut x=World::new("amm")?;x.pool(n)?;x.run(201,M,"open_swap",&args(&[V,0],&[input,1],&[200,1]))?;x.fee(201)?;x.pay(201,A,input)?;x.commit(&[201])?;x.checkpoint+=21;let f=x.request(3,vec![],[0;4]);x.execute(&f)?;x.run(201,M,"request_cancel",&[])?;x.commit(&[201])?;let refund=x.fields("refund_funding_5",201,0,input,0,0,F,1,0);x.settle(vec![refund],[0;4])?;assert_eq!(x.val(V,"consumed",201),1);Ok(())}

#[test]fn curve_limit_batch_uses_progressive_price_and_refunds_change()->Result<()>{let mut w=World::new("bondingcurve")?;let unit=10u128.pow(18);w.fee(I)?;w.pay(I,A,2_000_000*unit)?;w.operation_maintenance("initialize",0,0,0,0,0,0)?;
 let max=2*unit;for u in[200,201]{w.run(u,M,"open_limit_buy",&args(&[V,1,0],&[max],&[200,1]))?;w.fee(u)?;w.pay(u,B,max)?;}
 w.commit(&[200,201])?;let first=unit;let second=unit+100_000_000_000_000;let a=w.fields("settle_limit_buy_change",200,0,first,unit,max-first,1,1,0);let b=w.fields("settle_limit_buy_change",201,0,second,unit,max-second,1,1,0);w.settle(vec![a,b],[0;4])?;assert_eq!(w.val(V,"sold_lots",0),2);assert_eq!(w.wide(V,"quote_reserve"),first+second);assert_eq!(w.balance(V,B),first+second);for u in[200,201]{w.run(u,B,"claim",&[V])?;w.run(u,A,"claim",&[V])?;}Ok(())}

#[test]fn book_priority_is_enforced_by_bytecode_not_matcher_input_order()->Result<()>{let mut w=World::new("orderbook")?;let n=10u128.pow(24);
 for(u,side,amount,min)in[(200,0,n,n),(201,0,n,2*n),(202,1,2*n,n),(203,1,n,n)]{w.run(u,M,"open_sell",&args(&[V,side],&[amount,min],&[200,1]))?;w.fee(u)?;w.pay(u,if side==0{A}else{B},amount)?;}
 w.commit(&[200,201,202,203])?;let best=w.fields("match_orders",200,202,n,2*n,0,0,1,1);let other=w.fields("match_orders",201,203,n,n,0,0,1,1);let initial=w.slots.clone();assert!(w.settle(vec![other],[0,1,2,3]).is_err());assert_eq!(w.slots,initial);
 // The expensive ask cannot fill the remaining bid. Whole-order matching
 // carries both without consuming their funding or their terminal nonces.
 w.settle(vec![best],[0,1,2,3])?;assert_eq!(w.val(V,"consumed",200),1);assert_eq!(w.val(V,"consumed",202),1);assert_eq!(w.val(V,"consumed",201),0);assert_eq!(w.val(V,"consumed",203),0);Ok(())}

#[test]fn nft_competing_buyers_have_one_winner_and_loser_refund()->Result<()>{let mut w=World::new("nftmarket")?;let price=10u128.pow(28)+17;w.run(200,NFT,"acknowledge",&[V])?;w.run(200,M,"open_listing",&args(&[V,0],&[price],&[200,1]))?;w.fee(200)?;w.run(200,NFT,"transfer",&[0,V])?;
 for u in[201,203]{w.run(u,M,"open_buy",&args(&[V,200,1],&[price],&[200,1]))?;w.fee(u)?;w.pay(u,A,price)?;}
 w.commit(&[200,201,203])?;let wrong=w.fields("settle_sale",200,203,price,0,0,0,1,1);let before=w.slots.clone();assert!(w.settle(vec![wrong],[0;4]).is_err());assert_eq!(w.slots,before);
 let premature=w.fields("refund_funding_5",203,0,price,0,0,F,1,0);assert!(w.settle(vec![premature],[0;4]).is_err(),"eligible buyer cannot choose a refund before the winner");
 let sale=w.fields("settle_sale",200,201,price,0,0,0,1,1);let refund=w.fields("refund_funding_5",203,0,price,0,0,F,1,0);w.settle(vec![sale,refund],[0;4])?;assert_eq!(w.val(V,"consumed",200),1);assert_eq!(w.val(V,"consumed",201),1);assert_eq!(w.val(V,"consumed",203),1);w.run(201,NFT,"claim",&[0,V])?;w.run(203,A,"claim",&[V])?;Ok(())}

#[test]fn partial_excess_and_wrong_asset_funding_return_only_to_original_payer()->Result<()>{for native_fee in [0,F]{let mut w=World::new("amm")?;let n=10u128.pow(24);w.pool(n)?;let a=w.balance(201,A);let b=w.balance(201,B);w.run(201,M,"open_swap",&args(&[V,0],&[n,1],&[200,1]))?;if native_fee>0{w.fee(201)?;}w.pay(201,A,n+17)?;w.pay(201,B,23)?;w.commit(&[201])?;let mask=if native_fee==0{3}else{7};let refund=w.fields(&format!("refund_funding_{mask}"),201,0,n+17,23,0,native_fee,1,0);let mut bad=refund.clone();bad[1]=202;let before=w.slots.clone();assert!(w.settle(vec![bad],[0;4]).is_err());assert_eq!(w.slots,before);w.settle(vec![refund],[0;4])?;w.run(201,A,"claim",&[V])?;w.run(201,B,"claim",&[V])?;assert_eq!(w.balance(201,A),a);assert_eq!(w.balance(201,B),b);assert_eq!(w.val(V,"consumed",201),1);}Ok(())}

#[test]fn eight_workers_settlement_and_cancellation_have_one_vault_winner()->Result<()>{use std::sync::{Mutex,Barrier};
 for kind in["amm","orderbook","bondingcurve","nftmarket"]{let(mut w,users,ops,rank)=full_ups::trading_setup_size(kind,if ["amm","bondingcurve"].contains(&kind){4}else{2})?;w.commit(&users)?;let shared=Arc::new(Mutex::new(w));let barrier=Arc::new(Barrier::new(9));let mut jobs=vec![];
  for _ in 0..8{let shared=shared.clone();let barrier=barrier.clone();let ops=ops.clone();jobs.push(std::thread::spawn(move||->Result<bool>{let(anchor,mut candidate)={let w=shared.lock().unwrap();(w.revision,w.clone())};candidate.settle(ops,rank)?;barrier.wait();let mut current=shared.lock().unwrap();if current.revision!=anchor{return Ok(false);}
   // Apply caller-only writes. Never replace other users' concurrent state.
   for((u,c,o),n)in candidate.slots{if u==V{current.set(u,c,o,n);}}current.revision=candidate.revision;Ok(true)}));}
  {let mut current=shared.lock().unwrap();current.run(200,M,"request_cancel",&[])?;}barrier.wait();
  let winners=jobs.into_iter().map(|j|j.join().unwrap()).collect::<Result<Vec<_>>>()?.into_iter().filter(|x|*x).count();assert_eq!(winners,1);let w=shared.lock().unwrap();assert_eq!(w.val(V,"batch_phase",0),3);assert_eq!(w.val(200,"cancelled",0),1);
 }Ok(())}

#[test]fn settlement_tail_failure_restores_all_four_markets_without_refreezing()->Result<()>{for kind in["amm","orderbook","bondingcurve","nftmarket"]{let(mut w,users,ops,rank)=full_ups::trading_setup(kind)?;w.commit(&users)?;let f=w.request(2,ops,rank);let mut calls=expected_calls(&w.policy,&f)?;calls.last_mut().unwrap()["inputs"]=json!([u64::MAX]);let mut candidate=w.clone();let before=w.slots.clone();let mut rejected=false;for c in calls{let values=c["inputs"].as_array().unwrap().iter().map(|x|x.as_u64().unwrap()).collect::<Vec<_>>();if candidate.run(V,c["contract_id"].as_u64().unwrap(),c["method_name"].as_str().unwrap(),&values).is_err(){rejected=true;break;}}assert!(rejected);assert_eq!(w.slots,before);assert_eq!(w.val(V,"batch_phase",0),1);w.execute(&f)?;assert_eq!(w.val(V,"batch_phase",0),3);}Ok(())}

#[test]fn late_funding_cannot_change_frozen_eligibility()->Result<()>{let(mut w,_,_,_)=full_ups::trading_setup("amm")?;w.commit(&[200,201])?;w.pay(200,B,17)?;let n=10u128.pow(24);let input=10u128.pow(20);let out=quote(input,n,n);let a=w.fields("swap_0",200,0,input,out,0,0,2,0);let before=w.slots.clone();assert!(w.settle(vec![a],[0;4]).is_err());assert_eq!(w.slots,before);w.checkpoint+=21;w.execute(&w.request(3,vec![],[0;4]))?;w.commit(&[200,201])?;let a=w.fields("refund_funding_7",200,0,input,17,0,F,2,0);let b=w.fields("swap_0",201,0,input,out,0,0,1,0);w.settle(vec![a,b],[0;4])?;Ok(())}
#[test]fn closed_listing_reference_allows_late_buyer_refund()->Result<()>{let(mut w,_,ops,rank)=full_ups::trading_setup("nftmarket")?;
 // A second buyer pays for a listing before its earlier buyer wins.
 let n=10u128.pow(24);w.run(203,M,"request_cancel",&[])?; // discard the unrelated second sale through its ordinary refund later
 w.run(201,M,"request_cancel",&[])?;w.commit(&[200,201])?;let buy=w.fields("refund_funding_5",201,0,n,0,0,F,1,0);w.settle(vec![buy],rank)?;
 // The original listing remains active. A fresh nonce from the refunded buyer
 // wins it; then a concurrently open old buyer can refund against closed state.
 w.run(201,M,"close_buy",&[])?;w.run(201,M,"open_buy",&args(&[V,200,1],&[n],&[200,2]))?;w.fee(201)?;w.pay(201,A,n)?;
 // User 202 is already a seller, so use 203 after refunding its prior buy.
 w.commit(&[202,203])?;w.settle(vec![w.fields("refund_funding_5",203,0,n,0,0,F,1,0)],rank)?;w.run(203,M,"close_buy",&[])?;
 w.run(203,M,"open_buy",&args(&[V,200,1],&[n],&[200,2]))?;w.fee(203)?;w.pay(203,A,n)?;
 w.commit(&[200,201])?;w.settle(vec![w.fields("settle_sale",200,201,n,0,0,0,1,2)],rank)?;w.run(200,M,"close_listing",&[])?;
 w.commit(&[200,203])?;w.settle(vec![w.fields("refund_funding_5",203,0,n,0,0,F,2,0)],rank)?;assert_eq!(w.val(V,"consumed",203),2);let _=ops;Ok(())}

#[test]
#[ignore = "explicit benchmark: set BATCH_BUILD and fresh BATCH_BENCH_OUT"]
fn bytecode_batch_throughput_benchmark()->Result<()>{use std::time::Instant;let out=std::env::var("BATCH_BENCH_OUT")?;let mut results=vec![];
 for market in["amm","orderbook","bondingcurve","nftmarket"]{for size in if ["amm","bondingcurve"].contains(&market){vec![1usize,2,4]}else{vec![1usize,2]}{let(base,mut users,mut ops,rank)=full_ups::trading_setup_size(market,size)?;if size==1{ops.truncate(1);users=match market{"orderbook"=>vec![200,202],"nftmarket"=>vec![200,201],_=>vec![200]};}let mut commits=vec![];let mut settles=vec![];
  for _ in 0..12{let mut w=base.clone();let t=Instant::now();w.commit(&users)?;commits.push(t.elapsed().as_secs_f64()*1000.);let f=w.request(2,ops.clone(),rank);let t=Instant::now();w.execute(&f)?;settles.push(t.elapsed().as_secs_f64()*1000.);ensure!(w.val(V,"batch_phase",0)==3,"benchmark must count terminal success");}
  commits.sort_by(|a,b|a.total_cmp(b));settles.sort_by(|a,b|a.total_cmp(b));let commit=(commits[5]+commits[6])/2.;let settle=(settles[5]+settles[6])/2.;results.push(json!({"market":market,"scope":"real bytecode in-memory; no proof generation or coordinator","iterations":12,"commitSamplesMs":commits,"settleSamplesMs":settles,"quantiles":"p50 midpoint median, p95 nearest rank","members":users.len(),"fills":size,"explicitAndBurnCallsPerUps":40,"commitIncludesSponsorFunding":true,"commitP50Ms":commit,"settleP50Ms":settle,"settleP95Ms":settles[11],"settleVmFillsPerSecond":1000.*size as f64/settle,"twoPhaseVmFillsPerSecond":1000.*size as f64/(commit+settle),"chainTps":null}));
 }}
 std::fs::OpenOptions::new().write(true).create_new(true).open(out).and_then(|mut f|{use std::io::Write;f.write_all(serde_json::to_string_pretty(&results).unwrap().as_bytes())})?;Ok(())}

#[test]fn unsolicited_funding_recovery_and_sponsor_consent_are_enforced()->Result<()>{for market in["amm","orderbook","bondingcurve","nftmarket"]{let mut w=World::new(market)?;
 // Receiving native tokens alone is not consent to sponsor an Executor.
 w.run(S,0,"transfer",&[V,2*F])?;let unauthorized=w.fields("fund_gas",S,0,0,0,0,2*F,0,0);let before=w.slots.clone();assert!(w.execute(&w.request(4,vec![unauthorized.clone()],[0;4])).is_err());assert_eq!(w.slots,before);
 w.run(S,M,"authorize_sponsor",&[V,2*F,1,2])?;w.execute(&w.request(4,vec![unauthorized],[0;4]))?;let a=w.balance(201,A);w.run(201,M,"request_recovery",&[V])?;w.pay(201,A,17)?;let has_b=market!="nftmarket";let b=w.balance(201,B);if has_b{w.pay(201,B,23)?;}w.run(201,0,"transfer",&[V,13])?;
 let op=w.fields(if has_b{"recover_funding_7"}else{"recover_funding_5"},201,0,17,if has_b{23}else{0},0,13,0,0);let mut bad=op.clone();bad[1]=202;assert!(w.execute(&w.request(4,vec![bad],[0;4])).is_err());w.execute(&w.request(4,vec![op],[0;4]))?;w.run(201,A,"claim",&[V])?;if has_b{w.run(201,B,"claim",&[V])?;assert_eq!(w.balance(201,B),b);}w.run(201,0,"claim",&[V])?;assert_eq!(w.balance(201,A),a);
 }Ok(())}

#[test]fn nft_partial_fee_listing_refund_returns_the_same_nft()->Result<()>{let mut w=World::new("nftmarket")?;let price=10u128.pow(24);w.run(200,NFT,"acknowledge",&[V])?;w.run(200,M,"open_listing",&args(&[V,0],&[price],&[200,1]))?;w.run(200,NFT,"transfer",&[0,V])?;w.run(200,0,"transfer",&[V,17])?;w.commit(&[200])?;w.settle(vec![w.fields("refund_funding_12",200,0,0,0,0,17,1,0)],[0;4])?;w.run(200,NFT,"claim",&[0,V])?;w.run(200,M,"close_listing",&[])?;assert_eq!(w.val(V,"consumed",200),1);Ok(())}

#[test]fn wrong_and_excess_nft_deposits_return_actual_fifo_assets()->Result<()>{for excess in[false,true]{let mut w=World::new("nftmarket")?;w.give_nft(200,1,4)?;let price=10u128.pow(24);w.run(200,NFT,"acknowledge",&[V])?;w.run(200,M,"open_listing",&args(&[V,0],&[price],&[200,1]))?;w.fee(200)?;
 if excess{w.run(200,NFT,"transfer",&[0,V])?;}w.run(200,NFT,"transfer",&[1,V])?;w.commit(&[200])?;w.settle(vec![w.fields("refund_funding_12",200,0,0,0,0,F,1,0)],[0;4])?;w.run(200,NFT,"claim",&[if excess{0}else{1},V])?;
 if excess{w.run(200,M,"request_recovery",&[V])?;w.run(S,M,"authorize_sponsor",&[V,2*F,2,2])?;w.run(S,0,"transfer",&[V,2*F])?;let fund=w.fields("fund_gas",S,0,0,0,0,2*F,0,0);w.execute(&w.request(4,vec![fund],[0;4]))?;let recover=w.fields("recover_nft",200,0,0,0,0,0,1,0);w.execute(&w.request(4,vec![recover],[0;4]))?;w.run(200,NFT,"claim",&[1,V])?;}
 w.run(200,M,"close_listing",&[])?;assert_eq!(w.val(V,"consumed",200),1);
 }Ok(())}

#[test]
fn cancelled_book_fee_returns_to_sender_and_active_order_cannot_use_recovery()->Result<()>{
 let mut w=World::new("orderbook")?;let n=10u128.pow(24);let before=w.balance(200,A);
 w.run(200,M,"open_sell",&args(&[V,0],&[n,n],&[200,1]))?;w.fee(200)?;w.pay(200,A,n)?;
 assert!(w.run(200,M,"request_recovery",&[V]).is_err());
 w.run(200,M,"request_cancel",&[])?;w.commit(&[200])?;
 w.settle(vec![w.fields("refund_funding_5",200,0,n,0,0,F,1,0)],[0,1,2,3])?;
 w.run(200,A,"claim",&[V])?;let native=w.state.get_contract_slot(200,0,0)?;
 w.run(200,0,"claim",&[V])?;assert_eq!(w.state.get_contract_slot(200,0,0)?,native+F);assert_eq!(w.balance(200,A),before);Ok(())
}
#[test]
fn commit_sponsorship_cannot_be_spent_as_maintenance()->Result<()>{
 let mut w=World::new("orderbook")?;w.run(S,M,"authorize_sponsor",&[V,2*F,1,1])?;w.run(S,0,"transfer",&[V,2*F])?;
 let f=w.request(4,vec![w.fields("fund_gas",S,0,0,0,0,2*F,0,0)],[0;4]);let before=w.slots.clone();assert!(w.execute(&f).is_err());assert_eq!(w.slots,before);Ok(())
}
#[test]
fn first_and_middle_call_failures_discard_candidate_overlay()->Result<()>{
 for kind in ["amm","orderbook","bondingcurve","nftmarket"]{let(mut w,users,ops,rank)=full_ups::trading_setup(kind)?;w.commit(&users)?;let f=w.request(2,ops,rank);
  for position in [0usize,20]{let mut calls=expected_calls(&w.policy,&f)?;
   // Fault injection into a local VM transaction: the SD-key would reject
   // this substituted call too. It does not simulate coordinator persistence.
   calls[position]=json!({"contract_id":0,"method_name":"burn","inputs":[u64::MAX]});
   let before=w.slots.clone();let mut candidate=w.clone();let mut failed=false;
   for call in calls{let inputs=call["inputs"].as_array().unwrap().iter().map(|n|n.as_u64().unwrap()).collect::<Vec<_>>();if candidate.run(V,call["contract_id"].as_u64().unwrap(),call["method_name"].as_str().unwrap(),&inputs).is_err(){failed=true;break;}}
   assert!(failed);assert_eq!(w.slots,before);assert_eq!(w.val(V,"batch_phase",0),1);
  }w.execute(&f)?;
 }Ok(())
}

#[test]
fn canonical_commitment_bounds_and_forged_root_are_rejected()->Result<()>{
 let mut w=World::new("orderbook")?;let n=10u128.pow(24);
 for u in [200,201]{w.run(u,M,"open_sell",&args(&[V,0],&[n,n],&[200,1]))?;w.fee(u)?;w.pay(u,A,n)?;}
 w.run(S,M,"authorize_sponsor",&[V,2*F,1,2])?;w.run(S,0,"transfer",&[V,2*F])?;
 let mut f=vec![0;74];f[0]=1;f[1]=1;f[2]=2;f[3]=w.checkpoint+1024;f[4]=S;f[5]=200;f[6]=201;f[9]=1;f[10]=1;f[73]=F;
 assert!(w.execute(&f).is_err(),"maintenance consent cannot sponsor commit");w.run(S,M,"authorize_sponsor",&[V,2*F,2,1])?;
 for (index,value) in [(3,w.checkpoint+1025),(6,200),(9,2),(2,5)]{let mut bad=f.clone();bad[index]=value;let before=w.slots.clone();assert!(w.execute(&bad).is_err());assert_eq!(w.slots,before);}
 let mut bad=f.clone();bad.swap(5,6);assert!(w.execute(&bad).is_err());w.execute(&f)?;
 let mut bad=w.request(2,vec![],[0,1,2,3]);bad[13]^=1;let before=w.slots.clone();assert!(w.execute(&bad).is_err());assert_eq!(w.slots,before);
 // No compatible pair: carry is allowed, with no user fee claim.
 w.execute(&w.request(2,vec![],[0,1,2,3]))?;assert_eq!(w.val(V,"consumed",200),0);Ok(())
}

#[test]
fn independent_vaults_settle_concurrently_without_losing_either_partition()->Result<()>{
 use std::sync::{Barrier,Mutex};let mut w=World::new("amm")?;let n=10u128.pow(24);let input=10u128.pow(20);w.pool(n)?;
 w.run(201,M,"open_swap",&args(&[V,0],&[input,1],&[200,1]))?;w.fee(201)?;w.pay(201,A,input)?;w.commit(&[201])?;
 let other=101;w.vault=other;w.fee(I)?;w.pay(I,A,1)?;w.pay(I,B,1)?;w.operation_maintenance("activate_batch_vault",I,0,0,0,0,0)?;
 w.run(202,M,"open_add",&args(&[other],&[n,n,n-1000],&[200,1]))?;w.fee(202)?;w.pay(202,A,n)?;w.pay(202,B,n)?;w.commit(&[202])?;
 w.settle(vec![w.fields("add_liquidity",202,0,n,n,n-1000,0,1,0)],[0;4])?;w.run(202,M,"close_add",&[])?;
 w.run(203,M,"open_swap",&args(&[other,0],&[input,1],&[200,1]))?;w.fee(203)?;w.pay(203,A,input)?;w.commit(&[203])?;
 let shared=Arc::new(Mutex::new(w));let barrier=Arc::new(Barrier::new(2));let mut jobs=vec![];
 for (vault,payer) in [(V,201),(other,203)]{let shared=shared.clone();let barrier=barrier.clone();jobs.push(std::thread::spawn(move||->Result<()>{
  let mut candidate=shared.lock().unwrap().clone();candidate.vault=vault;let batch=candidate.val(vault,"batch_id",0);let root=(0..4).map(|i|candidate.val(vault,"batch_root",i)).collect::<Vec<_>>();
  candidate.settle(vec![candidate.fields("swap_0",payer,0,input,quote(input,n,n),0,0,1,0)],[0;4])?;barrier.wait();let mut current=shared.lock().unwrap();
  ensure!(current.val(vault,"batch_phase",0)==1&&current.val(vault,"batch_id",0)==batch&&(0..4).map(|i|current.val(vault,"batch_root",i)).collect::<Vec<_>>()==root,"vault anchor changed");
  for ((u,c,o),value) in candidate.slots{if u==vault{current.set(u,c,o,value);}}current.revision+=1;Ok(())
 }));}for job in jobs{job.join().unwrap()?;}let w=shared.lock().unwrap();for vault in [V,other]{assert_eq!(w.val(vault,"batch_phase",0),3);assert_eq!(w.val(vault,"reserve_a",0),pair(n+input)[0]);}Ok(())
}

#[test]
fn sparse_maximum_user_ids_fit_the_refund_fee_budget()->Result<()>{
 use std::collections::BTreeSet;let mut w=World::new("nftmarket")?;let users=[1_000_001,8_388_607,12_345_679,16_777_214];let seed=10u128.pow(24);let mut ops=vec![];
 for (i,u) in users.into_iter().enumerate(){w.set(u,0,0,1000*F);w.run(I,A,"transfer",&args(&[u],&[seed],&[]))?;w.run(u,A,"claim",&[I])?;w.give_nft(u,0,4+i as u64)?;
  w.run(u,NFT,"acknowledge",&[V])?;w.run(u,M,"open_listing",&args(&[V,0],&[seed],&[200,1]))?;w.fee(u)?;w.pay(u,A,17)?;w.run(u,NFT,"transfer",&[0,V])?;
  ops.push(w.fields("refund_funding_13",u,0,17,0,0,F,1,0));
 }w.commit(&users)?;let mut touched=BTreeSet::new();for call in expected_calls(&w.policy,&w.request(2,ops,[0;4]))?{let input=call["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>();for (u,c,o) in w.run_traced(V,call["contract_id"].as_u64().unwrap(),call["method_name"].as_str().unwrap(),&input)?{if u==V{touched.insert((c,o/4));}}}
 assert_eq!(w.val(V,"batch_phase",0),3);ensure!(touched.len()<=100,"sparse recipients exceed burn policy budget: {}",touched.len());println!("SPARSE_REFUND positional_leaves={} policy_max=100",touched.len());
 for u in users{w.run(u,A,"claim",&[V])?;w.run(u,NFT,"claim",&[0,V])?;w.run(u,0,"claim",&[V])?;assert_eq!(w.balance(u,A),seed);assert_eq!(w.state.get_contract_slot(u,0,0)?,1000*F);assert_eq!(w.val(V,"consumed",u),1);}Ok(())
}

#[test]
fn four_member_amm_and_curve_require_all_ordered_results()->Result<()>{
 for kind in ["amm","bondingcurve"]{let(mut w,users,ops,rank)=full_ups::trading_setup_size(kind,4)?;w.commit(&users)?;
  for position in [0,1,2,3]{let mut missing=ops.clone();missing.remove(position);let before=w.slots.clone();assert!(w.settle(missing,rank).is_err());assert_eq!(w.slots,before);
   if position<3{let mut reordered=ops.clone();reordered.swap(position,position+1);assert!(w.settle(reordered,rank).is_err());assert_eq!(w.slots,before);}}
  w.settle(ops,rank)?;assert_eq!(w.val(V,"batch_phase",0),3);
  for u in users{assert_eq!(w.val(V,"consumed",u),w.val(u,"nonce",0));}
  if kind=="bondingcurve"{assert_eq!(w.val(V,"sold_lots",0),4);}else{assert_eq!(w.wide(V,"reserve_a"),10u128.pow(24)+4*10u128.pow(20));}
 }Ok(())
}

#[test]
fn four_sparse_dual_asset_refunds_fit_commit_and_settlement_budgets()->Result<()>{
 use std::collections::BTreeSet;
 for kind in ["amm","bondingcurve","orderbook"]{let mut w=World::new(kind)?;let users=[1_000_001,8_388_607,12_345_679,16_777_214];let seed=10u128.pow(24);let mut ops=vec![];
  for u in users{w.set(u,0,0,1000*F);for c in[A,B]{w.run(I,c,"transfer",&args(&[u],&[seed],&[]))?;w.run(u,c,"claim",&[I])?;}
   if kind=="amm"{w.run(u,M,"open_swap",&args(&[V,0],&[17,1],&[200,1]))?;}else if kind=="bondingcurve"{w.run(u,M,"open_limit_buy",&args(&[V,1,0],&[23],&[200,1]))?;}else{w.run(u,M,"open_sell",&args(&[V,0],&[17,1],&[200,1]))?;}
   w.fee(u)?;w.pay(u,A,17)?;w.pay(u,B,23)?;w.run(u,M,"request_cancel",&[])?;ops.push(w.fields("refund_funding_7",u,0,17,23,0,F,1,0));
  }
  w.commit(&users)?;let rank=if kind=="orderbook"{[0,1,2,3]}else{[0;4]};let mut touched=BTreeSet::new();for c in expected_calls(&w.policy,&w.request(2,ops,rank))?{let inputs=c["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>();for(u,c,o)in w.run_traced(V,c["contract_id"].as_u64().unwrap(),c["method_name"].as_str().unwrap(),&inputs)?{if u==V{touched.insert((c,o/4));}}}
  ensure!(w.val(V,"batch_phase",0)==3&&touched.len()<=100,"four-refund fee budget");println!("FOUR_SPARSE_REFUND {kind} positional_leaves={} policy_max=100",touched.len());
  for u in users{for c in[A,B]{w.run(u,c,"claim",&[V])?;assert_eq!(w.balance(u,c),seed);}w.run(u,0,"claim",&[V])?;assert_eq!(w.balance(u,0),1000*F as u128);}
 }Ok(())
}
