//! Actual NFT v3 + U124 FT + marketplace bytecode. Native fee is a local oracle.
//! These VM atomicity tests are not coordinator or authenticated UPS evidence.
use anyhow::{bail,ensure,Result};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{eval::executor::{ExecutionContext,InMemoryStateBackend,StateBackend,VmExecutor},vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;use std::{collections::HashMap,fs};
const M:u64=1000;const NFT:u64=41;const FT:u64=42;const V:u64=100;const A:u64=200;const B:u64=201;const C:u64=202;const I:u64=5;const F:u64=1_000_100_000;const RADIX:u128=1u128<<62;const PRICE:u128=10u128.pow(28)+17;
fn limbs(n:u128)->Vec<u64>{vec![(n%RADIX)as u64,(n/RADIX)as u64]}
fn purchase(s:u64,p:u128,listing:u64,nonce:u64,deadline:u64)->Vec<u64>{let mut v=vec![V,s,listing];v.extend(limbs(p));v.extend([deadline,nonce]);v}
#[derive(Clone)]struct World{state:InMemoryStateBackend,methods:HashMap<(u64,String),DPNFunctionCircuitDefinition>,fields:HashMap<String,u64>,policy:Value,checkpoint:u64,vault_revision:u64,written:HashMap<(u64,u64,u64),u64>}
impl World{
 fn new()->Result<Self>{let root=std::env::var("NFT_MARKET_BUILD")?;let market:Value=serde_json::from_slice(&fs::read(format!("{root}/market/compiled/compilation_artifact.json"))?)?;let nft:Value=serde_json::from_slice(&fs::read(format!("{root}/nft/compilation_artifact.json"))?)?;let token:Value=serde_json::from_slice(&fs::read(std::env::var("TOKEN_WIDE_ARTIFACT")?)?)?;let policy=serde_json::from_slice(&fs::read(format!("{root}/market/policy.json"))?)?;let mut methods=HashMap::new();for(cid,a)in[(M,&market),(NFT,&nft),(FT,&token)]{let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;for d in defs{methods.insert((cid,d.name.clone()),d);}}let fields=market["abi"]["contract"]["state"].as_array().unwrap().iter().map(|f|(f["name"].as_str().unwrap().into(),f["offset"].as_u64().unwrap())).collect();let mut w=Self{state:InMemoryStateBackend::new(),methods,fields,policy,checkpoint:100,vault_revision:0,written:HashMap::new()};for u in[A,B,C,I]{w.state.set_slot(u,0,0,100*F);}w.run(I,NFT,"set_collection_metadata",&[123,0,0,0,0])?;w.run(I,FT,"set_metadata",&[123,18])?;w.run(I,FT,"mint",&limbs(PRICE*100))?;for u in[B,C]{let mut x=vec![u];x.extend(limbs(PRICE*20));w.run(I,FT,"transfer",&x)?;w.run(u,FT,"claim",&[I])?;}w.give_nft(A,0,1)?;w.run(I,NFT,"mint",&[1,2,0,0,0,0])?;w.fee(I)?;w.pay(I,1)?;w.settle("activate",I,0,0,0,0)?;w.run(I,FT,"claim",&[V])?;Ok(w)}
 fn give_nft(&mut self,u:u64,slot:u64,index:u64)->Result<()>{self.run(I,NFT,"mint",&[0,index,u64::MAX-4294967295,99,index,77])?;self.run(I,NFT,"acknowledge",&[u])?;self.run(I,NFT,"transfer",&[0,u])?;self.run(u,NFT,"claim",&[slot,I])}
 fn run(&mut self,u:u64,c:u64,name:&str,input:&[u64])->Result<()>{if c==0{return self.native(u,name,input);}let mut vm=VmExecutor::new(self.state.clone());let r=vm.execute(&self.methods[&(c,name.into())],&ExecutionContext{user_id:u,contract_id:c,caller_contract_id:DEFAULT_CALLER_CONTRACT_ID_U64,checkpoint_id:self.checkpoint,nonce:1,user_public_key_hash:[0;4]},input)?;if !r.success{bail!("{name}: {}",r.failure.unwrap().message);}self.state.apply_overlay(vm.write_overlay());self.written.extend(vm.write_overlay().iter().map(|(k,v)|(*k,*v)));self.state.apply_imt_overlay(vm.imt_write_overlay());Ok(())}
 fn native(&mut self,u:u64,name:&str,input:&[u64])->Result<()>{let bal=self.state.get_contract_slot(u,0,0)?;match name{
  "simple_transfer"=>{ensure!(bal>=input[1],"native balance");let old=self.state.get_contract_slot(u,0,3+2*input[0])?;self.set_slot(u,0,0,bal-input[1]);self.set_slot(u,0,3+2*input[0],old+input[1]);},
  "simple_claim"=>{let sent=self.state.get_contract_slot(input[0],0,3+2*u)?;let old=self.state.get_contract_slot(u,0,4+2*input[0])?;ensure!(sent>old,"native empty");self.set_slot(u,0,4+2*input[0],sent);self.set_slot(u,0,0,bal+sent-old);},
  "simple_burn"=>{ensure!(bal>=input[0],"native burn");self.set_slot(u,0,0,bal-input[0]);},_=>bail!("native method")};Ok(())}
 fn set_slot(&mut self,u:u64,c:u64,o:u64,v:u64){self.state.set_slot(u,c,o,v);self.written.insert((u,c,o),v);}
 fn fee(&mut self,u:u64)->Result<()>{self.run(u,0,"simple_transfer",&[V,F])}
 fn pay(&mut self,u:u64,n:u128)->Result<()>{let mut a=vec![V];a.extend(limbs(n));self.run(u,FT,"transfer",&a)}
 fn listing(&mut self,slot:u64,nonce:u64,fund:bool)->Result<()>{self.run(A,NFT,"acknowledge",&[V])?;let mut a=vec![V,slot];a.extend(limbs(PRICE));a.extend([200,nonce]);self.run(A,M,"open_listing",&a)?;if fund{self.fee(A)?;self.run(A,NFT,"transfer",&[slot,V])?;}Ok(())}
 fn buy(&mut self,u:u64,paid:u128)->Result<()>{self.run(u,M,"open_buy",&purchase(A,PRICE,1,1,200))?;self.fee(u)?;if paid>0{self.pay(u,paid)?;}Ok(())}
 fn settle(&mut self,name:&str,s:u64,b:u64,amount:u128,listing:u64,buy:u64)->Result<()>{let branch=self.policy["branches"].as_array().unwrap().iter().find(|x|x["name"]==name).unwrap();let l=limbs(amount);let f=[branch["branch"].as_u64().unwrap(),s,b,l[0],l[1],0,0,0,0,0,listing,buy,F];let mut next=self.clone();next.written.clear();for call in branch["calls"].as_array().unwrap(){let inputs:Vec<u64>=call["inputs"].as_array().unwrap().iter().map(|v|if let Some(i)=v["witness"].as_u64(){f[i as usize]}else{v["constant"].as_str().unwrap().parse().unwrap()}).collect();next.run(V,call["contract_id"].as_u64().unwrap(),call["method_name"].as_str().unwrap(),&inputs)?;}next.vault_revision+=1;*self=next;Ok(())}
 fn commit_candidate(&mut self,anchor:u64,candidate:&Self)->bool{if self.vault_revision!=anchor{return false;}assert!(candidate.written.keys().all(|(u,_,_)|*u==V));self.state.apply_overlay(&candidate.written);self.vault_revision=candidate.vault_revision;true}
 fn val(&self,u:u64,f:&str,i:u64)->u64{self.state.get_contract_slot(u,M,self.fields[f]+i).unwrap()}
 fn token_balance(&self,u:u64)->u128{self.state.get_contract_slot(u,FT,0).unwrap()as u128+RADIX*self.state.get_contract_slot(u,FT,1).unwrap()as u128}
 fn nft_id(&self,u:u64,slot:u64)->Vec<u64>{(0..4).map(|i|self.state.get_contract_slot(u,NFT,30+9*slot+i).unwrap()).collect()}
}
#[test]fn sale_exact_nft_high_limb_payment_and_replay()->Result<()>{let mut w=World::new()?;let id=w.nft_id(A,0);let buyer=w.token_balance(B);w.listing(0,1,true)?;w.buy(B,PRICE)?;
 assert!(w.settle("settle_sale",A,B,PRICE+1,1,1).is_err());assert_eq!(w.val(V,"consumed",A),0);
 w.settle("settle_sale",A,B,PRICE,1,1)?;assert!(w.settle("settle_sale",A,B,PRICE,1,1).is_err());assert_eq!(w.state.get_contract_slot(V,NFT,0)?,0);assert_eq!(w.token_balance(V),0);
 w.run(B,NFT,"claim",&[0,V])?;assert_eq!(w.nft_id(B,0),id);w.run(A,FT,"claim",&[V])?;assert_eq!(w.token_balance(A),PRICE);assert_eq!(w.token_balance(B),buyer-PRICE);w.run(A,M,"close_listing",&[])?;w.run(B,M,"close_buy",&[])?;Ok(())}
