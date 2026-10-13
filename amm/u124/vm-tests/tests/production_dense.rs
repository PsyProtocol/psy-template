use anyhow::Result;
use plonky2::field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}};
use psy_vm::dpn::{vm::exec::SimpleDPNExecutor,ops::{op_types::DPNOpType,state_cmd::{data::DPNStateCmd,types::DPNStateCmdCore}}};

// Replay the real excessive-output inputs through the deployed production
// bytecode with explicit mock reads. This is VM evidence, not a state proof.
fn excessive_output_vm(output:u128)->Result<()> {
 let root=std::env::var("DENSE_MARKETS")?;
 let a:psy_compiler::output::serialize::CompilationArtifact=serde_json::from_slice(&std::fs::read(format!("{root}/amm/compiled/compilation_artifact.json"))?)?;
 let offset=|name:&str|a.abi.contract.state.iter().find(|f|f.name==name).unwrap().offset as u64;
 let pair=|n:u128|vec![F::from_canonical_u64((n% (1u128<<62))as u64),F::from_canonical_u64((n>>62)as u64)];
 let amount=5_000_000_000_000_000_000u128;
 let mut inputs=vec![F::from_canonical_u64(1866816)];inputs.extend(pair(amount));inputs.extend(pair(output));inputs.push(F::from_canonical_u64(2));
 let d=a.circuit_definitions.iter().find(|d|d.name=="swap_0").unwrap();
 let mut exec=SimpleDPNExecutor::new_with_contract_ctx(inputs,F::from_canonical_u64(490560),F::from_canonical_u64(2434),F::from_canonical_u64(16777215),F::from_canonical_u64(260000),F::ONE,[F::ZERO;4],[F::ZERO;4]);
 let mut reads=std::collections::HashMap::new();let mut arrays=std::collections::HashMap::new();
 for(i,n)in d.definitions.iter().enumerate(){
  for(j,c)in d.state_commands.iter().enumerate().filter(|(j,_)|d.state_command_resolution_indices[*j]==i){let refs:Vec<_>=c.get_inputs().into_iter().map(|id|exec.resolve_target(id).to_canonical_u64()).collect();match c.convert_to_u64(&refs){
   DPNStateCmd::GetOtherUserContractStateSlotSingle(c)=>{assert_eq!(c.user_id,1866816);let value=if c.contract_id==0{assert_eq!(c.contract_state_tree_height,32);1000100000}else{assert_eq!(c.contract_id,2434);if c.sub_slot_index==offset("kind"){1}else if c.sub_slot_index==offset("pool"){490560}else if c.sub_slot_index==offset("side"){0}else if c.sub_slot_index==offset("nonce"){2}else if c.sub_slot_index==offset("deadline"){300000}else{anyhow::bail!("unexpected order slot")}};reads.insert(j as u64,F::from_canonical_u64(value));},
   DPNStateCmd::GetOtherUserContractStateSlotRange(c)=>{let value=if c.contract_id==2431{assert_eq!(c.sub_slot_index,33554453+4*490560);amount}else{assert_eq!(c.contract_id,2434);if c.sub_slot_index==offset("x"){amount}else if c.sub_slot_index==offset("y"){100_000_000_000_000_000_000}else{anyhow::bail!("unexpected order range")}};arrays.insert(j as u64,pair(value));},
   DPNStateCmd::GetSelfUserCurrentContractStateSlotSingle(_)=>{reads.insert(j as u64,F::ZERO);},
   DPNStateCmd::GetSelfUserCurrentContractStateSlotRange(c)=>{let value=if c.sub_slot_index==offset("reserve_a"){60_000_000_000_000_000_000}else if c.sub_slot_index==offset("reserve_b"){41_687_510_421_877_605_470}else{0};arrays.insert(j as u64,pair(value));},
   DPNStateCmd::SetContractStateSlotSingle(_)|DPNStateCmd::SetContractStateSlotRange(_)=>{},
   _=>anyhow::bail!("unexpected swap command")}}
  if n.op_type==DPNOpType::GetStateCommandResultSingle{exec.push_external_target(n.index,reads[&n.inputs[0]]);}else if n.op_type==DPNOpType::GetStateCommandResultArray{exec.push_external_target_array(n.index,arrays[&n.inputs[0]].clone());}else{exec.process_var_def(n);}
 }
 for a in &d.assertions{anyhow::ensure!(exec.resolve_target(a.left)==exec.resolve_target(a.right),"{}",a.message);}
 Ok(())
}

