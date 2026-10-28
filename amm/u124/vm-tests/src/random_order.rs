//! Independent permutation component; no beacon, chain seal, signature or UPS.
//! A future market/key must authenticate and bind this exact frozen root and seed.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,Field64,PrimeField64}},hash::{hash_types::{HashOut,HashOutTarget},poseidon::PoseidonHash},iop::{target::{BoolTarget,Target},witness::{PartialWitness,WitnessWrite}},plonk::{circuit_builder::CircuitBuilder,circuit_data::{CircuitConfig,CircuitData},config::{Hasher,PoseidonGoldilocksConfig as C},proof::ProofWithPublicInputs}};
use psy_common_circuit::u32::multiple_comparison::list_lte_circuit;
pub const FIELDS:usize=74;
const FROZEN_TAG:u64=0x50535946524f5a31;
const ORDER_TAG:u64=0x5053594f52445231;
const MEMBER:usize=50;
fn f(n:u64)->F{F::from_canonical_u64(n)}
#[cfg(test)]
fn less(a:&[u64;4],b:&[u64;4],owner_a:u64,owner_b:u64,nonce_a:u64,nonce_b:u64)->bool{(a,owner_a,nonce_a)<(b,owner_b,nonce_b)}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct CandidateInput{fields:Vec<String>,seed:[String;4]}
pub fn decode_candidate_input(bytes:&[u8])->Result<([u64;FIELDS],[u64;4])>{
 ensure!(bytes.len()<=16384,"bounded statement input");let input:CandidateInput=serde_json::from_slice(bytes)?;
 ensure!(input.fields.len()==FIELDS,"fixed statement width");
 fn integer(s:&str)->Result<u64>{ensure!(!s.is_empty()&&(s=="0"||!s.starts_with('0'))&&s.bytes().all(|b|b.is_ascii_digit()),"canonical decimal integer");Ok(s.parse()?)}
 let fields:[u64;FIELDS]=input.fields.iter().map(|s|integer(s)).collect::<Result<Vec<_>>>()?.try_into().map_err(|_|anyhow::anyhow!("statement width"))?;
 let seed:[u64;4]=input.seed.iter().map(|s|integer(s)).collect::<Result<Vec<_>>>()?.try_into().map_err(|_|anyhow::anyhow!("seed width"))?;
 validate_fields(&fields)?;ensure!(seed.iter().all(|n|*n<F::ORDER),"canonical seed");Ok((fields,seed))
}
pub fn validate_fields(values:&[u64;FIELDS])->Result<()>{
 ensure!(values.iter().all(|n|*n<F::ORDER),"noncanonical Felt");
 ensure!(values[0]==1&&values[1]==psy_config::PSY_NETWORK_MAGIC,"version/network");
 ensure!([1,2].contains(&values[2]),"AMM/Curve only");
 for i in [3,4]{ensure!(values[i]>0&&values[i]<1<<24,"market/vault ID");}
 for i in [5,6,7,8,10,11]{ensure!(values[i]>0&&values[i]<1<<32,"checkpoint/epoch bound");}
 for i in [9,12]{ensure!(values[i]>0&&values[i]<1<<62,"round/fee bound");}
 ensure!(values[6]<values[7]&&values[7]<values[8]&&values[8]<values[10]&&values[10]<values[11],"fixed future schedule");
 ensure!((1..=4).contains(&values[13]),"member capacity");
 for start in (14..50).step_by(4){ensure!(values[start..start+4].iter().any(|n|*n!=0),"nonzero scope root");}
 let mut previous=0;
 for i in 0..4{let row=&values[MEMBER+6*i..MEMBER+6*i+6];if i<values[13]as usize{ensure!(row[0]>previous&&row[0]<1<<24&&row[0]!=values[4],"canonical unique member");ensure!(row[1]>0&&row[1]<1<<62&&row[2..].iter().any(|n|*n!=0),"order nonce/terms");previous=row[0];}else{ensure!(row==[0;6],"canonical padding");}}
 Ok(())
}
pub fn frozen_root(values:&[u64;FIELDS])->Result<[u64;4]>{validate_fields(values)?;let mut input=vec![f(FROZEN_TAG)];input.extend(values.iter().map(|n|f(*n)));Ok(PoseidonHash::hash_no_pad(&input).elements.map(|x|x.to_canonical_u64()))}
pub fn order_keys(values:&[u64;FIELDS],seed:[u64;4])->Result<[[u64;4];4]>{
 ensure!(seed.iter().all(|n|*n<F::ORDER),"canonical seed");let root=frozen_root(values)?;
 Ok(std::array::from_fn(|i|{let mut input=vec![f(ORDER_TAG)];input.extend(root.map(f));input.extend(seed.map(f));input.extend(values[MEMBER+6*i..MEMBER+6*i+6].iter().map(|n|f(*n)));PoseidonHash::hash_no_pad(&input).elements.map(|x|x.to_canonical_u64())}))
}
pub fn permutation(values:&[u64;FIELDS],seed:[u64;4])->Result<[u64;4]>{
 let keys=order_keys(values,seed)?;let count=values[13]as usize;let mut rank=[0,1,2,3];rank[..count].sort_by_key(|i|(keys[*i as usize],values[MEMBER+6*(*i as usize)],values[MEMBER+6*(*i as usize)+1]));Ok(rank)
}
// A field value has two possible 64-bit decompositions modulo Goldilocks for
// small values. Constrain the decomposition <= p-1 before comparing unsigned.
pub fn constrain_canonical_limbs(builder:&mut CircuitBuilder<F,2>,limbs:[Target;2]){
 let max=[builder.constant(f((F::ORDER-1)&0xffffffff)),builder.constant(f((F::ORDER-1)>>32))];
 let canonical=list_lte_circuit(builder,limbs.to_vec(),max.to_vec(),32);builder.assert_one(canonical.target);
}
fn unsigned_less(builder:&mut CircuitBuilder<F,2>,a:Target,b:Target)->BoolTarget{
 let (al,ah)=builder.split_low_high(a,32,64);let(bl,bh)=builder.split_low_high(b,32,64);
 constrain_canonical_limbs(builder,[al,ah]);constrain_canonical_limbs(builder,[bl,bh]);
 let le=list_lte_circuit(builder,vec![al,ah],vec![bl,bh],32);let eq=builder.is_equal(a,b);let ne=builder.not(eq);builder.and(le,ne)
}
fn nonzero(builder:&mut CircuitBuilder<F,2>,x:Target){let zero=builder.zero();let eq=builder.is_equal(x,zero);builder.assert_zero(eq.target);}
fn hash_nonzero(builder:&mut CircuitBuilder<F,2>,xs:&[Target]){let zero=builder.zero();let mut same=builder._true();for x in xs{let eq=builder.is_equal(*x,zero);same=builder.and(same,eq);}builder.assert_zero(same.target);}
pub fn total_before(builder:&mut CircuitBuilder<F,2>,a:[Target;6],b:[Target;6])->BoolTarget{
 let mut prefix=builder._true();let mut result=builder._false();
 for i in 0..6{let lt=unsigned_less(builder,a[i],b[i]);let at=builder.and(prefix,lt);result=builder.or(result,at);let eq=builder.is_equal(a[i],b[i]);prefix=builder.and(prefix,eq);}result
}
fn constrain_scope(b:&mut CircuitBuilder<F,2>,v:&[Target;FIELDS])->[BoolTarget;4]{
 let one=b.one();b.connect(v[0],one);let magic=b.constant(f(psy_config::PSY_NETWORK_MAGIC));b.connect(v[1],magic);
 let two=b.constant(f(2));let k1=b.is_equal(v[2],one);let k2=b.is_equal(v[2],two);
 let market=b.or(k1,k2);b.assert_one(market.target);
 for i in [3,4]{b.range_check(v[i],24);nonzero(b,v[i]);}
 for i in [5,6,7,8,10,11]{b.range_check(v[i],32);nonzero(b,v[i]);}
 for i in [9,12]{b.range_check(v[i],62);nonzero(b,v[i]);}
 for (a,c)in [(6,7),(7,8),(8,10),(10,11)]{let lt=unsigned_less(b,v[a],v[c]);b.assert_one(lt.target);}
 b.range_check(v[13],3);let four=b.constant(f(4));
 let count_max=list_lte_circuit(b,vec![v[13]],vec![four],3);b.assert_one(count_max.target);nonzero(b,v[13]);
 for start in (14..50).step_by(4){hash_nonzero(b,&v[start..start+4]);}
 std::array::from_fn(|i|{let c=b.constant(f(i as u64));unsigned_less(b,c,v[13])})
}
fn constrain_members(b:&mut CircuitBuilder<F,2>,v:&[Target;FIELDS],active:[BoolTarget;4]){
 let zero=b.zero();
 for i in 0..4{
  let start=MEMBER+6*i;let owner=v[start];let nonce=v[start+1];
  b.range_check(owner,24);b.range_check(nonce,62);let inactive=b.not(active[i]);
  for x in &v[start..start+6]{let padded=b.mul(inactive.target,*x);b.connect(padded,zero);}
  let prev=if i==0{zero}else{v[start-6]};let inc=unsigned_less(b,prev,owner);
  let bad=b.not(inc);let violation=b.and(active[i],bad);b.assert_zero(violation.target);
  let eq=b.is_equal(owner,v[4]);let bad=b.and(active[i],eq);b.assert_zero(bad.target);
  let nz=b.is_equal(nonce,zero);let bad=b.and(active[i],nz);b.assert_zero(bad.target);
  let mut empty=b._true();
  for x in &v[start+2..start+6]{let eq=b.is_equal(*x,zero);empty=b.and(empty,eq);}
  let bad=b.and(active[i],empty);b.assert_zero(bad.target);
 }
}
fn select_member(b:&mut CircuitBuilder<F,2>,v:&[Target;FIELDS],rank:Target,keys:[HashOutTarget;4])->[Target;6]{
 let zero=b.zero();let mut row=[zero;6];
 for j in 0..4{
  let c=b.constant(f(j as u64));let select=b.is_equal(rank,c);
  let values=[keys[j].elements[0],keys[j].elements[1],keys[j].elements[2],keys[j].elements[3],v[MEMBER+6*j],v[MEMBER+6*j+1]];
  for k in 0..6{row[k]=b.mul_add(select.target,values[k],row[k]);}
 }
 row
}
fn constrain_rank(b:&mut CircuitBuilder<F,2>,v:&[Target;FIELDS],rank:[Target;4],keys:[HashOutTarget;4],active:[BoolTarget;4])->[[Target;6];4]{
 let mut sorted=[[b.zero();6];4];
 for i in 0..4{
  b.range_check(rank[i],2);
  for old in &rank[..i]{let eq=b.is_equal(rank[i],*old);b.assert_zero(eq.target);}
  let bound=unsigned_less(b,rank[i],v[13]);let bad=b.not(bound);let violation=b.and(active[i],bad);b.assert_zero(violation.target);
  let idx=b.constant(f(i as u64));let delta=b.sub(rank[i],idx);let inactive=b.not(active[i]);let pad=b.mul(inactive.target,delta);b.assert_zero(pad);
  sorted[i]=select_member(b,v,rank[i],keys);
 }
 sorted
}
pub struct PermutationCircuit{pub data:CircuitData<F,C,2>,fields:[Target;FIELDS],seed:HashOutTarget,rank:[Target;4]}
impl PermutationCircuit{
 pub fn build()->Self{
  let mut b=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());
  let fields:[Target;FIELDS]=b.add_virtual_targets(FIELDS).try_into().unwrap();
  let seed=b.add_virtual_hash();let rank:[Target;4]=b.add_virtual_targets(4).try_into().unwrap();
  let active=constrain_scope(&mut b,&fields);constrain_members(&mut b,&fields,active);
  let tag=b.constant(f(FROZEN_TAG));let mut all=vec![tag];all.extend(fields);
  let root=b.hash_n_to_hash_no_pad::<PoseidonHash>(all);
  let keys:[HashOutTarget;4]=std::array::from_fn(|i|{
   let tag=b.constant(f(ORDER_TAG));let mut input=vec![tag];input.extend(root.elements);
   input.extend(seed.elements);input.extend(&fields[MEMBER+6*i..MEMBER+6*i+6]);
   b.hash_n_to_hash_no_pad::<PoseidonHash>(input)
  });
  let sorted=constrain_rank(&mut b,&fields,rank,keys,active);
  for i in 1..4{
   let before=total_before(&mut b,sorted[i-1],sorted[i]);let bad=b.not(before);
   let violation=b.and(active[i],bad);b.assert_zero(violation.target);
  }
  b.register_public_inputs(&root.elements);b.register_public_inputs(&seed.elements);
  b.register_public_input(fields[13]);b.register_public_inputs(&rank);
  Self{data:b.build::<C>(),fields,seed,rank}
 }
 pub fn prove(&self,values:[u64;FIELDS],seed:[u64;4],rank:[u64;4])->Result<ProofWithPublicInputs<F,C,2>>{
  ensure!(values.iter().chain(&seed).chain(&rank).all(|n|*n<F::ORDER),"canonical witness");let mut pw=PartialWitness::new();for(t,v)in self.fields.iter().zip(values){pw.set_target(*t,f(v))?;}pw.set_hash_target(self.seed,HashOut{elements:seed.map(f)})?;for(t,v)in self.rank.iter().zip(rank){pw.set_target(*t,f(v))?;}Ok(self.data.prove(pw)?)
 }
 pub fn verify_for(&self,values:[u64;FIELDS],seed:[u64;4],proof:ProofWithPublicInputs<F,C,2>)->Result<()>{let mut expected=frozen_root(&values)?.to_vec();expected.extend(seed);expected.push(values[13]);expected.extend(permutation(&values,seed)?);ensure!(proof.public_inputs.iter().map(|x|x.to_canonical_u64()).collect::<Vec<_>>()==expected,"frozen statement/seed/permutation public endpoints");Ok(self.data.verify(proof)?)}
}
#[cfg(test)]mod tests{use super::*;#[test]fn host_ties_use_full_key_then_owner_then_nonce(){let k=[F::ORDER-1,1,2,3];assert!(less(&k,&k,7,8,9,1));assert!(less(&k,&k,7,7,9,10));assert!(!less(&k,&k,7,7,9,9));assert!(!less(&[1,0,0,9],&[0,0,0,10],1,2,1,1));}}
