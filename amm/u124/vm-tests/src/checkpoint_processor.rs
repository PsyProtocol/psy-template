//! Owned checkpoint-stat intrinsic lowering for undeployed processor candidates.
use anyhow::{ensure, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F, types::{Field, Field64, PrimeField64}}, hash::{hash_types::HashOut, poseidon::PoseidonHash}, plonk::config::Hasher};
use psy_client_common::traits::to_qfelts::QFeltSized;
use psy_client_data::qdata::pm_jobs_completed_stats::PMJobsCompletedStats;
use psy_vm::dpn::{ops::{op_types::{DPNBuiltInDataType as Type,DPNIndexedVarDef as Node,DPNOpType as Op,DPNAssertEqInfoIndexed},state_cmd::data::DPNStateCmd},vm::def::DPNFunctionCircuitDefinition};
pub fn lower_seed(def: &mut DPNFunctionCircuitDefinition) -> Result<()> {
    ensure!(def.name == "begin_checkpoint_batch" && def.circuit_inputs.len() == 15 && def.circuit_outputs.is_empty(), "checkpoint intrinsic exact method ABI");
    ensure!(def.assertions.iter().filter(|a|a.message == "checkpoint_seed_intrinsic").count() == 1, "one fail-closed source intrinsic required");
    ensure!(!def.state_commands.iter().any(|c|matches!(c,DPNStateCmd::GetCheckpointLeafStats(_))), "checkpoint intrinsic already lowered");
    def.assertions.retain(|a|a.message != "checkpoint_seed_intrinsic");
    let command = def.state_commands.len();
    def.state_commands.push(DPNStateCmd::get_checkpoint_leaf_stats(def.circuit_inputs[5]));
    def.state_command_resolution_indices.push(def.definitions.len());
    let array = def.definitions.iter().filter(|n|n.data_type==Type::TargetArray).map(|n|n.index+1).max().unwrap_or(0);
    def.definitions.push(Node{data_type:Type::TargetArray,index:array,op_type:Op::GetStateCommandResultArray,inputs:vec![command as u64]});
    let array_id = ((Type::TargetArray as u64)<<32)|array as u64;
    let mut next = def.definitions.iter().filter(|n|n.data_type==Type::Target).map(|n|n.index+1).max().unwrap_or(0);
    for limb in 0..4 {
        let offset = 5 + PMJobsCompletedStats::<F>::q_felt_size() + 1 + limb;
        let constant = next; next+=1;
        def.definitions.push(Node{data_type:Type::Target,index:constant,op_type:Op::Constant,inputs:vec![offset as u64]});
        let value = next; next+=1;
        def.definitions.push(Node{data_type:Type::Target,index:value,op_type:Op::TargetAt,inputs:vec![array_id,constant as u64]});
        def.assertions.push(DPNAssertEqInfoIndexed{left:def.circuit_inputs[6+limb],right:value as u64,message:"checkpoint seed limb mismatch".into()});
    }
    psy_vm::dpn::vm::validate::validate_function_definition(def)?;
    Ok(())
}
pub fn compile(source:&str,a:u64,b:u64)->Result<psy_compiler::output::serialize::ContractOutput>{
    let mut out=crate::batch_compile::compile(source,a,b,false)?;
    let mut count=0;for def in &mut out.circuit_definitions{if def.name=="begin_checkpoint_batch"{lower_seed(def)?;count+=1;}}
    ensure!(count==1,"one checkpoint batch entry required");
    out.contract_code.functions=out.circuit_definitions.iter().map(psy_vm::dpn::contract::dapen_fc_to_cfc_code_definition).collect();
    Ok(out)
}
pub fn rank(market:u64,batch:u64,root:[u64;4],seed:[u64;4],draw:u64,owners:[u64;4],nonces:[u64;4],count:usize)->Result<[u64;4]>{
    ensure!(market>0&&market<1<<24&&batch>0&&batch<1<<62&&draw>0&&draw<1<<32&&(1..=4).contains(&count),"processor rank context");
    ensure!(root.iter().chain(&seed).all(|n|*n<F::ORDER),"canonical processor hashes");
    ensure!(owners[..count].iter().all(|n|*n>0&&*n<1<<24)&&owners[..count].windows(2).all(|w|w[0]<w[1])&&nonces[..count].iter().all(|n|*n>0&&*n<1<<62),"canonical processor members");
    ensure!(owners[count..].iter().chain(&nonces[count..]).all(|n|*n==0),"canonical processor padding");
    let h=|v:[u64;4]|HashOut{elements:v.map(F::from_canonical_u64)};
    let domain=h([0x50535950524f4331,psy_config::PSY_NETWORK_MAGIC,market,batch]);
    let prefix=PoseidonHash::two_to_one(PoseidonHash::two_to_one(domain,h(root)),h(seed));
    let keys:[_;4]=std::array::from_fn(|i|PoseidonHash::two_to_one(prefix,h([owners[i],nonces[i],draw,0])).elements.map(|n|n.to_canonical_u64()));
    let mut rank=[0,1,2,3];rank[..count].sort_by_key(|i|(keys[*i as usize],owners[*i as usize],nonces[*i as usize]));Ok(rank)
}

