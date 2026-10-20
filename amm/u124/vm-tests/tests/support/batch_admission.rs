//! Accepted queue scope; not all submitted intents. Actual VM bytecode.
use super::*;
#[test]
#[ignore="requires distinct admission fixtures"]
fn admitted_nft_missing_seller_can_only_refund_without_aliasing_row_zero()->Result<()>{
 ensure!(std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1"),"distinct admission fixtures required");
 // A buyer may be the only accepted member. Its intended seller is outside
 // the sealed scope: the executor must neither inject that seller nor lock it.
 for unrelated_listing in [false,true]{
  let(mut w,_,_,_)=super::full_ups::trading_setup_size("nftmarket",2)?;
  let price=w.wide(203,"price");let before=w.balance(203,A)+price;
  let users=if unrelated_listing{vec![200,203]}else{vec![203]};
  w.commit(&users)?;let frozen=w.slots.clone();
  let forged=w.fields("settle_sale",if unrelated_listing{200}else{202},203,price,0,0,0,1,1);
  assert!(w.settle(vec![forged],[0;4]).is_err());assert_eq!(w.slots,frozen);
  let refund=w.fields("refund_funding_5",203,0,price,0,0,F,1,0);
  let mut redirect=refund.clone();redirect[1]=201;
  assert!(w.settle(vec![redirect],[0;4]).is_err());assert_eq!(w.slots,frozen);
  w.settle(vec![refund.clone()],[0;4])?;
  assert_eq!(w.val(V,"queue_phase",0),3);assert_eq!(w.val(V,"consumed",203),1);
  assert_eq!(w.val(V,"queue_outcome",(users.len()-1)as u64),2);
  if unrelated_listing{assert_eq!(w.val(V,"queue_outcome",0),3);assert_eq!(w.val(V,"consumed",200),0);}
  w.run(203,A,"claim",&[V])?;assert_eq!(w.balance(203,A),before);
  assert!(w.settle(vec![refund],[0;4]).is_err());
 }
 Ok(())
}
pub(super) fn enroll(w:&mut World,users:&[u64])->Result<()>{
 let epoch=w.val(V,"queue_epoch",0)+1;let cutoff=w.checkpoint+2;w.run(V,M,"start_epoch",&[epoch,cutoff])?;
 for u in users.iter().rev(){w.run(*u,M,"request_admission",&[epoch,cutoff])?;w.run(V,M,"admit_entry",&[*u,w.val(*u,"nonce",0)])?;}
 w.checkpoint=cutoff+1;w.run(V,M,"seal_epoch",&[epoch])?;Ok(())
}
#[test]
#[ignore="requires distinct admission fixtures"]
fn authenticated_admission_four_markets_omission_forgery_root_and_recovery()->Result<()>{
 ensure!(std::env::var("BATCH_ADMISSION_TEST").as_deref()==Ok("1"),"distinct admission fixtures required");
 for kind in ["amm","orderbook","bondingcurve","nftmarket"]{
  let(mut w,users,ops,rank)=super::full_ups::trading_setup_size(kind,2)?;
  let epoch=w.val(V,"queue_epoch",0)+1;let cutoff=w.checkpoint+2;w.run(V,M,"start_epoch",&[epoch,cutoff])?;
  let saved=w.slots.clone();assert!(w.run(V,M,"admit_entry",&[users[0],w.val(users[0],"nonce",0)]).is_err());assert_eq!(w.slots,saved,"no unsigned admission");
  for u in users.iter().rev(){w.run(*u,M,"request_admission",&[epoch,cutoff])?;w.run(V,M,"admit_entry",&[*u,w.val(*u,"nonce",0)])?;}
  let saved=w.slots.clone();assert!(w.run(V,M,"admit_entry",&[users[0],w.val(users[0],"nonce",0)]).is_err());assert_eq!(w.slots,saved);
  assert!(w.run(V,M,"seal_epoch",&[epoch]).is_err());w.checkpoint=cutoff+1;w.run(V,M,"seal_epoch",&[epoch])?;
  let sorted=users.iter().copied().collect::<std::collections::BTreeSet<_>>().into_iter().collect::<Vec<_>>();for(i,u)in sorted.iter().enumerate(){assert_eq!(w.val(V,"queue_owner",i as u64),*u);}
  let saved=w.slots.clone();assert!(w.run(V,M,"admit_entry",&[users[0],w.val(users[0],"nonce",0)]).is_err());assert_eq!(w.slots,saved);
  // Missing or forged owner/nonces cannot shrink or replace the sealed scope.
  let mut missing=w.clone();assert!(missing.commit(&sorted[..sorted.len()-1]).is_err());let mut forged=w.clone();assert!(forged.commit(&[users[0],999]).is_err());
  w.commit(&sorted)?;let before=w.slots.clone();let mut bad=w.request(2,ops.clone(),rank);bad[13]=(bad[13]+1)%18446744069414584321;assert!(w.execute(&bad).is_err());assert_eq!(w.slots,before);
  let batch=w.val(V,"batch_id",0);w.checkpoint=w.val(V,"batch_expiry",0)+1;w.execute(&w.request(3,vec![],[0;4]))?;assert_eq!(w.val(V,"queue_phase",0),2);assert!(w.run(V,M,"start_epoch",&[epoch+1,w.checkpoint+2]).is_err());
  w.commit(&sorted)?;assert_eq!(w.val(V,"batch_id",0),batch+1);w.settle(ops,rank)?;assert_eq!(w.val(V,"queue_phase",0),3);for i in 0..users.len(){assert_eq!(w.val(V,"queue_outcome",i as u64),1,"trade disposition");}
  assert!(w.run(V,M,"seal_epoch",&[epoch]).is_err());println!("ADMISSION {kind}: consent, sorted complete scope, omission/forgery/root rejection, expiry/refreeze and terminal results verified");
 }
 Ok(())
}
#[test]
#[ignore="requires distinct admission fixtures"]
fn admitted_cancellation_and_empty_epoch_recovery()->Result<()>{
 for kind in ["amm","bondingcurve"]{
  let(mut w,users,_,_)=super::full_ups::trading_setup_size(kind,2)?;enroll(&mut w,&users)?;for u in &users{w.run(*u,M,"request_cancel",&[])?;}w.commit(&users)?;
  let mut refunds=vec![];for u in &users{let pa=w.state.get_contract_slot(*u,A,33554453+4*V).unwrap()as u128+R*w.state.get_contract_slot(*u,A,33554454+4*V).unwrap()as u128;let pb=w.state.get_contract_slot(*u,B,33554453+4*V).unwrap()as u128+R*w.state.get_contract_slot(*u,B,33554454+4*V).unwrap()as u128;
   let ca=w.state.get_contract_slot(V,A,33554455+4**u).unwrap()as u128+R*w.state.get_contract_slot(V,A,33554456+4**u).unwrap()as u128;let cb=w.state.get_contract_slot(V,B,33554455+4**u).unwrap()as u128+R*w.state.get_contract_slot(V,B,33554456+4**u).unwrap()as u128;let aa=pa-ca;let bb=pb-cb;let fee=w.state.get_contract_slot(*u,0,3+2*V).unwrap()-w.val(V,"settled_fee",*u);let mask=(if aa>0{1}else{0})+(if bb>0{2}else{0})+(if fee>0{4}else{0});refunds.push(w.fields(&format!("refund_funding_{mask}"),*u,0,aa,bb,0,fee,w.val(*u,"nonce",0),0));}
  w.settle(refunds,[0;4])?;assert_eq!(w.val(V,"queue_phase",0),3);for i in 0..users.len(){assert_eq!(w.val(V,"queue_outcome",i as u64),2);}
  let next=w.val(V,"queue_epoch",0)+1;let cutoff=w.checkpoint+2;w.run(V,M,"start_epoch",&[next,cutoff])?;assert!(w.run(V,M,"abort_empty_epoch",&[next]).is_err());w.checkpoint=cutoff+1;w.run(V,M,"abort_empty_epoch",&[next])?;assert_eq!(w.val(V,"queue_phase",0),3);
 }
 Ok(())
}
#[test]
#[ignore="requires distinct admission fixtures"]
fn admitted_book_and_nft_legal_carry_are_explicit()->Result<()>{
 for kind in ["orderbook","nftmarket"]{let(mut w,_,_,_)=super::full_ups::trading_setup_size(kind,2)?;let users=if kind=="orderbook"{vec![200,201]}else{vec![200]};enroll(&mut w,&users)?;w.commit(&users)?;w.settle(vec![],if kind=="orderbook"{[0,1,2,3]}else{[0;4]})?;
  assert_eq!(w.val(V,"queue_phase",0),3);for i in 0..users.len(){assert_eq!(w.val(V,"queue_outcome",i as u64),3,"legal carry disposition");}
 }Ok(())
}
#[test]
#[ignore="requires distinct admission fixtures"]
fn admission_eight_workers_one_anchor_winner_then_capacity_bound()->Result<()>{
 use std::sync::{Mutex,Barrier};let mut w=World::new("amm")?;w.pool(10u128.pow(24))?;let epoch=w.val(V,"queue_epoch",0)+1;let cutoff=w.checkpoint+2;w.run(V,M,"start_epoch",&[epoch,cutoff])?;
 let users=(210..218).collect::<Vec<_>>();for u in &users{w.run(*u,M,"open_swap",&args(&[V,0],&[1,1],&[200,1]))?;w.run(*u,M,"request_admission",&[epoch,cutoff])?;}
 let shared=Arc::new(Mutex::new(w));let barrier=Arc::new(Barrier::new(8));let mut jobs=vec![];
 for u in &users{let u=*u;let shared=shared.clone();let barrier=barrier.clone();jobs.push(std::thread::spawn(move||->Result<bool>{let(anchor,mut candidate)={let w=shared.lock().unwrap();(w.revision,w.clone())};candidate.run(V,M,"admit_entry",&[u,1])?;barrier.wait();let mut current=shared.lock().unwrap();if current.revision!=anchor{return Ok(false);}for((owner,c,o),n)in candidate.slots{if owner==V{current.set(owner,c,o,n);}}current.revision+=1;Ok(true)}));}
 let wins=jobs.into_iter().map(|j|j.join().unwrap()).collect::<Result<Vec<_>>>()?.into_iter().filter(|x|*x).count();assert_eq!(wins,1);
 let mut w=shared.lock().unwrap();for u in &users{let _=w.run(V,M,"admit_entry",&[*u,1]);}assert_eq!(w.val(V,"queue_count",0),4);let set=(0..4).map(|i|w.val(V,"queue_owner",i)).collect::<std::collections::BTreeSet<_>>();assert_eq!(set.len(),4);assert!(!set.contains(&0));w.checkpoint=cutoff+1;w.run(V,M,"seal_epoch",&[epoch])?;Ok(())
}
