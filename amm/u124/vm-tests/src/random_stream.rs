//! Full-source, full-hash permutation pages. The future checkpoint statistic
//! is authenticated by the actual ordering CFC. Producer influence is retained.
use crate::{checkpoint_stream::{Hash,Member,Path,State},stream_source::{Tape,PriorityTree,PriorityMember,lt}};
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}},hash::{hash_types::{HashOut,HashOutTarget},poseidon::PoseidonHash as H},iop::{target::{Target,BoolTarget},witness::{PartialWitness,WitnessWrite}},plonk::{circuit_builder::CircuitBuilder,config::Hasher}};
use psy_common_circuit::hash::merkle::gadgets::merkle_proof::MerkleProofGadget;
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_crypto::hash::{merkle::core::MerkleProofCore,traits::hasher::MerkleZeroHasher};
use serde::{Serialize,Deserialize};
pub const EXPIRE:u64=10;
pub const RESTORE:u64=11;
pub const TAG:u64=91647816651058;
// Rank-v1 uses source+1 as a legacy domain word. The selected code/key separately
// binds the actual draw index (S+1 legacy; S+32 in the accepted-seal profile).
const RANK:u64=0x53545252414e4b;
fn f(n:u64)->F{F::from_canonical_u64(n)}
fn h(v:Hash)->HashOut<F>{HashOut{elements:v.map(f)}}
fn hash(v:Vec<u64>)->Hash{H::hash_no_pad(&v.into_iter().map(f).collect::<Vec<_>>()).elements.map(|n|n.to_canonical_u64())}
pub fn empty()->Hash{<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(56).0.elements.map(|n|n.to_canonical_u64())}
pub fn wrap(base:Hash,source:u64,seed:Hash,refund_only:bool)->Hash{hash([vec![TAG],base.to_vec(),vec![source+1],seed.to_vec(),vec![u64::from(refund_only)]].concat())}
pub fn wrap_target(b:&mut CircuitBuilder<F,2>,base:HashOutTarget,source:Target,seed:HashOutTarget,refund:Target)->HashOutTarget{
 let tag=b.constant(f(TAG));let draw=b.add_const(source,F::ONE);
 b.hash_n_to_hash_no_pad::<H>([vec![tag],base.elements.to_vec(),vec![draw],seed.elements.to_vec(),vec![refund]].concat())
}
pub(crate) fn key(scope:&[u64],seed:Hash,row:&PriorityMember)->[u64;7]{let mut v=vec![RANK];v.extend(scope);v.push(scope[6]+1);v.extend(seed);v.extend([row.index,row.member.owner,row.member.nonce]);v.extend(row.member.terms);let k=hash(v);[k[0],k[1],k[2],k[3],row.member.owner,row.member.nonce,row.index]}
#[derive(Clone,Serialize,Deserialize)]#[serde(deny_unknown_fields)]
pub struct Row{pub origin:PriorityMember,pub source:Path,pub append:Path}
#[derive(Clone,Serialize,Deserialize)]#[serde(deny_unknown_fields)]
pub struct Page{pub seed:Hash,pub refund_only:bool,pub rows:Vec<Row>}
impl Page{pub fn context(seed:Hash,refund_only:bool)->Self{Self{seed,refund_only,rows:vec![]}}}
#[derive(Clone,Serialize,Deserialize)]pub struct Ordering{pub before:State,pub after:State,pub page:Page}
pub fn prepare(scope:&[u64],source:&PriorityTree,seed:Hash)->Result<(Vec<Ordering>,PriorityTree)>{
 ensure!(scope.len()==41&&scope[0]==3&&scope[8]as usize==source.members.len()&&scope[17..21]==source.root(),"complete fixed source set required");
 ensure!(seed.iter().all(|n|*n<18446744069414584321),"canonical seed");
 let mut rank=source.members.clone();rank.sort_by_key(|r|key(scope,seed,r));
 let mut remaining=source.clone();let mut queue=PriorityTree::from_committed(scope,vec![])?;
 let mut state=State{seen:source.root(),ordered:empty(),..Default::default()};let mut pages=vec![];
 for chunk in rank.chunks(4){let before=state.clone();let mut rows=vec![];
  for row in chunk{let pos=state.cursor;rows.push(Row{origin:row.clone(),source:remaining.proof(row.index),append:queue.proof(pos)});
   remaining.remove(row.index);let mut members=queue.members.clone();members.push(PriorityMember{index:pos,member:row.member.clone()});queue=PriorityTree::from_committed(scope,members)?;
   state.cursor+=1;state.last=key(scope,seed,row);
  }
  state.seen=remaining.root();state.ordered=queue.root();pages.push(Ordering{before,after:state.clone(),page:Page{seed,refund_only:false,rows}});
 }
 ensure!(state.cursor==scope[8]&&state.seen==empty(),"complete permutation");Ok((pages,queue))
}
pub(crate) fn value(scope:&[u64],index:u64,m:&Member)->Hash{let mut raw=vec![0x5354524d454d33];raw.extend(&scope[..8]);raw.extend(&scope[9..17]);raw.extend(&scope[25..]);raw.extend([index,m.owner,m.nonce]);raw.extend(m.terms);hash(raw)}
fn path(p:&Path,value:Hash)->Result<Hash>{ensure!(p.index<1<<56&&p.siblings.len()==56,"exact order path");let proof=MerkleProofCore::new_from_params::<H>(p.index,Q(h(value)),p.siblings.iter().map(|v|Q(h(*v))).collect());Ok(proof.root.0.elements.map(|n|n.to_canonical_u64()))}
pub fn after(scope:&[u64],before:&State,p:&Page)->Result<State>{
 ensure!(!p.rows.is_empty()&&p.rows.len()<=4&&before.cursor+p.rows.len()as u64<=scope[8],"random page bounds");
 ensure!(p.rows.len()==4||before.cursor+p.rows.len()as u64==scope[8],"complete random ordering page");
 if before.cursor==0{ensure!(before.seen==scope[17..21]&&before.ordered==empty()&&before.last==[0;7],"original accepted manifest");}
 let mut out=before.clone();
 for row in &p.rows{ensure!(row.source.index==row.origin.index&&row.source.value==value(scope,row.origin.index,&row.origin.member)&&path(&row.source,row.source.value)?==out.seen,"original unconsumed source member");
  ensure!(row.append.index==out.cursor&&row.append.value==[0;4]&&path(&row.append,[0;4])?==out.ordered,"append-only queue");
  let k=key(scope,p.seed,&row.origin);ensure!(out.cursor==0||out.last<k,"one global order across pages");
  out.seen=path(&row.source,[0;4])?;out.ordered=path(&row.append,value(scope,out.cursor,&row.origin.member))?;out.cursor+=1;out.last=k;
 }
 if out.cursor==scope[8]{ensure!(out.seen==empty(),"no omitted source member");}Ok(out)
}
fn ge(b:&mut CircuitBuilder<F,2>,g:BoolTarget,a:Target,c:Target){crate::batch_policy::eq(b,g,a,c)}
fn gh(b:&mut CircuitBuilder<F,2>,g:BoolTarget,a:HashOutTarget,c:HashOutTarget){for(x,y)in a.elements.into_iter().zip(c.elements){ge(b,g,x,y)}}
pub(crate) fn before(b:&mut CircuitBuilder<F,2>,a:[Target;7],c:[Target;7])->BoolTarget{
 let primary=crate::random_order::total_before(b,a[..6].try_into().unwrap(),c[..6].try_into().unwrap());
 let mut same=b._true();for i in 0..6{let eq=b.is_equal(a[i],c[i]);same=b.and(same,eq);}let index=lt(b,a[6],c[6],56);let tie=b.and(same,index);b.or(primary,tie)
}
struct RowTargets{index:Target,owner:Target,nonce:Target,terms:HashOutTarget,source:MerkleProofGadget,append:MerkleProofGadget}
pub struct Targets{pub seed:HashOutTarget,pub refund:BoolTarget,pub len:Target,pub after:crate::stream_order::StateTargets,rows:Vec<RowTargets>}
impl Targets{
 pub fn add(b:&mut CircuitBuilder<F,2>,t:&mut Tape,scope:&[Target],sort:&crate::stream_order::StateTargets,gate:BoolTarget)->Self{
  let seed=t.hash(b);let refund=b.add_virtual_bool_target_safe();t.targets.push(refund.target);let len=t.scalar(b);
  let z=b.zero();let one=b.one();let four=b.constant(f(4));b.range_check(len,3);
  let positive=lt(b,z,len,3);ge(b,gate,positive.target,one);let above=lt(b,four,len,3);ge(b,gate,above.target,z);
  let end=b.add(sort.cursor,len);b.range_check(end,25);let too_many=lt(b,scope[8],end,25);ge(b,gate,too_many.target,z);
  let full=b.is_equal(len,four);let final_page=b.is_equal(end,scope[8]);let complete=b.or(full,final_page);ge(b,gate,complete.target,one);
  let first=b.is_equal(sort.cursor,z);let start=b.and(gate,first);let source=HashOutTarget{elements:scope[17..21].try_into().unwrap()};gh(b,start,sort.seen,source);
  let empty=b.constant_hash(h(empty()));gh(b,start,sort.ordered,empty);for n in sort.last{ge(b,start,n,z);}
  let(mut seen,mut ordered,mut last)=(sort.seen,sort.ordered,sort.last);let mut rows=vec![];
  for i in 0..4{let index=t.scalar(b);let owner=t.scalar(b);let nonce=t.scalar(b);let terms=t.hash(b);let source=t.proof(b,56);let append=t.proof(b,56);
   b.range_check(index,56);b.range_check(owner,24);b.range_check(nonce,62);let pos=b.constant(f(i));let exists=lt(b,pos,len,3);let active=b.and(gate,exists);
   let bad_owner=b.is_equal(owner,z);ge(b,active,bad_owner.target,z);let bad_nonce=b.is_equal(nonce,z);ge(b,active,bad_nonce.target,z);
   ge(b,active,source.index,index);gh(b,active,source.root,seen);let member=crate::stream_order::member(b,scope,index,owner,nonce,terms);gh(b,active,source.value,member);
   let at=b.add_const(sort.cursor,f(i));ge(b,active,append.index,at);gh(b,active,append.root,ordered);let zero=b.constant_hash(HashOut::ZERO);gh(b,active,append.value,zero);
   let mut raw=vec![b.constant(f(RANK))];raw.extend(scope);let draw=b.add_const(scope[6],F::ONE);raw.push(draw);raw.extend(seed.elements);raw.extend([index,owner,nonce]);raw.extend(terms.elements);let k=b.hash_n_to_hash_no_pad::<H>(raw);let now=[k.elements[0],k.elements[1],k.elements[2],k.elements[3],owner,nonce,index];
   let at_zero=b.is_equal(at,z);let not_first=b.not(at_zero);let compare=b.and(active,not_first);let valid=before(b,last,now);ge(b,compare,valid.target,one);
   let next=MerkleProofGadget::compute_root::<H,F,2>(b,index,zero,&source.siblings);
   seen=HashOutTarget{elements:std::array::from_fn(|j|b.select(active,next.elements[j],seen.elements[j]))};
   let value=crate::stream_order::member(b,scope,at,owner,nonce,terms);let next=MerkleProofGadget::compute_root::<H,F,2>(b,at,value,&append.siblings);
   ordered=HashOutTarget{elements:std::array::from_fn(|j|b.select(active,next.elements[j],ordered.elements[j]))};last=std::array::from_fn(|j|b.select(active,now[j],last[j]));
   rows.push(RowTargets{index,owner,nonce,terms,source,append});
  }
  let terminal=b.and(gate,final_page);gh(b,terminal,seen,empty);
  Self{seed,refund,len,after:crate::stream_order::StateTargets{cursor:end,seen,ordered,last},rows}
 }
 pub fn set(&self,pw:&mut PartialWitness<F>,page:Option<&Page>)->Result<()>{
  let blank=Page::context([0;4],false);let p=page.unwrap_or(&blank);ensure!(p.rows.len()<=4,"random page capacity");pw.set_hash_target(self.seed,h(p.seed))?;pw.set_bool_target(self.refund,p.refund_only)?;pw.set_target(self.len,f(p.rows.len()as u64))?;
  for(i,t)in self.rows.iter().enumerate(){let row=p.rows.get(i);pw.set_target(t.index,f(row.map(|r|r.origin.index).unwrap_or(0)))?;pw.set_target(t.owner,f(row.map(|r|r.origin.member.owner).unwrap_or(0)))?;pw.set_target(t.nonce,f(row.map(|r|r.origin.member.nonce).unwrap_or(0)))?;pw.set_hash_target(t.terms,h(row.map(|r|r.origin.member.terms).unwrap_or([0;4])))?;
   for(g,path)in[(&t.source,row.map(|r|&r.source)),(&t.append,row.map(|r|&r.append))]{let proof=if let Some(p)=path{ensure!(p.index<1<<56&&p.siblings.len()==56,"exact random path");MerkleProofCore::new_from_params::<H>(p.index,Q(h(p.value)),p.siblings.iter().map(|v|Q(h(*v))).collect())}else{MerkleProofCore::new_from_params::<H>(0,Q::ZERO,(0..56).map(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash).collect())};g.set_witness_core_proof_q(pw,&proof)?;}
  }Ok(())
 }
}
