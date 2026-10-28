//! Every UPS authenticates fresh dependency identities, including maintenance.
//! Historical source memberships alone do not authorize upgraded current code.
use crate::{
    final_state_coverage::{ContractOpening, Review},
    market_key::SDKeyCircuitGadget,
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
        target::Target,
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::circuit_builder::CircuitBuilder,
};
use psy_client_common::{data::qhashout::QHashOut as Q, traits::to_qfelts::ToQFelts};
use psy_client_data::qdata::checkpoint::{PsyCheckpointGlobalStateRoots, PsyCheckpointLeaf};
use psy_common_circuit::{
    builder::hash::core::CircuitBuilderHashCore,
    hash::merkle::gadgets::merkle_proof::MerkleProofGadget,
    traits::{CreatableTarget, ToTargets, WitnessValueFor},
};
use psy_crypto::hash::merkle::core::MerkleProofCore;
use psy_network_circuit::gadgets::qdata::{
    checkpoint::PsyCheckpointLeafGadget, contract::PsyContractLeafGadget,
};
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct CurrentOpening {
    pub anchor: PsyCheckpointLeaf<F>,
    pub anchor_path: MerkleProofCore<Q<F>>,
    pub checkpoint: PsyCheckpointLeaf<F>,
    pub roots: PsyCheckpointGlobalStateRoots<F>,
    pub contracts: Vec<ContractOpening>,
}
pub struct CurrentTargets {
    anchor: PsyCheckpointLeafGadget,
    anchor_path: MerkleProofGadget,
    checkpoint: PsyCheckpointLeafGadget,
    roots: Vec<Target>,
    dependencies: Vec<(PsyContractLeafGadget, MerkleProofGadget)>,
}
impl CurrentTargets {
    pub fn add(
        b: &mut CircuitBuilder<F, 2>,
        t: &mut Tape,
        r: &Review,
        g: &SDKeyCircuitGadget,
        chain: [u64; 4],
    ) -> Result<Self> {
        let anchor = PsyCheckpointLeafGadget::create_virtual(b);
        t.targets.extend(anchor.to_targets());
        let anchor_path = t.proof(b, 32);
        b.connect_hashes(
            anchor_path.root,
            g.session_context.sign_context.checkpoint_tree_root,
        );
        let one = b.one();
        b.connect(anchor_path.index, one);
        let ah = anchor.to_hash::<H, F, 2>(b);
        b.connect_hashes(anchor_path.value, ah);
        let expected = b.constant_hash(HashOut {
            elements: chain.map(F::from_canonical_u64),
        });
        b.connect_hashes(anchor.global_chain_root, expected);
        let checkpoint = PsyCheckpointLeafGadget::create_virtual(b);
        t.targets.extend(checkpoint.to_targets());
        let ch = checkpoint.to_hash::<H, F, 2>(b);
        b.connect_hashes(ch, g.session_context.checkpoint_leaf_hash);
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
        let root = b.hash_two_to_one::<H>(base, rv);
        b.connect_hashes(root, checkpoint.global_chain_root);
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
            b.connect(path.index, index);
            b.connect_hashes(path.root, hh[0]);
            let hash = leaf.to_hash::<H, F, 2>(b);
            b.connect_hashes(path.value, hash);
            for (actual, want) in [
                (leaf.code_root, code.0),
                (leaf.state_layout_root, layout.0),
                (leaf.function_tree_root, functions.0),
            ] {
                let want = b.constant_hash(want);
                b.connect_hashes(actual, want);
            }
            for (actual, want) in [
                (leaf.state_tree_height, height as u64),
                (leaf.state_layout_field_count, fields),
                (leaf.state_layout_slot_count, slots),
            ] {
                let want = b.constant(F::from_canonical_u64(want));
                b.connect(actual, want);
            }
            dependencies.push((leaf, path));
        }
        Ok(Self {
            anchor,
            anchor_path,
            checkpoint,
            roots,
            dependencies,
        })
    }
    pub fn set(
        &self,
        pw: &mut PartialWitness<F>,
        r: &Review,
        current: &CurrentOpening,
    ) -> Result<()> {
        self.anchor.set_witness(pw, &current.anchor)?;
        self.anchor_path
            .set_witness_core_proof_q(pw, &current.anchor_path)?;
        self.checkpoint.set_witness(pw, &current.checkpoint)?;
        let values = current.roots.to_qfelts();
        ensure!(
            values.len() == self.roots.len(),
            "current global roots encoding"
        );
        for (t, v) in self.roots.iter().zip(values) {
            pw.set_target(*t, v)?;
        }
        ensure!(
            current.contracts.len() == 4,
            "exact current dependency count"
        );
        for ((leaf, path), id) in self
            .dependencies
            .iter()
            .zip(r.assets.iter().map(|a| a.id).chain([r.market]))
        {
            let opening = current
                .contracts
                .iter()
                .find(|p| p.id == id)
                .context("current reviewed dependency")?;
            leaf.set_witness(pw, &opening.leaf)?;
            path.set_witness_core_proof_q(pw, &opening.path)?;
        }
        Ok(())
    }
}
