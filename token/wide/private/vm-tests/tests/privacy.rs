//! Exact compiled DPN operations + native note proofs on synthetic checkpoints.
//! State/session adapters are local fixtures; this is not a submitted UPS.
use anyhow::{bail, ensure, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{hash_types::HashOut, poseidon::PoseidonHash},
    plonk::config::{Hasher, PoseidonGoldilocksConfig as C},
};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{
    privacy::private_note_inclusion::PrivateNoteInclusionInput, qdata::user::PsyUserLeaf,
};
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_crypto::hash::merkle::core::MerkleProofCore;
use psy_dpn_circuit::circuits::{
    cfc::DapenContractFunctionCircuit, privacy::private_note_inclusion::PrivateNoteInclusionCircuit,
};
use psy_vm::dpn::{
    eval::executor::{ExecutionContext, InMemoryStateBackend, StateBackend, VmExecutor},
    ops::{
        op_types::DPNOpType,
        state_cmd::{data::DPNStateCmd, types::DPNStateCmdCore},
    },
    vm::{def::DPNFunctionCircuitDefinition, exec::SimpleDPNExecutor},
};
use serde_json::Value;
use std::{collections::HashMap, fs};
const T: u64 = 42;
const A: u64 = 200;
const BOB: u64 = 300;
const CP: u64 = 100;
const RADIX: u128 = 1 << 62;
const MAX: u128 = RADIX * RADIX - 1;
const SLOTS: [u64; 2] = [293601306, 293601307];
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn h(v: &[u64]) -> HashOut<F> {
    PoseidonHash::hash_no_pad(&v.iter().copied().map(f).collect::<Vec<_>>())
}
fn hh(a: HashOut<F>, b: HashOut<F>) -> HashOut<F> {
    PoseidonHash::two_to_one(a, b)
}
fn zero() -> HashOut<F> {
    HashOut {
        elements: [F::ZERO; 4],
    }
}
fn words(a: HashOut<F>) -> Vec<u64> {
    a.elements.iter().map(|x| x.to_canonical_u64()).collect()
}
fn merkle(
    value: HashOut<F>,
    index: u64,
    siblings: Vec<HashOut<F>>,
) -> MerkleProofCore<QHashOut<F>> {
    let mut root = value;
    for (i, s) in siblings.iter().enumerate() {
        root = if index >> i & 1 == 0 {
            hh(root, *s)
        } else {
            hh(*s, root)
        };
    }
    MerkleProofCore {
        root: QHashOut(root),
        value: QHashOut(value),
        index,
        siblings: siblings.into_iter().map(QHashOut).collect(),
    }
}
fn zeros(height: usize) -> Vec<HashOut<F>> {
    let mut v = vec![];
    let mut z = zero();
    for _ in 0..height {
        v.push(z);
        z = hh(z, z);
    }
    v
}
#[derive(Clone)]
struct World {
    state: InMemoryStateBackend,
    fields: HashMap<String, u64>,
    methods: HashMap<String, DPNFunctionCircuitDefinition>,
}
impl World {
    fn new() -> Result<Self> {
        let p = std::env::var("TOKEN_WIDE_PRIVATE_ARTIFACT")?;
        let a: Value = serde_json::from_slice(&fs::read(p)?)?;
        ensure!(a["state_tree_height"] == 32, "wrong height");
        let defs: Vec<DPNFunctionCircuitDefinition> =
            serde_json::from_value(a["circuit_definitions"].clone())?;
        Ok(Self {
            state: InMemoryStateBackend::new(),
            fields: a["abi"]["contract"]["state"]
                .as_array()
                .unwrap()
                .iter()
                .map(|x| {
                    (
                        x["name"].as_str().unwrap().into(),
                        x["offset"].as_u64().unwrap(),
                    )
                })
                .collect(),
            methods: defs.into_iter().map(|d| (d.name.clone(), d)).collect(),
        })
    }
    fn balance(&self, u: u64) -> u128 {
        self.state.get_contract_slot(u, T, 0).unwrap() as u128
            + RADIX * self.state.get_contract_slot(u, T, 1).unwrap() as u128
    }
    fn set_balance(&mut self, u: u64, n: u128) {
        self.state.set_slot(u, T, 0, (n % RADIX) as u64);
        self.state.set_slot(u, T, 1, (n / RADIX) as u64);
    }
    fn transfer(&mut self, value: u128, owner: HashOut<F>, secrets: [HashOut<F>; 2]) -> Result<()> {
        let mut inputs = words(owner);
        inputs.extend([(value % RADIX) as u64, (value / RADIX) as u64]);
        for s in secrets {
            inputs.extend(words(s));
        }
        let mut vm = VmExecutor::new(self.state.clone());
        let r = vm.execute(
            &self.methods["private_transfer"],
            &ExecutionContext {
                user_id: A,
                contract_id: T,
                caller_contract_id: psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64,
                checkpoint_id: CP,
                nonce: 1,
                user_public_key_hash: [0; 4],
            },
            &inputs,
        )?;
        ensure!(r.success, "{:?}", r.failure);
        self.state.apply_overlay(vm.write_overlay());
        Ok(())
    }
    fn note_root(&self, limb: usize) -> HashOut<F> {
        HashOut {
            elements: self
                .state
                .get_contract_hash(A, T, SLOTS[limb])
                .unwrap()
                .map(f),
        }
    }
    // Production SimpleDPNExecutor evaluates every unchanged compiled definition.
    // Explicit state command adapter supplies fixture reads and commits only after all assertions.
    fn claim(
        &mut self,
        user: u64,
        inputs: &[u64],
        session: HashOut<F>,
        checkpoint_root: HashOut<F>,
    ) -> Result<()> {
        let d = &self.methods["private_claim"];
        ensure!(inputs.len() == d.circuit_inputs.len(), "input arity");
        let mut ops = SimpleDPNExecutor::new_with_contract_ctx(
            inputs.iter().copied().map(f).collect(),
            f(user),
            f(T),
            f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),
            f(CP),
            f(1),
            [F::ZERO; 4],
            session.elements,
        );
        let mut state = self.state.clone();
        let mut results: HashMap<usize, Vec<F>> = HashMap::new();
        for step in 0..=d.definitions.len() {
            for (i, c) in d.state_commands.iter().enumerate() {
                if d.state_command_resolution_indices[i] as usize != step {
                    continue;
                }
                let resolved = c.convert_to_u64(
                    &c.get_inputs()
                        .iter()
                        .map(|id| ops.resolve_target(*id).to_canonical_u64())
                        .collect::<Vec<_>>(),
                );
                let v: Vec<u64> = match resolved {
                    DPNStateCmd::GetGlobalStateRoots(c) => {
                        ensure!(c.checkpoint_id == CP, "unknown checkpoint");
                        let mut v = vec![0; 20];
                        v[8..12].copy_from_slice(&words(checkpoint_root));
                        v
                    }
                    DPNStateCmd::GetSelfUserCurrentContractStateSlotRange(c) => {
                        state.get_contract_range(user, T, c.sub_slot_index, c.length as usize)?
                    }
                    DPNStateCmd::ContainsSelfUserCurrentIMTContractStateValue(c) => {
                        vec![(state.get_imt_value(user, T, &c.key) != [0; 4]) as u64]
                    }
                    DPNStateCmd::SetIMTContractStateValue(c) => {
                        let old = state.get_imt_value(user, T, &c.key);
                        if c.condition != 0 {
                            state.set_imt_value(user, T, &c.key, &c.value);
                        }
                        old.into_iter().chain(c.value).collect()
                    }
                    DPNStateCmd::SetContractStateSlotRange(c) => {
                        let old =
                            state.get_contract_range(user, T, c.sub_slot_index, c.value.len())?;
                        if c.condition != 0 {
                            for (j, v) in c.value.iter().enumerate() {
                                state.set_slot(user, T, c.sub_slot_index + j as u64, *v);
                            }
                        }
                        old.into_iter().chain(c.value).collect()
                    }
                    _ => bail!("unsupported fixture command {resolved:?}"),
                };
                results.insert(i, v.into_iter().map(f).collect());
            }
            if step == d.definitions.len() {
                break;
            }
            let op = &d.definitions[step];
            match op.op_type {
                DPNOpType::GetStateCommandResultSingle => {
                    ops.push_external_target(op.index, results[&(op.inputs[0] as usize)][0])
                }
                DPNOpType::GetStateCommandResultArray => ops.push_external_target_array(
                    op.index,
                    results[&(op.inputs[0] as usize)].clone(),
                ),
                DPNOpType::GetStateCommandResultHash => ops.push_external_hash(
                    op.index,
                    results[&(op.inputs[0] as usize)][..4].try_into().unwrap(),
                ),
                DPNOpType::SplitBits => {
                    let n = ops.resolve_target(op.inputs[1]).to_canonical_u64();
                    ensure!(
                        op.inputs[0] == 64 || n < (1u64 << op.inputs[0]),
                        "VM SplitBits range rejection"
                    );
                    ops.process_var_def(op);
                }
                _ => ops.process_var_def(op),
            }
        }
        for a in &d.assertions {
            ensure!(
                ops.resolve_target(a.left) == ops.resolve_target(a.right),
                "{}",
                a.message
            );
        }
        self.state = state;
        Ok(())
    }
}
struct Notes {
    inputs: Vec<u64>,
    session: HashOut<F>,
    checkpoint: HashOut<F>,
    native: [PrivateNoteInclusionInput<F>; 2],
}
fn prepare(w: &World, amount: u128, fp: HashOut<F>) -> Notes {
    let owner = h(&[BOB, 1337, 7, 8]);
    let nullifier_secrets = [h(&[11, 12]), h(&[21, 22])];
    let note_secrets = [h(&[31, 32]), h(&[41, 42])];
    let amounts = [(amount % RADIX) as u64, (amount / RADIX) as u64];
    let roots = [w.note_root(0), w.note_root(1)];
    let mut slotproofs = vec![];
    for l in 0..2 {
        let mut sib = zeros(32);
        sib[0] = roots[1 - l];
        slotproofs.push(merkle(roots[l], SLOTS[l], sib));
    }
    assert_eq!(slotproofs[0].root, slotproofs[1].root);
    let contract = merkle(
        slotproofs[0].root.0,
        T,
        zeros(psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize),
    );
    let user = PsyUserLeaf::new_user_default(f(A), QHashOut(zero()), contract.root);
    let userproof = merkle(
        user.alghash::<PoseidonHash>().0,
        A,
        zeros(psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize),
    );
    let native = std::array::from_fn(|l| {
        let commitment = hh(
            hh(
                owner,
                HashOut {
                    elements: [f(amounts[l]), F::ZERO, F::ZERO, F::ZERO],
                },
            ),
            PoseidonHash::hash_no_pad(
                &nullifier_secrets[l]
                    .elements
                    .into_iter()
                    .chain(note_secrets[l].elements)
                    .collect::<Vec<_>>(),
            ),
        );
        let membership = merkle(commitment, 0, zeros(20));
        if amounts[l] != 0 {
            assert_eq!(membership.root.0, roots[l]);
        }
        PrivateNoteInclusionInput {
            nullifier_secret: QHashOut(nullifier_secrets[l]),
            sender_user_id: A,
            contract_id: T,
            user_leaf: user,
            owner: QHashOut(owner),
            amount: f(amounts[l]),
            note_secret: QHashOut(note_secrets[l]),
            note_membership_proof: membership,
            note_root_slot: SLOTS[l],
            note_root_slot_proof: slotproofs[l].clone(),
            contract_proof: contract.clone(),
            user_tree_proof: userproof.clone(),
            checkpoint_id: f(CP),
        }
    });
    let nullifiers = std::array::from_fn::<_, 2, _>(|l| {
        if amounts[l] != 0 {
            PoseidonHash::hash_no_pad(&nullifier_secrets[l].elements)
        } else {
            zero()
        }
    });
    let leaves = std::array::from_fn::<_, 2, _>(|l| {
        if amounts[l] == 0 {
            return zero();
        }
        let mut pi = words(owner);
        pi.push(amounts[l]);
        pi.extend(words(userproof.root.0));
        pi.extend([CP, SLOTS[l], T]);
        pi.extend(words(nullifiers[l]));
        hh(fp, h(&pi))
    });
    let mut inputs = words(owner);
    inputs.extend(amounts);
    inputs.extend(words(userproof.root.0));
    inputs.extend([CP, 7, 8]);
    inputs.extend(words(nullifiers[0]));
    inputs.extend(words(nullifiers[1]));
    let mut session = zero();
    for l in 0..2 {
        if amounts[l] == 0 {
            inputs.extend(vec![0; 65]);
            continue;
        }
        let mut sib = zeros(16);
        sib[0] = leaves[1 - l];
        let p = merkle(leaves[l], l as u64, sib);
        if session != zero() {
            assert_eq!(session, p.root.0);
        }
        session = p.root.0;
        for s in p.siblings {
            inputs.extend(words(s.0));
        }
        inputs.push(l as u64);
    }
    Notes {
        inputs,
        session,
        checkpoint: userproof.root.0,
        native,
    }
}
fn funding_secrets() -> [HashOut<F>; 2] {
    [
        PoseidonHash::hash_no_pad(
            &h(&[11, 12])
                .elements
                .into_iter()
                .chain(h(&[31, 32]).elements)
                .collect::<Vec<_>>(),
        ),
        PoseidonHash::hash_no_pad(
            &h(&[21, 22])
                .elements
                .into_iter()
                .chain(h(&[41, 42]).elements)
                .collect::<Vec<_>>(),
        ),
    ]
}
fn fp() -> HashOut<F> {
    HashOut {
        elements: [
            2482434993266711942,
            6028864160300535936,
            2827549014984201026,
            3018365102481798071,
        ]
        .map(f),
    }
}
#[test]
fn real_native_note_proofs_and_u124_roundtrip_with_atomic_rejections() -> Result<()> {
    let mut w = World::new()?;
    let amount = 10u128.pow(27) + 123;
    w.set_balance(A, amount + 9);
    w.transfer(amount, h(&[BOB, 1337, 7, 8]), funding_secrets())?;
    assert_eq!(w.balance(A), 9);
    let n = prepare(&w, amount, fp());
    if let Ok(dir) = std::env::var("PRIVATE_TOKEN_SYNTHETIC_PROOF_FIXTURE") {
        let mut out = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir)?;
        std::io::Write::write_all(&mut out, &serde_json::to_vec(&n.native[0])?)?;
    }
    let circuit = PrivateNoteInclusionCircuit::<C, 2>::new(
        psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize,
        psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize,
        32,
        20,
    );
    assert_eq!(circuit.get_fingerprint().0, fp());
    for l in 0..2 {
        let proof = circuit.prove(&n.native[l])?;
        let mut values = words(n.native[l].owner.0);
        values.push(n.native[l].amount.to_canonical_u64());
        values.extend(words(n.checkpoint));
        values.extend([CP, SLOTS[l], T]);
        values.extend(words(PoseidonHash::hash_no_pad(
            &n.native[l].nullifier_secret.0.elements,
        )));
        assert_eq!(proof.public_inputs, h(&values).elements);
        plonky2::plonk::circuit_data::VerifierCircuitData {
            verifier_only: circuit.get_verifier_config_ref().clone(),
            common: circuit.get_common_circuit_data_ref().clone(),
        }
        .verify(proof)?;
    }
    let mut forged = n.native[0].clone();
    forged.amount += F::ONE;
    assert!(circuit.prove(&forged).is_err());
    let mut forged = n.native[0].clone();
    forged.contract_id += 1;
    assert!(circuit.prove(&forged).is_err());
    // Every mutation uses unchanged trusted roots; none may consume a nullifier.
    let mut mutations = vec![];
    for i in [0, 4, 5, 6, 10, 11, 13, 17, 21, 85, 86, 150] {
        let mut a = n.inputs.clone();
        a[i] = (a[i] + 1) % 18_446_744_069_414_584_321;
        mutations.push(a);
    }
    let mut a = n.inputs.clone();
    a[4] = RADIX as u64;
    mutations.push(a);
    let mut a = n.inputs.clone();
    a[85] = 65536;
    mutations.push(a);
    for a in mutations {
        assert!(w.claim(BOB, &a, n.session, n.checkpoint).is_err());
        assert_eq!(w.balance(BOB), 0);
        assert_eq!(w.state.imt_entries_for(BOB, T).count(), 0);
    }
    assert!(w
        .claim(BOB + 1, &n.inputs, n.session, n.checkpoint)
        .is_err());
    assert!(w.claim(BOB, &n.inputs, zero(), n.checkpoint).is_err());
    assert!(w.claim(BOB, &n.inputs, n.session, zero()).is_err());
    w.set_balance(BOB, MAX);
    assert!(w.claim(BOB, &n.inputs, n.session, n.checkpoint).is_err());
    assert_eq!(w.state.imt_entries_for(BOB, T).count(), 0);
    w.set_balance(BOB, 0);
    w.claim(BOB, &n.inputs, n.session, n.checkpoint)?;
    assert_eq!(w.balance(BOB), amount);
    assert_eq!(w.state.imt_entries_for(BOB, T).count(), 2);
    assert!(w.claim(BOB, &n.inputs, n.session, n.checkpoint).is_err());
    assert_eq!(w.balance(A) + w.balance(BOB), amount + 9);
    // Low proof cannot authorize high denomination: keep the native session unchanged.
    let mut swapped = n.inputs.clone();
    swapped.swap(4, 5);
    for i in 0..4 {
        swapped.swap(13 + i, 17 + i);
    }
    for i in 0..65 {
        swapped.swap(21 + i, 86 + i);
    }
    let mut clean = World::new()?;
    assert!(clean.claim(BOB, &swapped, n.session, n.checkpoint).is_err());
    Ok(())
}
#[test]
fn zero_limb_max_amount_and_note_capacity() -> Result<()> {
    for amount in [1, RADIX, RADIX - 1, MAX] {
        let mut w = World::new()?;
        w.set_balance(A, amount);
        w.transfer(amount, h(&[BOB, 1337, 7, 8]), funding_secrets())?;
        let n = prepare(&w, amount, fp());
        w.claim(BOB, &n.inputs, n.session, n.checkpoint)?;
        assert_eq!(w.balance(BOB), amount);
        assert_eq!(w.balance(A), 0);
        assert!(w.claim(BOB, &n.inputs, n.session, n.checkpoint).is_err());
        if amount % RADIX == 0 {
            let mut bad = n.inputs.clone();
            bad[13] = 1;
            let mut fresh = World::new()?;
            assert!(fresh.claim(BOB, &bad, n.session, n.checkpoint).is_err());
        }
    }
    let mut w = World::new()?;
    w.set_balance(A, 9);
    assert!(w
        .transfer(0, h(&[BOB, 1337, 7, 8]), funding_secrets())
        .is_err());
    assert!(w
        .transfer(10, h(&[BOB, 1337, 7, 8]), funding_secrets())
        .is_err());
    w.set_balance(A, RADIX + 9);
    w.state
        .set_slot(A, T, w.fields["private_note_count_high"], 1048576);
    assert!(w
        .transfer(RADIX + 1, h(&[BOB, 1337, 7, 8]), funding_secrets())
        .is_err());
    assert_eq!(w.balance(A), RADIX + 9);
    Ok(())
}
#[test]
fn both_private_cfc_circuits_build_at_production_height() -> Result<()> {
    let w = World::new()?;
    for name in ["private_transfer", "private_claim"] {
        let c = DapenContractFunctionCircuit::<C, 2>::new(&w.methods[name], 32, 16, false);
        println!("{name} CFC degree {}", c.circuit_data.common.degree_bits());
    }
    Ok(())
}
#[test]
fn exact_claim_op_gadgets_verify_and_reject_changed_amount_or_denominations() -> Result<()> {
    use plonky2::{
        hash::hash_types::HashOutTarget,
        iop::witness::{PartialWitness, WitnessWrite},
        plonk::{circuit_builder::CircuitBuilder, circuit_data::CircuitConfig},
    };
    use psy_dpn_circuit::vm::ops::SimpleDPNBuilder;
    let mut w = World::new()?;
    let amount = 10u128.pow(27) + 123;
    w.set_balance(A, amount);
    w.transfer(amount, h(&[BOB, 1337, 7, 8]), funding_secrets())?;
    let n = prepare(&w, amount, fp());
    let d = &w.methods["private_claim"];
    let mut builder = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
    let inputs = builder.add_virtual_targets(151);
    builder.register_public_inputs(&inputs);
    let user = builder.constant(f(BOB));
    let contract = builder.constant(f(T));
    let caller = builder.constant(f(
        psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64,
    ));
    let cp = builder.constant(f(CP));
    let nonce = builder.one();
    let z = builder.zero();
    let pubkey = HashOutTarget { elements: [z; 4] };
    let root = HashOutTarget {
        elements: n.session.elements.map(|x| builder.constant(x)),
    };
    let mut ops = SimpleDPNBuilder::new_with_contract_ctx(
        inputs.clone(),
        user,
        contract,
        caller,
        cp,
        nonce,
        pubkey,
        root,
    );
    for op in &d.definitions {
        match op.op_type {
            DPNOpType::GetStateCommandResultSingle => {
                ensure!(
                    [2, 4].contains(&op.inputs[0]),
                    "unexpected fixture single result"
                );
                ops.push_external_target(op.index, z);
            }
            DPNOpType::GetStateCommandResultArray => {
                let values = match op.inputs[0] {
                    0 => {
                        let mut v = vec![F::ZERO; 20];
                        v[8..12].copy_from_slice(&n.checkpoint.elements);
                        v
                    }
                    1 => vec![F::ZERO; 2],
                    _ => bail!("unexpected fixture array result"),
                };
                ops.push_external_target_array(
                    op.index,
                    values.into_iter().map(|x| builder.constant(x)).collect(),
                );
            }
            _ => ops.process_var_def(&mut builder, op),
        }
    }
    for a in &d.assertions {
        builder.connect(ops.resolve_target(a.left), ops.resolve_target(a.right));
    }
    let circuit = builder.build::<C>();
    println!(
        "private_claim exact assertion gadgets: degree {}",
        circuit.common.degree_bits()
    );
    for mutation in [
        None,
        Some(0),
        Some(4),
        Some(5),
        Some(6),
        Some(13),
        Some(17),
        Some(21),
        Some(86),
    ] {
        let mut values = n.inputs.clone();
        if let Some(i) = mutation {
            values[i] += 1;
        }
        let mut pw = PartialWitness::new();
        for (t, v) in inputs.iter().zip(values) {
            pw.set_target(*t, f(v))?;
        }
        let result = circuit.prove(pw);
        if mutation.is_none() {
            circuit.verify(result?)?;
        } else {
            assert!(result.is_err(), "forged claim gadget proof at {mutation:?}");
        }
    }
    Ok(())
}
#[test]
fn denomination_trees_append_independently_and_full_high_tree_rolls_back_low_append() -> Result<()>
{
    let owner = h(&[BOB, 1337, 7, 8]);
    let secrets = funding_secrets();
    let mut w = World::new()?;
    w.set_balance(A, 3 * RADIX + 9);
    w.transfer(RADIX + 2, owner, secrets)?;
    let low0 = hh(
        hh(
            owner,
            HashOut {
                elements: [f(2), F::ZERO, F::ZERO, F::ZERO],
            },
        ),
        secrets[0],
    );
    let low_root0 = w.note_root(0);
    let high_root0 = w.note_root(1);
    w.transfer(3, owner, secrets)?;
    let low1 = hh(
        hh(
            owner,
            HashOut {
                elements: [f(3), F::ZERO, F::ZERO, F::ZERO],
            },
        ),
        secrets[0],
    );
    let mut siblings = zeros(20);
    siblings[0] = low0;
    assert_eq!(w.note_root(0), merkle(low1, 1, siblings).root.0);
    assert_ne!(w.note_root(0), low_root0);
    assert_eq!(w.note_root(1), high_root0);
    assert_eq!(
        w.state
            .get_contract_slot(A, T, w.fields["private_note_count_low"])?,
        2
    );
    assert_eq!(
        w.state
            .get_contract_slot(A, T, w.fields["private_note_count_high"])?,
        1
    );
    let before = w.note_root(0);
    let balance = w.balance(A);
    w.state
        .set_slot(A, T, w.fields["private_note_count_high"], 1048576);
    assert!(w.transfer(RADIX + 1, owner, secrets).is_err());
    assert_eq!(w.note_root(0), before);
    assert_eq!(w.balance(A), balance);
    assert_eq!(
        w.state
            .get_contract_slot(A, T, w.fields["private_note_count_low"])?,
        2
    );
    Ok(())
}
