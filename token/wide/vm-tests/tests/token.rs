//! Execute the actual compiled token; independent u128 accounting oracle.
use anyhow::{bail,Result};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{eval::executor::{ExecutionContext,InMemoryStateBackend,StateBackend,VmExecutor},vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
use std::{collections::HashMap,fs,path::PathBuf};
const TOKEN:u64=42;const ISSUER:u64=5;const ALICE:u64=200;const BOB:u64=300;const SDK:u64=100;
const B:u128=1u128<<62;const MAX:u128=B*B-1;
fn limbs(n:u128)->[u64;2]{[(n%B)as u64,(n/B)as u64]}
struct World{state:InMemoryStateBackend,fields:HashMap<String,u64>,methods:HashMap<String,DPNFunctionCircuitDefinition>}
impl World{
 fn new()->Result<Self>{
  let path=std::env::var("TOKEN_WIDE_ARTIFACT").map(PathBuf::from).unwrap_or_else(|_|PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../verification-2026-10-12/compiled-reviewed/compilation_artifact.json"));
  let a:Value=serde_json::from_slice(&fs::read(path)?)?;
  let fields=a["abi"]["contract"]["state"].as_array().unwrap().iter().map(|f|(f["name"].as_str().unwrap().into(),f["offset"].as_u64().unwrap())).collect();
  let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;
  Ok(Self{state:InMemoryStateBackend::new(),fields,methods:defs.into_iter().map(|d|(d.name.clone(),d)).collect()})
 }
 fn set_pair(&mut self,u:u64,f:&str,index:u64,n:u128){let off=self.fields[f]+index;for(i,v)in limbs(n).iter().enumerate(){self.state.set_slot(u,TOKEN,off+i as u64,*v);}}
 fn pair(&self,u:u64,f:&str,index:u64)->u128{let off=self.fields[f]+index;u128::from(self.state.get_contract_slot(u,TOKEN,off).unwrap())+u128::from(self.state.get_contract_slot(u,TOKEN,off+1).unwrap())*B}
 fn balance(&self,u:u64)->u128{self.pair(u,"balance",0)}
 fn sent(&self,u:u64,to:u64)->u128{self.pair(u,"other_user_info",4*to)}
 fn claimed(&self,u:u64,from:u64)->u128{self.pair(u,"other_user_info",4*from+2)}
 fn exec(&mut self,u:u64,name:&str,inputs:&[u64])->Result<()>{
  let mut vm=VmExecutor::new(self.state.clone());
  let r=vm.execute(&self.methods[name],&ExecutionContext{user_id:u,contract_id:TOKEN,caller_contract_id:DEFAULT_CALLER_CONTRACT_ID_U64,checkpoint_id:100,nonce:1,user_public_key_hash:[0;4]},inputs)?;
  if !r.success{bail!("{}",r.failure.unwrap().message);}
  self.state.apply_overlay(vm.write_overlay());self.state.apply_imt_overlay(vm.imt_write_overlay());Ok(())
 }
 fn amount(&mut self,u:u64,name:&str,prefix:&[u64],n:u128)->Result<()>{let mut inputs=prefix.to_vec();inputs.extend(limbs(n));self.exec(u,name,&inputs)}
 fn transfer(&mut self,u:u64,to:u64,n:u128)->Result<()>{self.amount(u,"transfer",&[to],n)}
 fn init(&mut self)->Result<()>{self.exec(ISSUER,"set_metadata",&[123,18])}
}
#[test]
fn billion_tokens_at_18_decimals_mint_transfer_claim_and_settle_burn()->Result<()>{
 let mut w=World::new()?;let supply=10_000_000_000u128*10u128.pow(18);w.init()?;
 w.amount(ISSUER,"set_max_supply",&[],supply)?;w.amount(ISSUER,"mint",&[],supply)?;
 assert_eq!(w.balance(ISSUER),supply);assert_eq!(w.pair(ISSUER,"total_supply",0),supply);
 assert!(w.amount(ISSUER,"mint",&[],1).is_err());assert!(w.amount(BOB,"mint",&[],1).is_err());
 let payment=1_000_000_000u128*10u128.pow(18)+123456789012345678;
 w.transfer(ISSUER,ALICE,payment)?;w.exec(ALICE,"claim",&[ISSUER])?;assert_eq!(w.balance(ALICE),payment);
 assert!(w.exec(ALICE,"claim",&[ISSUER]).is_err());
 let burn=B+7;w.amount(ALICE,"burn",&[],burn)?;w.exec(ISSUER,"settle_burn",&[ALICE])?;
 assert_eq!(w.balance(ALICE),payment-burn);assert_eq!(w.pair(ISSUER,"total_supply",0),supply-burn);
 assert!(w.exec(ISSUER,"settle_burn",&[ALICE]).is_err());assert_eq!(w.pair(ISSUER,"total_minted",0),supply);
 w.exec(ISSUER,"renounce_mint_authority",&[])?;assert!(w.amount(ISSUER,"mint",&[],1).is_err());Ok(())
}
#[test]
fn carry_borrow_overflow_and_noncanonical_limbs_are_enforced()->Result<()>{
 let mut w=World::new()?;w.set_pair(ALICE,"balance",0,B+10);
 w.transfer(ALICE,BOB,B-1)?;w.transfer(ALICE,BOB,2)?;assert_eq!(w.sent(ALICE,BOB),B+1);assert_eq!(w.balance(ALICE),9);
 w.exec(BOB,"claim",&[ALICE])?;assert_eq!(w.balance(BOB),B+1);
 assert!(w.transfer(ALICE,BOB,10).is_err());assert_eq!(w.balance(ALICE),9);
 for amount in [[B as u64,0],[0,B as u64],[18_446_744_069_414_584_320,0]]{
  assert!(w.exec(ALICE,"transfer",&[BOB,amount[0],amount[1]]).is_err());
 }
 let mut w=World::new()?;w.set_pair(ALICE,"balance",0,MAX);w.set_pair(ALICE,"other_user_info",4*BOB,MAX);
 assert!(w.transfer(ALICE,BOB,1).is_err());assert_eq!(w.balance(ALICE),MAX);
 w.init()?;w.amount(ISSUER,"mint",&[],MAX)?;assert!(w.amount(ISSUER,"mint",&[],1).is_err());
 let mut w=World::new()?;w.set_pair(ALICE,"other_user_info",4*BOB,MAX);w.set_pair(BOB,"balance",0,1);
 assert!(w.exec(BOB,"claim",&[ALICE]).is_err());assert_eq!(w.claimed(BOB,ALICE),0);Ok(())
}
#[test]
fn large_sdk_refunds_are_bound_to_the_actual_payer_and_cumulative_credit()->Result<()>{
 let mut w=World::new()?;let n=10u128.pow(27)+B+7;w.set_pair(ALICE,"balance",0,n+100);
 w.transfer(ALICE,SDK,n)?;assert!(w.exec(SDK,"cancel_unclaimed_payment",&[BOB]).is_err());
 w.exec(SDK,"cancel_unclaimed_payment",&[ALICE])?;assert_eq!(w.sent(SDK,ALICE),n);assert_eq!(w.sent(SDK,BOB),0);
 assert_eq!(w.balance(SDK),0);assert!(w.exec(SDK,"cancel_unclaimed_payment",&[ALICE]).is_err());
 w.exec(ALICE,"claim",&[SDK])?;assert_eq!(w.balance(ALICE),n+100);
 w.transfer(ALICE,SDK,n)?;w.exec(SDK,"claim",&[ALICE])?;
 w.amount(SDK,"refund_claimed_payment",&[ALICE],n-1)?;
 assert!(w.amount(SDK,"refund_claimed_payment",&[ALICE],2).is_err());
 assert!(w.amount(SDK,"refund_claimed_payment",&[BOB],1).is_err());
 w.amount(SDK,"refund_claimed_payment",&[ALICE],1)?;w.exec(ALICE,"claim",&[SDK])?;
 assert_eq!(w.balance(ALICE),n+100);assert_eq!(w.balance(SDK),0);Ok(())
}
#[test]
fn batch_duplicates_zero_entries_and_total_overflow_are_atomic()->Result<()>{
 let mut w=World::new()?;w.set_pair(ALICE,"balance",0,MAX);
 let mut args=vec![BOB,BOB];args.extend(limbs(B-1));args.extend(limbs(3));w.exec(ALICE,"batch_transfer_2",&args)?;
 assert_eq!(w.sent(ALICE,BOB),B+2);assert_eq!(w.balance(ALICE),MAX-B-2);
 let mut args=vec![BOB,BOB,0,SDK,BOB];for n in [1,2,0,B,4]{args.extend(limbs(n));}w.exec(ALICE,"batch_transfer_5",&args)?;
 assert_eq!(w.sent(ALICE,BOB),B+9);assert_eq!(w.sent(ALICE,SDK),B);
 let before=w.balance(ALICE);let mut args=vec![BOB,SDK];args.extend(limbs(MAX));args.extend(limbs(1));
 assert!(w.exec(ALICE,"batch_transfer_2",&args).is_err());assert_eq!(w.balance(ALICE),before);Ok(())
}
#[test]
fn wide_delegation_spend_close_refund_and_stale_version_guards()->Result<()>{
 let mut w=World::new()?;let allocated=B+5;w.set_pair(ALICE,"balance",0,allocated);
 w.amount(ALICE,"open_delegation_channel",&[0,BOB],allocated)?;assert_eq!(w.balance(ALICE),0);
 let mut args=vec![ALICE,0];args.extend(limbs(B));args.push(SDK);w.exec(BOB,"spend_delegation",&args)?;
 assert_eq!(w.sent(BOB,SDK),B);let mut wrong=args.clone();wrong[2]=6;wrong[3]=0;
 assert!(w.exec(BOB,"spend_delegation",&wrong).is_err());
 w.exec(ALICE,"request_revoke_delegation",&[0])?;assert!(w.exec(ALICE,"finalize_revoke_delegation",&[0,BOB]).is_err());
 w.exec(BOB,"close_delegation_channel",&[ALICE,0,1])?;w.exec(ALICE,"finalize_revoke_delegation",&[0,BOB])?;
 assert_eq!(w.balance(ALICE),5);assert!(w.exec(ALICE,"finalize_revoke_delegation",&[0,BOB]).is_err());
 w.amount(ALICE,"open_delegation_channel",&[0,BOB],5)?;assert!(w.exec(BOB,"close_delegation_channel",&[ALICE,0,1]).is_err());
 let mut args=vec![ALICE,0];args.extend(limbs(2));args.push(SDK);w.exec(BOB,"spend_delegation",&args)?;
 assert_eq!(w.sent(BOB,SDK),B+2);Ok(())
}
#[test]
fn random_transfers_claims_match_independent_u128_and_conserve_assets()->Result<()>{
 let mut w=World::new()?;let ids=[ALICE,BOB,SDK];let initial=10u128.pow(30);w.set_pair(ALICE,"balance",0,initial);
 let mut balances=[initial,0,0];let mut seed=0x91af_231d_045bu64;
 for i in 0..256{seed=seed.wrapping_mul(6364136223846793005).wrapping_add(1);let from=i%3;let to=(from+1+(seed as usize%2))%3;
  let value=balances[from]/(2+(seed%17)as u128);if value==0{continue;}
  w.transfer(ids[from],ids[to],value)?;balances[from]-=value;
  w.exec(ids[to],"claim",&[ids[from]])?;balances[to]+=value;
  for j in 0..3{assert_eq!(w.balance(ids[j]),balances[j]);}assert_eq!(balances.iter().sum::<u128>(),initial);
 }Ok(())
}
