//! Conditional whole-set ordering pages. The manifest root is NOT a block-wide
//! coverage certificate. No market signature, UPS or broadcast is authorized.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,Field64,PrimeField64}},hash::{hash_types::{HashOut,HashOutTarget},poseidon::PoseidonHash as H},iop::{target::{Target,BoolTarget},witness::{PartialWitness,WitnessWrite}},plonk::{circuit_builder::CircuitBuilder,circuit_data::{CircuitConfig,CircuitData},config::{Hasher,PoseidonGoldilocksConfig as C},proof::ProofWithPublicInputs}};
use psy_common_circuit::{hash::merkle::gadgets::merkle_proof::MerkleProofGadget,u32::multiple_comparison::list_lte_circuit};
use serde::{Serialize,Deserialize};use std::collections::BTreeMap;
pub const FIELDS:usize=41;pub const HEIGHT:usize=24;pub const PAGE:usize=4;
pub type Hash=[u64;4];pub type Proof=ProofWithPublicInputs<F,C,2>;
const MEMBER_TAG:u64=0x5354524d454d31;const ORDER_TAG:u64=0x5354524f524431;
fn f(n:u64)->F{F::from_canonical_u64(n)}
fn h(x:Hash)->HashOut<F>{HashOut{elements:x.map(f)}}
fn pair(a:Hash,b:Hash)->Hash{H::two_to_one(h(a),h(b)).elements.map(|v|v.to_canonical_u64())}
fn hash(v:Vec<u64>)->Hash{H::hash_no_pad(&v.into_iter().map(f).collect::<Vec<_>>()).elements.map(|v|v.to_canonical_u64())}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]#[serde(deny_unknown_fields)]
pub struct Member{pub owner:u64,pub nonce:u64,pub terms:Hash}
#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(deny_unknown_fields)]
pub struct Manifest{pub fields:Vec<u64>,pub members:Vec<Member>}
#[derive(Clone,Debug,Default,Serialize,Deserialize,PartialEq,Eq)]#[serde(deny_unknown_fields)]
pub struct State{pub cursor:u64,pub seen:Hash,pub ordered:Hash,pub last:[u64;7]}
#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(deny_unknown_fields)]
pub struct Path{pub index:u64,pub value:Hash,pub siblings:Vec<Hash>}
#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(deny_unknown_fields)]
pub struct Row{pub index:u64,pub member:Member,pub source:Path,pub seen:Path,pub ordered:Path}
#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(deny_unknown_fields)]
pub struct PageInput{pub fields:Vec<u64>,pub before:State,pub after:State,pub rows:Vec<Row>}
#[derive(Clone)]pub struct Tree{nodes:BTreeMap<(usize,u64),Hash>,zero:[Hash;HEIGHT+1]}
impl Tree{
 pub fn new()->Self{let mut zero=[[0;4];HEIGHT+1];for i in 0..HEIGHT{zero[i+1]=pair(zero[i],zero[i]);}Self{nodes:BTreeMap::new(),zero}}
 fn node(&self,l:usize,i:u64)->Hash{*self.nodes.get(&(l,i)).unwrap_or(&self.zero[l])}
 pub fn root(&self)->Hash{self.node(HEIGHT,0)}
 pub fn path(&self,index:u64)->Path{Path{index,value:self.node(0,index),siblings:(0..HEIGHT).map(|l|self.node(l,(index>>l)^1)).collect()}}
 pub fn set(&mut self,index:u64,value:Hash){assert!(index<1<<HEIGHT);self.nodes.insert((0,index),value);let mut p=index;for l in 0..HEIGHT{p>>=1;self.nodes.insert((l+1,p),pair(self.node(l,2*p),self.node(l,2*p+1)));}}
}
pub fn validate_scope(v:&[u64])->Result<()>{
 ensure!(v.len()==FIELDS&&v.iter().all(|n|*n<F::ORDER),"canonical stream scope");ensure!(v[0]==1&&v[1]==psy_config::PSY_NETWORK_MAGIC&&[1,2].contains(&v[2]),"stream version/network/market");
 for i in[3,4]{ensure!(v[i]>0&&v[i]<1<<24,"stream identity");}ensure!(v[5]>0&&v[5]<1<<62&&v[6]>0&&v[6]<v[7]&&v[7]<1<<32&&v[8]>0&&v[8]<(1<<HEIGHT),"stream schedule/count");
 for start in[9,13,17,25,29,33,37]{ensure!(v[start..start+4].iter().any(|n|*n!=0),"stream scope root");}Ok(())
}
fn member_hash(v:&[u64],index:u64,m:&Member)->Hash{let mut values=vec![MEMBER_TAG];values.extend(&v[..17]);values.extend(&v[25..]);values.extend([index,m.owner,m.nonce]);values.extend(m.terms);hash(values)}
fn key(v:&[u64],index:u64,m:&Member)->[u64;7]{let mut values=vec![ORDER_TAG];values.extend(v);values.extend([index,m.owner,m.nonce]);values.extend(m.terms);let k=hash(values);[k[0],k[1],k[2],k[3],m.owner,m.nonce,index]}
pub fn prepare(mut manifest:Manifest)->Result<(Manifest,Vec<PageInput>)>{
 ensure!(manifest.fields.len()==FIELDS&&manifest.fields.iter().all(|n|*n<F::ORDER)&&manifest.members.len()as u64==manifest.fields[8]&&manifest.members.len()<(1<<HEIGHT),"exact finite set");
 let mut source=Tree::new();let mut last=0;
 for(i,m)in manifest.members.iter().enumerate(){ensure!(m.owner>last&&m.owner<1<<24&&m.owner!=manifest.fields[4]&&m.nonce>0&&m.nonce<1<<62&&m.terms.iter().all(|n|*n<F::ORDER)&&m.terms.iter().any(|n|*n!=0),"canonical unique manifest member");last=m.owner;source.set(i as u64,member_hash(&manifest.fields,i as u64,m));}
 let root=source.root();ensure!(manifest.fields[17..21]==[0;4]||manifest.fields[17..21]==root,"manifest root substitution");manifest.fields[17..21].copy_from_slice(&root);validate_scope(&manifest.fields)?;
 let v=&manifest.fields;let mut rank=(0..manifest.members.len()).collect::<Vec<_>>();rank.sort_by_key(|i|key(v,*i as u64,&manifest.members[*i]));
 let(mut seen,mut ordered)=(Tree::new(),Tree::new());let mut state=State{seen:seen.root(),ordered:ordered.root(),..Default::default()};let mut pages=vec![];
 for chunk in rank.chunks(PAGE){let before=state.clone();let mut rows=vec![];for index in chunk{let i=*index as u64;let member=manifest.members[*index].clone();rows.push(Row{index:i,member:member.clone(),source:source.path(i),seen:seen.path(i),ordered:ordered.path(state.cursor)});seen.set(i,[1,0,0,0]);ordered.set(state.cursor,member_hash(v,i,&member));state.cursor+=1;state.last=key(v,i,&member);}state.seen=seen.root();state.ordered=ordered.root();pages.push(PageInput{fields:v.clone(),before,after:state.clone(),rows});}
 Ok((manifest,pages))
}
fn gated_eq(b:&mut CircuitBuilder<F,2>,gate:BoolTarget,a:Target,c:Target){let d=b.sub(a,c);let d=b.mul(gate.target,d);b.assert_zero(d);}
fn gated_hash(b:&mut CircuitBuilder<F,2>,gate:BoolTarget,a:HashOutTarget,c:HashOutTarget){for(x,y)in a.elements.into_iter().zip(c.elements){gated_eq(b,gate,x,y);}}
fn select_hash(b:&mut CircuitBuilder<F,2>,gate:BoolTarget,a:HashOutTarget,c:HashOutTarget)->HashOutTarget{HashOutTarget{elements:std::array::from_fn(|i|b.select(gate,a.elements[i],c.elements[i]))}}
fn lt(b:&mut CircuitBuilder<F,2>,a:Target,c:Target,bits:usize)->BoolTarget{let le=list_lte_circuit(b,vec![a],vec![c],bits);let eq=b.is_equal(a,c);let ne=b.not(eq);b.and(le,ne)}
fn total_before(b:&mut CircuitBuilder<F,2>,a:[Target;7],c:[Target;7])->BoolTarget{let first=crate::random_order::total_before(b,a[..6].try_into().unwrap(),c[..6].try_into().unwrap());let mut eq=b._true();for i in 0..6{let same=b.is_equal(a[i],c[i]);eq=b.and(eq,same);}let index=lt(b,a[6],c[6],24);let tie=b.and(eq,index);b.or(first,tie)}
struct RowTargets{index:Target,owner:Target,nonce:Target,terms:HashOutTarget,source:MerkleProofGadget,seen:MerkleProofGadget,ordered:MerkleProofGadget}
pub struct PageCircuit{pub data:CircuitData<F,C,2>,scope:Vec<Target>,cursor:Target,len:Target,seen:HashOutTarget,ordered:HashOutTarget,last:[Target;7],rows:Vec<RowTargets>}
pub fn public_inputs(p:&PageInput)->Vec<F>{let mut v=p.fields.clone();v.extend([p.before.cursor,p.rows.len()as u64]);v.extend(p.before.seen);v.extend(p.before.ordered);v.extend(p.before.last);v.extend([p.after.cursor]);v.extend(p.after.seen);v.extend(p.after.ordered);v.extend(p.after.last);v.into_iter().map(f).collect()}
impl PageCircuit{
 pub fn build()->Self{
  let mut b=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());let scope=b.add_virtual_targets(FIELDS);let cursor=b.add_virtual_target();let len=b.add_virtual_target();let seen=b.add_virtual_hash();let ordered=b.add_virtual_hash();let last:[Target;7]=b.add_virtual_targets(7).try_into().unwrap();let zero=b.zero();let one=b.one();
  let version=b.constant(f(1));b.connect(scope[0],version);let magic=b.constant(f(psy_config::PSY_NETWORK_MAGIC));b.connect(scope[1],magic);let a=b.is_equal(scope[2],one);let two=b.constant(f(2));let c=b.is_equal(scope[2],two);let allowed=b.or(a,c);b.assert_one(allowed.target);
  for i in[3,4]{b.range_check(scope[i],24);let z=b.is_equal(scope[i],zero);b.assert_zero(z.target);}b.range_check(scope[5],62);let z=b.is_equal(scope[5],zero);b.assert_zero(z.target);
  for i in[6,7]{b.range_check(scope[i],32);}let positive=lt(&mut b,zero,scope[6],32);b.assert_one(positive.target);let schedule=lt(&mut b,scope[6],scope[7],32);b.assert_one(schedule.target);
  for start in[9,13,17,25,29,33,37]{let mut empty=b._true();for x in &scope[start..start+4]{let eq=b.is_equal(*x,zero);empty=b.and(empty,eq);}b.assert_zero(empty.target);}
  b.range_check(scope[8],24);b.range_check(cursor,24);b.range_check(len,3);let four=b.constant(f(4));let max=list_lte_circuit(&mut b,vec![len],vec![four],3);b.assert_one(max.target);let positive=lt(&mut b,zero,len,3);b.assert_one(positive.target);let end=b.add(cursor,len);let bound=list_lte_circuit(&mut b,vec![end],vec![scope[8]],25);b.assert_one(bound.target);let full=b.is_equal(len,four);let terminal=b.is_equal(end,scope[8]);let complete=b.or(full,terminal);b.assert_one(complete.target);
  let first=b.is_equal(cursor,zero);let empty=b.constant_hash(h(Tree::new().root()));gated_hash(&mut b,first,seen,empty);gated_hash(&mut b,first,ordered,empty);for t in last{gated_eq(&mut b,first,t,zero);}
  let(mut current_seen,mut current_ordered,mut previous)=(seen,ordered,last);let mut rows=vec![];
  for row in 0..PAGE{
   let position=b.constant(f(row as u64));let active=lt(&mut b,position,len,3);let inactive=b.not(active);let index=b.add_virtual_target();let owner=b.add_virtual_target();let nonce=b.add_virtual_target();let terms=b.add_virtual_hash();b.range_check(index,24);b.range_check(owner,24);b.range_check(nonce,62);
   for t in [index,owner,nonce].into_iter().chain(terms.elements){gated_eq(&mut b,inactive,t,zero);}let valid=lt(&mut b,index,scope[8],24);let bad=b.not(valid);let bad=b.and(active,bad);b.assert_zero(bad.target);for t in[owner,nonce]{let eq=b.is_equal(t,zero);let bad=b.and(active,eq);b.assert_zero(bad.target);}let same=b.is_equal(owner,scope[4]);let bad=b.and(active,same);b.assert_zero(bad.target);let mut empty_terms=b._true();for t in terms.elements{let eq=b.is_equal(t,zero);empty_terms=b.and(empty_terms,eq);}let bad=b.and(active,empty_terms);b.assert_zero(bad.target);
   let mut values=vec![b.constant(f(MEMBER_TAG))];values.extend(&scope[..17]);values.extend(&scope[25..]);values.extend([index,owner,nonce]);values.extend(terms.elements);let member=b.hash_n_to_hash_no_pad::<H>(values);
   let mut values=vec![b.constant(f(ORDER_TAG))];values.extend(&scope);values.extend([index,owner,nonce]);values.extend(terms.elements);let key=b.hash_n_to_hash_no_pad::<H>(values);let now=[key.elements[0],key.elements[1],key.elements[2],key.elements[3],owner,nonce,index];
   let at=b.add(cursor,position);let at_zero=b.is_equal(at,zero);let not_first=b.not(at_zero);let compare=b.and(active,not_first);let before=total_before(&mut b,previous,now);let invalid=b.not(before);let bad=b.and(compare,invalid);b.assert_zero(bad.target);
   let source=MerkleProofGadget::add_virtual_to::<H,F,2>(&mut b,HEIGHT);let consumed=MerkleProofGadget::add_virtual_to::<H,F,2>(&mut b,HEIGHT);let append=MerkleProofGadget::add_virtual_to::<H,F,2>(&mut b,HEIGHT);let source_root=HashOutTarget{elements:scope[17..21].try_into().unwrap()};gated_hash(&mut b,active,source.root,source_root);gated_eq(&mut b,active,source.index,index);gated_hash(&mut b,active,source.value,member);
   let zero_hash=b.constant_hash(HashOut::ZERO);let used=b.constant_hash(h([1,0,0,0]));gated_hash(&mut b,active,consumed.root,current_seen);gated_eq(&mut b,active,consumed.index,index);gated_hash(&mut b,active,consumed.value,zero_hash);let next_seen=MerkleProofGadget::compute_root::<H,F,2>(&mut b,consumed.index,used,&consumed.siblings);
   gated_hash(&mut b,active,append.root,current_ordered);gated_eq(&mut b,active,append.index,at);gated_hash(&mut b,active,append.value,zero_hash);let next_ordered=MerkleProofGadget::compute_root::<H,F,2>(&mut b,append.index,member,&append.siblings);
   current_seen=select_hash(&mut b,active,next_seen,current_seen);current_ordered=select_hash(&mut b,active,next_ordered,current_ordered);previous=std::array::from_fn(|i|b.select(active,now[i],previous[i]));rows.push(RowTargets{index,owner,nonce,terms,source,seen:consumed,ordered:append});
  }
  b.register_public_inputs(&scope);b.register_public_input(cursor);b.register_public_input(len);b.register_public_inputs(&seen.elements);b.register_public_inputs(&ordered.elements);b.register_public_inputs(&last);b.register_public_input(end);b.register_public_inputs(&current_seen.elements);b.register_public_inputs(&current_ordered.elements);b.register_public_inputs(&previous);
  Self{data:b.build::<C>(),scope,cursor,len,seen,ordered,last,rows}
 }
 pub fn prove(&self,p:&PageInput)->Result<Proof>{
  validate_scope(&p.fields)?;ensure!(!p.rows.is_empty()&&p.rows.len()<=PAGE,"stream page width");for s in[&p.before,&p.after]{ensure!(s.cursor<1<<24&&s.seen.iter().chain(&s.ordered).chain(&s.last).all(|n|*n<F::ORDER),"canonical stream state");}for r in &p.rows{ensure!(r.index<1<<24&&r.member.owner<1<<24&&r.member.nonce<1<<62&&r.member.terms.iter().all(|n|*n<F::ORDER),"canonical stream row");for path in[&r.source,&r.seen,&r.ordered]{ensure!(path.value.iter().chain(path.siblings.iter().flatten()).all(|n|*n<F::ORDER),"canonical stream path");}}let mut pw=PartialWitness::new();for(t,n)in self.scope.iter().zip(&p.fields){pw.set_target(*t,f(*n))?;}pw.set_target(self.cursor,f(p.before.cursor))?;pw.set_target(self.len,f(p.rows.len()as u64))?;pw.set_hash_target(self.seen,h(p.before.seen))?;pw.set_hash_target(self.ordered,h(p.before.ordered))?;for(t,n)in self.last.iter().zip(p.before.last){pw.set_target(*t,f(n))?;}
  let blank=Tree::new().path(0);for(i,t)in self.rows.iter().enumerate(){let empty=Row{index:0,member:Member{owner:0,nonce:0,terms:[0;4]},source:blank.clone(),seen:blank.clone(),ordered:blank.clone()};let row=p.rows.get(i).unwrap_or(&empty);for(target,n)in[(t.index,row.index),(t.owner,row.member.owner),(t.nonce,row.member.nonce)]{pw.set_target(target,f(n))?;}pw.set_hash_target(t.terms,h(row.member.terms))?;
   for(g,path)in[(&t.source,&row.source),(&t.seen,&row.seen),(&t.ordered,&row.ordered)]{ensure!(path.index<1<<HEIGHT&&path.siblings.len()==HEIGHT,"stream Merkle shape");pw.set_target(g.index,f(path.index))?;pw.set_hash_target(g.value,h(path.value))?;for(target,value)in g.siblings.iter().zip(&path.siblings){pw.set_hash_target(*target,h(*value))?;}}
  }let proof=self.data.prove(pw)?;ensure!(proof.public_inputs==public_inputs(p),"stream page endpoints");Ok(proof)
 }
 pub fn verify(&self,p:&PageInput,proof:Proof)->Result<()>{validate_scope(&p.fields)?;ensure!(proof.public_inputs==public_inputs(p),"stream exact page scope/endpoints");Ok(self.data.verify(proof)?)}
}
pub fn verify_chain(c:&PageCircuit,manifest:&Manifest,pages:&[PageInput],proofs:Vec<Proof>)->Result<State>{
 let (canonical,expected)=prepare(manifest.clone())?;ensure!(canonical.fields==manifest.fields&&pages.len()==expected.len()&&proofs.len()==pages.len(),"complete canonical stream");let empty=Tree::new().root();let mut state=State{seen:empty,ordered:empty,..Default::default()};
 for((page,reference),proof)in pages.iter().zip(expected).zip(proofs){ensure!(page.fields==manifest.fields&&page.before==state&&public_inputs(page)==public_inputs(&reference),"stream omission/reordering/restart endpoint");c.verify(page,proof)?;state=page.after.clone();}
 ensure!(state.cursor==manifest.fields[8],"all manifest members must be ordered before financial execution");Ok(state)
}
