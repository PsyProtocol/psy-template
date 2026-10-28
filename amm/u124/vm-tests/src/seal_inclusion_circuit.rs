//! Conditional historical state-opening circuit. The checkpoint root is an
//! explicit public input, NOT a consensus/finality or beacon certificate.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::{hash_types::{HashOutTarget},poseidon::PoseidonHash as H},iop::{target::Target,witness::{PartialWitness,WitnessWrite}},plonk::{circuit_builder::CircuitBuilder,circuit_data::{CircuitConfig,CircuitData},config::PoseidonGoldilocksConfig as C,proof::ProofWithPublicInputs}};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_common_circuit::{builder::hash::core::CircuitBuilderHashCore,hash::merkle::gadgets::merkle_proof::MerkleProofGadget,traits::CreatableTarget,u32::multiple_comparison::list_lte_circuit};
use psy_network_circuit::gadgets::qdata::{checkpoint::PsyCheckpointLeafGadget,checkpoint_state_roots::PsyCheckpointGlobalStateRootsGadget,user::PsyUserLeafGadget,contract::PsyContractLeafGadget};
use psy_config::network_constants::{CHECKPOINT_TREE_HEIGHT,GLOBAL_USER_TREE_HEIGHT,GLOBAL_CONTRACT_TREE_HEIGHT};
use crate::{random_order::{constrain_frozen_statement,frozen_root,validate_fields,FIELDS},seal_inclusion::{SealLayout,SealOpening}};
fn f(n:u64)->F{F::from_canonical_u64(n)}
fn hash_slice(v:&[Target])->HashOutTarget{HashOutTarget{elements:v.try_into().unwrap()}}
fn less(b:&mut CircuitBuilder<F,2>,a:Target,c:Target){let le=list_lte_circuit(b,vec![a],vec![c],32);b.assert_one(le.target);let eq=b.is_equal(a,c);b.assert_zero(eq.target);}
fn connect_member(b:&mut CircuitBuilder<F,2>,proof:&MerkleProofGadget,root:HashOutTarget,index:Target,value:HashOutTarget){b.connect_hashes(proof.root,root);b.connect(proof.index,index);b.connect_hashes(proof.value,value);}
pub(crate) struct Openings{
 genesis:PsyCheckpointLeafGadget,checkpoint:PsyCheckpointLeafGadget,roots:PsyCheckpointGlobalStateRootsGadget,user:PsyUserLeafGadget,contract:PsyContractLeafGadget,
 genesis_path:MerkleProofGadget,checkpoint_path:MerkleProofGadget,user_path:MerkleProofGadget,contract_path:MerkleProofGadget,user_contract_path:MerkleProofGadget,words:Vec<MerkleProofGadget>,key_param:HashOutTarget,
}
impl Openings{
 pub(crate) fn create(b:&mut CircuitBuilder<F,2>,layout:SealLayout)->Result<Self>{Ok(Self{
  genesis:PsyCheckpointLeafGadget::create_virtual(b),checkpoint:PsyCheckpointLeafGadget::create_virtual(b),roots:PsyCheckpointGlobalStateRootsGadget::create_virtual(b),user:PsyUserLeafGadget::create_virtual(b),contract:PsyContractLeafGadget::create_virtual(b),
  genesis_path:MerkleProofGadget::add_virtual_to::<H,F,2>(b,CHECKPOINT_TREE_HEIGHT as usize),checkpoint_path:MerkleProofGadget::add_virtual_to::<H,F,2>(b,CHECKPOINT_TREE_HEIGHT as usize),user_path:MerkleProofGadget::add_virtual_to::<H,F,2>(b,GLOBAL_USER_TREE_HEIGHT as usize),contract_path:MerkleProofGadget::add_virtual_to::<H,F,2>(b,GLOBAL_CONTRACT_TREE_HEIGHT as usize),user_contract_path:MerkleProofGadget::add_virtual_to::<H,F,2>(b,GLOBAL_CONTRACT_TREE_HEIGHT as usize),words:layout.word_indices()?.iter().map(|_|MerkleProofGadget::add_virtual_to::<H,F,2>(b,layout.height as usize)).collect(),key_param:b.add_virtual_hash(),
 })}
 pub(crate) fn set(&self,pw:&mut PartialWitness<F>,p:&SealOpening)->Result<()>{
  ensure!(self.words.len()==p.root_words.len(),"exact stored-root word count");self.genesis.set_witness(pw,&p.chain_anchor_leaf)?;self.checkpoint.set_witness(pw,&p.checkpoint_leaf)?;self.roots.set_witness(pw,&p.state_roots)?;self.user.set_witness(pw,&p.user_leaf)?;self.contract.set_witness(pw,&p.contract_leaf)?;pw.set_hash_target(self.key_param,p.key_public_param.0)?;
  for(g,v)in [(&self.genesis_path,&p.chain_anchor_proof),(&self.checkpoint_path,&p.checkpoint_proof),(&self.user_path,&p.user_proof),(&self.contract_path,&p.contract_proof),(&self.user_contract_path,&p.user_contract_proof)]{ensure!(g.siblings.len()==v.siblings.len()&&v.index<(1u64<<g.siblings.len()),"exact Merkle witness shape");g.set_witness_core_proof_q(pw,v)?;}
  for(g,v)in self.words.iter().zip(&p.root_words){ensure!(g.siblings.len()==v.siblings.len()&&v.index<(1u64<<g.siblings.len()),"exact Merkle witness shape");g.set_witness_core_proof_q(pw,v)?;}Ok(())
 }
}
pub(crate) fn bind_checkpoint(b:&mut CircuitBuilder<F,2>,v:&[Target;FIELDS],root:HashOutTarget,cp:Target,o:&Openings){
 let one=b.one();let genesis=o.genesis.to_hash::<H,F,2>(b);connect_member(b,&o.genesis_path,root,one,genesis);b.connect_hashes(o.genesis.global_chain_root,hash_slice(&v[18..22]));
 let leaf=o.checkpoint.to_hash::<H,F,2>(b);connect_member(b,&o.checkpoint_path,root,cp,leaf);let state=o.roots.to_hash::<H,F,2>(b);b.connect_hashes(state,o.checkpoint.global_chain_root);
 b.range_check(cp,32);less(b,v[6],cp);let end=list_lte_circuit(b,vec![cp],vec![v[7]],32);b.assert_one(end.target);less(b,cp,v[8]);
}
pub(crate) fn bind_account(b:&mut CircuitBuilder<F,2>,v:&[Target;FIELDS],cp:Target,o:&Openings){
 let leaf=o.user.to_hash::<H,F,2>(b);connect_member(b,&o.user_path,o.roots.user_tree_root,v[4],leaf);b.connect(o.user.user_id,v[4]);b.connect_hashes(o.user.public_key,hash_slice(&v[38..42]));
 let key=b.hash_two_to_one::<H>(hash_slice(&v[34..38]),o.key_param);b.connect_hashes(key,o.user.public_key);
 b.range_check(o.user.nonce,62);let zero=b.zero();let eq=b.is_equal(o.user.nonce,zero);b.assert_zero(eq.target);b.range_check(o.user.last_checkpoint_id,32);let le=list_lte_circuit(b,vec![o.user.last_checkpoint_id],vec![cp],32);b.assert_one(le.target);
 b.connect_hashes(o.user_contract_path.root,o.user.user_state_tree_root);b.connect(o.user_contract_path.index,v[3]);
}
pub(crate) fn bind_contract(b:&mut CircuitBuilder<F,2>,v:&[Target;FIELDS],layout:SealLayout,o:&Openings){
 let leaf=o.contract.to_hash::<H,F,2>(b);connect_member(b,&o.contract_path,o.roots.contract_tree_root,v[3],leaf);
 b.connect_hashes(o.contract.code_root,hash_slice(&v[22..26]));b.connect_hashes(o.contract.state_layout_root,hash_slice(&v[26..30]));b.connect_hashes(o.contract.function_tree_root,hash_slice(&v[30..34]));
 for(target,value)in[(o.contract.state_tree_height,layout.height as u64),(o.contract.state_layout_field_count,layout.fields),(o.contract.state_layout_slot_count,layout.slots)]{let expected=b.constant(f(value));b.connect(target,expected);}
}
pub(crate) fn bind_stored_root(b:&mut CircuitBuilder<F,2>,root:HashOutTarget,layout:SealLayout,o:&Openings)->Result<()>{
 for(proof,index)in o.words.iter().zip(layout.word_indices()?){b.connect_hashes(proof.root,o.user_contract_path.value);let expected=b.constant(f(index));b.connect(proof.index,expected);}
 for i in 0..4{let slot=layout.root_slot+i as u64;let word=&o.words[(slot/4-layout.root_slot/4)as usize];b.connect(word.value.elements[(slot%4)as usize],root.elements[i]);}Ok(())
}
pub struct SealCircuit{pub data:CircuitData<F,C,2>,fields:[Target;FIELDS],checkpoint_root:HashOutTarget,checkpoint:Target,opening:Openings}
impl SealCircuit{
 pub fn build(layout:SealLayout)->Result<Self>{
  layout.validate()?;let mut b=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());let fields:[Target;FIELDS]=b.add_virtual_targets(FIELDS).try_into().unwrap();let checkpoint_root=b.add_virtual_hash();let checkpoint=b.add_virtual_target();
  let(root,_)=constrain_frozen_statement(&mut b,&fields);let opening=Openings::create(&mut b,layout)?;
  bind_checkpoint(&mut b,&fields,checkpoint_root,checkpoint,&opening);bind_account(&mut b,&fields,checkpoint,&opening);bind_contract(&mut b,&fields,layout,&opening);bind_stored_root(&mut b,root,layout,&opening)?;
  let zero=b.zero();let mut empty=b._true();for x in checkpoint_root.elements{let eq=b.is_equal(x,zero);empty=b.and(empty,eq);}b.assert_zero(empty.target);
  b.register_public_inputs(&root.elements);b.register_public_inputs(&checkpoint_root.elements);b.register_public_input(checkpoint);
  Ok(Self{data:b.build::<C>(),fields,checkpoint_root,checkpoint,opening})
 }
 pub fn prove(&self,v:[u64;FIELDS],root:Q<F>,p:&SealOpening)->Result<ProofWithPublicInputs<F,C,2>>{
  validate_fields(&v)?;ensure!(p.schema==1&&p.checkpoint_id<=u32::MAX as u64,"canonical seal schema/checkpoint");let mut pw=PartialWitness::new();for(t,n)in self.fields.iter().zip(v){pw.set_target(*t,f(n))?;}pw.set_hash_target(self.checkpoint_root,root.0)?;pw.set_target(self.checkpoint,f(p.checkpoint_id))?;self.opening.set(&mut pw,p)?;Ok(self.data.prove(pw)?)
 }
 pub fn verify_for(&self,v:[u64;FIELDS],root:Q<F>,cp:u64,proof:ProofWithPublicInputs<F,C,2>)->Result<()>{
  validate_fields(&v)?;ensure!(cp>v[6]&&cp<=v[7]&&cp<v[8]&&root!=Q::ZERO,"pre-draw checkpoint/root bound");let mut expected=frozen_root(&v)?.map(f).to_vec();expected.extend(root.0.elements);expected.push(f(cp));ensure!(proof.public_inputs==expected,"frozen root/checkpoint root/inclusion endpoint");Ok(self.data.verify(proof)?)
 }
}
