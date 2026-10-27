//! Public proof verification only. No wallet, witness, RPC, signing or broadcast.
use anyhow::{ensure, Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, Field64, PrimeField64},
    },
    hash::poseidon::PoseidonHash as H,
    plonk::{
        circuit_data::VerifierCircuitData, config::PoseidonGoldilocksConfig as C,
        proof::ProofWithPublicInputs,
    },
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::{
    dpn::proving_session::DPNProvingSessionCompactMethodCall,
    guta::end_cap_input::SubmitUserEndCapNonProofInput,
    qdata::{
        contract_inclusion::PsyContractFunctionInclusionProof,
        ups_signature::PsyUserProvingSessionSignatureDataCompact, user::PsyUserLeaf,
        user_contract_state::SignContext,
    },
    ups::{
        ups_context_input::UserProvingSessionHeader,
        ups_standard_cfc_input::UPSCFCStandardStateDeltaInput,
    },
};
use psy_common_circuit::serialization::PsyGateSerializer;
use psy_crypto::hash::traits::{
    hasher::{FieldQHasher, MerkleZeroHasher},
    qhashable::QFieldHashable,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
const SDK: &str = "06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f";
const MAGIC: u64 = 1384803358401154921;
type Header = UserProvingSessionHeader<F>;
type Proof = ProofWithPublicInputs<F, C, 2>;
#[derive(Serialize, Deserialize)]
pub struct PublicRequest {
    pub user_ec_input: SubmitUserEndCapNonProofInput<F>,
    pub proof: Vec<u8>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApprovedCall {
    pub contract_id: String,
    pub method_id: Option<String>,
    pub method_name: String,
    pub inputs: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WalletApproval {
    pub user_id: u64,
    pub public_key: Q<F>,
    pub nonce: u64,
    pub checkpoint_min: u64,
    pub checkpoint_max: u64,
    pub start_leaf: Q<F>,
    pub max_fee: u64,
    pub network_magic: u64,
    pub sdk_manifest: String,
    pub calls: Vec<ApprovedCall>,
}
#[derive(Serialize, Deserialize)]
pub struct ContractVerifier {
    pub contract_id: u64,
    pub code_root: Q<F>,
    pub layout_root: Q<F>,
    pub function_root: Q<F>,
    pub height: u64,
    pub fields: u64,
    pub slots: u64,
    pub methods: Vec<MethodVerifier>,
}
#[derive(Serialize, Deserialize)]
pub struct MethodVerifier {
    pub method_id: u32,
    pub name: String,
    pub arity: usize,
    pub outputs: usize,
    pub function_index: u64,
    pub fingerprint: Q<F>,
    pub verifier_b64: String,
}
#[derive(Serialize, Deserialize)]
pub struct VerifierPack {
    pub schema: u32,
    pub sdk_manifest: String,
    pub network_magic: u64,
    pub ups_whitelist: Q<F>,
    pub start_fingerprint: Q<F>,
    pub step_fingerprint: Q<F>,
    pub endcap_b64: String,
    pub start_b64: String,
    pub step_b64: String,
    pub sign_b64: String,
    pub sign_fingerprint: Q<F>,
    pub contracts: Vec<ContractVerifier>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicStep {
    pub contract_id: u64,
    pub method_id: u32,
    pub method_name: String,
    pub cfc_session_root: Q<F>,
    pub state_delta: UPSCFCStandardStateDeltaInput<F>,
    pub inclusion: PsyContractFunctionInclusionProof<F>,
    pub end_header: Header,
    pub cfc_proof_b64: String,
    pub ups_proof_b64: String,
    pub ups_known_root: Q<F>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicBundle {
    pub schema: u32,
    pub anchor: PublicAnchor,
    pub start_header: Header,
    pub start_proof_b64: String,
    pub steps: Vec<PublicStep>,
    pub sign_proof_b64: String,
    pub public_key_param: Q<F>,
    pub sig_hash: Q<F>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicAnchor {
    pub start_checkpoint_id: u64,
    pub checkpoint_leaf: psy_client_data::qdata::checkpoint::PsyCheckpointLeaf<F>,
    pub global_state_roots: psy_client_data::qdata::checkpoint::PsyCheckpointGlobalStateRoots<F>,
    pub ups_step_circuit_whitelist_root: Q<F>,
}
fn stable_json(v: &serde_json::Value) -> Result<String> {
    Ok(match v {
        serde_json::Value::Null => "null".into(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => {
            serde_json::to_string(&n.as_u64().context("noninteger public anchor")?.to_string())?
        }
        serde_json::Value::String(s) => serde_json::to_string(s)?,
        serde_json::Value::Array(a) => format!(
            "[{}]",
            a.iter()
                .map(stable_json)
                .collect::<Result<Vec<_>>>()?
                .join(",")
        ),
        serde_json::Value::Object(o) => {
            let mut pairs = o.iter().collect::<Vec<_>>();
            pairs.sort_by_key(|(k, _)| *k);
            format!(
                "{{{}}}",
                pairs
                    .into_iter()
                    .map(|(k, v)| Ok(format!("{}:{}", serde_json::to_string(k)?, stable_json(v)?)))
                    .collect::<Result<Vec<_>>>()?
                    .join(",")
            )
        }
    })
}
fn verifier(text: &str) -> Result<VerifierCircuitData<F, C, 2>> {
    let bytes = B64.decode(text)?;
    ensure!(bytes.len() <= 2_000_000, "verifier resource size");
    VerifierCircuitData::from_bytes(bytes, &PsyGateSerializer)
        .map_err(|e| anyhow::anyhow!("verifier decode: {e}"))
}
fn proof(text: &str) -> Result<Proof> {
    let bytes = B64.decode(text)?;
    ensure!(bytes.len() <= 2_000_000, "proof resource size");
    Ok(bincode::deserialize(&bytes)?)
}
fn verify_hash(v: &VerifierCircuitData<F, C, 2>, p: Proof, want: Q<F>) -> Result<()> {
    ensure!(
        p.public_inputs == want.0.elements,
        "proof public input binding"
    );
    v.verify(p)?;
    Ok(())
}
fn integer(text: &str) -> Result<u64> {
    ensure!(
        !text.is_empty()
            && text.bytes().all(|b| b.is_ascii_digit())
            && (text == "0" || !text.starts_with('0')),
        "canonical approved integer"
    );
    let n = text.parse::<u64>()?;
    ensure!(n < F::ORDER, "approved integer outside Felt");
    Ok(n)
}
fn pi(root: Q<F>, header: Q<F>) -> Q<F> {
    H::q_two_to_one(root, header)
}
fn session_root(leaves: &[Q<F>]) -> Q<F> {
    if leaves.is_empty() {
        return H::get_zero_hash(16);
    }
    let mut row = leaves.to_vec();
    for height in 0..16 {
        if row.len() % 2 == 1 {
            row.push(H::get_zero_hash(height));
        }
        row = row.chunks(2).map(|c| H::q_two_to_one(c[0], c[1])).collect();
    }
    row[0]
}
pub fn verify_market_request(
    pack: &VerifierPack,
    request_bytes: &[u8],
    approval: &WalletApproval,
    bundle: &PublicBundle,
) -> Result<serde_json::Value> {
    ensure!(
        request_bytes.len() <= 6_000_000 && pack.schema == 1 && bundle.schema == 1,
        "request/bundle version or size"
    );
    ensure!(
        pack.sdk_manifest == SDK
            && approval.sdk_manifest == SDK
            && pack.network_magic == MAGIC
            && approval.network_magic == MAGIC,
        "compiled dependency/network identity"
    );
    ensure!(
        approval.user_id > 0
            && approval.user_id < 16777216
            && approval.nonce > 0
            && approval.nonce < (1u64 << 62),
        "ordinary user/nonce"
    );
    ensure!(
        approval.calls.len() >= 2
            && approval.calls.len() <= 17
            && bundle.steps.len() == approval.calls.len(),
        "complete bounded call stack"
    );
    let request: PublicRequest = serde_json::from_slice(request_bytes)?;
    let core = &request.user_ec_input.core;
    let full: Proof = bincode::deserialize(&request.proof)?;
    let fixed = verifier(&pack.endcap_b64)?;
    verify_hash(&fixed, full, core.get_proof_public_inputs_hash::<H>())?;
    ensure!(
        core.new_user_leaf.qfhash::<H>() == core.state_transition.end_user_leaf_hash
            && core.new_user_leaf.user_id == core.state_transition.user_id
            && core.new_user_leaf.last_checkpoint_id == core.checkpoint_id,
        "endcap endpoint binding"
    );
    ensure!(
        core.state_transition.user_id.to_canonical_u64() == approval.user_id
            && core.new_user_leaf.public_key == approval.public_key
            && core.new_user_leaf.nonce.to_canonical_u64() == approval.nonce
            && core.state_transition.start_user_leaf_hash == approval.start_leaf,
        "approval identity/state/nonce"
    );
    let mut heights = psy_client_data::guta::api::SimpleContractHeightCache::new();
    for c in &pack.contracts {
        ensure!(c.height <= 32, "contract state height");
        heights.add_contract(
            c.contract_id,
            c.height as u8,
            H::get_zero_hash(c.height as usize),
        );
    }
    request
        .user_ec_input
        .ensure_simple_self_consistent::<H>(core.get_proof_public_inputs_hash::<H>(), &heights)?;
    request.user_ec_input.verify_and_generate_cst_updates::<H>(
        core.checkpoint_id.to_canonical_u64(),
        bundle
            .start_header
            .session_start_context
            .start_session_user_leaf
            .user_state_tree_root,
    )?;

    let cp = core.checkpoint_id.to_canonical_u64();
    ensure!(
        approval.checkpoint_min <= cp && cp <= approval.checkpoint_max,
        "approval expiry"
    );
    let fee = core
        .stats
        .guta_fees_collected
        .to_canonical_u64()
        .checked_add(core.stats.da_fees_collected.to_canonical_u64())
        .context("fee overflow")?;
    ensure!(
        fee > 0
            && fee <= approval.max_fee
            && core.stats.user_ops_processed == F::ONE
            && core.stats.total_transactions.to_canonical_u64() == approval.calls.len() as u64,
        "fees/whole-stack count"
    );
    let start_key = verifier(&pack.start_b64)?;
    let step_key = verifier(&pack.step_b64)?;
    let sign_key = verifier(&pack.sign_b64)?;
    let mut previous = bundle.start_header;
    let session = previous.session_start_context;
    ensure!(
        bundle.anchor.start_checkpoint_id == cp
            && bundle.anchor.checkpoint_leaf.qfhash::<H>() == session.checkpoint_leaf_hash
            && bundle.anchor.global_state_roots.qfhash::<H>()
                == bundle.anchor.checkpoint_leaf.global_chain_root
            && bundle.anchor.ups_step_circuit_whitelist_root == pack.ups_whitelist,
        "public session anchor"
    );
    let session_hash = format!(
        "{:x}",
        Sha256::digest(stable_json(&serde_json::to_value(&bundle.anchor)?)?.as_bytes())
    );
    ensure!(
        session.checkpoint_id == core.checkpoint_id
            && session.checkpoint_tree_root == core.state_transition.checkpoint_tree_root_hash
            && session.start_session_user_leaf.qfhash::<H>() == approval.start_leaf,
        "start session endpoint"
    );
    ensure!(
        session.start_session_user_leaf.public_key == approval.public_key
            && session.start_session_user_leaf.user_id.to_canonical_u64() == approval.user_id
            && session
                .start_session_user_leaf
                .nonce
                .to_canonical_u64()
                .checked_add(1)
                == Some(approval.nonce),
        "start key/nonce"
    );
    ensure!(
        previous.ups_step_circuit_whitelist_root == pack.ups_whitelist
            && previous.current_state.tx_count == F::ZERO
            && previous.current_state.tx_hash_stack == Q::ZERO,
        "start stack/whitelist"
    );
    verify_hash(
        &start_key,
        proof(&bundle.start_proof_b64)?,
        pi(H::get_zero_hash(16), previous.qfhash::<H>()),
    )?;
    let mut proof_leaves = vec![H::q_two_to_one(
        pack.start_fingerprint,
        pi(H::get_zero_hash(16), previous.qfhash::<H>()),
    )];
    let mut event_cursor = 0usize;
    let mut methods = BTreeMap::new();
    for c in &pack.contracts {
        for m in &c.methods {
            ensure!(
                methods
                    .insert((c.contract_id, m.method_id), (c, m))
                    .is_none(),
                "duplicate trusted method"
            );
        }
    }
    for (i, (step, want)) in bundle.steps.iter().zip(&approval.calls).enumerate() {
        let (contract, method) = methods
            .get(&(step.contract_id, step.method_id))
            .context("unreviewed method verifier")?;
        ensure!(
            want.contract_id == step.contract_id.to_string()
                && want.method_name == step.method_name
                && step.method_name == method.name
                && want
                    .method_id
                    .as_ref()
                    .is_none_or(|v| v == &step.method_id.to_string()),
            "approved call identity/order"
        );
        ensure!(want.inputs.len() == method.arity, "approved arity");
        let inputs = want
            .inputs
            .iter()
            .map(|s| integer(s).map(F::from_canonical_u64))
            .collect::<Result<Vec<_>>>()?;
        let call = DPNProvingSessionCompactMethodCall::new_from_inputs::<H>(
            F::from_canonical_u64(4294967296),
            F::from_canonical_u64(step.contract_id),
            F::from_canonical_u32(step.method_id),
            &inputs,
        );
        let context = &step.state_delta.cfc_transaction_input_context;
        let begin = context.transaction_call_start_ctx;
        let end = context.transaction_end_ctx;
        ensure!(call == begin.call_data, "approved parameters/caller");
        ensure!(
            context.proving_session_start_ctx.qfhash::<H>() == session.qfhash::<H>(),
            "call session binding"
        );
        ensure!(
            context.proving_session_start_ctx.state_roots.qfhash::<H>()
                == context
                    .proving_session_start_ctx
                    .checkpoint_leaf
                    .global_chain_root,
            "checkpoint state root"
        );
        let inclusion = &step.inclusion;
        let leaf = &inclusion.contract_inclusion_proof.contract_leaf;
        let tree = &inclusion
            .contract_inclusion_proof
            .contract_tree_merkle_proof;
        let function = &inclusion.contract_function_merkle_proof;
        ensure!(
            leaf.code_root == contract.code_root
                && leaf.state_layout_root == contract.layout_root
                && leaf.function_tree_root == contract.function_root
                && leaf.state_tree_height.to_canonical_u64() == contract.height
                && leaf.state_layout_field_count.to_canonical_u64() == contract.fields
                && leaf.state_layout_slot_count.to_canonical_u64() == contract.slots,
            "code/layout binding"
        );
        ensure!(
            tree.index == step.contract_id
                && tree.value == leaf.qfhash::<H>()
                && tree.verify::<H>()
                && tree.root
                    == context
                        .proving_session_start_ctx
                        .state_roots
                        .contract_tree_root,
            "authenticated contract inclusion"
        );
        ensure!(
            function.index == 2 * method.function_index
                && function.value == method.fingerprint
                && function.verify::<H>()
                && function.root == contract.function_root,
            "authenticated method inclusion"
        );
        ensure!(
            function.siblings.first()
                == Some(&Q::from_values(
                    step.method_id as u64,
                    ((method.outputs as u64) << 32) | method.arity as u64,
                    0,
                    0
                )),
            "function arity commitment"
        );
        ensure!(
            step.cfc_session_root == session_root(&proof_leaves),
            "CFC proof session tree root"
        );
        let cfc_key = verifier(&method.verifier_b64)?;
        verify_hash(
            &cfc_key,
            proof(&step.cfc_proof_b64)?,
            pi(step.cfc_session_root, context.qfhash::<H>()),
        )?;
        proof_leaves.push(H::q_two_to_one(
            method.fingerprint,
            pi(step.cfc_session_root, context.qfhash::<H>()),
        ));
        ensure!(
            step.ups_known_root == session_root(&proof_leaves),
            "UPS proof session tree root"
        );
        let old = previous.current_state;
        // The selected protocol commits event count/index, not event data. Event
        // sidecars are advisory only: never use them as balances, NFT identity,
        // receipt evidence or proof of execution. Check their public envelope.
        let emitted = usize::try_from(end.total_events_emitted.to_canonical_u64())?;
        ensure!(emitted <= 32, "event sidecar bound");
        for offset in 0..emitted {
            let event = request
                .user_ec_input
                .events
                .get(event_cursor)
                .context("missing event sidecar")?;
            ensure!(
                event.checkpoint_id == core.checkpoint_id
                    && event.user_id == F::from_canonical_u64(approval.user_id)
                    && event.contract_id == F::from_canonical_u64(step.contract_id)
                    && event.method_id == F::from_canonical_u32(step.method_id)
                    && event.event_index
                        == old.user_leaf.event_index + F::from_canonical_usize(offset)
                    && event.data.len() <= 64,
                "event sidecar envelope"
            );
            event_cursor += 1;
        }
        ensure!(
            begin.start_user_contract_tree_root == old.user_leaf.user_state_tree_root
                && begin.start_user_balance == old.user_leaf.balance
                && begin.start_user_event_index == old.user_leaf.event_index
                && begin.start_deferred_tx_debt_tree_root == old.deferred_tx_debt_tree_root
                && begin.previous_tx_stack_hash == old.tx_hash_stack
                && begin.previous_tx_count == old.tx_count,
            "ordered start state/stack"
        );
        ensure!(
            step.state_delta.deferred_tx_debt_pivot_proof.root == old.deferred_tx_debt_tree_root
                && step.state_delta.deferred_tx_debt_pivot_proof.verify::<H>()
                && step.state_delta.deferred_tx_debt_pivot_proof.value == Q::ZERO,
            "deferred debt remains empty"
        );
        let delta = &step.state_delta.user_contract_tree_update_proof;
        ensure!(
            delta.index == step.contract_id
                && delta.old_root == old.user_leaf.user_state_tree_root
                && delta.new_value == end.end_contract_state_tree_root
                && delta.verify::<H>(),
            "ordered contract state delta"
        );
        ensure!(
            delta.old_value == begin.start_contract_state_tree_root
                || (delta.old_value == Q::ZERO
                    && begin.start_contract_state_tree_root
                        == H::get_zero_hash(contract.height as usize)),
            "empty/nonempty contract root"
        );
        ensure!(
            end.end_deferred_tx_debt_tree_root == old.deferred_tx_debt_tree_root
                && step.state_delta.inline_tx_debt_pivot_proof.root == old.inline_tx_debt_tree_root
                && step.state_delta.inline_tx_debt_pivot_proof.verify::<H>()
                && step.state_delta.inline_tx_debt_pivot_proof.value == Q::ZERO,
            "nested/deferred scope forbidden"
        );
        let spent = end.total_balance_spent.to_canonical_u64();
        let balance = old
            .user_leaf
            .balance
            .to_canonical_u64()
            .checked_sub(spent)
            .context("balance underflow")?;
        let events = old
            .user_leaf
            .event_index
            .to_canonical_u64()
            .checked_add(end.total_events_emitted.to_canonical_u64())
            .context("event overflow")?;
        ensure!(events < F::ORDER, "event index overflow");
        let mut expected = previous;
        expected.current_state.user_leaf = PsyUserLeaf {
            user_state_tree_root: delta.new_root,
            balance: F::from_canonical_u64(balance),
            event_index: F::from_canonical_u64(events),
            ..old.user_leaf
        };
        expected.current_state.tx_hash_stack =
            H::q_two_to_one(old.tx_hash_stack, call.qfhash::<H>());
        expected.current_state.tx_count = F::from_canonical_usize(i + 1);
        ensure!(step.end_header == expected, "complete ordered end header");
        verify_hash(
            &step_key,
            proof(&step.ups_proof_b64)?,
            pi(step.ups_known_root, expected.qfhash::<H>()),
        )?;
        if i + 1 == approval.calls.len() {
            ensure!(
                step.contract_id == 0
                    && step.method_id == 3998182541
                    && inputs == vec![F::from_canonical_u64(fee)],
                "last exact fee burn"
            );
        }
        proof_leaves.push(H::q_two_to_one(
            pack.step_fingerprint,
            pi(step.ups_known_root, expected.qfhash::<H>()),
        ));
        previous = expected;
    }
    ensure!(
        request.user_ec_input.events.len() == event_cursor,
        "extra event sidecar"
    );
    let mut end_leaf = previous.current_state.user_leaf;
    end_leaf.nonce = F::from_canonical_u64(approval.nonce);
    ensure!(end_leaf == core.new_user_leaf, "full path/proof endpoint");
    let sig_data = PsyUserProvingSessionSignatureDataCompact {
        start_user_leaf_hash: approval.start_leaf,
        end_user_leaf_hash: end_leaf.qfhash::<H>(),
        checkpoint_leaf_hash: session.checkpoint_leaf_hash,
        tx_stack_hash: previous.current_state.tx_hash_stack,
        tx_count: previous.current_state.tx_count,
    };
    let sign_context = SignContext {
        checkpoint_tree_root: session.checkpoint_tree_root,
        user_leaf: previous.current_state.user_leaf,
    };
    let sig_hash = sig_data
        .get_sig_action_for_user::<H>(
            MAGIC,
            F::from_canonical_u64(approval.user_id),
            F::from_canonical_u64(approval.nonce),
            sign_context,
        )
        .get_qhash::<H>();
    ensure!(
        bundle.sig_hash == sig_hash
            && H::q_two_to_one(pack.sign_fingerprint, bundle.public_key_param)
                == approval.public_key,
        "signature context/key"
    );
    verify_hash(
        &sign_key,
        proof(&bundle.sign_proof_b64)?,
        H::q_two_to_one(sig_hash, bundle.public_key_param),
    )?;
    Ok(
        serde_json::json!({"fullProofVerified":true,"fullCallsBound":true,"sessionBound":true,"sigHashBound":true,"endpointsAndFeesBound":true,"requestSha256":format!("{:x}",Sha256::digest(request_bytes)),"sdkManifestSha256":SDK,"contentHash":request.user_ec_input.get_tx_hash()?.to_string(),"userId":approval.user_id,"nonce":approval.nonce.to_string(),"checkpoint":cp,"endUserLeafHash":core.state_transition.end_user_leaf_hash.to_string(),"sigHash":sig_hash.to_string(),"sessionHash":session_hash,"fingerprint":pack.sign_fingerprint.to_string(),"actualFee":fee.to_string(),"eventAssurance":"advisory data; count and identity envelope checked, never authoritative state","broadcast":false}),
    )
}
