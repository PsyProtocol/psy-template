//! Application compiler for NFT v3 (height 30), U124 FT (31), native fee (32).
//! Foreign views use scalar reads; no foreign ABI/layout changes are performed.
use anyhow::{ensure,bail,Result};
use psy_compiler::output::serialize::ContractOutput;
use psy_vm::dpn::{contract::dapen_fc_to_cfc_code_definition,ops::state_cmd::data::DPNStateCmd};
pub fn compile(source:&str,nft:u64,token:u64)->Result<ContractOutput>{
 ensure!(nft>=5&&token>=5&&nft!=token,"distinct NFT/FT contracts required");
 let mut out=psy_compiler::compile(source)?;
 ensure!(out.state_tree_height()==31,"market height must be 31");
 super::layout_preflight::verify_abi_layout(&out.abi_to_json()?)?;
 for def in &mut out.circuit_definitions {
  // The typed scalar accessor retains TargetAt(single, 0). The VM permits
  // this scalar-as-array shorthand. Use an equivalent scalar operation;
  // this does not fix the read/write root conflict or change its fingerprint.
  let constants:std::collections::HashMap<u64,u64>=def.definitions.iter().filter(|n|n.data_type==psy_vm::dpn::ops::op_types::DPNBuiltInDataType::Target&&n.op_type==psy_vm::dpn::ops::op_types::DPNOpType::Constant).map(|n|(n.index as u64,n.inputs[0])).collect();
  for n in &mut def.definitions {
   if n.op_type==psy_vm::dpn::ops::op_types::DPNOpType::TargetAt&&n.inputs[0]>>32==0{
    ensure!(constants.get(&n.inputs[1])==Some(&0),"scalar TargetAt must use index zero");
    n.op_type=psy_vm::dpn::ops::op_types::DPNOpType::Add;
   }
  }
  super::prepend_height(def,32)?;
  super::prepend_height(def,30)?;
  let mut constants=std::collections::HashMap::new();let mut current=None;
  for node in &def.definitions {let v=serde_json::to_value(node)?;if v["data_type"]==0&&v["op_type"]==1{constants.insert(v["index"].as_u64().unwrap(),v["inputs"][0].as_u64().unwrap());}if v["data_type"]==0&&v["op_type"]==47{current=v["index"].as_u64();}}
  for cmd in &mut def.state_commands {
   let foreign=match cmd{
    DPNStateCmd::GetOtherUserContractStateSlotRange(c)=>Some((c.contract_id,&mut c.contract_state_tree_height,c.length)),
    DPNStateCmd::GetOtherUserContractStateSlotSingle(c)=>Some((c.contract_id,&mut c.contract_state_tree_height,1)),
    DPNStateCmd::GetSelfUserExternalContractStateSlotRange(c)=>Some((c.contract_id,&mut c.contract_state_tree_height,c.length)),
    DPNStateCmd::GetSelfUserExternalContractStateSlotSingle(c)=>Some((c.contract_id,&mut c.contract_state_tree_height,1)),_=>None};
   if let Some((cid,height,length))=foreign{
    ensure!(length==1 || (Some(cid)==current&&length==2),"NFT/FT reads must be scalar; market price may be a pair");
    ensure!(constants.get(height)==Some(&31),"unexpected unresolved height");
    match constants.get(&cid).copied(){Some(0)=>*height=1,Some(id)if id==nft=>*height=0,Some(id)if id==token=>{},_ if Some(cid)==current=>{},_=>bail!("unknown foreign contract in {}",def.name)}
   }
  }
 }
 out.contract_code.functions=out.circuit_definitions.iter().map(dapen_fc_to_cfc_code_definition).collect();Ok(out)
}
