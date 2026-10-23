//! Test-only state adapter around the SAME primitive executor used by proving.
//! No bytecode/context substitution. State paths here are not authenticated:
//! full CFC/UPS tests are still mandatory before financial authorization.
use anyhow::{bail,ensure,Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{eval::executor::{InMemoryStateBackend,StateBackend},ops::{op_types::DPNOpType,state_cmd::{data::DPNStateCmd,types::DPNStateCmdCore}},vm::{exec::SimpleDPNExecutor,def::DPNFunctionCircuitDefinition}};
use std::collections::HashMap;
type Writes=HashMap<(u64,u64,u64),u64>;
fn read(s:&InMemoryStateBackend,w:&Writes,u:u64,c:u64,offset:u64,actor:u64)->Result<u64>{if u==actor{if let Some(n)=w.get(&(u,c,offset)){return Ok(*n);}}s.get_contract_slot(u,c,offset)}
pub fn execute(state:&InMemoryStateBackend,def:&DPNFunctionCircuitDefinition,user:u64,contract:u64,checkpoint:u64,key:[u64;4],input:&[u64])->Result<Writes>{
 match std::panic::catch_unwind(std::panic::AssertUnwindSafe(||execute_inner(state,def,user,contract,checkpoint,key,input))){
  Ok(result)=>result,
  Err(payload)=>{let text=payload.downcast_ref::<String>().map(String::as_str).or_else(||payload.downcast_ref::<&str>().copied()).unwrap_or("");
   if text=="SplitBits: target bits must be less than num_bits"{bail!("SDK rejected noncanonical amount range; discarded local execution");}
   // Unsupported instructions, bad test adapter behavior and other panics
   // remain test failures; never count an arbitrary panic as valid rejection.
   std::panic::resume_unwind(payload)
  }
 }
}
fn execute_inner(state:&InMemoryStateBackend,def:&DPNFunctionCircuitDefinition,user:u64,contract:u64,checkpoint:u64,key:[u64;4],input:&[u64])->Result<Writes>{
 ensure!(input.len()==def.circuit_inputs.len(),"exact arity");
 let f=F::from_canonical_u64;let mut vm=SimpleDPNExecutor::new_with_contract_ctx(input.iter().copied().map(f).collect(),f(user),f(contract),f(DEFAULT_CALLER_CONTRACT_ID_U64),f(checkpoint),f(1),key.map(f),[F::ZERO;4]);
 let mut writes=Writes::new();let mut results:HashMap<usize,Vec<u64>>=HashMap::new();
 for step in 0..=def.definitions.len(){
  for(index,_)in def.state_command_resolution_indices.iter().enumerate().filter(|(_,position)|**position==step){
   let raw=&def.state_commands[index];let values=raw.get_inputs().iter().map(|id|vm.resolve_target(*id).to_canonical_u64()).collect::<Vec<_>>();let command=raw.convert_to_u64(&values);
   let get=|u,c,o,n:u64|->Result<Vec<u64>>{(0..n).map(|i|read(state,&writes,u,c,o+i,user)).collect()};
   let mut pending=None;
   let result=match command{
    DPNStateCmd::GetSelfUserCurrentContractStateSlotSingle(c)=>get(user,contract,c.sub_slot_index,1)?,
    DPNStateCmd::GetSelfUserCurrentContractStateSlotRange(c)=>get(user,contract,c.sub_slot_index,u64::from(c.length))?,
    DPNStateCmd::GetSelfUserCurrentContractStateSlotHash(c)=>get(user,contract,c.slot_index*4,4)?,
    DPNStateCmd::GetSelfUserExternalContractStateSlotSingle(c)=>get(user,c.contract_id,c.sub_slot_index,1)?,
    DPNStateCmd::GetSelfUserExternalContractStateSlotRange(c)=>get(user,c.contract_id,c.sub_slot_index,u64::from(c.length))?,
    DPNStateCmd::GetSelfUserExternalContractStateSlotHash(c)=>get(user,c.contract_id,c.slot_index*4,4)?,
    DPNStateCmd::GetOtherUserContractStateSlotSingle(c)=>get(c.user_id,c.contract_id,c.sub_slot_index,1)?,
    DPNStateCmd::GetOtherUserContractStateSlotRange(c)=>get(c.user_id,c.contract_id,c.sub_slot_index,u64::from(c.length))?,
    DPNStateCmd::GetOtherUserContractStateSlotHash(c)=>get(c.user_id,c.contract_id,c.slot_index*4,4)?,
    DPNStateCmd::SetContractStateSlotSingle(c)=>{let mut old=get(user,contract,c.sub_slot_index,1)?;old.push(c.value);if c.condition!=0{pending=Some((c.sub_slot_index,vec![c.value]));}old},
    DPNStateCmd::SetContractStateSlotHash(c)=>{let mut old=get(user,contract,c.slot_index*4,4)?;old.extend(c.value);if c.condition!=0{pending=Some((c.slot_index*4,c.value.to_vec()));}old},
    DPNStateCmd::SetContractStateSlotRange(c)=>{let mut old=get(user,contract,c.sub_slot_index,c.value.len()as u64)?;old.extend(&c.value);if c.condition!=0{pending=Some((c.sub_slot_index,c.value));}old},
    other=>bail!("unsupported public test state command: {other:?}"),
   };
   if let Some((start,values))=pending{for(i,value)in values.into_iter().enumerate(){writes.insert((user,contract,start+i as u64),value);}}
   results.insert(index,result);
  }
  if let Some(op)=def.definitions.get(step){match op.op_type{
   DPNOpType::GetStateCommandResultSingle=>{let r=results.get(&(op.inputs[0]as usize)).ok_or_else(||anyhow::anyhow!("state result not ready"))?;vm.push_external_target(op.index,f(r[0]));},
   DPNOpType::GetStateCommandResultHash=>{let r=results.get(&(op.inputs[0]as usize)).ok_or_else(||anyhow::anyhow!("state result not ready"))?;ensure!(r.len()==4,"hash state result width");vm.push_external_hash(op.index,[f(r[0]),f(r[1]),f(r[2]),f(r[3])]);},
   DPNOpType::GetStateCommandResultArray=>{let r=results.get(&(op.inputs[0]as usize)).ok_or_else(||anyhow::anyhow!("state result not ready"))?;vm.push_external_target_array(op.index,r.iter().copied().map(f).collect());},
   _=>vm.process_var_def(op),
  }}
 }
 for a in &def.assertions{ensure!(vm.resolve_target(a.left)==vm.resolve_target(a.right),"assertion: {}",a.message);}
 Ok(writes)
}