#[test]fn live_refund_requires_signed_cancel_and_always_returns_to_owner()->Result<()>{let mut w=World::new()?;let id=w.nft_id(A,0);w.listing(0,1,true)?;w.buy(B,PRICE)?;
 assert!(w.settle("refund_listing",A,0,0,1,0).is_err());assert!(w.settle("refund_buy",B,B,PRICE,0,1).is_err());w.run(A,M,"request_cancel",&[])?;assert!(w.settle("settle_sale",A,B,PRICE,1,1).is_err());w.settle("refund_listing",A,0,0,1,0)?;w.run(A,NFT,"claim",&[0,V])?;assert_eq!(w.nft_id(A,0),id);w.settle("refund_buy",B,B,PRICE,0,1)?;w.run(B,FT,"claim",&[V])?;assert_eq!(w.token_balance(B),PRICE*20);Ok(())}
#[test]fn competing_buyers_only_one_fills_second_gets_full_refund()->Result<()>{let mut w=World::new()?;w.listing(0,1,true)?;w.buy(B,PRICE)?;w.buy(C,PRICE)?;w.settle("settle_sale",A,B,PRICE,1,1)?;assert!(w.settle("settle_sale",A,C,PRICE,1,1).is_err());w.settle("refund_buy",C,C,PRICE,0,1)?;w.run(C,FT,"claim",&[V])?;assert_eq!(w.token_balance(C),20*PRICE);assert_eq!(w.val(V,"consumed",C),1);Ok(())}
#[test]fn partial_and_excess_payment_are_recoverable_with_actual_delta()->Result<()>{for n in [PRICE-1,PRICE+1]{let mut w=World::new()?;w.listing(0,1,true)?;w.buy(B,n)?;assert!(w.settle("settle_sale",A,B,PRICE,1,1).is_err());w.run(B,M,"request_cancel",&[])?;assert!(w.settle("refund_buy",B,B,PRICE,0,1).is_err());w.settle("refund_buy",B,B,n,0,1)?;w.run(B,FT,"claim",&[V])?;assert_eq!(w.token_balance(B),20*PRICE);assert_eq!(w.val(V,"consumed",A),0);}Ok(())}
#[test]fn fee_only_orders_and_unfunded_abandonment()->Result<()>{let mut w=World::new()?;w.listing(0,1,false)?;w.fee(A)?;w.buy(B,0)?;assert!(w.run(A,M,"abandon_unfunded",&[]).is_err());w.run(A,M,"request_cancel",&[])?;w.settle("refund_listing_fee",A,0,0,1,0)?;w.settle("refund_buy_fee",B,B,0,0,1)?;w.run(A,M,"close_listing",&[])?;w.run(B,M,"close_buy",&[])?;w.listing(0,2,false)?;w.run(A,M,"abandon_unfunded",&[])?;assert_eq!(w.val(A,"kind",0),0);Ok(())}
#[test]fn nft_identity_metadata_sequence_and_scratch_slot_are_bound()->Result<()>{for mutation in 0..4{let mut w=World::new()?;w.listing(0,1,true)?;w.buy(B,PRICE)?;match mutation{0=>w.state.set_slot(A,NFT,1182+35*V,99),1=>w.state.set_slot(A,NFT,1182+35*V+4,99),2=>w.state.set_slot(A,NFT,1182+35*V+32,2),_=>w.state.set_slot(V,NFT,34,1)}assert!(w.settle("settle_sale",A,B,PRICE,1,1).is_err());assert_eq!(w.val(V,"consumed",A),0);assert_eq!(w.token_balance(V),0);}Ok(())}
#[test]fn expiry_boundary_and_unsigned_refund()->Result<()>{let mut w=World::new()?;w.listing(0,1,true)?;w.buy(B,PRICE)?;w.checkpoint=200;assert!(w.settle("refund_listing",A,0,0,1,0).is_err());w.checkpoint=201;assert!(w.settle("settle_sale",A,B,PRICE,1,1).is_err());w.settle("refund_listing",A,0,0,1,0)?;w.settle("refund_buy",B,B,PRICE,0,1)?;Ok(())}
#[test]fn full_delivery_queue_rolls_back_and_recipient_ack_reopens_it()->Result<()>{let mut w=World::new()?;w.listing(0,1,true)?;w.buy(B,PRICE)?;let base=1182+35*B;w.state.set_slot(V,NFT,base+32,4);assert!(w.settle("settle_sale",A,B,PRICE,1,1).is_err());assert_eq!(w.val(V,"consumed",A),0);assert_eq!(w.val(V,"settled_fee",A),0);assert_eq!(w.token_balance(V),0);
 // Recipient has claimed one earlier delivery. ACK is performed before send in the same stack.
 w.state.set_slot(B,NFT,1182+35*V+33,1);w.settle("settle_sale",A,B,PRICE,1,1)?;assert_eq!(w.state.get_contract_slot(V,NFT,base+34)?,1);assert_eq!(w.state.get_contract_slot(V,NFT,base+32)?,5);Ok(())}
