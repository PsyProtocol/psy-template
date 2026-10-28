//! Fixed-resource recursive linkage, conditional on an authenticated checkpoint
//! root and a qualified seed. Neither assumption is supplied by this circuit.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,Field64,PrimeField64}},iop::witness::{PartialWitness,WitnessWrite},plonk::{circuit_builder::CircuitBuilder,circuit_data::{CircuitConfig,CircuitData},config::PoseidonGoldilocksConfig as C,proof::{ProofWithPublicInputs,ProofWithPublicInputsTarget}}};
use psy_client_common::data::qhashout::QHashOut as Q;
use crate::{random_order::{frozen_root,permutation,validate_fields,PermutationCircuit,FIELDS},seal_inclusion::SealLayout,seal_inclusion_circuit::SealCircuit};
pub const SEAL_ORDER_VERSION:u64=1;
type Proof=ProofWithPublicInputs<F,C,2>;
pub struct SealOrderCircuit{
 pub data:CircuitData<F,C,2>,seal:SealCircuit,order:PermutationCircuit,
 seal_target:ProofWithPublicInputsTarget<2>,order_target:ProofWithPublicInputsTarget<2>,
}
impl SealOrderCircuit{
 pub fn build(layout:SealLayout)->Result<Self>{
  // No caller-supplied child verifier, fingerprint, common data or callback.
  let seal=SealCircuit::build(layout)?;let order=PermutationCircuit::build();
  ensure!(seal.data.common.num_public_inputs==9&&order.data.common.num_public_inputs==13,"fixed child public input widths");
  let mut b=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());
  let seal_target=b.add_virtual_proof_with_pis(&seal.data.common);let seal_key=b.constant_verifier_data(&seal.data.verifier_only);b.verify_proof::<C>(&seal_target,&seal_key,&seal.data.common);
  let order_target=b.add_virtual_proof_with_pis(&order.data.common);let order_key=b.constant_verifier_data(&order.data.verifier_only);b.verify_proof::<C>(&order_target,&order_key,&order.data.common);
  // Both children must prove the same complete frozen statement commitment.
  for i in 0..4{b.connect(seal_target.public_inputs[i],order_target.public_inputs[i]);}
  let version=b.constant(F::from_canonical_u64(SEAL_ORDER_VERSION));b.register_public_input(version);
  b.register_public_inputs(&seal_target.public_inputs); // root[4], checkpoint root[4], inclusion checkpoint
  b.register_public_inputs(&order_target.public_inputs[4..]); // seed[4], count, rank[4]
  Ok(Self{data:b.build::<C>(),seal,order,seal_target,order_target})
 }
 pub fn seal_resources(&self)->&SealCircuit{&self.seal}
 pub fn order_resources(&self)->&PermutationCircuit{&self.order}
 pub fn prove(&self,seal:&Proof,order:&Proof)->Result<Proof>{
  ensure!(seal.public_inputs.len()==9&&order.public_inputs.len()==13,"fixed child input widths");
  // The recursive circuit, rather than a host-only equality assertion, binds
  // the roots and verifies the actual two proofs under its constant keys.
  let mut pw=PartialWitness::new();pw.set_proof_with_pis_target(&self.seal_target,seal)?;pw.set_proof_with_pis_target(&self.order_target,order)?;Ok(self.data.prove(pw)?)
 }
 pub fn verify_for(&self,fields:[u64;FIELDS],seed:[u64;4],root:Q<F>,checkpoint:u64,proof:Proof)->Result<()>{
  validate_fields(&fields)?;ensure!(seed.iter().all(|n|*n<F::ORDER),"canonical seed");
  ensure!(checkpoint>fields[6]&&checkpoint<=fields[7]&&checkpoint<fields[8]&&root!=Q::ZERO,"conditional seal checkpoint/root endpoints");
  let mut expected=vec![SEAL_ORDER_VERSION];expected.extend(frozen_root(&fields)?);expected.extend(root.0.elements.map(|n|n.to_canonical_u64()));expected.push(checkpoint);expected.extend(seed);expected.push(fields[13]);expected.extend(permutation(&fields,seed)?);
  ensure!(proof.public_inputs.iter().map(|n|n.to_canonical_u64()).collect::<Vec<_>>()==expected,"sealed statement/order/checkpoint public endpoints");
  Ok(self.data.verify(proof)?)
 }
}