#[tokio::test]
async fn deployed_vm_excessive_output_is_contained_and_valid_quote_reaches_slippage() {
 use psy_template_u124_markets::runtime::{contain,Failure,Progress};
 let excessive=contain(async {excessive_output_vm(100_000_000_000_000_000_000)}).await.unwrap_err();
 assert!(matches!(excessive,Failure::Panic("invalid_amount_range")),"{excessive:?}");
 assert_eq!(Progress::default().failure(&excessive)["submitted"],false);
 let valid=contain(async {excessive_output_vm(3_197_849_341_433_559_487)}).await.unwrap_err();
 assert!(matches!(&valid,Failure::Rejected(e) if e.to_string()=="slippage"),"{valid:?}");
}
#[test]
fn production_executor_runs_dense_noops_and_open_add()->Result<()> {
 let root=std::env::var("DENSE_MARKETS")?;
 for market in ["amm","orderbook","bondingcurve"] {
  let a:psy_compiler::output::serialize::CompilationArtifact=serde_json::from_slice(&std::fs::read(format!("{root}/{market}/compiled/compilation_artifact.json"))?)?;
  for name in if market=="amm"{vec!["noop","open_add"]}else if market=="bondingcurve"{vec!["noop","initialize"]}else{vec!["noop"]} {
   let d=a.circuit_definitions.iter().find(|d|d.name==name).unwrap();
   let inputs=if name=="open_add"{vec![490560,3883139815726120960,10,3883139815726120960,10,3883139815726119960,10,300000,1]}else{vec![]};
   let user=if name=="initialize"{1014848}else{506944};
   let mut exec=SimpleDPNExecutor::new_with_contract_ctx(inputs.into_iter().map(F::from_canonical_u64).collect(),F::from_canonical_u64(user),F::from_canonical_u64(if market=="bondingcurve"{2436}else{2434}),F::from_canonical_u64(16777215),F::from_canonical_u64(252000),F::ONE,[F::ZERO;4],[F::ZERO;4]);
   let mut reads=std::collections::HashMap::new();let mut arrays=std::collections::HashMap::new();let mut writes=std::collections::HashMap::new();
   for(i,n)in d.definitions.iter().enumerate(){
    for (j,c) in d.state_commands.iter().enumerate().filter(|(j,_)|d.state_command_resolution_indices[*j]==i){let refs:Vec<_>=c.get_inputs().into_iter().map(|id|exec.resolve_target(id).to_canonical_u64()).collect();match c.convert_to_u64(&refs){
     DPNStateCmd::GetSelfUserCurrentContractStateSlotSingle(_)=>{reads.insert(j as u64,F::ZERO);},
     DPNStateCmd::GetSelfUserCurrentContractStateSlotRange(c)=>{arrays.insert(j as u64,vec![F::ZERO;c.length as usize]);},
     DPNStateCmd::GetOtherUserContractStateSlotSingle(c)=>{assert_eq!(c.user_id,506944);assert_eq!(c.contract_id,0);assert_eq!(c.contract_state_tree_height,32);assert_eq!(c.sub_slot_index,3+2*user);reads.insert(j as u64,F::from_canonical_u64(1000100000));},
     DPNStateCmd::GetOtherUserContractStateSlotRange(c)=>{assert_eq!(c.user_id,506944);assert_eq!(c.contract_id,2431);assert_eq!(c.contract_state_tree_height,31);assert_eq!(c.sub_slot_index,33554453+4*user);assert_eq!(c.length,2);arrays.insert(j as u64,vec![F::from_canonical_u64(2329883889435672576),F::from_canonical_u64(6)]);},
     DPNStateCmd::SetContractStateSlotSingle(c)=>{if c.condition!=0{writes.insert(c.sub_slot_index,c.value);}},
     DPNStateCmd::SetContractStateSlotRange(c)=>{if c.condition!=0{for(k,v)in c.value.iter().enumerate(){writes.insert(c.sub_slot_index+k as u64,*v);}}},
     _=>anyhow::bail!("unexpected production command")}}
    if n.op_type==DPNOpType::GetStateCommandResultSingle {exec.push_external_target(n.index,reads[&n.inputs[0]]);}else if n.op_type==DPNOpType::GetStateCommandResultArray {let result=arrays.get(&n.inputs[0]).cloned().unwrap_or_else(||vec![reads[&n.inputs[0]]]);exec.push_external_target_array(n.index,result);}else{exec.process_var_def(n);}
   }
   for a in &d.assertions{assert_eq!(exec.resolve_target(a.left),exec.resolve_target(a.right),"{market}:{name}: {}",a.message);}
   if name=="open_add"{let offset=a.abi.contract.state.iter().find(|f|f.name=="kind").unwrap().offset as u64;assert_eq!(writes[&offset],2);}
   if name=="initialize"{let offset=a.abi.contract.state.iter().find(|f|f.name=="phase").unwrap().offset as u64;assert_eq!(writes[&offset],1);}
  }
 }
 Ok(())
}