#[test]fn standalone_ack_requires_fresh_fee_and_cannot_consume_live_order_fee()->Result<()>{let mut w=World::new()?;w.listing(0,1,true)?;w.buy(B,PRICE)?;assert!(w.settle("ack_delivery",B,0,0,0,0).is_err());w.settle("settle_sale",A,B,PRICE,1,1)?;w.run(B,NFT,"claim",&[0,V])?;w.run(B,M,"close_buy",&[])?;assert!(w.settle("ack_delivery",B,0,0,0,0).is_err());w.fee(B)?;w.settle("ack_delivery",B,0,0,0,0)?;assert_eq!(w.state.get_contract_slot(V,NFT,1182+35*B+34)?,1);Ok(())}
#[test]fn all_market_circuits_build_at_production_state_height()->Result<()>{use psy_dpn_circuit::circuits::cfc::DapenContractFunctionCircuit;use plonky2::plonk::config::PoseidonGoldilocksConfig;let w=World::new()?;let mut defs:Vec<_>=w.methods.iter().filter(|((cid,_),_)|*cid==M).map(|(_,d)|d).collect();defs.sort_by_key(|d|&d.name);for d in defs{let c=DapenContractFunctionCircuit::<PoseidonGoldilocksConfig,2>::new(d,31,16,false);println!("NFT marketplace {} CFC built, degree {}",d.name,c.circuit_data.common.degree_bits());}Ok(())}

