pub mod registration_checkpoint;
pub mod market_key;
pub mod proof_binding;
pub mod batch_compile;
pub mod batch_policy;
pub mod submission_guard;
pub mod policy;
pub mod runtime;
pub mod prover_resources;
pub mod wallet_driver;
pub mod nft_market;
pub mod layout_preflight;
mod ranges;
// The application build resolves foreign token ABIs without changing Node/compiler.
use anyhow::{bail,ensure,Result};
use psy_compiler::output::serialize::ContractOutput;
use psy_vm::dpn::{contract::dapen_fc_to_cfc_code_definition,ops::{state_cmd::{data::DPNStateCmd,types::DPNStateCmdCore},op_types::{DPNBuiltInDataType,DPNIndexedVarDef,DPNOpType}},vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
// Insert immutable height resources after the complete input prefix. Preserve
// input positions, typed lanes, literal operands and state resolution timing.
fn prepend_height(def:&mut DPNFunctionCircuitDefinition,height:u64)->Result<u64> {
 let prefix=def.definitions.iter().take_while(|n|matches!(n.op_type,DPNOpType::InputTarget|DPNOpType::U32InputTarget|DPNOpType::BoolInputTarget)).count();
 ensure!(def.definitions[..prefix].iter().all(|n|n.data_type==DPNBuiltInDataType::Target),"market input lanes must be Felt");
 let height_index=prefix as u64;let felt_ref=|id:u64|if id>>32==0 && id>=height_index{id+1}else{id};
 for n in &mut def.definitions {
  if n.data_type==DPNBuiltInDataType::Target && n.index as u64>=height_index{n.index+=1;}
  match n.op_type as u16 {
   // GetUserPublicKeyHash (50) produces a Hash context value and consumes
   // no Felt references. Preserve its index and inputs when adding a Felt.
   0|1|2|3|46|47|48|50|53|54|55=>{},
   18=>{for id in &mut n.inputs[1..]{*id=felt_ref(*id);}},
   4|5|6|7|8|9|10|13|14|15|16|17|20|21|22|23|78=>{for id in &mut n.inputs{*id=felt_ref(*id);}},
   _=>bail!("unsupported rebase opcode {:?} in {}",n.op_type,def.name),
  }
 }
 for id in def.circuit_inputs.iter_mut().chain(def.circuit_outputs.iter_mut()){*id=felt_ref(*id);}
 for a in &mut def.assertions{a.left=felt_ref(a.left);a.right=felt_ref(a.right);}
 for cmd in &mut def.state_commands{let refs:Vec<_>=cmd.get_inputs().into_iter().map(felt_ref).collect();*cmd=cmd.convert_to_u64(&refs);}
 ensure!(def.events.is_empty(),"market event rebase not implemented");
 for index in &mut def.state_command_resolution_indices{ensure!(*index>=prefix,"state command inside input prefix");*index+=1;}
 def.definitions.insert(prefix,DPNIndexedVarDef{data_type:DPNBuiltInDataType::Target,index:height_index as usize,op_type:DPNOpType::Constant,inputs:vec![height]});
 let mut next=0;for n in &def.definitions{if n.data_type==DPNBuiltInDataType::Target{ensure!(n.index==next,"non-dense Felt definition in {}",def.name);next+=1;}}
 Ok(height_index)
}
fn prepend_native_height(def:&mut DPNFunctionCircuitDefinition)->Result<u64> { prepend_height(def,32) }
pub fn compile_market(source:&str,a:u64,b:u64)->Result<ContractOutput>{
 ensure!(a>=5 && b>=5 && a!=b,"two distinct U124 asset IDs required");
 let mut out=psy_compiler::compile(source)?;
 ensure!(out.state_tree_height()==31,"market layout height must be 31");
 for def in &mut out.circuit_definitions {
  ranges::lower_close_ranges(def)?;
  let native_height=prepend_native_height(def)?;
  let mut constants=std::collections::HashMap::new();
  let mut current=None;
  for node in &def.definitions {let v=serde_json::to_value(node)?;if v["data_type"]==0 && v["op_type"]==1 {constants.insert(v["index"].as_u64().unwrap(),v["inputs"][0].as_u64().unwrap());}if v["data_type"]==0&&v["op_type"]==47{current=v["index"].as_u64();}}
  // Two-limb self reads are lowered to transaction-local single readers. This
  // avoids the frozen SDK's range cache key mismatch without changing Node or
  // replacing current-session reads with an UPS-start foreign-user snapshot.
  for (_i,cmd) in def.state_commands.iter_mut().enumerate(){let foreign=match cmd { DPNStateCmd::GetOtherUserContractStateSlotRange(c)=>Some((c.contract_id, &mut c.contract_state_tree_height,c.length)), DPNStateCmd::GetOtherUserContractStateSlotSingle(c)=>Some((c.contract_id, &mut c.contract_state_tree_height,1)), DPNStateCmd::GetSelfUserExternalContractStateSlotRange(c)=>Some((c.contract_id, &mut c.contract_state_tree_height,c.length)), DPNStateCmd::GetSelfUserExternalContractStateSlotSingle(c)=>Some((c.contract_id, &mut c.contract_state_tree_height,1)),_=>None}; if let Some((contract_id,height,length))=foreign {
   ensure!(constants.get(height)==Some(&31),"unexpected unresolved read height");
   match constants.get(&contract_id).copied(){Some(0)=>{*height=native_height;ensure!(length==1,"PSY read must be one Felt");},Some(id) if id==a||id==b=>ensure!(length==2||(length==1&&def.name.starts_with("close_")),"U124 read must contain both limbs"),_ if Some(contract_id)==current=>{},_=>bail!("unrecognized foreign contract in {}",def.name)}
  }else {let v:Value=serde_json::to_value(&*cmd)?;ensure!(!v["type"].as_str().unwrap().starts_with("GetOtherUserContract") && !v["type"].as_str().unwrap().starts_with("GetSelfUserExternalContract"),"unsupported foreign read shape");}}
 }
 out.contract_code.functions=out.circuit_definitions.iter().map(dapen_fc_to_cfc_code_definition).collect();
 Ok(out)
}

pub mod batch_compact;
pub mod composition_policy;

pub mod live_guard;
pub mod guard_reads;
pub mod live_rpc;

#[cfg(test)]
mod context_rebase_tests {
 use super::*;
 use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
 use plonky2::field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}};
 use psy_vm::dpn::vm::exec::SimpleDPNExecutor;

 #[test]
 fn prepended_height_preserves_authenticated_key_and_rejects_each_wrong_limb()->Result<()> {
  let source=r#"
#[contract]
pub struct KeyProbe { pub remembered: Hash, pub owner: Felt }
#[contract_implementation]
impl KeyProbe {
 #[contract_method]
 pub fn remember(&mut self, ctx: &mut ChainContext, expected: Hash) {
  let actual: Hash = ctx.user_public_key;
  require(actual[0] == expected[0] && actual[1] == expected[1] && actual[2] == expected[2] && actual[3] == expected[3], "key mismatch");
  self.remembered = actual; self.owner = ctx.user_id;
 }

}
"#;
  let out=psy_compiler::compile(source)?;
  let original=out.circuit_definitions.iter().find(|d|d.name=="remember").unwrap();
  let key=original.definitions.iter().find(|n|n.op_type==DPNOpType::GetUserPublicKeyHash).unwrap();
  // The frozen serializer may retain a zero placeholder. The execution opcode
  // ignores it; it is not a reference to Felt target zero.
  ensure!(key.inputs.iter().all(|x|*x==0),"unexpected context literal payload: {:?}",key);
  let mut rebased=original.clone();let height_index=prepend_height(&mut rebased,32)?;
  psy_vm::dpn::vm::validate::validate_function_definition(&rebased)?;
  ensure!(rebased.circuit_inputs==original.circuit_inputs,"height insertion changed ABI input references");
  ensure!(height_index==original.definitions.iter().take_while(|n|n.op_type==DPNOpType::InputTarget).count() as u64,"height must follow input prefix");
  let after=rebased.definitions.iter().find(|n|n.op_type==DPNOpType::GetUserPublicKeyHash).unwrap();
  ensure!(after.index==key.index&&after.data_type==key.data_type&&after.inputs==key.inputs,"Hash context changed");
  // Use the SDK's proving-path primitive executor. Its lightweight VmExecutor
  // oracle does not materialize all four context-hash components.
  let eval=|def:&DPNFunctionCircuitDefinition,input:&[u64]|{
   let f=F::from_canonical_u64;
   let mut vm=SimpleDPNExecutor::new_with_contract_ctx(input.iter().copied().map(f).collect(),f(200),f(1000),f(DEFAULT_CALLER_CONTRACT_ID_U64),f(100),f(1),[11,22,33,44].map(f),[F::ZERO;4]);
   for op in &def.definitions{vm.process_var_def(op);}
   let success=def.assertions.iter().all(|a|vm.resolve_target(a.left)==vm.resolve_target(a.right));
   let writes=def.state_commands.iter().map(|c|c.get_inputs().into_iter().map(|id|vm.resolve_target(id).to_canonical_u64()).collect::<Vec<_>>()).collect::<Vec<_>>();
   (success,writes)
  };
  let reference=eval(original,&[11,22,33,44]);let transformed=eval(&rebased,&[11,22,33,44]);
  ensure!(reference.0&&transformed.0,"reference/rebased key check");
  ensure!(reference.1==transformed.1&&!transformed.1.is_empty(),"rebase changed resolved state writes");
  for limb in 0..4 {
   let mut wrong=[11,22,33,44];wrong[limb]+=1;
   for def in [original,&rebased] {
    ensure!(!eval(def,&wrong).0,"wrong key limb {limb} accepted");
   }
  }
  Ok(())
 }

 #[test]
 fn range_lowering_preserves_key_context_payload()->Result<()> {
  let source=r#"
#[contract]
pub struct LowerKeyProbe { pub remembered: Hash, pub values: [Felt;2] }
#[contract_implementation]
impl LowerKeyProbe {
 #[contract_method]
 pub fn remember(&mut self, ctx: &mut ChainContext, expected: Hash) {
  let values = self.values;
  let actual: Hash = ctx.user_public_key;
  require(actual[0] == expected[0] && actual[1] == expected[1] && actual[2] == expected[2] && actual[3] == expected[3], "key mismatch");
  self.values = [values[1], values[0]]; self.remembered = actual;
 }
}
"#;
  let out=psy_compiler::compile(source)?;
  let original=&out.circuit_definitions[0];
  let mut lowered=original.clone();ranges::lower_batch_ranges(&mut lowered)?;
  psy_vm::dpn::vm::validate::validate_function_definition(&lowered)?;
  ensure!(lowered.circuit_inputs==original.circuit_inputs,"range lowering changed ABI inputs");
  let before=original.definitions.iter().find(|n|n.op_type==DPNOpType::GetUserPublicKeyHash).unwrap();
  let after=lowered.definitions.iter().find(|n|n.op_type==DPNOpType::GetUserPublicKeyHash).unwrap();
  ensure!(before.data_type==after.data_type&&before.index==after.index&&before.inputs==after.inputs,"range lowering changed Hash context");
  Ok(())
 }
}

pub mod fixed_verifier;

pub mod wallet_verification;
pub mod wallet_verifier_export;

pub mod contract_layout;

// Standalone candidate permutation constraints, not a qualified beacon or UPS.
pub mod random_order;

pub mod seal_inclusion;
pub mod seal_inclusion_circuit;
pub mod seal_order;
pub mod checkpoint_evidence;
pub mod scoped_order;
