//! Sealed-state membership relative to a supplied checkpoint root. No finality,
//! entropy, live contract semantic approval, signature, UPS or spending authority.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}},hash::{hash_types::HashOut,poseidon::PoseidonHash as H}};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::qdata::{checkpoint::{PsyCheckpointGlobalStateRoots,PsyCheckpointLeaf},user::PsyUserLeaf,contract::PsyContractLeaf};
use psy_config::network_constants::{CHECKPOINT_TREE_HEIGHT,GLOBAL_USER_TREE_HEIGHT,GLOBAL_CONTRACT_TREE_HEIGHT};
use psy_crypto::hash::{merkle::core::MerkleProofCore,traits::{qhashable::QFieldHashable,hasher::FieldQHasher}};
use serde::{Serialize,Deserialize};
use crate::random_order::{frozen_root,validate_fields,FIELDS};
#[derive(Clone,Copy,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SealLayout{pub schema:u32,pub height:u8,pub fields:u64,pub slots:u64,pub root_slot:u64}
impl SealLayout{
 pub fn validate(&self)->Result<()>{ensure!(self.schema==1&&(1..=32).contains(&self.height)&&self.fields>0&&self.fields<=u32::MAX as u64,"reviewed seal layout version/height/fields");ensure!(self.slots<=(1u64<<self.height)*4&&self.root_slot.checked_add(4).is_some_and(|end|end<=self.slots),"reviewed packed root slot capacity");Ok(())}
 pub fn word_indices(&self)->Result<Vec<u64>>{self.validate()?;let first=self.root_slot/4;let last=(self.root_slot+3)/4;Ok(if first==last{vec![first]}else{vec![first,last]})}
}
#[derive(Clone,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SealOpening{
 pub schema:u32,pub checkpoint_id:u64,pub chain_anchor_leaf:PsyCheckpointLeaf<F>,pub chain_anchor_proof:MerkleProofCore<Q<F>>,
 pub checkpoint_leaf:PsyCheckpointLeaf<F>,pub checkpoint_proof:MerkleProofCore<Q<F>>,pub state_roots:PsyCheckpointGlobalStateRoots<F>,
 pub contract_leaf:PsyContractLeaf<F>,pub contract_proof:MerkleProofCore<Q<F>>,
 pub user_leaf:PsyUserLeaf<F>,pub user_proof:MerkleProofCore<Q<F>>,pub key_public_param:Q<F>,
 pub user_contract_proof:MerkleProofCore<Q<F>>,pub root_words:Vec<MerkleProofCore<Q<F>>>,
}
pub(crate)fn q(v:&[u64])->Q<F>{Q(HashOut{elements:std::array::from_fn(|i|F::from_canonical_u64(v[i]))})}
fn member(proof:&MerkleProofCore<Q<F>>,root:Q<F>,index:u64,value:Q<F>,height:u8)->Result<()>{
 ensure!(proof.siblings.len()==height as usize&&proof.index==index&&index<(1u64<<height)&&proof.root==root&&proof.value==value&&proof.verify::<H>(),"Merkle membership/root/index/height");Ok(())
}
pub fn verify_seal_opening(v:&[u64;FIELDS],layout:SealLayout,checkpoint_root:Q<F>,p:&SealOpening)->Result<()>{
 validate_fields(v)?;layout.validate()?;ensure!(p.schema==1&&checkpoint_root!=Q::ZERO,"seal schema/expected checkpoint root");
 ensure!(p.checkpoint_id>v[6]&&p.checkpoint_id<=v[7]&&p.checkpoint_id<v[8],"seal inclusion checkpoint must precede draw");
 ensure!(p.chain_anchor_leaf.global_chain_root==q(&v[18..22]),"genesis instance");
 member(&p.chain_anchor_proof,checkpoint_root,1,p.chain_anchor_leaf.qfhash::<H>(),CHECKPOINT_TREE_HEIGHT)?;
 member(&p.checkpoint_proof,checkpoint_root,p.checkpoint_id,p.checkpoint_leaf.qfhash::<H>(),CHECKPOINT_TREE_HEIGHT)?;
 ensure!(p.state_roots.qfhash::<H>()==p.checkpoint_leaf.global_chain_root,"sealed checkpoint state roots");
 verify_contract(v,layout,p)?;verify_user(v,p)?;
 let root=Q(HashOut{elements:frozen_root(v)?.map(F::from_canonical_u64)});
 let indices=layout.word_indices()?;ensure!(p.root_words.len()==indices.len(),"exact root word opening count");
 for (proof,index)in p.root_words.iter().zip(indices){member(proof,p.user_contract_proof.value,index,proof.value,layout.height)?;}
 for i in 0..4{let slot=layout.root_slot+i as u64;let word=&p.root_words[(slot/4-layout.root_slot/4)as usize];ensure!(word.value.0.elements[(slot%4)as usize]==root.0.elements[i],"stored frozen root differs from complete statement");}
 Ok(())
}
fn verify_contract(v:&[u64;FIELDS],layout:SealLayout,p:&SealOpening)->Result<()>{
 let leaf=&p.contract_leaf;ensure!(leaf.code_root==q(&v[22..26])&&leaf.state_layout_root==q(&v[26..30])&&leaf.function_tree_root==q(&v[30..34]),"sealed code/layout/function identity");
 ensure!(leaf.state_tree_height.to_canonical_u64()==layout.height as u64&&leaf.state_layout_field_count.to_canonical_u64()==layout.fields&&leaf.state_layout_slot_count.to_canonical_u64()==layout.slots,"reviewed layout metadata endpoints");
 member(&p.contract_proof,p.state_roots.contract_tree_root,v[3],leaf.qfhash::<H>(),GLOBAL_CONTRACT_TREE_HEIGHT)
}
fn verify_user(v:&[u64;FIELDS],p:&SealOpening)->Result<()>{
 let user=&p.user_leaf;ensure!(user.user_id.to_canonical_u64()==v[4]&&user.public_key==q(&v[38..42]),"sealed vault/key identity");
 ensure!(H::q_two_to_one(q(&v[34..38]),p.key_public_param)==user.public_key,"key fingerprint/public parameter binding");
 ensure!(user.nonce.to_canonical_u64()>0&&user.nonce.to_canonical_u64()<(1u64<<62)&&user.last_checkpoint_id.to_canonical_u64()<=p.checkpoint_id,"initialized sealed account context");
 member(&p.user_proof,p.state_roots.user_tree_root,v[4],user.qfhash::<H>(),GLOBAL_USER_TREE_HEIGHT)?;
 member(&p.user_contract_proof,user.user_state_tree_root,v[3],p.user_contract_proof.value,GLOBAL_CONTRACT_TREE_HEIGHT)
}
