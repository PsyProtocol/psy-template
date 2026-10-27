//! Actual market + U124 Token bytecode; native PSY fee accounting is an oracle.
//! VM lifecycle evidence does not replace a full authenticated-state UPS proof.
use anyhow::{bail,Result};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{eval::executor::{ExecutionContext,InMemoryStateBackend,StateBackend,VmExecutor},vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
use std::{collections::HashMap,fs};
const M:u64=1000;const A:u64=42;const B:u64=43;const VAULT:u64=100;const ALICE:u64=200;const BOB:u64=201;const ISSUER:u64=5;const TARGET:u64=400;
const RADIX:u128=1u128<<62;const MAX:u128=RADIX*RADIX-1;const F:u64=1_000_100_000;
fn limbs(n:u128)->[u64;2]{[(n%RADIX)as u64,(n/RADIX)as u64]}
fn args(prefix:&[u64],amounts:&[u128],suffix:&[u64])->Vec<u64>{let mut v=prefix.to_vec();for n in amounts{v.extend(limbs(*n));}v.extend(suffix);v}
#[derive(Clone)]
struct World{state:InMemoryStateBackend,methods:HashMap<(u64,String),DPNFunctionCircuitDefinition>,fields:HashMap<String,u64>,checkpoint:u64}
impl World{
 fn new(market:&str)->Result<Self>{let root=std::env::var("U124_BUILD").unwrap_or_else(|_|"/private/tmp/psy-markets-u124-20261012".into());let artifact:Value=serde_json::from_slice(&fs::read(format!("{root}/{market}/compilation_artifact.json"))?)?;let token:Value=serde_json::from_slice(&fs::read(std::env::var("TOKEN_WIDE_ARTIFACT")?)?)?;let mut methods=HashMap::new();for (cid,a)in[(M,&artifact),(A,&token),(B,&token)]{let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;for d in defs{methods.insert((cid,d.name.clone()),d);}}let fields=artifact["abi"]["contract"]["state"].as_array().unwrap().iter().map(|f|(f["name"].as_str().unwrap().into(),f["offset"].as_u64().unwrap())).collect();let mut w=Self{state:InMemoryStateBackend::new(),methods,fields,checkpoint:100};for u in[ALICE,BOB,ISSUER]{w.state.set_slot(u,0,0,100*F);}for c in[A,B]{w.run(ISSUER,c,"set_metadata",&[123,18])?;w.run(ISSUER,c,"mint",&limbs(MAX/4))?;for u in[ALICE,BOB]{w.run(ISSUER,c,"transfer",&args(&[u],&[MAX/16],&[]))?;w.run(u,c,"claim",&[ISSUER])?;}}Ok(w)}
 fn native(&mut self,u:u64,name:&str,inputs:&[u64])->Result<()>{let bal=self.state.get_contract_slot(u,0,0)?;match name{
  "transfer"=>{let to=inputs[0];let n=inputs[1];if bal<n{bail!("native balance");}let sent=self.state.get_contract_slot(u,0,3+2*to)?;self.state.set_slot(u,0,0,bal-n);self.state.set_slot(u,0,3+2*to,sent.checked_add(n).unwrap());},
  "claim"=>{let from=inputs[0];let sent=self.state.get_contract_slot(from,0,3+2*u)?;let claimed=self.state.get_contract_slot(u,0,4+2*from)?;if sent<=claimed{bail!("native empty claim");}self.state.set_slot(u,0,4+2*from,sent);self.state.set_slot(u,0,0,bal+sent-claimed);},
  "burn"=>{if bal<inputs[0]{bail!("native burn");}self.state.set_slot(u,0,0,bal-inputs[0]);},_=>bail!("unknown native method")};Ok(())}
 fn run(&mut self,u:u64,c:u64,name:&str,inputs:&[u64])->Result<()>{let name=if c==M&&name=="close_order"{let kind=self.val(u,"kind",0);let side=self.val(u,"side",0);if self.methods.contains_key(&(M,"open_swap".into())){match (kind,side){(1,0)=>"close_swap_0",(1,1)=>"close_swap_1",(2,_)=>"close_add",(3,_)=>"close_remove",_=>bail!("no order")}}else if self.methods.contains_key(&(M,"initialize".into())){if kind==1{"close_buy"}else{"close_sell"}}else{if side==0{"close_0"}else{"close_1"}}}else{name};if c==0{return self.native(u,name,inputs);}let mut vm=VmExecutor::new(self.state.clone());let r=vm.execute(&self.methods[&(c,name.into())],&ExecutionContext{user_id:u,contract_id:c,caller_contract_id:DEFAULT_CALLER_CONTRACT_ID_U64,checkpoint_id:self.checkpoint,nonce:1,user_public_key_hash:[0;4],session_proof_tree_root:[0;4],transaction_log:vec![],transaction_stack_hash:[0;4]},inputs)?;if !r.success{bail!("{}:{} {}",c,name,r.failure.unwrap().message);}self.state.apply_overlay(vm.write_overlay());self.state.apply_imt_overlay(vm.imt_write_overlay());Ok(())}
 fn atomic(&mut self,calls:Vec<(u64,&str,Vec<u64>)>)->Result<()>{let mut next=self.clone();for(c,n,args)in calls{next.run(VAULT,c,n,&args)?;}*self=next;Ok(())}
 fn fee(&mut self,u:u64)->Result<()>{self.run(u,0,"transfer",&[VAULT,F])}
 fn pay(&mut self,u:u64,c:u64,n:u128)->Result<()>{self.run(u,c,"transfer",&args(&[VAULT],&[n],&[]))}
 fn val(&self,u:u64,f:&str,index:u64)->u64{self.state.get_contract_slot(u,M,self.fields[f]+index).unwrap()}
 fn pair(&self,u:u64,f:&str,index:u64)->u128{u128::from(self.val(u,f,index))+u128::from(self.val(u,f,index+1))*RADIX}
 fn balance(&self,u:u64,c:u64)->u128{u128::from(self.state.get_contract_slot(u,c,0).unwrap())+u128::from(self.state.get_contract_slot(u,c,1).unwrap())*RADIX}
 fn settle(&mut self,name:&str,inputs:Vec<u64>,payer:u64,claims:&[u64],outputs:&[(u64,u64,u128)])->Result<()>{let mut calls=vec![(M,name,inputs),(0,"claim",vec![payer])];for c in claims{calls.push((*c,"claim",vec![payer]));}for(c,to,n)in outputs{calls.push((*c,"transfer",args(&[*to],&[*n],&[])));}calls.push((0,"burn",vec![F]));self.atomic(calls)}
}
#[test]
fn amm_18_decimal_lp_swap_remove_and_original_payer_refund()->Result<()>{let mut w=World::new("amm")?;let n=10u128.pow(28);let minted=n-1000;
 w.run(ALICE,M,"open_add",&args(&[VAULT],&[n,n,minted],&[200,1]))?;w.fee(ALICE)?;w.pay(ALICE,A,n)?;w.pay(ALICE,B,n)?;
 assert!(w.settle("add_liquidity",args(&[ALICE],&[n,n,minted+1],&[1]),ALICE,&[A,B],&[]).is_err());
 w.settle("add_liquidity",args(&[ALICE],&[n,n,minted],&[1]),ALICE,&[A,B],&[])?;assert_eq!(w.pair(VAULT,"total_shares",0),n);assert_eq!(w.balance(VAULT,A),n);
 w.run(ALICE,M,"close_order",&[])?;let input=10u128.pow(26);let output=98_715_803_439_706_129_885_046_090u128;
 w.run(BOB,M,"open_swap",&args(&[VAULT,0],&[input,output],&[200,1]))?;w.fee(BOB)?;w.pay(BOB,A,input)?;
 assert!(w.settle("swap_0",args(&[BOB],&[input,output+1],&[1]),BOB,&[A],&[(B,BOB,output+1)]).is_err());
 w.settle("swap_0",args(&[BOB],&[input,output],&[1]),BOB,&[A],&[(B,BOB,output)])?;w.run(BOB,M,"close_order",&[])?;
 let ra=n+input;let rb=n-output;assert_eq!(w.pair(VAULT,"reserve_a",0),ra);assert_eq!(w.balance(VAULT,B),rb);
 w.run(ALICE,M,"open_add",&args(&[VAULT],&[ra,rb,n],&[200,2]))?;w.fee(ALICE)?;w.pay(ALICE,A,ra)?;w.pay(ALICE,B,rb)?;
 w.settle("add_liquidity",args(&[ALICE],&[ra,rb,n],&[2]),ALICE,&[A,B],&[])?;w.run(ALICE,M,"close_order",&[])?;
 let burn=n/2;let out_a=ra/2;let out_b=rb/2;w.run(ALICE,M,"open_remove",&args(&[VAULT],&[burn,out_a,out_b],&[200,3]))?;w.fee(ALICE)?;
 w.settle("remove_liquidity",args(&[ALICE],&[burn,out_a,out_b],&[3]),ALICE,&[],&[(A,ALICE,out_a),(B,ALICE,out_b)])?;
 assert_eq!(w.pair(VAULT,"total_shares",0),2*n-burn);assert_eq!(w.balance(VAULT,A),2*ra-out_a);assert_eq!(w.balance(VAULT,B),2*rb-out_b);w.run(ALICE,M,"close_order",&[])?;
 w.run(BOB,M,"open_swap",&args(&[VAULT,1],&[input,1],&[200,2]))?;w.fee(BOB)?;w.pay(BOB,B,input)?;w.checkpoint=201;
 assert!(w.run(VAULT,M,"swap_1",&args(&[BOB],&[input,1],&[2])).is_err());w.settle("refund_swap_1",args(&[BOB],&[input],&[2]),BOB,&[B],&[(B,BOB,input)])?;
 assert!(w.run(VAULT,M,"refund_swap_1",&args(&[BOB],&[input],&[2])).is_err());Ok(())}

#[test]
fn book_high_limb_match_expiry_replay_and_cancellation_race()->Result<()>{let mut w=World::new("orderbook")?;let a=10u128.pow(28)+RADIX+7;let b=2*a;
 w.run(ALICE,M,"open_sell",&args(&[VAULT,0],&[a,b],&[100,1]))?;w.run(BOB,M,"open_sell",&args(&[VAULT,1],&[b,a],&[100,1]))?;w.fee(ALICE)?;w.fee(BOB)?;w.pay(ALICE,A,a)?;w.pay(BOB,B,b)?;
 assert!(w.run(VAULT,M,"match_orders",&args(&[ALICE,BOB],&[a,b-1],&[1,1])).is_err());
 let fill=args(&[ALICE,BOB],&[a,b],&[1,1]);let calls=vec![(M,"match_orders",fill.clone()),(0,"claim",vec![ALICE]),(0,"claim",vec![BOB]),(A,"claim",vec![ALICE]),(B,"claim",vec![BOB]),(A,"transfer",args(&[BOB],&[a],&[])),(B,"transfer",args(&[ALICE],&[b],&[])),(0,"transfer",vec![BOB,F]),(0,"burn",vec![F])];w.atomic(calls)?;assert!(w.run(VAULT,M,"match_orders",&fill).is_err());w.run(ALICE,M,"close_order",&[])?;w.run(BOB,M,"close_order",&[])?;
 w.run(ALICE,M,"open_sell",&args(&[VAULT,0],&[a,b],&[100,2]))?;w.fee(ALICE)?;w.pay(ALICE,A,a)?;w.checkpoint=101;
 assert!(w.settle("cancel_0",args(&[BOB],&[a],&[2]),BOB,&[A],&[(A,BOB,a)]).is_err());w.settle("cancel_0",args(&[ALICE],&[a],&[2]),ALICE,&[A],&[(A,ALICE,a)])?;assert_eq!(w.val(VAULT,"consumed",ALICE),2);assert!(w.run(VAULT,M,"cancel_0",&args(&[ALICE],&[a],&[2])).is_err());Ok(())}
#[test]
fn curve_18_decimal_buy_sell_stale_refund_and_graduation()->Result<()>{let mut w=World::new("bondingcurve")?;let unit=10u128.pow(18);let inventory=2_000_000*unit;w.fee(ISSUER)?;w.pay(ISSUER,A,inventory)?;w.settle("initialize",vec![],ISSUER,&[A],&[])?;
 let lots=1_000_000u64;let cost=u128::from(lots)*unit+100_000_000_000_000u128*u128::from(lots)*u128::from(lots-1)/2;let tokens=u128::from(lots)*unit;
 for u in[ALICE,BOB]{w.run(u,M,"open_buy",&args(&[VAULT,lots,0],&[cost],&[200,1]))?;w.fee(u)?;w.pay(u,B,cost)?;}
 assert!(w.settle("settle_buy",args(&[ALICE,lots],&[cost+1,tokens],&[1]),ALICE,&[B],&[(A,ALICE,tokens)]).is_err());
 w.settle("settle_buy",args(&[ALICE,lots],&[cost,tokens],&[1]),ALICE,&[B],&[(A,ALICE,tokens)])?;assert_eq!(w.pair(VAULT,"quote_reserve",0),cost);
 assert!(w.run(VAULT,M,"settle_buy",&args(&[BOB,lots],&[cost,tokens],&[1])).is_err());
 w.fee(ISSUER)?;assert!(w.run(VAULT,M,"graduate",&args(&[TARGET+1],&[cost,inventory-tokens],&[])).is_err());w.settle("graduate",args(&[TARGET],&[cost,inventory-tokens],&[]),ISSUER,&[],&[(B,TARGET,cost),(A,TARGET,inventory-tokens)])?;assert_eq!(w.val(VAULT,"phase",0),2);assert_eq!(w.balance(VAULT,A),0);assert_eq!(w.balance(VAULT,B),0);
 w.settle("refund_buy",args(&[BOB,lots],&[cost],&[1]),BOB,&[B],&[(B,BOB,cost)])?;assert!(w.run(VAULT,M,"refund_buy",&args(&[BOB,lots],&[cost],&[1])).is_err());Ok(())}
#[test]
fn noncanonical_amounts_wrong_high_limb_and_overflow_never_mutate()->Result<()>{for market in["amm","orderbook"]{let mut w=World::new(market)?;let method=if market=="amm"{"open_swap"}else{"open_sell"};assert!(w.run(ALICE,M,method,&[VAULT,0,RADIX as u64,0,1,0,200,1]).is_err());assert_eq!(w.val(ALICE,"kind",0),0);let n=RADIX+1;w.run(ALICE,M,method,&args(&[VAULT,0],&[n,1],&[200,1]))?;w.fee(ALICE)?;w.pay(ALICE,A,n)?;let cancel=if market=="amm"{"refund_swap_0"}else{"cancel_0"};assert!(w.settle(cancel,args(&[ALICE],&[1],&[1]),ALICE,&[A],&[(A,ALICE,1)]).is_err());assert_eq!(w.val(VAULT,"consumed",ALICE),0);assert_eq!(w.balance(VAULT,A),0);w.settle(cancel,args(&[ALICE],&[n],&[1]),ALICE,&[A],&[(A,ALICE,n)])?;}Ok(())}
#[test]
fn curve_sell_roundtrip_restores_backing_and_rejects_replay()->Result<()>{let mut w=World::new("bondingcurve")?;let unit=10u128.pow(18);let inventory=2_000_000*unit;w.fee(ISSUER)?;w.pay(ISSUER,A,inventory)?;w.settle("initialize",vec![],ISSUER,&[A],&[])?;let lots=999_999u64;let tokens=u128::from(lots)*unit;let cost=u128::from(lots)*unit+100_000_000_000_000u128*u128::from(lots)*u128::from(lots-1)/2;
 w.run(ALICE,M,"open_buy",&args(&[VAULT,lots,0],&[cost],&[200,1]))?;w.fee(ALICE)?;w.pay(ALICE,B,cost)?;w.settle("settle_buy",args(&[ALICE,lots],&[cost,tokens],&[1]),ALICE,&[B],&[(A,ALICE,tokens)])?;w.run(ALICE,M,"close_order",&[])?;
 w.run(ALICE,M,"open_sell",&args(&[VAULT,lots,lots],&[cost],&[200,2]))?;w.fee(ALICE)?;w.pay(ALICE,A,tokens)?;assert!(w.run(VAULT,M,"settle_sell",&args(&[ALICE,lots],&[cost-1,tokens],&[2])).is_err());w.settle("settle_sell",args(&[ALICE,lots],&[cost,tokens],&[2]),ALICE,&[A],&[(B,ALICE,cost)])?;assert_eq!(w.val(VAULT,"sold_lots",0),0);assert_eq!(w.pair(VAULT,"quote_reserve",0),0);assert_eq!(w.balance(VAULT,A),inventory);assert_eq!(w.balance(VAULT,B),0);assert!(w.run(VAULT,M,"settle_sell",&args(&[ALICE,lots],&[cost,tokens],&[2])).is_err());w.run(ALICE,M,"close_order",&[])?;Ok(())}
#[test]
fn amm_reverse_swap_and_two_asset_refund_preserve_reserves()->Result<()>{let mut w=World::new("amm")?;let n=10u128.pow(28);w.run(ALICE,M,"open_add",&args(&[VAULT],&[n,n,n-1000],&[200,1]))?;w.fee(ALICE)?;w.pay(ALICE,A,n)?;w.pay(ALICE,B,n)?;w.settle("add_liquidity",args(&[ALICE],&[n,n,n-1000],&[1]),ALICE,&[A,B],&[])?;w.run(ALICE,M,"close_order",&[])?;let input=10u128.pow(26);let output=98_715_803_439_706_129_885_046_090u128;
 w.run(BOB,M,"open_swap",&args(&[VAULT,1],&[input,output],&[200,1]))?;w.fee(BOB)?;w.pay(BOB,B,input)?;w.settle("swap_1",args(&[BOB],&[input,output],&[1]),BOB,&[B],&[(A,BOB,output)])?;assert_eq!(w.pair(VAULT,"reserve_a",0),n-output);assert_eq!(w.pair(VAULT,"reserve_b",0),n+input);w.run(BOB,M,"close_order",&[])?;
 w.run(BOB,M,"open_add",&args(&[VAULT],&[input,input,1],&[200,2]))?;w.fee(BOB)?;w.pay(BOB,A,input)?;w.pay(BOB,B,input)?;w.checkpoint=201;w.settle("refund_add",args(&[BOB],&[input,input],&[2]),BOB,&[A,B],&[(A,BOB,input),(B,BOB,input)])?;assert_eq!(w.balance(VAULT,A),n-output);assert_eq!(w.balance(VAULT,B),n+input);assert_eq!(w.pair(VAULT,"total_shares",0),n);w.run(BOB,M,"close_order",&[])?;Ok(())}

#[test]
fn parallel_candidates_commit_once_and_original_payer_recovers_every_market()->Result<()> {
 use std::sync::{Arc,Mutex,Barrier};
 // Model the chain's start-anchor compare-and-commit. Every candidate executes
 // real bytecode; the mutex/version is a local model, not coordinator evidence.
 for market in ["amm","orderbook","bondingcurve"] {
  for _round in 0..4 {
   let mut w=World::new(market)?;let n=10u128.pow(18);
   if market=="bondingcurve" {let inventory=2_000_000*n;w.fee(ISSUER)?;w.pay(ISSUER,A,inventory)?;w.settle("initialize",vec![],ISSUER,&[A],&[])?;}
   let (asset,method)=if market=="bondingcurve"{(B,"refund_buy")}else if market=="amm"{(A,"refund_swap_0")}else{(A,"cancel_0")};
   let before=w.balance(BOB,asset);
   if market=="bondingcurve"{w.run(BOB,M,"open_buy",&args(&[VAULT,1,0],&[n],&[200,1]))?;}
   else{w.run(BOB,M,if market=="amm"{"open_swap"}else{"open_sell"},&args(&[VAULT,0],&[n,n],&[200,1]))?;}
   w.fee(BOB)?;w.pay(BOB,asset,n)?;w.checkpoint=201;
   let shared=Arc::new(Mutex::new((0u64,w)));let barrier=Arc::new(Barrier::new(8));
   let mut handles=Vec::new();
   for _ in 0..8 {let shared=shared.clone();let barrier=barrier.clone();handles.push(std::thread::spawn(move||->Result<bool>{
    let (anchor,mut candidate)=shared.lock().unwrap().clone();
    let inputs=if market=="bondingcurve"{args(&[BOB,1],&[n],&[1])}else{args(&[BOB],&[n],&[1])};
    let result=candidate.settle(method,inputs,BOB,&[asset],&[(asset,BOB,n)]);
    barrier.wait();result?;let mut current=shared.lock().unwrap();if current.0!=anchor{return Ok(false);}*current=(anchor+1,candidate);Ok(true)
   }));}
   let mut winners=0;for h in handles{winners+=usize::from(h.join().unwrap()?);}assert_eq!(winners,1);
   let mut guard=shared.lock().unwrap();let w=&mut guard.1;
   assert_eq!(w.val(VAULT,"consumed",BOB),1);assert_eq!(w.balance(VAULT,asset),0);
   let inputs=if market=="bondingcurve"{args(&[BOB,1],&[n],&[1])}else{args(&[BOB],&[n],&[1])};
   assert!(w.settle(method,inputs,BOB,&[asset],&[(asset,BOB,n)]).is_err());
   w.run(BOB,asset,"claim",&[VAULT])?;assert_eq!(w.balance(BOB,asset),before);
  }
 }
 Ok(())
}

#[test]
fn curve_bootstrap_advances_donor_cursor_and_allows_post_graduation_refund()->Result<()> {
 let root=std::env::var("U124_BOOTSTRAP_FIXTURES")?;
 let config:Value=serde_json::from_slice(&fs::read(format!("{root}/market-bootstrap-config.json"))?)?;
 let artifact:Value=serde_json::from_slice(&fs::read(format!("{root}/bondingcurve-v2/compiled/compilation_artifact.json"))?)?;
 let issuer=config["issuer"].as_u64().unwrap();let donor=config["bootstrap"]["funderId"].as_u64().unwrap();
 let target=config["target"].as_u64().unwrap();let asset=config["assetB"].as_u64().unwrap();
 let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(artifact["circuit_definitions"].clone())?;
 let methods=defs.into_iter().map(|d|((M,d.name.clone()),d)).collect();
 let fields=artifact["abi"]["contract"]["state"].as_array().unwrap().iter().map(|f|(f["name"].as_str().unwrap().into(),f["offset"].as_u64().unwrap())).collect();
 let mut w=World{state:InMemoryStateBackend::new(),methods,fields,checkpoint:100};
 let unit=10u128.pow(18);let quote=21*unit/10;
 w.state.set_slot(VAULT,M,w.fields["phase"],1);w.state.set_slot(VAULT,M,w.fields["sold_lots"],2);
 for (i,limb) in limbs(quote).iter().enumerate(){w.state.set_slot(VAULT,M,w.fields["quote_reserve"]+i as u64,*limb);w.state.set_slot(VAULT,M,w.fields["settled_b"]+2*donor+i as u64,*limb);}
 for user in [issuer,donor]{w.state.set_slot(user,0,3+2*VAULT,2*F);w.state.set_slot(VAULT,M,w.fields["settled_fee"]+user,F);}
 w.state.set_slot(VAULT,M,w.fields["consumed"]+donor,1);w.state.set_slot(donor,M,w.fields["nonce"],1);
 let input=args(&[target],&[quote,unit],&[]);
 let mut underfunded=w.clone();underfunded.state.set_slot(donor,0,3+2*VAULT,F);
 assert!(underfunded.run(VAULT,M,"graduate",&input).is_err());assert_eq!(underfunded.val(VAULT,"phase",0),1);
 assert_eq!(underfunded.val(VAULT,"settled_fee",issuer),F,"failed guard must not commit issuer cursor");
 w.run(VAULT,M,"graduate",&input)?;
 assert_eq!(w.val(VAULT,"phase",0),2);assert_eq!(w.val(VAULT,"settled_fee",issuer),2*F);assert_eq!(w.val(VAULT,"settled_fee",donor),2*F);
 // The donor was also a buyer before graduation. Its next fee and payment
 // must fund a new refund rather than reusing the already claimed donation.
 w.run(donor,M,"open_buy",&args(&[VAULT,1,2],&[unit],&[200,2]))?;
 w.state.set_slot(donor,0,3+2*VAULT,3*F);
 for (i,limb) in limbs(quote+unit).iter().enumerate(){w.state.set_slot(donor,asset,33554453+4*VAULT+i as u64,*limb);}
 w.run(VAULT,M,"refund_buy",&args(&[donor,1],&[unit],&[2]))?;
 assert_eq!(w.val(VAULT,"settled_fee",donor),3*F);assert_eq!(w.val(VAULT,"consumed",donor),2);
 assert_eq!(w.pair(VAULT,"settled_b",2*donor),quote+unit);
 Ok(())
}

#[test]
fn historical_open_orders_cannot_repeat_a_committed_refund_in_any_market()->Result<()> {
 // Remote payer slots are restored to an old OPEN snapshot, while the vault's
 // current consumed nonce and cumulative accounting remain authoritative.
 for market in ["amm","orderbook","bondingcurve"] {
  let mut w=World::new(market)?;let n=10u128.pow(18);
  if market=="bondingcurve"{w.fee(ISSUER)?;w.pay(ISSUER,A,2_000_000*n)?;w.settle("initialize",vec![],ISSUER,&[A],&[])?;}
  let (asset,method)=if market=="bondingcurve"{(B,"refund_buy")}else if market=="amm"{(A,"refund_swap_0")}else{(A,"cancel_0")};
  let before=w.balance(BOB,asset);
  if market=="bondingcurve"{w.run(BOB,M,"open_buy",&args(&[VAULT,1,0],&[n],&[200,1]))?;}
  else{w.run(BOB,M,if market=="amm"{"open_swap"}else{"open_sell"},&args(&[VAULT,0],&[n,n],&[200,1]))?;}
  w.fee(BOB)?;w.pay(BOB,asset,n)?;
  let snapshot=w.clone();w.checkpoint=201;
  let inputs=if market=="bondingcurve"{args(&[BOB,1],&[n],&[1])}else{args(&[BOB],&[n],&[1])};
  w.settle(method,inputs.clone(),BOB,&[asset],&[(asset,BOB,n)])?;
  w.run(BOB,asset,"claim",&[VAULT])?;w.run(BOB,M,"close_order",&[])?;
  for name in ["kind","pool","side","nonce","deadline","lots","expected_sold"]{
   if let Some(offset)=w.fields.get(name){w.state.set_slot(BOB,M,*offset,snapshot.state.get_contract_slot(BOB,M,*offset)?);}
  }
  for name in ["x","y","z"]{let offset=w.fields[name];for i in 0..2{w.state.set_slot(BOB,M,offset+i,snapshot.state.get_contract_slot(BOB,M,offset+i)?);}}
  assert!(w.settle(method,inputs,BOB,&[asset],&[(asset,BOB,n)]).is_err());
  assert_eq!(w.val(VAULT,"consumed",BOB),1);assert_eq!(w.balance(BOB,asset),before);assert_eq!(w.balance(VAULT,asset),0);
 }
 Ok(())
}
