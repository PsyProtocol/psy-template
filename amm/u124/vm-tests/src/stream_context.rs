//! Historical source authentication inside the spending circuit, not a host flag.
use crate::{
    final_state_coverage::{Review, Snapshot},
    market_key::{get_zk_public_key_param, SDKeyCircuitGadget},
    stream_source::Tape,
};
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::{
        hash_types::{HashOut, HashOutTarget},
        poseidon::PoseidonHash as H,
    },
    iop::{
        target::{BoolTarget, Target},
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::circuit_builder::CircuitBuilder,
};
use psy_client_common::traits::to_qfelts::ToQFelts;
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use psy_common_circuit::{
    hash::merkle::gadgets::merkle_proof::MerkleProofGadget,
    traits::{CreatableTarget, ToTargets, WitnessValueFor},
};
use psy_network_circuit::gadgets::qdata::{
    checkpoint::PsyCheckpointLeafGadget, contract::PsyContractLeafGadget, user::PsyUserLeafGadget,
};
struct Dependency {
    leaf: PsyContractLeafGadget,
    path: MerkleProofGadget,
}
pub struct SourceContextTargets {
    anchor: PsyCheckpointLeafGadget,
    checkpoint: PsyCheckpointLeafGadget,
    anchor_path: MerkleProofGadget,
    checkpoint_path: MerkleProofGadget,
    roots: Vec<Target>,
    dependencies: Vec<Dependency>,
    vault: PsyUserLeafGadget,
    vault_path: MerkleProofGadget,
    vault_contracts: Vec<MerkleProofGadget>,
    pub scope_hash: HashOutTarget,
    pub vault_state: HashOutTarget,
    pub vault_hash: HashOutTarget,
    ready_offset: u64,
    phase_offset: u64,
    owned: Vec<Target>,
    ready: crate::stream_source::Word,
    phase: crate::stream_source::Word,
}
impl SourceContextTargets {
    pub fn add(
        b: &mut CircuitBuilder<F, 2>,
        t: &mut Tape,
        r: &Review,
        g: &SDKeyCircuitGadget,
        scope: &[Target],
        facts: &[HashOutTarget],
        chain: [u64; 4],
        gate: BoolTarget,
    ) -> Result<Self> {
        let tape_start = t.targets.len();
        let anchor = PsyCheckpointLeafGadget::create_virtual(b);
        t.targets.extend(anchor.to_targets());
        let checkpoint = PsyCheckpointLeafGadget::create_virtual(b);
        t.targets.extend(checkpoint.to_targets());
        let anchor_path = t.proof(b, 32);
        let checkpoint_path = t.proof(b, 32);
        connect_hashes(
            b,
            gate,
            anchor_path.root,
            g.session_context.sign_context.checkpoint_tree_root,
        );
        connect_hashes(
            b,
            gate,
            checkpoint_path.root,
            g.session_context.sign_context.checkpoint_tree_root,
        );
        let one = b.one();
        connect(b, gate, anchor_path.index, one);
        connect(b, gate, checkpoint_path.index, scope[6]);
        let ah = anchor.to_hash::<H, F, 2>(b);
        let ch = checkpoint.to_hash::<H, F, 2>(b);
        connect_hashes(b, gate, anchor_path.value, ah);
        connect_hashes(b, gate, checkpoint_path.value, ch);
        let expected = b.constant_hash(HashOut {
            elements: chain.map(F::from_canonical_u64),
        });
        connect_hashes(b, gate, anchor.global_chain_root, expected);
        for i in 0..4 {
            connect(b, gate, scope[9 + i], expected.elements[i]);
            connect(b, gate, scope[13 + i], ch.elements[i]);
            connect(
                b,
                gate,
                scope[21 + i],
                checkpoint.stats.random_seed.elements[i],
            );
        }
        let roots = (0..24).map(|_| t.scalar(b)).collect::<Vec<_>>();
        let hh = roots
            .chunks_exact(4)
            .map(|s| HashOutTarget {
                elements: s.try_into().unwrap(),
            })
            .collect::<Vec<_>>();
        let cd = b.hash_two_to_one::<H>(hh[0], hh[1]);
        let uw = b.hash_two_to_one::<H>(hh[2], hh[3]);
        let base = b.hash_two_to_one::<H>(cd, uw);
        let rv = b.hash_two_to_one::<H>(hh[4], hh[5]);
        let gh = b.hash_two_to_one::<H>(base, rv);
        connect_hashes(b, gate, gh, checkpoint.global_chain_root);
        // Frozen serialization: contract, deposit, user, withdrawal, registration
        // and validator roots. Bind to actual SDK order in tests.
        let user = HashOutTarget {
            elements: roots[8..12].try_into().unwrap(),
        };
        let contracts = HashOutTarget {
            elements: roots[..4].try_into().unwrap(),
        };
        connect_hashes(b, gate, user, facts[0]);
        let mut dependencies = vec![];
        for (id, code, layout, functions, height, fields, slots) in r
            .assets
            .iter()
            .map(|a| {
                (
                    a.id,
                    a.code_root,
                    a.layout_root,
                    a.function_root,
                    a.height,
                    a.fields,
                    a.slots,
                )
            })
            .chain([(
                r.market,
                r.code_root,
                r.layout_root,
                r.function_root,
                31,
                r.layout_fields,
                r.layout_slots,
            )])
        {
            let leaf = PsyContractLeafGadget::create_virtual(b);
            t.targets.extend(leaf.to_targets());
            let path = t.proof(b, 24);
            let index = b.constant(F::from_canonical_u64(id));
            connect(b, gate, path.index, index);
            connect_hashes(b, gate, path.root, contracts);
            let lh = leaf.to_hash::<H, F, 2>(b);
            connect_hashes(b, gate, path.value, lh);
            for (a, v) in [
                (leaf.code_root, code.0),
                (leaf.state_layout_root, layout.0),
                (leaf.function_tree_root, functions.0),
            ] {
                let wanted = b.constant_hash(v);
                connect_hashes(b, gate, a, wanted);
            }
            for (a, v) in [
                (leaf.state_tree_height, height as u64),
                (leaf.state_layout_field_count, fields),
                (leaf.state_layout_slot_count, slots),
            ] {
                let wanted = b.constant(F::from_canonical_u64(v));
                connect(b, gate, a, wanted);
            }
            dependencies.push(Dependency { leaf, path });
        }
        for (start, value) in [
            (25, r.code_root),
            (29, r.layout_root),
            (37, r.function_root),
        ] {
            let h = b.constant_hash(value.0);
            for i in 0..4 {
                connect(b, gate, scope[start + i], h.elements[i]);
            }
        }
        let vault = PsyUserLeafGadget::create_virtual(b);
        t.targets.extend(vault.to_targets());
        let vault_path = t.proof(b, 32);
        connect(b, gate, vault_path.index, scope[4]);
        connect(b, gate, scope[4], g.user_id);
        connect(b, gate, vault.user_id, g.user_id);
        connect_hashes(b, gate, vault_path.root, user);
        let vh = vault.to_hash::<H, F, 2>(b);
        connect_hashes(b, gate, vault_path.value, vh);
        connect_hashes(
            b,
            gate,
            vault.public_key,
            g.session_context.start_user_leaf.public_key,
        );
        let param = get_zk_public_key_param(b, &g.private_key);
        let fingerprint = HashOutTarget {
            elements: scope[33..37].try_into().unwrap(),
        };
        let pk = b.hash_two_to_one::<H>(fingerprint, param);
        connect_hashes(b, gate, pk, vault.public_key);
        let mut vault_contracts = vec![];
        for (i, id) in [0, r.assets[1].id, r.assets[2].id, r.market]
            .into_iter()
            .enumerate()
        {
            let p = t.proof(b, 24);
            let cid = b.constant(F::from_canonical_u64(id));
            connect(b, gate, p.index, cid);
            connect_hashes(b, gate, p.root, vault.user_state_tree_root);
            connect_hashes(b, gate, p.value, facts[i + 1]);
            vault_contracts.push(p);
        }
        let ready_slot = b.constant(F::from_canonical_u64(r.offsets["batch_ready"]));
        let ready = crate::stream_source::Word::create(b, t, facts[4], ready_slot, gate, 31);
        connect(b, gate, ready.value, one);
        let phase_slot = b.constant(F::from_canonical_u64(r.offsets["batch_phase"]));
        let phase = crate::stream_source::Word::create(b, t, facts[4], phase_slot, gate, 31);
        let z = b.zero();
        let three = b.constant(F::from_canonical_u64(3));
        let four = b.constant(F::from_canonical_u64(4));
        let p0 = b.is_equal(phase.value, z);
        let p3 = b.is_equal(phase.value, three);
        let p4 = b.is_equal(phase.value, four);
        let idle = b.or(p0, p3);
        let idle = b.or(idle, p4);
        connect(b, gate, idle.target, one);
        b.range_check(scope[6], 32);
        b.range_check(g.checkpoint_id, 32);
        let le = psy_common_circuit::u32::multiple_comparison::list_lte_circuit(
            b,
            vec![scope[6]],
            vec![g.checkpoint_id],
            32,
        );
        connect(b, gate, le.target, one);
        let scope_hash = b.hash_n_to_hash_no_pad::<H>(scope.to_vec());
        Ok(Self {
            anchor,
            checkpoint,
            anchor_path,
            checkpoint_path,
            roots,
            dependencies,
            vault,
            vault_path,
            vault_contracts,
            scope_hash,
            vault_state: vault.user_state_tree_root,
            vault_hash: vh,
            ready_offset: r.offsets["batch_ready"],
            phase_offset: r.offsets["batch_phase"],
            owned: t.targets[tape_start..].to_vec(),
            ready,
            phase,
        })
    }
    pub fn set(
        &self,
        pw: &mut PartialWitness<F>,
        r: &Review,
        s: &Snapshot,
        vault_path: &psy_crypto::hash::merkle::core::MerkleProofCore<
            psy_client_common::data::qhashout::QHashOut<F>,
        >,
    ) -> Result<()> {
        self.anchor.set_witness(pw, &s.history.anchor)?;
        self.checkpoint.set_witness(pw, &s.history.checkpoint)?;
        self.anchor_path
            .set_witness_core_proof_q(pw, &s.history.anchor_path)?;
        self.checkpoint_path
            .set_witness_core_proof_q(pw, &s.history.checkpoint_path)?;
        let values = s.history.roots.to_qfelts();
        ensure!(
            values.len() == self.roots.len(),
            "frozen global state root encoding"
        );
        for (t, v) in self.roots.iter().zip(values) {
            pw.set_target(*t, v)?;
        }
        for (t, id) in self
            .dependencies
            .iter()
            .zip(r.assets.iter().map(|a| a.id).chain([r.market]))
        {
            let p = s
                .contracts
                .iter()
                .find(|p| p.id == id)
                .context("source dependency")?;
            t.leaf.set_witness(pw, &p.leaf)?;
            t.path.set_witness_core_proof_q(pw, &p.path)?;
        }
        let v = s
            .accounts
            .iter()
            .find(|a| a.leaf.user_id == F::from_canonical_u64(s.fields[4]))
            .context("source vault")?;
        self.vault.set_witness(pw, &v.leaf)?;
        self.ready
            .set(pw, &v.market, r.offsets["batch_ready"], true)?;
        self.phase
            .set(pw, &v.market, r.offsets["batch_phase"], true)?;
        self.vault_path.set_witness_core_proof_q(pw, vault_path)?;
        for (t, p) in self.vault_contracts.iter().zip([
            v.native.as_ref().context("source native")?,
            v.asset_a.as_ref().context("source A")?,
            v.asset_b.as_ref().context("source B")?,
            &v.market,
        ]) {
            t.set_witness_core_proof_q(pw, &p.contract_path)?;
        }
        Ok(())
    }
}

fn connect(b: &mut CircuitBuilder<F, 2>, gate: BoolTarget, a: Target, c: Target) {
    crate::batch_policy::eq(b, gate, a, c);
}
fn connect_hashes(
    b: &mut CircuitBuilder<F, 2>,
    gate: BoolTarget,
    a: HashOutTarget,
    c: HashOutTarget,
) {
    for (x, y) in a.elements.into_iter().zip(c.elements) {
        connect(b, gate, x, y);
    }
}
impl SourceContextTargets {
    pub fn set_empty(&self, pw: &mut PartialWitness<F>) -> Result<()> {
        let mut excluded = self.ready.inputs();
        excluded.extend(self.phase.inputs());
        for t in &self.owned {
            if !excluded.contains(t) {
                pw.set_target(*t, F::ZERO)?;
            }
        }
        self.ready.empty(pw, self.ready_offset)?;
        self.phase.empty(pw, self.phase_offset)?;
        Ok(())
    }
}
