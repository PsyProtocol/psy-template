//! Actual compiled reservation bytecode only. No custody, SD-key authorization,
//! authenticated foreign-state proof, UPS atomicity or network claim is implied.
use anyhow::Result;
use psy_vm::dpn::{eval::executor::{InMemoryStateBackend,StateBackend},vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
use std::{collections::HashMap,fs};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}},hash::{hash_types::HashOut,poseidon::PoseidonHash},plonk::config::Hasher};
const C:u64=1000;const V:u64=100;const U:u64=200;const K:[u64;4]=[11,22,33,44];
#[path="support/composition_vm.rs"]mod composition_vm;
struct World{state:InMemoryStateBackend,methods:HashMap<String,DPNFunctionCircuitDefinition>,fields:HashMap<String,u64>,checkpoint:u64}
impl World{
 fn new()->Result<Self>{let a:Value=serde_json::from_slice(&fs::read(std::env::var("COMPOSITION_RESERVATION_ARTIFACT")?)?)?;let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;Ok(Self{state:InMemoryStateBackend::new(),methods:defs.into_iter().map(|d|(d.name.clone(),d)).collect(),fields:a["abi"]["contract"]["state"].as_array().unwrap().iter().map(|f|(f["name"].as_str().unwrap().into(),f["offset"].as_u64().unwrap())).collect(),checkpoint:100})}
 fn run(&mut self,user:u64,key:[u64;4],name:&str,input:&[u64])->Result<()>{let writes=composition_vm::execute(&self.state,&self.methods[name],user,C,self.checkpoint,key,input)?;self.state.apply_overlay(&writes);Ok(())}
 fn at(&self,user:u64,field:&str,index:u64)->u64{self.state.get_contract_slot(user,C,self.fields[field]+index).unwrap()}
 fn request(&mut self,epoch:u64,nonce:u64,expiry:u64)->Result<()>{self.run(U,[0;4],"request_intent",&[V,epoch,nonce,17,1,5,0,7,0,expiry,100,11,22,33,44])}
}
#[test]
fn exact_key_epoch_nonce_cancel_and_timeout_execute_real_bytecode()->Result<()>{
 let mut w=World::new()?;w.run(V,K,"open_epoch",&[1,110])?;w.request(1,1,120)?;
 // Independent host hash of the documented synthetic fixture. Both U124 limbs,
 // chain domain, controller, owner, nonce, budget, receiver, key and registry
 // must survive the compiler lowering and actual state write.
 let hash=|a:[u64;4]|HashOut{elements:a.map(F::from_canonical_u64)};
 let mut expected=hash([1384803358401154921,C,U,1]);
 for row in [[V,1,120,100],[17,1,5,0],[7,0,U,1],K,[0xaaaaaaaa;4],[0xaaaaaaaa;4]]{expected=PoseidonHash::two_to_one(expected,hash(row));}
 for limb in 0..4{assert_eq!(w.at(U,"request_commitment",limb),expected.elements[limb as usize].to_canonical_u64());}
 for limb in 0..4{let mut wrong=K;wrong[limb]+=1;assert!(w.run(V,wrong,"accept_reservation",&[U,1]).is_err());assert_eq!(w.at(V,"epoch_phase",0),1);assert_eq!(w.at(V,"active_owner",0),0);}
 assert!(w.run(V,K,"accept_reservation",&[U+1,1]).is_err());assert!(w.run(V,K,"accept_reservation",&[U,2]).is_err());
 w.run(V,K,"accept_reservation",&[U,1])?;assert_eq!(w.at(V,"active_owner",0),U);assert_eq!(w.at(V,"active_nonce",0),1);
 for limb in 0..4{assert_eq!(w.at(V,"active_commitment",limb),w.at(U,"request_commitment",limb));}
 assert!(w.run(V,K,"accept_reservation",&[U,1]).is_err());assert!(w.request(1,2,120).is_err());assert!(w.run(V,K,"cancel_reservation",&[]).is_err());
 assert!(w.run(U,[0;4],"request_cancel",&[2]).is_err());w.run(U,[0;4],"request_cancel",&[1])?;w.run(V,K,"cancel_reservation",&[])?;assert_eq!(w.at(V,"consumed",U),1);assert_eq!(w.at(V,"epoch_phase",0),3);
 w.run(V,K,"open_epoch",&[2,110])?;w.request(2,2,120)?;assert!(w.run(V,K,"accept_reservation",&[U,1]).is_err());w.run(V,K,"accept_reservation",&[U,2])?;
 w.checkpoint=120;assert!(w.run(V,K,"cancel_reservation",&[]).is_err());w.checkpoint=121;w.run(V,K,"cancel_reservation",&[])?;assert_eq!(w.at(V,"consumed",U),2);
 w.run(V,K,"open_epoch",&[3,125])?;assert!(w.run(V,K,"abort_empty_epoch",&[]).is_err());w.checkpoint=126;assert!(w.request(3,3,140).is_err());w.run(V,K,"abort_empty_epoch",&[])?;assert_eq!(w.at(V,"epoch_phase",0),3);Ok(())
}
#[test]
fn invalid_terms_and_cancel_before_acceptance_do_not_reserve()->Result<()>{
 let mut w=World::new()?;w.run(V,K,"open_epoch",&[1,110])?;
 let valid=[V,1,1,17,1,5,0,7,0,120,100,11,22,33,44];
 for(index,value)in[(0,0),(0,U),(1,2),(2,2),(3,1u64<<62),(4,1u64<<62),(5,1u64<<62),(7,1u64<<62),(9,100),(10,0)]{let mut bad=valid;bad[index]=value;assert!(w.run(U,[0;4],"request_intent",&bad).is_err(),"invalid input {index}");assert_eq!(w.at(U,"request_nonce",0),0);}
 w.request(1,1,120)?;w.run(U,[0;4],"request_cancel",&[1])?;assert!(w.run(V,K,"accept_reservation",&[U,1]).is_err());assert_eq!(w.at(V,"epoch_phase",0),1);assert_eq!(w.at(V,"active_owner",0),0);Ok(())
}
