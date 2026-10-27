//! Application-owned stateless market authorization on the selected SDK primitives.
//! The compact policy has logical slots distinct from the actual UPS stack. It
//! uses the SDK's explicit signature-proof/endcap interface, never pretends to be
//! a programmable DPN function or enables the unsupported wallet Plonky2 mode.
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    gates::gate::GateRef,
    hash::{
        hash_types::{HashOut, HashOutTarget},
        poseidon::PoseidonHash,
    },
    iop::{
        target::Target,
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::{
        circuit_builder::CircuitBuilder,
        circuit_data::{CircuitData, VerifierOnlyCircuitData},
        config::{Hasher, PoseidonGoldilocksConfig as C},
        proof::ProofWithPublicInputs,
    },
};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::qstore::controllers::proving_session::PsyReadLocalProvingSessionStore;
use psy_client_data::{
    dpn::sd_key::SDKeyTransactionInfo,
    qdata::{
        ups_signature::PsyUserProvingSessionSignatureDataCompact, user::PsyUserLeaf,
        user_contract_state::SignContext,
    },
};
use psy_common_circuit::{
    builder::{
        hash::core::CircuitBuilderHashCore,
        pad_circuit::{pad_circuit_degree, CircuitBuilderPsyCommonGates},
    },
    proof_minifier::pm_chain::PsyProofMinifierChain,
    traits::CreatableTarget,
    u32::gates::comparison::ComparisonGate,
};
use psy_config::{network_constants::DEFERRED_CALL_MAGIC, PSY_NETWORK_MAGIC};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_network_circuit::{
    gadgets::qdata::{user::PsyUserLeafGadget, user_contract_state::SignContextGadget},
    ups::gadgets::ups_signature_data::PsyUserProvingSessionSignatureDataCompactGadget,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketKeyConfig {
    pub num_introspectable_transactions: u32,
    pub can_read_state: bool,
    pub contract_state_tree_height: u8,
    pub requires_secp256k1: bool,
    pub num_secp256k1_slots: u32,
}
#[derive(Debug, Clone)]
pub struct MarketTransactionInfoTargets {
    pub contract_id: Target,
    pub method_id: Target,
    pub caller_contract_id: Target,
    pub inputs_length: Target,
    pub inputs_hash: HashOutTarget,
    pub tx_hash: HashOutTarget,
}
#[derive(Debug)]
pub struct MarketTransactionIntrospection {
    pub tx_info_slots: Vec<MarketTransactionInfoTargets>,
    pub tx_stack_hash: HashOutTarget,
    pub tx_count: Target,
}
#[derive(Debug)]
pub struct MarketSessionContextTargets {
    pub start_user_leaf_hash: HashOutTarget,
    pub checkpoint_leaf_hash: HashOutTarget,
    pub sign_context: SignContextGadget,
    pub nonce: Target,
    pub start_user_leaf: PsyUserLeafGadget,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MarketSessionContext {
    pub start_user_leaf_hash: QHashOut<F>,
    pub checkpoint_leaf_hash: QHashOut<F>,
    pub checkpoint_tree_root: QHashOut<F>,
    pub current_user_leaf: PsyUserLeaf<F>,
    pub nonce: F,
    pub start_user_leaf: PsyUserLeaf<F>,
}
#[derive(Clone, Debug)]
pub struct MarketKeyWitness {
    pub session_context: MarketSessionContext,
    pub circuit_inputs: Vec<F>,
    pub transaction_infos: Vec<SDKeyTransactionInfo<F>>,
    pub tx_stack_hash: QHashOut<F>,
    pub tx_count: F,
    pub state_reader_results: Option<()>,
    pub secp256k1_slots: Vec<()>,
    pub checkpoint_id: F,
    pub user_id: F,
}
#[derive(Debug)]
pub struct MarketKeyCircuit {
    pub config: MarketKeyConfig,
    pub tx_introspection: MarketTransactionIntrospection,
    pub circuit_inputs: Vec<Target>,
    pub private_key: HashOutTarget,
    pub sig_hash: HashOutTarget,
    pub session_context: MarketSessionContextTargets,
    pub checkpoint_id: Target,
    pub user_id: Target,
    pub state_reader: Option<()>,
    pub secp256k1: Option<()>,
    pub circuit_data: Option<CircuitData<F, C, 2>>,
    pub minifier_chain: Option<PsyProofMinifierChain<2, F, C>>,
}
pub fn get_sd_key_public_key_param(private: &QHashOut<F>) -> QHashOut<F> {
    psy_ups_circuit::signature::sd_key_dpn::get_sd_key_public_key_param(private)
}
pub fn get_zk_public_key_param(
    builder: &mut CircuitBuilder<F, 2>,
    private: &HashOutTarget,
) -> HashOutTarget {
    psy_ups_circuit::signature::sd_key_plonky2::get_zk_public_key_param::<C, 2>(builder, private)
}
pub fn compute_tx_stack_hash(infos: &[SDKeyTransactionInfo<F>]) -> QHashOut<F> {
    infos.iter().fold(QHashOut::ZERO, |running, tx| {
        let hash = PoseidonHash::hash_no_pad(&[
            F::from_noncanonical_u64(DEFERRED_CALL_MAGIC),
            tx.caller_contract_id,
            tx.contract_id,
            tx.method_id,
            tx.inputs_length,
            tx.inputs_hash.0.elements[0],
            tx.inputs_hash.0.elements[1],
            tx.inputs_hash.0.elements[2],
            tx.inputs_hash.0.elements[3],
        ]);
        QHashOut(PoseidonHash::two_to_one(running.0, hash))
    })
}
pub fn add_session_context(
    builder: &mut CircuitBuilder<F, 2>,
    sig_hash: HashOutTarget,
    user_id: Target,
    checkpoint_id: Target,
    stack: HashOutTarget,
    count: Target,
) -> MarketSessionContextTargets {
    let start_user_leaf = PsyUserLeafGadget::create_virtual(builder);
    let start_user_leaf_hash = start_user_leaf.to_hash::<PoseidonHash, F, 2>(builder);
    let sign_context = SignContextGadget::add_virtual_to(builder);
    let checkpoint_leaf_hash = builder.add_virtual_hash();
    let nonce = builder.add_virtual_target();
    builder.connect(start_user_leaf.nonce, sign_context.user_leaf.nonce);
    builder.connect(start_user_leaf.user_id, sign_context.user_leaf.user_id);
    builder.connect_hashes(
        start_user_leaf.public_key,
        sign_context.user_leaf.public_key,
    );
    let mut end = sign_context.user_leaf;
    end.nonce = nonce;
    let end_hash = end.to_hash::<PoseidonHash, F, 2>(builder);
    let data = PsyUserProvingSessionSignatureDataCompactGadget::new_from_known(
        start_user_leaf_hash,
        end_hash,
        checkpoint_leaf_hash,
        stack,
        count,
    );
    let expected = data
        .get_sig_action_with_user_info::<PoseidonHash, F, 2>(
            builder,
            PSY_NETWORK_MAGIC,
            user_id,
            nonce,
            &sign_context,
        )
        .sig_action_hash;
    builder.connect_hashes(sig_hash, expected);
    builder.connect(user_id, sign_context.user_leaf.user_id);
    builder.connect(checkpoint_id, sign_context.user_leaf.last_checkpoint_id);
    MarketSessionContextTargets {
        start_user_leaf_hash,
        checkpoint_leaf_hash,
        sign_context,
        nonce,
        start_user_leaf,
    }
}
impl MarketKeyCircuit {
    pub fn add_virtual_to(
        b: &mut CircuitBuilder<F, 2>,
        config: &MarketKeyConfig,
        input_len: usize,
    ) -> Self {
        assert!(
            !config.can_read_state && !config.requires_secp256k1 && config.num_secp256k1_slots == 0,
            "market keys are stateless and have no secp256k1 slots"
        );
        assert!(
            (1..=64).contains(&config.num_introspectable_transactions),
            "bounded exact logical slots"
        );
        let private_key = b.add_virtual_hash();
        let sig_hash = b.add_virtual_hash();
        let user_id = b.add_virtual_target();
        let checkpoint_id = b.add_virtual_target();
        let circuit_inputs = b.add_virtual_targets(input_len);
        let tx_count = b.add_virtual_target();
        let tx_stack_hash = b.add_virtual_hash();
        let mut running = b.constant_hash(HashOut::ZERO);
        let mut slots = Vec::new();
        let magic = b.constant(F::from_noncanonical_u64(DEFERRED_CALL_MAGIC));
        for _ in 0..config.num_introspectable_transactions {
            let contract_id = b.add_virtual_target();
            let method_id = b.add_virtual_target();
            let caller_contract_id = b.add_virtual_target();
            let inputs_length = b.add_virtual_target();
            let inputs_hash = b.add_virtual_hash();
            let tx_hash = b.hash_n_to_hash_no_pad::<PoseidonHash>(vec![
                magic,
                caller_contract_id,
                contract_id,
                method_id,
                inputs_length,
                inputs_hash.elements[0],
                inputs_hash.elements[1],
                inputs_hash.elements[2],
                inputs_hash.elements[3],
            ]);
            running = b.hash_two_to_one::<PoseidonHash>(running, tx_hash);
            slots.push(MarketTransactionInfoTargets {
                contract_id,
                method_id,
                caller_contract_id,
                inputs_length,
                inputs_hash,
                tx_hash,
            });
        }
        b.connect_hashes(running, tx_stack_hash);
        let exact_count = b.constant(F::from_canonical_u64(
            config.num_introspectable_transactions as u64,
        ));
        b.connect(tx_count, exact_count);
        let session_context =
            add_session_context(b, sig_hash, user_id, checkpoint_id, tx_stack_hash, tx_count);
        let param = get_zk_public_key_param(b, &private_key);
        let public = b.hash_two_to_one::<PoseidonHash>(sig_hash, param);
        b.register_public_inputs(&public.elements);
        Self {
            config: config.clone(),
            tx_introspection: MarketTransactionIntrospection {
                tx_info_slots: slots,
                tx_stack_hash,
                tx_count,
            },
            circuit_inputs,
            private_key,
            sig_hash,
            session_context,
            checkpoint_id,
            user_id,
            state_reader: None,
            secp256k1: None,
            circuit_data: None,
            minifier_chain: None,
        }
    }
    pub fn build_circuit(&mut self, mut builder: CircuitBuilder<F, 2>) -> Result<()> {
        builder.add_psy_type_b_common_gates();
        pad_circuit_degree::<F, 2>(&mut builder, 11);
        let data = builder.build::<C>();
        let gates = [GateRef::new(ComparisonGate::new(32, 16))];
        let chain = PsyProofMinifierChain::<2, F, C>::new_add_gates(
            &data.verifier_only,
            &data.common,
            2,
            Some(&gates),
        );
        self.circuit_data = Some(data);
        self.minifier_chain = Some(chain);
        Ok(())
    }
    pub fn get_fingerprint(&self) -> QHashOut<F> {
        QHashOut(
            self.minifier_chain
                .as_ref()
                .expect("built market key")
                .get_fingerprint(),
        )
    }
    pub fn get_verifier_config_ref(&self) -> Option<&VerifierOnlyCircuitData<C, 2>> {
        self.minifier_chain.as_ref().map(|c| c.get_verifier_data())
    }
    pub async fn prove(
        &self,
        private: QHashOut<F>,
        input: &MarketKeyWitness,
        sig_hash: QHashOut<F>,
    ) -> Result<ProofWithPublicInputs<F, C, 2>> {
        ensure!(
            !self.config.can_read_state
                && self.state_reader.is_none()
                && self.secp256k1.is_none()
                && input.state_reader_results.is_none()
                && input.secp256k1_slots.is_empty(),
            "unsupported market witness feature"
        );
        ensure!(
            input.circuit_inputs.len() == self.circuit_inputs.len()
                && input.transaction_infos.len() == self.tx_introspection.tx_info_slots.len(),
            "exact market witness shape"
        );
        let s = &input.session_context;
        ensure!(
            s.start_user_leaf.qfhash::<PoseidonHash>() == s.start_user_leaf_hash
                && s.start_user_leaf.nonce == s.current_user_leaf.nonce
                && s.start_user_leaf.user_id == s.current_user_leaf.user_id
                && s.start_user_leaf.public_key == s.current_user_leaf.public_key,
            "market start/current identity binding"
        );
        ensure!(
            input.user_id == s.current_user_leaf.user_id
                && input.checkpoint_id == s.current_user_leaf.last_checkpoint_id,
            "market signed identity/checkpoint binding"
        );
        let mut end = s.current_user_leaf;
        end.nonce = s.nonce;
        let data = PsyUserProvingSessionSignatureDataCompact {
            start_user_leaf_hash: s.start_user_leaf_hash,
            end_user_leaf_hash: end.qfhash::<PoseidonHash>(),
            checkpoint_leaf_hash: s.checkpoint_leaf_hash,
            tx_stack_hash: input.tx_stack_hash,
            tx_count: input.tx_count,
        };
        let expected = data
            .get_sig_action_for_user::<PoseidonHash>(
                PSY_NETWORK_MAGIC,
                input.user_id,
                s.nonce,
                SignContext {
                    checkpoint_tree_root: s.checkpoint_tree_root,
                    user_leaf: s.current_user_leaf,
                },
            )
            .get_qhash::<PoseidonHash>();
        ensure!(
            expected == sig_hash,
            "market exact SDK signature preimage differs"
        );
        let mut pw = PartialWitness::<F>::new();
        pw.set_hash_target(self.private_key, private.0)?;
        pw.set_hash_target(self.sig_hash, sig_hash.0)?;
        pw.set_target(self.user_id, input.user_id)?;
        pw.set_target(self.checkpoint_id, input.checkpoint_id)?;
        pw.set_target_arr(&self.circuit_inputs, &input.circuit_inputs)?;
        pw.set_hash_target(self.tx_introspection.tx_stack_hash, input.tx_stack_hash.0)?;
        pw.set_target(self.tx_introspection.tx_count, input.tx_count)?;
        for (slot, tx) in self
            .tx_introspection
            .tx_info_slots
            .iter()
            .zip(&input.transaction_infos)
        {
            pw.set_target(slot.contract_id, tx.contract_id)?;
            pw.set_target(slot.method_id, tx.method_id)?;
            pw.set_target(slot.caller_contract_id, tx.caller_contract_id)?;
            pw.set_target(slot.inputs_length, tx.inputs_length)?;
            pw.set_hash_target(slot.inputs_hash, tx.inputs_hash.0)?;
        }
        self.session_context
            .start_user_leaf
            .set_witness(&mut pw, &s.start_user_leaf)?;
        pw.set_hash_target(
            self.session_context.checkpoint_leaf_hash,
            s.checkpoint_leaf_hash.0,
        )?;
        self.session_context
            .sign_context
            .user_leaf
            .set_witness(&mut pw, &s.current_user_leaf)?;
        pw.set_hash_target(
            self.session_context.sign_context.checkpoint_tree_root,
            s.checkpoint_tree_root.0,
        )?;
        pw.set_target(self.session_context.nonce, s.nonce)?;
        let proof = self
            .circuit_data
            .as_ref()
            .context("market circuit not built")?
            .prove(pw)?;
        self.minifier_chain
            .as_ref()
            .context("market minifier not built")?
            .prove(&proof)
    }
}

// Local policy-source aliases; these are application types, not SDK modes.
pub type SDKeyCircuitGadget = MarketKeyCircuit;
pub type SDKeyTransactionInfoTargets = MarketTransactionInfoTargets;
pub type SDKeyTransactionIntrospectionGadget = MarketTransactionIntrospection;
pub type SDKeySessionContextTargets = MarketSessionContextTargets;
pub type SDKeyCircuitWitnessInput = MarketKeyWitness;
pub type SDKeySessionContext = MarketSessionContext;

/// Sign the exact already-proved session through the SDK's explicit Endcap
/// interface. No wallet-mode relabeling, auto-submit or replacement request.
pub async fn prove_session_endcap(
    session: &psy_prover::session::session::WalletSession,
    public: QHashOut<F>,
    private: QHashOut<F>,
    circuit: &MarketKeyCircuit,
    fields: &[u64],
    logical_infos: Option<Vec<SDKeyTransactionInfo<F>>>,
) -> Result<(
    psy_client_data::guta::end_cap_input::SubmitUserEndCapNonProofInput<F>,
    ProofWithPublicInputs<F, C, 2>,
)> {
    let mut manager = session
        .user_session_mgrs
        .get_mut(&public)
        .context("market session absent")?;
    let header = *manager.get_current_ups_header();
    let nonce = manager.require_lps()?.get_nonce();
    let actual = manager.sd_key_transaction_infos();
    ensure!(
        header.current_state.tx_count.to_canonical_u64() == actual.len() as u64
            && compute_tx_stack_hash(&actual) == header.current_state.tx_hash_stack,
        "actual complete market call stack differs"
    );
    let identity = psy_crypto::signature::zk::data::ZKPublicKeyInfo {
        public_key_param: get_sd_key_public_key_param(&private),
        fingerprint: circuit.get_fingerprint(),
    };
    ensure!(
        identity.qfhash::<PoseidonHash>() == public
            && header.current_state.user_leaf.public_key == public,
        "market signing identity differs"
    );
    let witness = MarketKeyWitness {
        session_context: MarketSessionContext {
            start_user_leaf_hash: header
                .session_start_context
                .start_session_user_leaf
                .qfhash::<PoseidonHash>(),
            start_user_leaf: header.session_start_context.start_session_user_leaf,
            checkpoint_leaf_hash: header.session_start_context.checkpoint_leaf_hash,
            checkpoint_tree_root: header.session_start_context.checkpoint_tree_root,
            current_user_leaf: header.current_state.user_leaf,
            nonce,
        },
        circuit_inputs: fields.iter().copied().map(F::from_canonical_u64).collect(),
        transaction_infos: logical_infos.unwrap_or(actual),
        tx_stack_hash: header.current_state.tx_hash_stack,
        tx_count: header.current_state.tx_count,
        state_reader_results: None,
        secp256k1_slots: vec![],
        checkpoint_id: header.session_start_context.checkpoint_id,
        user_id: header.session_start_context.start_session_user_leaf.user_id,
    };
    let signature = circuit
        .prove(
            private,
            &witness,
            manager.get_sighash(PSY_NETWORK_MAGIC, nonce),
        )
        .await?;
    circuit
        .minifier_chain
        .as_ref()
        .context("market minifier absent")?
        .verify(signature.clone())?;
    let cm = session.wallet.random_circuit_manager();
    manager.proof_tree_state.finalize_tree(cm.as_ref()).await?;
    let slots = manager.require_lps()?.get_total_slots_modified();
    let proof = manager
        .prove_end_cap(
            cm.as_ref(),
            PSY_NETWORK_MAGIC,
            nonce,
            slots,
            circuit.get_fingerprint(),
            identity.public_key_param,
            signature,
            circuit
                .get_verifier_config_ref()
                .context("market verifier absent")?
                .clone(),
        )
        .await?;
    let input = manager.get_api_input().await?;
    crate::proof_binding::validate_endcap_binding(&input.core, &proof.public_inputs)?;
    Ok((input, proof))
}