/// Exact public planning input. The result is independently constrained by the
/// actual settlement CFC and complete SD-key; this helper cannot authorize it.
pub fn producer_order_proposal(spec:&serde_json::Value,input:&serde_json::Value)->Result<[u64;4]>{
    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Proposal { batch:String,checkpoint:String,root:[String;4],seed:[String;4],owners:[String;4],nonces:[String;4],count:usize }
    fn integer(s:&str)->Result<u64>{
        ensure!(!s.is_empty()&&(s=="0"||!s.starts_with('0'))&&s.bytes().all(|b|b.is_ascii_digit()),"canonical public rank integer");
        Ok(s.parse()?)
    }
    fn array(v:&[String;4])->Result<[u64;4]>{Ok(v.iter().map(|s|integer(s)).collect::<Result<Vec<_>>>()?.try_into().unwrap())}
    crate::processor_policy::validate(spec)?;
    ensure!(crate::processor_policy::previous(spec),"producer order requires explicit v4 profile");
    let v:Proposal=serde_json::from_value(input.clone())?;
    ensure!((2..=4).contains(&v.count),"producer batch requires two to four members");
    rank(spec["market_id"].as_u64().unwrap(),integer(&v.batch)?,array(&v.root)?,array(&v.seed)?,integer(&v.checkpoint)?,array(&v.owners)?,array(&v.nonces)?,v.count)
}

pub fn lower_stream_seed(def: &mut DPNFunctionCircuitDefinition) -> Result<()> {
    ensure!(def.name == "begin_order_page" && [9,10].contains(&def.circuit_inputs.len()) && def.circuit_outputs.is_empty(), "checkpoint intrinsic exact method ABI");
    ensure!(def.assertions.iter().filter(|a|a.message == "stream_seed_intrinsic").count() == 1, "one fail-closed source intrinsic required");
    ensure!(!def.state_commands.iter().any(|c|matches!(c,DPNStateCmd::GetCheckpointLeafStats(_))), "checkpoint intrinsic already lowered");
    def.assertions.retain(|a|a.message != "stream_seed_intrinsic");
    let command = def.state_commands.len();
    def.state_commands.push(DPNStateCmd::get_checkpoint_leaf_stats(def.circuit_inputs[4]));
    def.state_command_resolution_indices.push(def.definitions.len());
    let array = def.definitions.iter().filter(|n|n.data_type==Type::TargetArray).map(|n|n.index+1).max().unwrap_or(0);
    def.definitions.push(Node{data_type:Type::TargetArray,index:array,op_type:Op::GetStateCommandResultArray,inputs:vec![command as u64]});
    let array_id = ((Type::TargetArray as u64)<<32)|array as u64;
    let mut next = def.definitions.iter().filter(|n|n.data_type==Type::Target).map(|n|n.index+1).max().unwrap_or(0);
    for limb in 0..4 {
        let offset = 5 + PMJobsCompletedStats::<F>::q_felt_size() + 1 + limb;
        let constant = next; next+=1;
        def.definitions.push(Node{data_type:Type::Target,index:constant,op_type:Op::Constant,inputs:vec![offset as u64]});
        let value = next; next+=1;
        def.definitions.push(Node{data_type:Type::Target,index:value,op_type:Op::TargetAt,inputs:vec![array_id,constant as u64]});
        def.assertions.push(DPNAssertEqInfoIndexed{left:def.circuit_inputs[5+limb],right:value as u64,message:"checkpoint seed limb mismatch".into()});
    }
    psy_vm::dpn::vm::validate::validate_function_definition(def)?;
    Ok(())
}
pub fn compile_random_stream(source:&str,a:u64,b:u64)->Result<psy_compiler::output::serialize::ContractOutput>{
 let mut out=crate::batch_compile::compile(source,a,b,false)?;let mut n=0;for d in &mut out.circuit_definitions{if d.name=="begin_order_page"{lower_stream_seed(d)?;n+=1;}}ensure!(n==1,"one random stream entry required");out.contract_code.functions=out.circuit_definitions.iter().map(psy_vm::dpn::contract::dapen_fc_to_cfc_code_definition).collect();Ok(out)
}
