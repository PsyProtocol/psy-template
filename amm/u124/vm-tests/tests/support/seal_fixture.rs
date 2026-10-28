use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}},hash::{hash_types::HashOut,poseidon::PoseidonHash as H}};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::qdata::{checkpoint::{PsyCheckpointGlobalStateRoots,PsyCheckpointLeaf},user::PsyUserLeaf,contract::PsyContractLeaf};
use psy_crypto::hash::{merkle::core::MerkleProofCore,traits::{qhashable::QFieldHashable,hasher::{MerkleZeroHasher,FieldQHasher}}};
use psy_config::network_constants::{CHECKPOINT_TREE_HEIGHT,GLOBAL_CONTRACT_TREE_HEIGHT,GLOBAL_USER_TREE_HEIGHT};
use psy_template_u124_markets::{seal_inclusion::{SealLayout,SealOpening},random_order::FIELDS};
use std::collections::BTreeMap;
fn f(n:u64)->F{F::from_canonical_u64(n)}
fn hash(v:&[u64])->Q<F>{Q(HashOut{elements:std::array::from_fn(|i|f(v[i]))})}
fn paths(height:u8,values:Vec<(u64,Q<F>)>)->(Q<F>,BTreeMap<u64,MerkleProofCore<Q<F>>>){
 let mut levels=vec![values.iter().copied().collect::<BTreeMap<_,_>>()];
 for h in 0..height as usize{let parents=levels[h].keys().map(|i|i/2).collect::<std::collections::BTreeSet<_>>();let next=parents.into_iter().map(|i|{let zero=H::get_zero_hash(h);let left=*levels[h].get(&(2*i)).unwrap_or(&zero);let right=*levels[h].get(&(2*i+1)).unwrap_or(&zero);(i,H::q_two_to_one(left,right))}).collect();levels.push(next);}
 let root=levels[height as usize][&0];let proofs=values.into_iter().map(|(index,value)|{let siblings=(0..height as usize).map(|h|*levels[h].get(&((index>>h)^1)).unwrap_or(&H::get_zero_hash(h))).collect();(index,MerkleProofCore::new_from_params::<H>(index,value,siblings))}).collect();(root,proofs)
}
pub fn fixture_with_root(root_slot:u64,kind:u64,stored_root:impl Fn(&[u64;FIELDS])->Result<[u64;4]>)->Result<([u64;FIELDS],SealLayout,Q<F>,SealOpening)>{
 let mut v=[0;FIELDS];v[..14].copy_from_slice(&[1,psy_config::PSY_NETWORK_MAGIC,kind,1000,100,1,100,110,120,3,150,160,2000200000,4]);for i in 0..9{v[14+4*i]=(i+1)as u64;}for i in 0..4{v[50+6*i]=200+i as u64;v[51+6*i]=i as u64+1;v[52+6*i]=i as u64+10;}
 let slots=root_slot+4;let abi=serde_json::json!({"contract":{"state_tree_height":31,"state_layout":{"layout_version":1,"encoding_version":1,"field_count":if root_slot==0{1}else{2},"slot_count":slots,"fields":if root_slot==0{vec![serde_json::json!({"field_id":1,"type":{"kind":"primitive","name":"Hash"},"start_slot":0,"payload_offset":0,"slot_count":4})]}else{vec![serde_json::json!({"field_id":1,"type":{"kind":"array","item":{"kind":"primitive","name":"Felt"},"length":root_slot,"item_felt_size":1},"start_slot":0,"payload_offset":0,"slot_count":root_slot}),serde_json::json!({"field_id":2,"type":{"kind":"primitive","name":"Hash"},"start_slot":root_slot,"payload_offset":0,"slot_count":4})]}}},"types":[]});
 let (layout_root,field_count,slot_count)=psy_template_u124_markets::contract_layout::artifact_layout(v[3],31,&abi)?;v[26..30].copy_from_slice(&layout_root.0.elements.map(|x|x.to_canonical_u64()));
 let key_public_param=Q::from_values(7,8,9,10);let key=H::q_two_to_one(hash(&v[34..38]),key_public_param);v[38..42].copy_from_slice(&key.0.elements.map(|x|x.to_canonical_u64()));
 let layout=SealLayout{schema:1,height:31,fields:field_count,slots:slot_count,root_slot};let root=stored_root(&v)?;let mut words=BTreeMap::<u64,[F;4]>::new();for i in 0..4{let slot=root_slot+i as u64;words.entry(slot/4).or_insert([F::ZERO;4])[(slot%4)as usize]=f(root[i]);}
 let(cst,cst_paths)=paths(layout.height,words.into_iter().map(|(i,value)|(i,Q(HashOut{elements:value}))).collect());let(ust,ust_paths)=paths(GLOBAL_CONTRACT_TREE_HEIGHT,vec![(v[3],cst)]);
 let user_leaf=PsyUserLeaf{user_id:f(v[4]),public_key:key,user_state_tree_root:ust,nonce:F::ONE,last_checkpoint_id:f(100),..Default::default()};let(users,user_paths)=paths(GLOBAL_USER_TREE_HEIGHT,vec![(v[4],user_leaf.qfhash::<H>())]);
 let contract_leaf=PsyContractLeaf{code_root:hash(&v[22..26]),state_layout_root:layout_root,function_tree_root:hash(&v[30..34]),state_tree_height:f(layout.height as u64),state_layout_field_count:f(layout.fields),state_layout_slot_count:f(layout.slots),..Default::default()};let(contracts,contract_paths)=paths(GLOBAL_CONTRACT_TREE_HEIGHT,vec![(v[3],contract_leaf.qfhash::<H>())]);
 let state_roots=PsyCheckpointGlobalStateRoots{contract_tree_root:contracts,user_tree_root:users,..Default::default()};let checkpoint_leaf=PsyCheckpointLeaf{global_chain_root:state_roots.qfhash::<H>(),..Default::default()};let chain_anchor_leaf=PsyCheckpointLeaf{global_chain_root:hash(&v[18..22]),..Default::default()};let cp=105;let(checkpoint_root,cp_paths)=paths(CHECKPOINT_TREE_HEIGHT,vec![(1,chain_anchor_leaf.qfhash::<H>()),(cp,checkpoint_leaf.qfhash::<H>())]);
 let p=SealOpening{schema:1,checkpoint_id:cp,chain_anchor_leaf,chain_anchor_proof:cp_paths[&1].clone(),checkpoint_leaf,checkpoint_proof:cp_paths[&cp].clone(),state_roots,contract_leaf,contract_proof:contract_paths[&v[3]].clone(),user_leaf,user_proof:user_paths[&v[4]].clone(),key_public_param,user_contract_proof:ust_paths[&v[3]].clone(),root_words:layout.word_indices()?.iter().map(|i|cst_paths[i].clone()).collect()};Ok((v,layout,checkpoint_root,p))
}
