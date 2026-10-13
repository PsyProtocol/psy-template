//! Production op-gadget proofs; arithmetic only, not authenticated-state CFC/UPS.
use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::hash_types::HashOutTarget,iop::witness::{PartialWitness,WitnessWrite},plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig,config::PoseidonGoldilocksConfig as C}};
use psy_dpn_circuit::vm::ops::SimpleDPNBuilder;
use serde_json::Value;
use std::fs;
#[test]
fn full_width_products_and_swap_floor_prove_without_field_wrap()->Result<()>{let root=std::env::var("U124_BUILD")?;let source=fs::read_to_string(std::env::var("U124_PROBE")?)?;let artifact=psy_compiler::compile(&source)?;let samples:Value=serde_json::from_slice(&fs::read(format!("{root}/arithmetic-samples.json"))?)?;
 for(name,key)in[("product_equal","product"),("exact_swap","swap")]{let def=artifact.circuit_definitions.iter().find(|d|d.name==name).unwrap();assert!(def.state_commands.is_empty());let mut builder=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());let inputs=builder.add_virtual_targets(8);builder.register_public_inputs(&inputs);let zero=builder.zero();let hash=HashOutTarget{elements:[zero;4]};let mut ops=SimpleDPNBuilder::<F,2>::new_with_contract_ctx(inputs.clone(),zero,zero,zero,zero,zero,hash,hash);for node in &def.definitions{ops.process_var_def(&mut builder,node);}for a in &def.assertions{builder.connect(ops.resolve_target(a.left),ops.resolve_target(a.right));}let circuit=builder.build::<C>();println!("{name}: degree {}",circuit.common.degree_bits());
  for sample in samples[key].as_array().unwrap(){let values:Vec<u64>=sample["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect();let mut witness=PartialWitness::new();for(t,v)in inputs.iter().zip(&values){witness.set_target(*t,F::from_canonical_u64(*v))?;}let proof=circuit.prove(witness);if sample["valid"]==true{let proof=proof?;assert_eq!(proof.public_inputs,values.iter().map(|v|F::from_canonical_u64(*v)).collect::<Vec<_>>());circuit.verify(proof)?;}else{assert!(proof.is_err(),"accepted wrong {name} {values:?}");}}
 }Ok(())}
