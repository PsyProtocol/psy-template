//! Boundary and competing-intent guards from the existing Curve/Orderbook bytecode.
//! Token outboxes are authenticated-state fixtures; this is not a full UPS proof.
use anyhow::{bail,Result};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{eval::executor::{ExecutionContext,InMemoryStateBackend,StateBackend,VmExecutor},vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
use std::{collections::HashMap,fs,path::PathBuf};
const VAULT:u64=100;const ALICE:u64=200;const BOB:u64=201;const ISSUER:u64=300;const TARGET:u64=400;const ESCROW:u64=1_000_100_000;
struct World {state:InMemoryStateBackend,fields:HashMap<String,u64>,methods:HashMap<String,DPNFunctionCircuitDefinition>,contract:u64,checkpoint:u64}
impl World {
 fn new(contract:u64,market:&str)->Result<Self>{
  let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
  let dir=root.join(market).join("contract/target");
  let abi:Value=serde_json::from_slice(&fs::read(dir.join("abi.json"))?)?;
  let definitions:Vec<DPNFunctionCircuitDefinition>=serde_json::from_slice(&fs::read(dir.join("circuit_defs.json"))?)?;
  let fields=abi["contract"]["state"].as_array().unwrap().iter().map(|f|(f["name"].as_str().unwrap().to_owned(),f["offset"].as_u64().unwrap())).collect();
  Ok(Self{state:InMemoryStateBackend::new(),fields,methods:definitions.into_iter().map(|d|(d.name.clone(),d)).collect(),contract,checkpoint:100})
 }
 fn value(&self,name:&str,index:u64)->u64 {self.state.get_contract_slot(VAULT,self.contract,self.fields[name]+index).unwrap()}
 fn sent(&mut self,user:u64,asset:u64,value:u64){self.state.set_slot(user,asset,3+2*VAULT,value);}
 fn run(&mut self,user:u64,name:&str,inputs:&[u64])->Result<()>{
  let mut vm=VmExecutor::new(self.state.clone());
  let result=vm.execute(&self.methods[name],&ExecutionContext{user_id:user,contract_id:self.contract,caller_contract_id:DEFAULT_CALLER_CONTRACT_ID_U64,checkpoint_id:self.checkpoint,nonce:1,user_public_key_hash:[0;4]},inputs)?;
  if !result.success {bail!("{}",result.failure.unwrap().message);}
  self.state.apply_overlay(vm.write_overlay());self.state.apply_imt_overlay(vm.imt_write_overlay());Ok(())
 }
 fn curve(threshold:u64)->Result<Self>{
  let mut w=Self::new(66,"bondingcurve")?;
  w.sent(ISSUER,65,2_000_000_000_000_000);w.sent(ISSUER,0,ESCROW);
  w.run(VAULT,"initialize",&[65,ISSUER,TARGET,1_000_000,1_000_000,1_000_000_000,1_000_000_000,10_000,threshold])?;Ok(w)
 }
}
#[test]
fn maximum_curve_roundtrip_matches_u128_price_and_reserve_oracle()->Result<()>{
 let mut w=World::curve(1_000_000)?;
 let cap=1_000_000u64;
 let cost=(u128::from(cap)*1_000_000_000+u128::from(cap)*u128::from(cap-1)*10_000/2) as u64;
 w.run(ALICE,"open_buy",&[VAULT,cap,0,cost,200,1])?;w.sent(ALICE,0,cost+ESCROW);
 assert!(w.run(VAULT,"settle_buy",&[ALICE,cap,cost+1,1]).is_err());
 w.run(VAULT,"settle_buy",&[ALICE,cap,cost,1])?;
 assert_eq!((w.value("sold_lots",0),w.value("psy_reserve",0)),(cap,cost));
 assert!(w.run(VAULT,"settle_buy",&[ALICE,cap,cost,1]).is_err());
 w.run(ALICE,"close_buy",&[])?;
 w.run(ALICE,"open_sell",&[VAULT,cap,cap,cost,200,2])?;w.sent(ALICE,0,cost+2*ESCROW);w.sent(ALICE,65,1_000_000_000_000_000);
 assert!(w.run(VAULT,"settle_sell",&[ALICE,cap,cost-1,2]).is_err());
 w.run(VAULT,"settle_sell",&[ALICE,cap,cost,2])?;
 assert_eq!((w.value("sold_lots",0),w.value("psy_reserve",0)),(0,0));
 Ok(())
}
#[test]
fn competing_curve_quotes_stale_refund_and_graduation_boundaries()->Result<()>{
 let mut w=World::curve(1)?;
 let base=1_000_000_000;
 for user in [ALICE,BOB]{w.run(user,"open_buy",&[VAULT,1,0,base,200,1])?;w.sent(user,0,base+ESCROW);}
 assert!(w.run(VAULT,"graduate",&[TARGET,base,1_999_999_000_000_000]).is_err());
 w.run(VAULT,"settle_buy",&[ALICE,1,base,1])?;
 assert!(w.run(VAULT,"settle_buy",&[BOB,1,base,1]).unwrap_err().to_string().contains("stale buy quote"));
 assert_eq!((w.value("consumed_nonce",BOB),w.value("psy_reserve",0)),(0,base));
 w.sent(ISSUER,0,2*ESCROW);
 let tokens=1_999_999_000_000_000;
 assert!(w.run(VAULT,"graduate",&[TARGET+1,base,tokens]).is_err());
 assert!(w.run(VAULT,"graduate",&[TARGET,base+1,tokens]).is_err());
 assert!(w.run(VAULT,"graduate",&[TARGET,base,tokens-1]).is_err());
 w.run(VAULT,"graduate",&[TARGET,base,tokens])?;
 assert_eq!((w.value("phase",0),w.value("psy_reserve",0)),(2,0));
 assert!(w.run(VAULT,"settle_buy",&[BOB,1,base,1]).is_err());
 w.run(VAULT,"refund_buy",&[BOB,1,base,1])?;
 assert_eq!(w.value("settled_psy_sent",BOB),base+ESCROW);
 assert!(w.run(VAULT,"refund_buy",&[BOB,1,base,1]).is_err());
 assert!(w.run(VAULT,"graduate",&[TARGET,base,tokens]).is_err());
 Ok(())
}
fn order_pair()->Result<World>{
 let mut w=World::new(64,"orderbook")?;
 w.run(ALICE,"open_sell",&[VAULT,0,10_000_000,10_000_000,100,1])?;
 w.run(BOB,"open_sell",&[VAULT,4,10_000_000,10_000_000,100,1])?;
 w.sent(ALICE,0,10_000_000+ESCROW);w.sent(BOB,0,ESCROW);w.sent(BOB,4,10_000_000);Ok(w)
}
#[test]
fn orderbook_exact_deadline_price_fee_and_replay_guards()->Result<()>{
 let mut w=order_pair()?;
 assert!(w.run(VAULT,"match_orders",&[ALICE,BOB,10_000_000,9_999_999,1,1]).is_err());
 w.sent(BOB,0,ESCROW+1);
 assert!(w.run(VAULT,"match_orders",&[ALICE,BOB,10_000_000,10_000_000,1,1]).is_err());
 w.sent(BOB,0,ESCROW);
 w.run(VAULT,"match_orders",&[ALICE,BOB,10_000_000,10_000_000,1,1])?;
 assert_eq!((w.value("active_consumed_nonce",ALICE),w.value("active_consumed_nonce",BOB)),(1,1));
 assert!(w.run(VAULT,"match_orders",&[ALICE,BOB,10_000_000,10_000_000,1,1]).is_err());
 assert!(w.run(VAULT,"cancel_psy_order",&[ALICE,10_000_000,1]).is_err());
 Ok(())
}
#[test]
fn orderbook_refund_wins_race_and_prevents_subsequent_match()->Result<()>{
 let mut w=order_pair()?;
 w.checkpoint=101;
 assert!(w.run(VAULT,"match_orders",&[ALICE,BOB,10_000_000,10_000_000,1,1]).is_err());
 assert!(w.run(VAULT,"cancel_psy_order",&[BOB,10_000_000,1]).is_err());
 assert!(w.run(VAULT,"cancel_psy_order",&[ALICE,9_999_999,1]).is_err());
 w.run(VAULT,"cancel_psy_order",&[ALICE,10_000_000,1])?;
 assert!(w.run(VAULT,"cancel_psy_order",&[ALICE,10_000_000,1]).is_err());
 w.checkpoint=100;
 assert!(w.run(VAULT,"match_orders",&[ALICE,BOB,10_000_000,10_000_000,1,1]).is_err());
 w.run(VAULT,"cancel_usdt_order",&[BOB,10_000_000,1])?;
 assert_eq!(w.value("active_settled_usdt_sent",BOB),10_000_000);
 Ok(())
}
