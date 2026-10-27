//! Distinct batch profiles. Lower typed two-limb self reads in the application,
//! without editing Node, the token ABI, or the legacy compilation profile.
use anyhow::{ensure,Result};
use psy_compiler::output::serialize::ContractOutput;
use psy_vm::dpn::{contract::dapen_fc_to_cfc_code_definition,ops::state_cmd::data::DPNStateCmd};
pub fn compile(source:&str,a:u64,b:u64,nft:bool)->Result<ContractOutput>{
 ensure!(a>=5&&b>=5&&a!=b,"distinct batch assets");
 if nft{let mut out=super::nft_market::compile(source,a,b)?;for d in &mut out.circuit_definitions{super::ranges::lower_batch_ranges(d)?;}out.contract_code.functions=out.circuit_definitions.iter().map(dapen_fc_to_cfc_code_definition).collect();return Ok(out); }
 let mut out=psy_compiler::compile(source)?;
 ensure!(out.state_tree_height()==31,"batch layout height must be 31");
 super::layout_preflight::verify_abi_layout(&out.abi_to_json()?)?;
 for def in &mut out.circuit_definitions{
  // The same audited scalarization, applied to this new profile only.
  super::ranges::lower_batch_ranges(def)?;
  let native_height=super::prepend_height(def,32)?;
  let mut constants=std::collections::HashMap::new();let mut current=None;
  for n in &def.definitions{if n.data_type==psy_vm::dpn::ops::op_types::DPNBuiltInDataType::Target&&n.op_type==psy_vm::dpn::ops::op_types::DPNOpType::Constant{constants.insert(n.index as u64,n.inputs[0]);}if n.op_type==psy_vm::dpn::ops::op_types::DPNOpType::GetContractId{current=Some(n.index as u64);}}
  for cmd in &mut def.state_commands{
   let r=match cmd{DPNStateCmd::GetOtherUserContractStateSlotRange(c)=>Some((c.contract_id,&mut c.contract_state_tree_height)),DPNStateCmd::GetOtherUserContractStateSlotSingle(c)=>Some((c.contract_id,&mut c.contract_state_tree_height)),DPNStateCmd::GetSelfUserExternalContractStateSlotRange(c)=>Some((c.contract_id,&mut c.contract_state_tree_height)),DPNStateCmd::GetSelfUserExternalContractStateSlotSingle(c)=>Some((c.contract_id,&mut c.contract_state_tree_height)),_=>None};
   if let Some((cid,height))=r{ensure!(constants.get(height)==Some(&31),"unresolved batch height");match constants.get(&cid).copied(){Some(0)=>*height=native_height,Some(id)if id==a||id==b=>{},_ if Some(cid)==current=>{},_=>anyhow::bail!("unbound batch foreign contract")}}
  }
 }
 out.contract_code.functions=out.circuit_definitions.iter().map(dapen_fc_to_cfc_code_definition).collect();Ok(out)
}
