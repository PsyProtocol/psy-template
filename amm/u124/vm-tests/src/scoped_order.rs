//! Versioned seal/permutation binding. Supplied identities, checkpoint root and
//! seed remain unqualified; this component cannot authorize market execution.
use anyhow::{ensure, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F, types::{Field, Field64, PrimeField64}},
    hash::{hash_types::{HashOut, HashOutTarget}, poseidon::PoseidonHash},
    iop::{target::Target, witness::{PartialWitness, WitnessWrite}},
    plonk::{circuit_builder::CircuitBuilder, circuit_data::{CircuitConfig, CircuitData},
        config::{Hasher, PoseidonGoldilocksConfig as C}, proof::ProofWithPublicInputs}};
use psy_client_common::data::qhashout::QHashOut as Q;
use crate::{random_order::{validate_fields, constrain_frozen_statement, constrain_permutation,
        order_keys_with_root, FIELDS},
    seal_inclusion::{SealLayout, SealOpening, verify_seal_root},
    seal_inclusion_circuit::{Openings, bind_checkpoint, bind_account, bind_contract, bind_stored_root}};

pub const SCOPE_FIELDS: usize = 36;
const TAG: u64 = 0x50535953434f5032;
type Proof = ProofWithPublicInputs<F, C, 2>;
#[derive(Clone)]
pub struct ScopedInput { pub fields: [u64; FIELDS], pub scope: [u64; SCOPE_FIELDS], pub seed: [u64; 4] }
fn f(value: u64) -> F { F::from_canonical_u64(value) }
pub fn validate_scope(scope: &[u64; SCOPE_FIELDS]) -> Result<()> {
    ensure!(scope[0] == 2, "scoped seal version");
    for start in [1, 9, 18, 27] {
        ensure!(scope[start..start + 8].iter().all(|v| *v <= u32::MAX as u64)
            && scope[start..start + 8].iter().any(|v| *v != 0), "complete nonzero 256-bit identity");
    }
    for index in [17, 26, 35] { ensure!(scope[index] > 0 && scope[index] < 1 << 62, "scope epoch/nonce bound"); }
    Ok(())
}
pub fn decode_scoped_input(bytes: &[u8]) -> Result<ScopedInput> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Wire { fields: Vec<String>, scope_fields: Vec<String>, seed: Vec<String> }
    ensure!(bytes.len() <= 32768, "bounded scoped input");
    let wire: Wire = serde_json::from_slice(bytes)?;
    fn values<const N: usize>(strings: Vec<String>) -> Result<[u64; N]> {
        ensure!(strings.len() == N, "exact scoped input width");
        let mut out = [0; N];
        for (index, text) in strings.iter().enumerate() {
            let value: u64 = text.parse()?; ensure!(value.to_string() == *text, "canonical scoped integer"); out[index] = value;
        }
        Ok(out)
    }
    let input = ScopedInput { fields: values(wire.fields)?, scope: values(wire.scope_fields)?, seed: values(wire.seed)? };
    validate_fields(&input.fields)?; validate_scope(&input.scope)?;
    ensure!(input.seed.iter().all(|n| *n < F::ORDER), "canonical scoped seed");
    Ok(input)
}
pub fn scoped_root(input: &ScopedInput) -> Result<[u64; 4]> {
    validate_fields(&input.fields)?; validate_scope(&input.scope)?;
    let mut values = vec![f(TAG)]; values.extend(input.fields.map(f)); values.extend(input.scope.map(f));
    Ok(PoseidonHash::hash_no_pad(&values).elements.map(|n| n.to_canonical_u64()))
}
pub fn scoped_permutation(input: &ScopedInput) -> Result<[u64; 4]> {
    ensure!(input.seed.iter().all(|n| *n < F::ORDER), "canonical scoped seed");
    let keys = order_keys_with_root(&input.fields, input.seed, scoped_root(input)?);
    let mut rank = [0, 1, 2, 3];
    rank[..input.fields[13] as usize].sort_by_key(|i| (keys[*i as usize], input.fields[50 + 6 * *i as usize], input.fields[51 + 6 * *i as usize]));
    Ok(rank)
}
pub fn verify_scoped_opening(input: &ScopedInput, layout: SealLayout, root: Q<F>, opening: &SealOpening) -> Result<()> {
    verify_seal_root(&input.fields, layout, root, opening, Q(HashOut { elements: scoped_root(input)?.map(f) }))
}
pub fn expected_public_inputs(input: &ScopedInput, root: Q<F>, checkpoint: u64) -> Result<Vec<F>> {
    ensure!(root != Q::ZERO && checkpoint > input.fields[6] && checkpoint <= input.fields[7] && checkpoint < input.fields[8], "scoped seal checkpoint endpoints");
    let mut expected = vec![2]; expected.extend(scoped_root(input)?); expected.extend(root.0.elements.map(|n| n.to_canonical_u64())); expected.push(checkpoint);
    expected.extend(input.scope); expected.extend(input.seed); expected.push(input.fields[13]); expected.extend(scoped_permutation(input)?);
    Ok(expected.into_iter().map(f).collect())
}
fn constrain_scope(b: &mut CircuitBuilder<F, 2>, fields: &[Target; FIELDS], scope: &[Target; SCOPE_FIELDS]) -> HashOutTarget {
    let version = b.constant(f(2)); b.connect(scope[0], version);
    let zero = b.zero();
    for start in [1, 9, 18, 27] {
        let mut empty = b._true();
        for value in &scope[start..start + 8] { b.range_check(*value, 32); let eq = b.is_equal(*value, zero); empty = b.and(empty, eq); }
        b.assert_zero(empty.target);
    }
    for index in [17, 26, 35] { b.range_check(scope[index], 62); let eq = b.is_equal(scope[index], zero); b.assert_zero(eq.target); }
    let tag = b.constant(f(TAG)); let mut values = vec![tag]; values.extend(*fields); values.extend(*scope);
    b.hash_n_to_hash_no_pad::<PoseidonHash>(values)
}
pub struct ScopedOrderCircuit {
    pub data: CircuitData<F, C, 2>, fields: [Target; FIELDS], scope: [Target; SCOPE_FIELDS],
    checkpoint_root: HashOutTarget, checkpoint: Target, seed: HashOutTarget, rank: [Target; 4], opening: Openings,
}
impl ScopedOrderCircuit {
    pub fn build(layout: SealLayout) -> Result<Self> {
        layout.validate()?;
        let mut b = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
        let fields: [Target; FIELDS] = b.add_virtual_targets(FIELDS).try_into().unwrap();
        let scope: [Target; SCOPE_FIELDS] = b.add_virtual_targets(SCOPE_FIELDS).try_into().unwrap();
        let checkpoint_root = b.add_virtual_hash(); let checkpoint = b.add_virtual_target();
        let seed = b.add_virtual_hash(); let rank: [Target; 4] = b.add_virtual_targets(4).try_into().unwrap();
        let (_, active) = constrain_frozen_statement(&mut b, &fields);
        let root = constrain_scope(&mut b, &fields, &scope);
        constrain_permutation(&mut b, &fields, root, seed, rank, active);
        let opening = Openings::create(&mut b, layout)?;
        bind_checkpoint(&mut b, &fields, checkpoint_root, checkpoint, &opening);
        bind_account(&mut b, &fields, checkpoint, &opening); bind_contract(&mut b, &fields, layout, &opening);
        bind_stored_root(&mut b, root, layout, &opening)?;
        let zero = b.zero(); let mut empty = b._true();
        for value in checkpoint_root.elements { let eq = b.is_equal(value, zero); empty = b.and(empty, eq); } b.assert_zero(empty.target);
        let version = b.constant(f(2)); b.register_public_input(version);
        b.register_public_inputs(&root.elements); b.register_public_inputs(&checkpoint_root.elements); b.register_public_input(checkpoint);
        b.register_public_inputs(&scope); b.register_public_inputs(&seed.elements); b.register_public_input(fields[13]); b.register_public_inputs(&rank);
        Ok(Self { data: b.build::<C>(), fields, scope, checkpoint_root, checkpoint, seed, rank, opening })
    }
    pub fn prove(&self, input: &ScopedInput, root: Q<F>, opening: &SealOpening, rank: [u64; 4]) -> Result<Proof> {
        ensure!(input.fields.iter().chain(&input.scope).chain(&input.seed).chain(&rank).all(|n| *n < F::ORDER), "canonical scoped witness");
        ensure!(opening.schema == 1 && opening.checkpoint_id <= u32::MAX as u64, "scoped opening schema/checkpoint");
        let mut pw = PartialWitness::new();
        for (target, value) in self.fields.iter().zip(input.fields) { pw.set_target(*target, f(value))?; }
        for (target, value) in self.scope.iter().zip(input.scope) { pw.set_target(*target, f(value))?; }
        pw.set_hash_target(self.checkpoint_root, root.0)?; pw.set_target(self.checkpoint, f(opening.checkpoint_id))?;
        pw.set_hash_target(self.seed, HashOut { elements: input.seed.map(f) })?;
        for (target, value) in self.rank.iter().zip(rank) { pw.set_target(*target, f(value))?; }
        self.opening.set(&mut pw, opening)?;
        Ok(self.data.prove(pw)?)
    }
    pub fn verify_for(&self, input: &ScopedInput, root: Q<F>, checkpoint: u64, proof: Proof) -> Result<()> {
        ensure!(proof.public_inputs == expected_public_inputs(input, root, checkpoint)?, "scoped seal/order public endpoints");
        Ok(self.data.verify(proof)?)
    }
}
