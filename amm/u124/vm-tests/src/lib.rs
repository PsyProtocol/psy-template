pub mod proof_binding;
pub mod batch_compile;
pub mod batch_policy;
pub mod submission_guard;
pub mod policy;
pub mod runtime;
pub mod wallet_driver;
pub mod nft_market;
pub mod layout_preflight;
mod ranges;
// The application build resolves foreign token ABIs without changing Node/compiler.
use anyhow::{bail,ensure,Result};
use psy_compiler::output::serialize::ContractOutput;
use psy_vm::dpn::{contract::dapen_fc_to_cfc_code_definition,ops::{state_cmd::{data::DPNStateCmd,types::DPNStateCmdCore},op_types::{DPNBuiltInDataType,DPNIndexedVarDef,DPNOpType}},vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
// The production executor allocates dense target vectors. A prepended target
// must have index zero; rebase symbolic Felt references without changing any
// literal input positions, split widths, constants or state-command IDs.
fn felt_ref(id:u64)->u64{if id>>32==0{id+1}else{id}}
fn prepend_height(def:&mut DPNFunctionCircuitDefinition,height:u64)->Result<()> {
 for n in &mut def.definitions {
  if n.data_type==DPNBuiltInDataType::Target{n.index+=1;}
  match n.op_type as u16 {
   0|1|2|3|46|47|48|53|54|55=>{},
   18=>{for id in &mut n.inputs[1..]{*id=felt_ref(*id);}},
   4|5|6|7|8|9|10|13|14|15|16|17|20|21|22|23|78=>{for id in &mut n.inputs{*id=felt_ref(*id);}},
   _=>bail!("unsupported rebase opcode {:?} in {}",n.op_type,def.name),
  }
 }
 for id in def.circuit_inputs.iter_mut().chain(def.circuit_outputs.iter_mut()){*id=felt_ref(*id);}
 for a in &mut def.assertions{a.left=felt_ref(a.left);a.right=felt_ref(a.right);}
 for cmd in &mut def.state_commands{let refs:Vec<_>=cmd.get_inputs().into_iter().map(felt_ref).collect();*cmd=cmd.convert_to_u64(&refs);}
 ensure!(def.events.is_empty(),"market event rebase not implemented");
 for index in &mut def.state_command_resolution_indices{*index+=1;}
 def.definitions.insert(0,DPNIndexedVarDef{data_type:DPNBuiltInDataType::Target,index:0,op_type:DPNOpType::Constant,inputs:vec![height]});
 let mut next=0;for n in &def.definitions{if n.data_type==DPNBuiltInDataType::Target{ensure!(n.index==next,"non-dense Felt definition in {}",def.name);next+=1;}}
 Ok(())
}
fn prepend_native_height(def:&mut DPNFunctionCircuitDefinition)->Result<()> { prepend_height(def,32) }
pub fn compile_market(source:&str,a:u64,b:u64)->Result<ContractOutput>{
 ensure!(a>=5 && b>=5 && a!=b,"two distinct U124 asset IDs required");
 let mut out=psy_compiler::compile(source)?;
 ensure!(out.state_tree_height()==31,"market layout height must be 31");
 for def in &mut out.circuit_definitions {
  ranges::lower_close_ranges(def)?;
  prepend_native_height(def)?;
  let mut constants=std::collections::HashMap::new();
  let mut current=None;
  for node in &def.definitions {let v=serde_json::to_value(node)?;if v["data_type"]==0 && v["op_type"]==1 {constants.insert(v["index"].as_u64().unwrap(),v["inputs"][0].as_u64().unwrap());}if v["data_type"]==0&&v["op_type"]==47{current=v["index"].as_u64();}}
  // Two-limb self reads are lowered to transaction-local single readers. This
  // avoids the frozen SDK's range cache key mismatch without changing Node or
  // replacing current-session reads with an UPS-start foreign-user snapshot.
  let native_height=0;
  for (_i,cmd) in def.state_commands.iter_mut().enumerate(){let foreign=match cmd { DPNStateCmd::GetOtherUserContractStateSlotRange(c)=>Some((c.contract_id, &mut c.contract_state_tree_height,c.length)), DPNStateCmd::GetOtherUserContractStateSlotSingle(c)=>Some((c.contract_id, &mut c.contract_state_tree_height,1)), DPNStateCmd::GetSelfUserExternalContractStateSlotRange(c)=>Some((c.contract_id, &mut c.contract_state_tree_height,c.length)), DPNStateCmd::GetSelfUserExternalContractStateSlotSingle(c)=>Some((c.contract_id, &mut c.contract_state_tree_height,1)),_=>None}; if let Some((contract_id,height,length))=foreign {
   ensure!(constants.get(height)==Some(&31),"unexpected unresolved read height");
   match constants.get(&contract_id).copied(){Some(0)=>{*height=native_height;ensure!(length==1,"PSY read must be one Felt");},Some(id) if id==a||id==b=>ensure!(length==2||(length==1&&def.name.starts_with("close_")),"U124 read must contain both limbs"),_ if Some(contract_id)==current=>{},_=>bail!("unrecognized foreign contract in {}",def.name)}
  }else {let v:Value=serde_json::to_value(&*cmd)?;ensure!(!v["type"].as_str().unwrap().starts_with("GetOtherUserContract") && !v["type"].as_str().unwrap().starts_with("GetSelfUserExternalContract"),"unsupported foreign read shape");}}
 }
 out.contract_code.functions=out.circuit_definitions.iter().map(dapen_fc_to_cfc_code_definition).collect();
 Ok(out)
}

pub mod batch_compact;
