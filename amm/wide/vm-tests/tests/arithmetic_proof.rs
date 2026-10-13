//! Prove and verify the same straight-line arithmetic with production DPN op gadgets.
//! This is an arithmetic subcircuit proof, not a full state/UPS/deployment proof.
use anyhow::Result;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field}, hash::hash_types::HashOutTarget, iop::witness::{PartialWitness,WitnessWrite}, plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig,config::PoseidonGoldilocksConfig as C}};
use psy_dpn_circuit::vm::ops::SimpleDPNBuilder;
use std::{fs,path::PathBuf};
#[test]
fn wide_comparison_proofs_verify_and_reject_wrong_or_wrapped_products() -> Result<()> {
    let source=fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contract/src/arithmetic-probe.psy.rs"))?;
    let artifact=psy_compiler::compile(&source)?;
    let max=(1u64<<56)-1;
    for name in ["verify_le","verify_lt","verify_eq"] {
        let def=artifact.circuit_definitions.iter().find(|d| d.name==name).unwrap();
        assert!(def.state_commands.is_empty());
        let mut builder=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());
        let inputs=builder.add_virtual_targets(4);
        builder.register_public_inputs(&inputs);
        let zero=builder.zero();let hash=HashOutTarget{elements:[zero;4]};
        let mut ops=SimpleDPNBuilder::<F,2>::new_with_contract_ctx(inputs.clone(),zero,zero,zero,zero,zero,hash,hash);
        for op in &def.definitions {ops.process_var_def(&mut builder,op);}
        for assertion in &def.assertions {builder.connect(ops.resolve_target(assertion.left),ops.resolve_target(assertion.right));}
        let circuit=builder.build::<C>();
        println!("{name}: {} gates, degree {}",circuit.common.degree(),circuit.common.degree_bits());
        let equal=[900_000_000_000,9_970_000_000_000_000,9_970_000_000_000_000,900_000_000_000];
        let lesser=[max-1,max,max,max];
        let greater=[max,max,max-1,max];
        let mut samples=vec![(equal,name!="verify_lt"),(lesser,name!="verify_eq"),(greater,false),([max+1,1,max,1],false)];
        // The first product wraps in a Felt; the other is its field residue.
        let modulus=18_446_744_069_414_584_321u128;
        let residue=(u128::from(1u64<<32).pow(2)%modulus) as u64;
        samples.push(([1u64<<32,1u64<<32,residue,1],false));
        for (values,valid) in samples {
            let mut pw=PartialWitness::new();
            for (t,v) in inputs.iter().zip(values) {pw.set_target(*t,F::from_canonical_u64(v))?;}
            let proof=circuit.prove(pw);
            if valid {let proof=proof?;assert_eq!(proof.public_inputs,values.map(F::from_canonical_u64));circuit.verify(proof)?;}
            else {assert!(proof.is_err(),"{name} accepted invalid {values:?}");}
        }
    }
    Ok(())
}
