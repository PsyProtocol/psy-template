//! Lower only close-method self Token ranges into two transaction-local single
//! reads. Preserve the ABI/layout and array ID; its low getter now has length 1,
//! and all constant-index high getters are redirected to the second read.
use anyhow::{bail, ensure, Context, Result};
use std::collections::HashMap;
use psy_vm::dpn::{
    ops::{op_types::{DPNBuiltInDataType as Type,DPNIndexedVarDef as Node,DPNOpType as Op},
        state_cmd::{data::{DPNStateCmd as Cmd,DPNStateCmdGetSelfUserExternalContractStateSlotSingle as Single,DPNStateCmdGetSelfUserCurrentContractStateSlotSingle as CurrentSingle,DPNStateCmdGetOtherUserContractStateSlotSingle as OtherSingle},types::DPNStateCmdCore}},
    vm::def::DPNFunctionCircuitDefinition as Def,
};
fn reference(id:u64,map:&HashMap<u64,u64>)->Result<u64>{
    if id>>32==0 {map.get(&id).copied().with_context(||format!("Felt {id} used before definition"))}else{Ok(id)}
}
fn push(out:&mut Vec<Node>,next:&mut usize,op:Op,inputs:Vec<u64>)->u64{
    let id=*next as u64;out.push(Node{data_type:Type::Target,index:*next,op_type:op,inputs});*next+=1;id
}
pub(crate) fn lower_close_ranges(def:&mut Def)->Result<()> {
    lower_ranges(def,false)
}
pub(crate) fn lower_batch_ranges(def:&mut Def)->Result<()> {
    lower_ranges(def,true)
}
fn lower_ranges(def:&mut Def,batch:bool)->Result<()> {
    let is_pair=|c:&Cmd<u64>|match c{Cmd::GetSelfUserExternalContractStateSlotRange(c)=>{!batch||c.length==2},Cmd::GetSelfUserCurrentContractStateSlotRange(c)if batch=>c.length==2,Cmd::GetOtherUserContractStateSlotRange(c)if batch=>c.length==2,_=>false};
    let ranges=def.state_commands.iter().filter(|c|is_pair(c)).count();
    if ranges==0{return Ok(());}
    ensure!(batch||def.name.starts_with("close_"),"self Token range lowering is limited to close methods");
    ensure!(def.state_commands.len()==def.state_command_resolution_indices.len(),"resolution index count");
    let mut command_map=Vec::new();let mut count=0usize;
    for c in &def.state_commands {
        let high=if is_pair(c){if let Cmd::GetSelfUserExternalContractStateSlotRange(c)=c{ensure!(c.length==2,"only two-limb self reads supported");}Some(count+1)}else{None};
        command_map.push((count,high));count+=if high.is_some(){2}else{1};
    }
    let constants:HashMap<u64,u64>=def.definitions.iter().filter(|n|n.data_type==Type::Target&&n.op_type==Op::Constant).map(|n|(n.index as u64,n.inputs[0])).collect();
    let mut out=Vec::new();let mut next=0usize;let zero=push(&mut out,&mut next,Op::Constant,vec![0]);
    let mut targets=HashMap::new();let mut high_arrays=HashMap::new();
    let mut commands:Vec<Option<Cmd<u64>>>=vec![None;count];let mut indices=vec![0usize;count];
    for (i,original) in def.definitions.iter().enumerate(){
        let reads:Vec<_>=def.state_command_resolution_indices.iter().enumerate().filter_map(|(j,pos)|(*pos==i).then_some(j)).collect();
        for &j in &reads {
            let (low,high)=command_map[j];let original=&def.state_commands[j];
            if high.is_some(){
                let base=reference(match original{Cmd::GetSelfUserExternalContractStateSlotRange(c)=>c.sub_slot_index,Cmd::GetSelfUserCurrentContractStateSlotRange(c)=>c.sub_slot_index,Cmd::GetOtherUserContractStateSlotRange(c)=>c.sub_slot_index,_=>unreachable!()},&targets)?;
                let one=push(&mut out,&mut next,Op::Constant,vec![1]);let upper=push(&mut out,&mut next,Op::Add,vec![base,one]);
                for(index,offset)in[(low,base),(high.unwrap(),upper)]{
                    commands[index]=Some(match original{
                        Cmd::GetSelfUserExternalContractStateSlotRange(c)=>Cmd::GetSelfUserExternalContractStateSlotSingle(Single::new(reference(c.contract_id,&targets)?,reference(c.contract_state_tree_height,&targets)?,offset)),
                        Cmd::GetSelfUserCurrentContractStateSlotRange(_)=>Cmd::GetSelfUserCurrentContractStateSlotSingle(CurrentSingle::new(offset)),
                        Cmd::GetOtherUserContractStateSlotRange(c)=>Cmd::GetOtherUserContractStateSlotSingle(OtherSingle::new(reference(c.user_id,&targets)?,reference(c.contract_id,&targets)?,reference(c.contract_state_tree_height,&targets)?,offset)),
                        _=>unreachable!(),
                    });
                }
            }else{
                let refs=original.get_inputs().into_iter().map(|id|reference(id,&targets)).collect::<Result<Vec<_>>>()?;
                commands[low]=Some(original.convert_to_u64(&refs));
            }
        }
        for j in reads{let(low,high)=command_map[j];indices[low]=out.len();if let Some(h)=high{indices[h]=out.len();}}
        let mut node=original.clone();
        if node.op_type==Op::GetStateCommandResultArray {
            let old=node.inputs[0] as usize;let (low,high)=*command_map.get(old).context("state command ID")?;
            if let Some(high)=high {
                ensure!(node.data_type==Type::TargetArray,"expected target array");
                let high_target=push(&mut out,&mut next,Op::GetStateCommandResultSingle,vec![high as u64]);
                high_arrays.insert(((node.data_type as u64)<<32)|node.index as u64,high_target);
            }
            node.inputs[0]=low as u64;
        }else if node.op_type==Op::GetStateCommandResultSingle||(batch&&node.op_type==Op::GetStateCommandResultHash){
            node.inputs[0]=command_map.get(node.inputs[0] as usize).context("state command ID")?.0 as u64;
        }else if node.op_type==Op::TargetAt&&high_arrays.contains_key(&node.inputs[0]){
            let index=*constants.get(&node.inputs[1]).context("self amount array index must be constant")?;
            ensure!(index<=1,"self amount index outside pair");
            if index==1 {node.op_type=Op::Add;node.inputs=vec![high_arrays[&node.inputs[0]],zero];}
            else {node.inputs[1]=reference(node.inputs[1],&targets)?;}
        }else{
            match node.op_type as u16 {
                0|1|2|3|46|47|48=>{},
                // Hash context getter has no Felt references. Preserve its
                // ignored zero payload while scalarizing two-limb reads.
                50 if batch=>{ensure!(node.inputs.iter().all(|x|*x==0),"unexpected key-context literal payload");},
                18=>{for id in &mut node.inputs[1..]{ensure!(!high_arrays.contains_key(id),"unsupported whole self array use");*id=reference(*id,&targets)?;}},
                4|5|6|7|8|9|10|13|14|15|20|23=>{for id in &mut node.inputs{ensure!(!high_arrays.contains_key(id),"unsupported whole self array use");*id=reference(*id,&targets)?;}},
                16|17|21|22|78 if batch=>{for id in &mut node.inputs{ensure!(!high_arrays.contains_key(id),"unsupported whole self array use");*id=reference(*id,&targets)?;}},
                _=>bail!("unsupported range lowering opcode {:?}",node.op_type),
            }
        }
        if node.data_type==Type::Target{targets.insert(original.index as u64,next as u64);node.index=next;next+=1;}
        out.push(node);
    }
    for id in def.circuit_inputs.iter_mut().chain(def.circuit_outputs.iter_mut()){ensure!(!high_arrays.contains_key(id),"whole self array I/O unsupported");*id=reference(*id,&targets)?;}
    for a in &mut def.assertions{a.left=reference(a.left,&targets)?;a.right=reference(a.right,&targets)?;}
    def.state_commands=commands.into_iter().map(|c|c.context("unresolved state command")).collect::<Result<Vec<_>>>()?;
    def.state_command_resolution_indices=indices;def.definitions=out;
    Ok(())
}
