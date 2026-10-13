//! Production DPN op gadgets for the exact generated U124 arithmetic.
//! This is an arithmetic proof, not a funded token CFC or UPS proof.
use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::hash_types::HashOutTarget,iop::witness::{PartialWitness,WitnessWrite},plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig,config::PoseidonGoldilocksConfig as C}};
use psy_dpn_circuit::vm::ops::SimpleDPNBuilder;
use std::{fs,path::PathBuf};
const B:u128=1u128<<62;const MAX:u128=B*B-1;
fn limbs(n:u128)->[u64;2]{[(n%B)as u64,(n/B)as u64]}
#[test]
fn generated_add_sub_proofs_verify_and_reject_forged_carry_borrow_and_limbs()->Result<()>{
 let path=std::env::var("TOKEN_WIDE_PROBE_SOURCE").map(PathBuf::from).unwrap_or_else(|_|PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/arithmetic-probe.psy.rs"));
 let artifact=psy_compiler::compile(&fs::read_to_string(path)?)?;
 for name in ["verify_add","verify_sub"]{
  let def=artifact.circuit_definitions.iter().find(|d|d.name==name).unwrap();assert!(def.state_commands.is_empty());
  let mut builder=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());let inputs=builder.add_virtual_targets(6);builder.register_public_inputs(&inputs);
  let zero=builder.zero();let hash=HashOutTarget{elements:[zero;4]};let mut ops=SimpleDPNBuilder::<F,2>::new_with_contract_ctx(inputs.clone(),zero,zero,zero,zero,zero,hash,hash);
  for op in &def.definitions{ops.process_var_def(&mut builder,op);}for assertion in &def.assertions{builder.connect(ops.resolve_target(assertion.left),ops.resolve_target(assertion.right));}
  let circuit=builder.build::<C>();println!("{name}: degree {}",circuit.common.degree_bits());
  let valid=if name=="verify_add"{vec![(B-1,1,B),(MAX-1,1,MAX),(10u128.pow(27),9u128*10u128.pow(26),19u128*10u128.pow(26)),(0,0,0)]}else{vec![(B,1,B-1),(MAX,MAX,0),(10u128.pow(27),9u128*10u128.pow(26),10u128.pow(26)),(0,0,0)]};
  let mut cases:Vec<([u64;6],bool)>=vec![];
  for(a,b,result)in valid{let [al,ah]=limbs(a);let [bl,bh]=limbs(b);let [rl,rh]=limbs(result);cases.push(([al,ah,bl,bh,rl,rh],true));if result<MAX{let [rl,rh]=limbs(result+1);cases.push(([al,ah,bl,bh,rl,rh],false));}}
  cases.extend([([B as u64,0,0,0,0,1],false),([0,B as u64,0,0,0,0],false),([18_446_744_069_414_584_320,0,0,0,0,0],false)]);
  if name=="verify_add"{cases.push(([(B-1)as u64,(B-1)as u64,1,0,0,0],false));}else{cases.push(([0,0,1,0,(B-1)as u64,(B-1)as u64],false));}
  for(values,valid)in cases{let mut pw=PartialWitness::new();for(t,v)in inputs.iter().zip(values){pw.set_target(*t,F::from_canonical_u64(v))?;}let proof=circuit.prove(pw);if valid{let proof=proof?;assert_eq!(proof.public_inputs,values.map(F::from_canonical_u64));circuit.verify(proof)?;}else{assert!(proof.is_err(),"accepted invalid {name} {values:?}");}}
 }Ok(())
}