#[test]
fn production_executor_closes_every_settled_order_with_native_32_and_token_31()->Result<()> {
 let root=std::env::var("DENSE_MARKETS")?;
 for (market,cid,pool,names) in [
  ("amm",2434,490560,vec![("close_swap_0",1,0),("close_swap_1",1,1),("close_add",2,0),("close_remove",3,0)]),
  ("orderbook",2435,1539136,vec![("close_0",1,0),("close_1",1,1)]),
  ("bondingcurve",2436,1014848,vec![("close_buy",1,0),("close_sell",2,0)])] {
  let artifact:psy_compiler::output::serialize::CompilationArtifact=serde_json::from_slice(&std::fs::read(format!("{root}/{market}/compiled/compilation_artifact.json"))?)?;
  let offset=|name:&str|artifact.abi.contract.state.iter().find(|f|f.name==name).unwrap().offset as u64;
  for(name,kind,side)in names {
   let d=artifact.circuit_definitions.iter().find(|d|d.name==name).unwrap();
   let mut exec=SimpleDPNExecutor::new_with_contract_ctx(vec![],F::from_canonical_u64(506944),F::from_canonical_u64(cid),F::from_canonical_u64(16777215),F::from_canonical_u64(260000),F::ONE,[F::ZERO;4],[F::ZERO;4]);
   let mut reads=std::collections::HashMap::new();let mut arrays=std::collections::HashMap::new();let mut writes=std::collections::HashMap::new();let amount=vec![F::from_canonical_u64(7),F::ONE];
   for(i,n)in d.definitions.iter().enumerate(){
    for(j,c)in d.state_commands.iter().enumerate().filter(|(j,_)|d.state_command_resolution_indices[*j]==i){let refs:Vec<_>=c.get_inputs().into_iter().map(|id|exec.resolve_target(id).to_canonical_u64()).collect();match c.convert_to_u64(&refs){
     DPNStateCmd::GetSelfUserCurrentContractStateSlotSingle(c)=>{let value=if c.sub_slot_index==offset("kind"){kind}else if c.sub_slot_index==offset("pool"){pool}else if c.sub_slot_index==offset("side"){side}else{anyhow::bail!("unexpected own slot")};reads.insert(j as u64,F::from_canonical_u64(value));},
     DPNStateCmd::GetSelfUserExternalContractStateSlotSingle(c)=>{let value=if c.contract_id==0{assert_eq!(c.contract_state_tree_height,32);assert_eq!(c.sub_slot_index,3+2*pool);1000100000}else{assert!([2431,2432].contains(&c.contract_id));assert_eq!(c.contract_state_tree_height,31);let first=33554453+4*pool;assert!([first,first+1].contains(&c.sub_slot_index));if c.sub_slot_index==first{7}else{1}};reads.insert(j as u64,F::from_canonical_u64(value));},
     DPNStateCmd::GetSelfUserExternalContractStateSlotRange(c)=>{assert!([2431,2432].contains(&c.contract_id));assert_eq!(c.contract_state_tree_height,31);assert_eq!(c.sub_slot_index,33554453+4*pool);assert_eq!(c.length,2);arrays.insert(j as u64,amount.clone());},
     DPNStateCmd::GetOtherUserContractStateSlotSingle(c)=>{assert_eq!(c.user_id,pool);assert_eq!(c.contract_id,cid);assert_eq!(c.contract_state_tree_height,31);reads.insert(j as u64,F::from_canonical_u64(1000100000));},
     DPNStateCmd::GetOtherUserContractStateSlotRange(c)=>{if c.contract_id==cid{assert_eq!(c.user_id,pool);}else{assert!([2431,2432].contains(&c.contract_id));assert_eq!(c.user_id,506944);assert_eq!(c.sub_slot_index,33554453+4*pool);}assert_eq!(c.contract_state_tree_height,31);assert_eq!(c.length,2);arrays.insert(j as u64,amount.clone());},
     DPNStateCmd::SetContractStateSlotSingle(c)=>{if c.condition!=0{writes.insert(c.sub_slot_index,c.value);}},
     _=>anyhow::bail!("unexpected close command")}}
    if n.op_type==DPNOpType::GetStateCommandResultSingle {exec.push_external_target(n.index,reads[&n.inputs[0]]);}else if n.op_type==DPNOpType::GetStateCommandResultArray {let result=arrays.get(&n.inputs[0]).cloned().unwrap_or_else(||vec![reads[&n.inputs[0]]]);exec.push_external_target_array(n.index,result);}else{exec.process_var_def(n);}
   }
   for a in &d.assertions{assert_eq!(exec.resolve_target(a.left),exec.resolve_target(a.right),"{market}:{name}: {}",a.message);}
   assert_eq!(writes[&offset("kind")],0);
  }
 }
 Ok(())
}