#[test]fn terminal_receipts_preserve_nft_identity_amount_and_delivery_cursors()->Result<()>{let mut w=World::new()?;let id=w.nft_id(A,0);w.listing(0,1,true)?;w.buy(B,PRICE)?;w.settle("settle_sale",A,B,PRICE,1,1)?;
 let a=17*A;let b=17*B;assert_eq!(w.val(V,"results",a),1);assert_eq!(w.val(V,"results",a+1),1);assert_eq!(w.val(V,"results",a+2),B);assert_eq!(w.val(V,"results",b+1),2);assert_eq!(w.val(V,"results",b+2),A);assert_eq!(w.val(V,"results",b+7),1);assert_eq!(w.val(V,"results",a+16),F);
 assert_eq!(w.val(V,"results",a+3)as u128+RADIX*w.val(V,"results",a+4)as u128,PRICE);assert_eq!(w.val(V,"results",a+5)as u128+RADIX*w.val(V,"results",a+6)as u128,PRICE);for i in 0..4{assert_eq!(w.val(V,"results",a+8+i),id[i as usize]);assert_eq!(w.val(V,"results",b+8+i),id[i as usize]);}Ok(())}
#[test]fn historical_sale_can_win_before_cancel_settlement_but_refund_commit_invalidates_it()->Result<()>{
 // Actual bytecode plus a local caller-revision compare-and-commit model.
 // This is not evidence of node-side admission/rejection.
 for refund_wins in [false,true]{let mut w=World::new()?;w.listing(0,1,true)?;w.buy(B,PRICE)?;let anchor=w.vault_revision;let mut old_sale=w.clone();old_sale.settle("settle_sale",A,B,PRICE,1,1)?;
 w.run(A,M,"request_cancel",&[])?;assert_eq!(w.vault_revision,anchor);
 if refund_wins{w.settle("refund_listing",A,0,0,1,0)?;assert!(!w.commit_candidate(anchor,&old_sale));assert_eq!(w.val(V,"results",17*A+1),3);w.settle("refund_buy",B,B,PRICE,0,1)?;assert_eq!(w.val(V,"results",17*B+1),4);}else{assert!(w.commit_candidate(anchor,&old_sale));assert_eq!(w.val(A,"cancelled",0),1,"caller-only commit preserves seller's cancel request");assert_eq!(w.val(V,"results",17*A+1),1);assert!(w.settle("refund_listing",A,0,0,1,0).is_err());}
 }Ok(())}

