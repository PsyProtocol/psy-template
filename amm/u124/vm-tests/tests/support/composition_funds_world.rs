//! Test-only actual-bytecode world. VM snapshots are NOT chain inclusion or
//! authenticated state proofs. The separate UPS harness supplies Merkle paths.
use anyhow::{ensure,Result};
use std::{collections::{BTreeMap,HashMap},fs};
use serde_json::Value;
use psy_vm::dpn::{eval::executor::{InMemoryStateBackend,StateBackend,VmExecutor,ExecutionContext},vm::def::DPNFunctionCircuitDefinition};
#[path="composition_vm.rs"]mod primitive;
pub const C:u64=1002;pub const V:u64=100;pub const U:u64=200;pub const A:u64=42;pub const B:u64=43;pub const F:u64=1_000_100_000;pub const R:u128=1u128<<62;
pub fn pair(n:u128)->[u64;2]{[(n%R)as u64,(n/R)as u64]}
#[derive(Clone)]pub struct World {
 pub state:InMemoryStateBackend,pub slots:BTreeMap<(u64,u64,u64),u64>,pub methods:HashMap<(u64,String),DPNFunctionCircuitDefinition>,
 pub fields:HashMap<String,u64>,pub artifacts:BTreeMap<u64,Value>,pub policy:Value,pub checkpoint:u64,pub revision:u64,pub key:[u64;4],
}
impl World {
 pub fn new()->Result<Self>{
  let root=std::env::var("COMPOSITION_BUILD")?;let load=|p:&str|->Result<Value>{Ok(serde_json::from_slice(&fs::read(format!("{root}/{p}"))?)?)};
  let controller=load("compiled/compilation_artifact.json")?;let token=load("token.json")?;let native=load("native.json")?;
  let artifacts=BTreeMap::from([(C,controller.clone()),(A,token.clone()),(B,token),(0,native)]);
  let mut methods=HashMap::new();for(cid,a)in &artifacts {let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;for def in defs{methods.insert((*cid,def.name.clone()),def);}}
  let fields=controller["abi"]["contract"]["state"].as_array().unwrap().iter().map(|f|(f["name"].as_str().unwrap().into(),f["offset"].as_u64().unwrap())).collect();
  let mut w=Self{state:InMemoryStateBackend::new(),slots:BTreeMap::new(),methods,fields,artifacts,policy:load("policy.json")?,checkpoint:100,revision:0,key:[11,22,33,44]};
  if std::env::var_os("COMPOSITION_METADATA_GUARD").is_some(){for c in[A,B]{w.run(5,c,"set_metadata",&[123,18])?;w.run(5,c,"mint",&pair(1u128<<120))?;w.run(5,c,"renounce_mint_authority",&[])?;}}
  Ok(w)
 }
 pub fn load_markets(&mut self)->Result<()> {
  let a:Value=serde_json::from_slice(&fs::read(format!("{}/amm.json",std::env::var("COMPOSITION_BUILD")?))?)?;
  for cid in [1000,1001]{let defs:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(a["circuit_definitions"].clone())?;for d in defs{self.methods.insert((cid,d.name.clone()),d);}self.artifacts.insert(cid,a.clone());}Ok(())
 }
 pub fn set(&mut self,u:u64,c:u64,o:u64,n:u64){self.state.set_slot(u,c,o,n);self.slots.insert((u,c,o),n);}
 pub fn get(&self,u:u64,c:u64,o:u64)->u64{self.state.get_contract_slot(u,c,o).unwrap()}
 pub fn at(&self,u:u64,n:&str)->u64{self.get(u,C,self.fields[n])}
 pub fn wide(&self,u:u64,c:u64,o:u64)->u128{self.get(u,c,o)as u128+R*self.get(u,c,o+1)as u128}
 pub fn run(&mut self,u:u64,c:u64,name:&str,input:&[u64])->Result<()> {
  let d=self.methods.get(&(c,name.into())).ok_or_else(||anyhow::anyhow!("missing {c}/{name}"))?;
  let writes=if c!=0&&name!="set_metadata" {primitive::execute(&self.state,d,u,c,self.checkpoint,if u==V{self.key}else{[0;4]},input)?} else {
   let mut vm=VmExecutor::new(self.state.clone());let result=vm.execute(d,&ExecutionContext{user_id:u,contract_id:c,caller_contract_id:psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64,checkpoint_id:self.checkpoint,nonce:self.revision+1,user_public_key_hash:if u==V{self.key}else{[0;4]}},input)?;
   ensure!(result.success,"public synthetic call {c}/{name}: {:?}",result.failure);
   self.state.apply_imt_overlay(vm.imt_write_overlay());vm.write_overlay().clone()
  };
  self.state.apply_overlay(&writes);self.slots.extend(writes);Ok(())
 }
 pub fn request_args(&self,input:u128,minimum_mid:u128,minimum_final:u128)->Vec<u64> {
  let mut args=vec![V,1];args.extend(pair(input));args.extend(pair(minimum_mid));args.extend(pair(minimum_final));args.extend([500,20*F]);args.extend(self.key);
  args
 }
 pub fn request(&mut self,input:u128,minimum_mid:u128,minimum_final:u128)->Result<()> {
  self.run(U,C,"request_route",&self.request_args(input,minimum_mid,minimum_final))
 }
 pub fn atomic_calls(&mut self,user:u64,calls:&[(u64,&str,Vec<u64>)])->Result<()> {
  let mut next=self.clone();for(c,name,args)in calls{next.run(user,*c,name,args)?;}*self=next;Ok(())
 }
 pub fn seed_funding(&mut self,input:u128)->Result<()> {
  self.set(U,0,0,100*F);self.run(U,0,"simple_transfer",&[V,20*F])?;
  for c in [A,B]{if self.get(5,c,3)==0{self.run(5,c,"set_metadata",&[123,18])?;self.run(5,c,"mint",&pair(1u128<<120))?;}}
  let mut args=vec![U];args.extend(pair(input));self.run(5,A,"transfer",&args)?;self.run(U,A,"claim",&[5])?;
  let mut args=vec![V];args.extend(pair(input));self.run(U,A,"transfer",&args)?;self.run(U,C,"bind_funding",&[1])
 }
 pub fn fields(&self,name:&str,values:&[(usize,u64)],fee:u64)->Result<Vec<u64>> {
  let op=self.policy["operations"].as_array().unwrap().iter().find(|o|o["name"]==name).ok_or_else(||anyhow::anyhow!("unknown operation {name}"))?;
  let mut f=vec![0;74];f[0]=4;f[21]=op["branch"].as_u64().unwrap();f[22]=U;f[23]=1;f[33]=fee;f[73]=fee;
  for &(i,value)in values{ensure!((1..12).contains(&i),"operation input index");f[21+i]=value;}Ok(f)
 }
 pub fn execute(&mut self,f:&[u64])->Result<()> {
  let calls=psy_template_u124_markets::composition_policy::calls(&self.policy,f)?;let mut next=self.clone();
  for c in calls{let values=c["inputs"].as_array().unwrap().iter().map(|n|n.as_u64().unwrap()).collect::<Vec<_>>();next.run(V,c["contract_id"].as_u64().unwrap(),c["method_name"].as_str().unwrap(),&values)?;}
  // Actual fee derivation/end-cap binding belongs to the UPS harness; this VM
  // oracle executes the supplied policy fee and commits all calls together.
  next.revision+=1;*self=next;Ok(())
 }
}