#[test]fn activation_is_one_time_and_seed_cannot_be_redirected_or_doubled()->Result<()>{
 let mut w=World::new()?;assert_eq!(w.val(V,"pool",0),V);assert_eq!(w.token_balance(V),0);assert!(w.settle("activate",I,0,0,0,0).is_err());
 // A fresh vault with incorrect seed funding cannot consume or mark activation.
 for amount in [0,2]{let mut x=World::new()?;x.state.set_slot(V,M,x.fields["pool"],0);x.state.set_slot(V,0,0,F);x.state.set_slot(I,0,3+2*V,F);x.state.set_slot(V,0,4+2*I,F);x.state.set_slot(V,FT,0,amount);assert!(x.run(V,M,"activate",&[I]).is_err());assert_eq!(x.val(V,"pool",0),0);}
 Ok(())
}


#[test]
fn standalone_nft_occupied_recipient_and_burn_settlement_preserve_identity_and_supply()->Result<()> {
 let mut w=World::new()?;let offered=w.nft_id(A,0);w.give_nft(B,0,3)?;let occupied=w.nft_id(B,0);
 w.run(A,NFT,"transfer",&[0,B])?;
 let received=1182+35*A+33;let cursor=w.state.get_contract_slot(B,NFT,received)?;
 assert!(w.run(B,NFT,"claim",&[0,A]).is_err());assert_eq!(w.nft_id(B,0),occupied);assert_eq!(w.state.get_contract_slot(B,NFT,received)?,cursor);
 let supply=w.state.get_contract_slot(I,NFT,4)?;
 w.run(B,NFT,"burn",&[0])?;assert!(w.run(B,NFT,"burn",&[0]).is_err());
 w.run(B,NFT,"claim",&[0,A])?;assert_eq!(w.nft_id(B,0),offered);assert!(w.run(B,NFT,"claim",&[1,A]).is_err());
 w.run(I,NFT,"settle_burn",&[B])?;assert_eq!(w.state.get_contract_slot(I,NFT,4)?,supply-1);assert!(w.run(I,NFT,"settle_burn",&[B]).is_err());
 Ok(())
}
#[test]
fn standalone_nft_unauthorized_and_out_of_range_writes_are_atomic()->Result<()> {
 let mut w=World::new()?;let supply=w.state.get_contract_slot(I,NFT,4)?;let occupied=w.nft_id(I,1);
 for (u,input) in [(A,vec![0,3,0,0,0,0]),(I,vec![128,3,0,0,0,0]),(I,vec![1,3,0,0,0,0])] {
  assert!(w.run(u,NFT,"mint",&input).is_err());assert_eq!(w.state.get_contract_slot(I,NFT,4)?,supply);assert_eq!(w.nft_id(I,1),occupied);
 }
 assert!(w.run(A,NFT,"transfer",&[0,16777216]).is_err());assert!(w.run(B,NFT,"settle_burn",&[A]).is_err());
 Ok(())
}

#[test]
fn standalone_nft_full_recipient_capacity_preserves_pending_identity_until_slot_reopens()->Result<()> {
 let mut w=World::new()?;
 for slot in 0..128 {w.give_nft(B,slot,slot+3)?;}
 let offered=w.nft_id(A,0);w.run(A,NFT,"transfer",&[0,B])?;
 let received=1182+35*A+33;let cursor=w.state.get_contract_slot(B,NFT,received)?;
 for slot in [0,127,128] {assert!(w.run(B,NFT,"claim",&[slot,A]).is_err());assert_eq!(w.state.get_contract_slot(B,NFT,received)?,cursor);}
 w.run(B,NFT,"burn",&[127])?;w.run(B,NFT,"claim",&[127,A])?;
 assert_eq!(w.nft_id(B,127),offered);assert_eq!(w.state.get_contract_slot(B,NFT,0)?,128);
 assert!(w.run(B,NFT,"claim",&[127,A]).is_err());Ok(())
}
