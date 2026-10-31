//! Native v14 backend for the formal Executor. Source/approval data are public
//! projections only; SDK session state, witnesses and nonces are never cached.
use super::{f, save, Guard};
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{hash_types::HashOut, poseidon::PoseidonHash as H},
    plonk::config::Hasher,
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::{
    config::store_config::{C, D},
    qstore::{
        controllers::proving_session::{
            PsyLocalProvingSessionStore, PsyReadLocalProvingSessionStore,
        },
        imm::{
            cmd::QSRCmdGetContractCodeDefinition, cmd_processor::PsyReadCommandProcessorSyncMut,
        },
    },
    traits::qdatastore::{
        qmetadata::QMetaDataStoreReaderSync, qtreedata::QTreeDataStoreReaderSync,
    },
};
use psy_config::network_constants::UPS_SESSION_PROOF_TREE_HEIGHT;
use psy_crypto::hash::{
    merkle::core::MerkleProofCore,
    traits::{hasher::MerkleZeroHasher, qhashable::QFieldHashable},
};
use psy_prover::session::session::WalletSession;
use psy_provider::session::TxStatus;
use psy_template_u124_markets::{
    final_state_coverage::{ContractOpening, Review, Snapshot},
    market_key::{MarketKeyCircuit, SDKeyCircuitWitnessInput, SDKeySessionContext},
    source_review,
    stream_current::CurrentOpening,
    stream_execution,
    stream_policy::{self, Request, StreamKey},
};
use psy_ups_circuit::session::UserProvingSessionManager;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextInput {
    pub source: Snapshot,
    pub request: Request,
    pub execution_checkpoint: u64,
    pub expected_nonce: u64,
    pub expected_start_leaf: Q<F>,
}
pub struct Runtime {
    pub review: Review,
    pub key: StreamKey,
}
pub enum Circuit {
    Batch(MarketKeyCircuit),
    Stream(Runtime),
}
impl Circuit {
    pub fn g(&self) -> &MarketKeyCircuit {
        match self {
            Self::Batch(g) => g,
            Self::Stream(s) => &s.key.g,
        }
    }
    pub fn stream(&self) -> Option<&Runtime> {
        match self {
            Self::Stream(s) => Some(s),
            _ => None,
        }
    }
}

pub fn load(path: &Path, spec: &Value) -> Result<Runtime> {
    ensure!(spec["version"] == 14, "reviewed deterministic v14 only");
    let binding = &spec["executor_binding"];
    ensure!(
        binding["sdk_commit"] == "c92880c8b6e2c8d392f19368bc8801a2584fd427",
        "frozen Executor SDK"
    );
    let name = binding["review"]
        .as_str()
        .context("owned source review path")?;
    ensure!(
        !Path::new(name).is_absolute()
            && Path::new(name)
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_))),
        "confined source review path"
    );
    let file = path.parent().context("policy directory")?.join(name);
    let raw = fs::read(&file)?;
    ensure!(
        format!("{:x}", Sha256::digest(&raw))
            == binding["review_sha256"].as_str().context("review digest")?,
        "source review changed"
    );
    let (review, _, _) = source_review::review(&file)?;
    stream_policy::validate(spec, &review)?;
    let root: Q<F> = binding["chain_root"]
        .as_str()
        .context("chain-instance root")?
        .parse()?;
    let key = StreamKey::build(spec, &review, root.0.elements.map(|n| n.to_canonical_u64()))?;
    Ok(Runtime { review, key })
}
pub fn calls(spec: &Value, fields: &[u64], guard: &Guard) -> Result<Vec<Value>> {
    if spec["version"] != 14 {
        return psy_template_u124_markets::batch_compact::calls(spec, fields);
    }
    let context = guard
        .stream
        .as_ref()
        .context("native stream context required")?;
    ensure!(
        context.request.fields == fields,
        "request and approved stream context differ"
    );
    stream_policy::calls(spec, &context.request, true)
}
pub async fn start(session: &WalletSession, key: Q<F>, guard: &Guard) -> Result<()> {
    let c = guard.stream.as_ref().context("stream context")?;
    let cp = c.execution_checkpoint;
    let user = guard.identity.vault_id;
    let provider = session.st_provider.with_user_id_owned(user);
    let head = provider.get_latest_block_state().await?.checkpoint_id;
    ensure!(
        cp > 0 && cp < (1u64 << 32) && cp <= head && head <= guard.valid_until_checkpoint,
        "stream execution window unavailable"
    );
    let proof = provider.get_user_tree_merkle_proof(cp, user).await?;
    ensure!(
        proof.value == c.expected_start_leaf,
        "approved stream starting state changed"
    );
    let fresh = proof.value == Q::ZERO;
    let leaf = provider.get_user_leaf_data(cp, user).await?;
    ensure!(
        fresh || (leaf.public_key == key && leaf.qfhash::<H>() == proof.value),
        "stream fixed starting leaf/key"
    );
    let nonce = if fresh {
        1
    } else {
        leaf.nonce
            .to_canonical_u64()
            .checked_add(1)
            .context("nonce overflow")?
    };
    ensure!(
        nonce == c.expected_nonce
            && provider.get_user_tree_leaf_hash(head, user).await? == proof.value,
        "stream starting state/nonce changed; reconcile original request"
    );
    ensure!(
        matches!(
            provider.get_tx_status(user, nonce).await?,
            TxStatus::Submittable
        ),
        "stream nonce unavailable"
    );
    if c.request.fields[0] == stream_policy::OPEN {
        ensure!(
            cp == c.source.fields[6],
            "OPEN requires its fresh fixed source checkpoint"
        );
    }
    let mut lps = PsyLocalProvingSessionStore::new_at(
        provider,
        f(cp),
        f(user),
        f(nonce),
        if fresh { F::ZERO } else { leaf.event_index },
        UPS_SESSION_PROOF_TREE_HEIGHT as usize,
    );
    lps.set_is_new_user(fresh);
    let cm = session.wallet.random_circuit_manager();
    let mut manager = UserProvingSessionManager::<F, H, _, C, D>::new(
        lps,
        session.circuit_info.clone(),
        cm.ups_circuit_whitelist_root().await?,
    )
    .await?;
    manager.prove_ups_start(cm.as_ref()).await?;
    session.user_session_mgrs.insert(key, manager);
    Ok(())
}
pub async fn execute(
    session: &WalletSession,
    key: Q<F>,
    spec: &Value,
    guard: &Guard,
    quote: bool,
    out: &Path,
) -> Result<()> {
    let c = guard.stream.as_ref().context("stream context")?;
    let calls = stream_policy::calls(spec, &c.request, true)?;
    let cm = session.wallet.random_circuit_manager();
    let mut manager = session
        .user_session_mgrs
        .get_mut(&key)
        .context("stream session")?;
    let initial = manager
        .require_lps_mut()?
        .get_contract_state_slot(F::ZERO, F::ZERO)
        .await?
        .value
        .0
        .elements
        .map(|n| n.to_canonical_u64());
    for call in &calls[..calls.len() - 1] {
        let cid = call["contract_id"].as_u64().context("stream contract")?;
        let code = manager
            .require_lps_mut()?
            .resolve_get_contract_code_mut(&QSRCmdGetContractCodeDefinition { contract_id: cid })
            .await?;
        let (index, definition) = cm
            .resolve_contract_function_by_method_name(
                cid,
                &code,
                call["method_name"]
                    .as_str()
                    .context("stream method")?
                    .into(),
            )
            .await?;
        let inputs = call["inputs"]
            .as_array()
            .context("stream arguments")?
            .iter()
            .map(|v| v.as_u64().context("Felt argument").map(f))
            .collect::<Result<Vec<_>>>()?;
        if quote {
            manager
                .trace_standard_call(cm.as_ref(), f(cid), index as u32, &definition, inputs)
                .await?;
        } else {
            manager
                .prove_standard_call(cm.as_ref(), f(cid), index as u32, &definition, inputs)
                .await?;
        }
    }
    let slots = manager.require_lps()?.get_total_modified_slots_for_fee();
    let changed = manager.require_lps()?.has_positional_slot_update(0, 0);
    let current = manager
        .require_lps_mut()?
        .get_contract_state_slot(F::ZERO, F::ZERO)
        .await?
        .value
        .0
        .elements
        .map(|n| n.to_canonical_u64());
    let fee = stream_policy::completion_fee(slots, changed, initial, current)?;
    if quote {
        return save(
            &out.join("quote.json"),
            &json!({"profile":"source-funded-v14","fee":fee,"checkpoint":c.execution_checkpoint,"nonce":c.expected_nonce,"proofVerified":false,"broadcast":false,"scope":"Disposable exact-state trace proposal; complete UPS independently checks fee"}),
        );
    }
    ensure!(
        fee == c.request.fields[73],
        "stream exact fee changed; do not sign or broadcast"
    );
    let code = manager
        .require_lps_mut()?
        .resolve_get_contract_code_mut(&QSRCmdGetContractCodeDefinition { contract_id: 0 })
        .await?;
    let (index, definition) = cm
        .resolve_contract_function_by_method_name(0, &code, "burn".into())
        .await?;
    manager
        .prove_standard_call(
            cm.as_ref(),
            F::ZERO,
            index as u32,
            &definition,
            vec![f(fee)],
        )
        .await?;
    ensure!(
        fee == psy_config::network_constants::GUTA_FEE
            + psy_config::DA_FEE
                * manager
                    .require_lps()?
                    .get_total_slots_modified()
                    .to_canonical_u64(),
        "actual final stream fee"
    );
    Ok(())
}
impl Runtime {
    pub async fn check_instance(
        &self,
        spec: &Value,
        provider: &psy_provider::provider::RpcProvider,
    ) -> Result<()> {
        let expected: Q<F> = spec["executor_binding"]["chain_root"]
            .as_str()
            .context("chain root")?
            .parse()?;
        ensure!(
            provider
                .get_checkpoint_leaf_data(1)
                .await?
                .global_chain_root
                == expected,
            "registered chain instance changed"
        );
        let cp = provider.get_latest_block_state().await?.checkpoint_id;
        let mut identities = self
            .review
            .assets
            .iter()
            .map(|a| {
                (
                    a.id,
                    a.code_root,
                    a.layout_root,
                    a.function_root,
                    a.height as u64,
                    a.fields,
                    a.slots,
                )
            })
            .collect::<Vec<_>>();
        identities.push((
            self.review.market,
            self.review.code_root,
            self.review.layout_root,
            self.review.function_root,
            30,
            self.review.layout_fields,
            self.review.layout_slots,
        ));
        for (id, code, layout, functions, height, fields, slots) in identities {
            let leaf = provider.get_contract_leaf_data(id).await?;
            ensure!(
                leaf.code_root == code
                    && leaf.state_layout_root == layout
                    && leaf.function_tree_root == functions
                    && leaf.state_tree_height.to_canonical_u64() == height
                    && leaf.state_layout_field_count.to_canonical_u64() == fields
                    && leaf.state_layout_slot_count.to_canonical_u64() == slots,
                "registered dependency identity changed"
            );
        }
        ensure!(
            provider.get_latest_block_state().await?.checkpoint_id >= cp,
            "checkpoint regression"
        );
        Ok(())
    }
    pub async fn bind(
        &self,
        session: &WalletSession,
        key: Q<F>,
        spec: &Value,
        guard: &Guard,
        context: SDKeySessionContext,
        actual: &[psy_client_data::dpn::sd_key::SDKeyTransactionInfo<F>],
        stack: Q<F>,
        count: F,
        checkpoint: F,
        out: &Path,
    ) -> Result<SDKeyCircuitWitnessInput> {
        let input = guard.stream.as_ref().context("stream context")?;
        let cp = checkpoint.to_canonical_u64();
        ensure!(
            cp == input.execution_checkpoint,
            "actual session checkpoint differs"
        );
        let provider = session
            .st_provider
            .with_user_id_owned(guard.identity.vault_id);
        let mut source = input.source.clone();
        source.history.anchor_path = provider.get_checkpoint_tree_merkle_proof(cp, 1).await?;
        source.history.checkpoint_path = provider
            .get_checkpoint_tree_merkle_proof(cp, source.fields[6])
            .await?;
        let current = CurrentOpening {
            anchor: provider.get_checkpoint_leaf_data(1).await?,
            anchor_path: provider.get_checkpoint_tree_merkle_proof(cp, 1).await?,
            checkpoint: provider.get_checkpoint_leaf_data(cp).await?,
            roots: provider.get_checkpoint_global_state_roots(cp).await?,
            contracts: {
                let mut list = vec![];
                for id in self
                    .review
                    .assets
                    .iter()
                    .map(|a| a.id)
                    .chain([self.review.market])
                {
                    list.push(ContractOpening {
                        id,
                        leaf: provider.get_contract_leaf_data(id).await?,
                        path: provider
                            .get_contract_tree_merkle_proof(cp, id as u32)
                            .await?,
                    });
                }
                list
            },
        };
        let vault = if [4, 13, 14].contains(&input.request.fields[0]) {
            MerkleProofCore::new_from_params::<H>(
                0,
                Q::ZERO,
                (0..32).map(H::get_zero_hash).collect(),
            )
        } else {
            stream_execution::source_vault_path(&source)?
        };
        ensure!(
            context.start_user_leaf.public_key == key,
            "registered native key"
        );
        let bound = stream_execution::bind_session(
            &self.key,
            spec,
            &self.review,
            &source,
            &vault,
            &current,
            &input.request,
            context,
            actual,
            stack,
            count,
            checkpoint,
        )?;
        save(
            &out.join("stream-context.json"),
            &json!({"source":source,"current":current,"request":input.request,"publicSession":bound.session_context,"stack":bound.transaction_infos,"txStackHash":bound.tx_stack_hash,"txCount":bound.tx_count,"checkpoint":checkpoint,"scope":"Explicit public projection only; not signing witness"}),
        )?;
        Ok(bound)
    }
    pub fn verify_saved(
        &self,
        spec: &Value,
        guard: &Guard,
        core: &psy_client_data::guta::api::SubmitUserEndCapNonProofCoreInput<F>,
        directory: &Path,
    ) -> Result<()> {
        use psy_client_data::qdata::{
            ups_signature::PsyUserProvingSessionSignatureDataCompact,
            user_contract_state::SignContext,
        };
        use psy_template_u124_markets::market_key::{
            compute_tx_stack_hash, get_sd_key_public_key_param,
        };
        let raw: Value = serde_json::from_slice(&fs::read(directory.join("stream-context.json"))?)?;
        let source: Snapshot = serde_json::from_value(raw["source"].clone())?;
        let current: CurrentOpening = serde_json::from_value(raw["current"].clone())?;
        let request: Request = serde_json::from_value(raw["request"].clone())?;
        ensure!(
            serde_json::to_value(&request)?
                == serde_json::to_value(
                    &guard.stream.as_ref().context("stream approval")?.request
                )?,
            "saved stream request substitution"
        );
        let context: SDKeySessionContext = serde_json::from_value(raw["publicSession"].clone())?;
        let infos: Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<F>> =
            serde_json::from_value(raw["stack"].clone())?;
        let active = infos
            .iter()
            .filter(|i| {
                i.contract_id != f(self.review.market)
                    || i.method_id != f(spec["noop"]["method_id"].as_u64().unwrap())
            })
            .copied()
            .collect::<Vec<_>>();
        let stack = compute_tx_stack_hash(&active);
        let count = f(active.len() as u64);
        let vault = if [4, 13, 14].contains(&request.fields[0]) {
            MerkleProofCore::new_from_params::<H>(
                0,
                Q::ZERO,
                (0..32).map(H::get_zero_hash).collect(),
            )
        } else {
            stream_execution::source_vault_path(&source)?
        };
        let cp: F = serde_json::from_value(raw["checkpoint"].clone())?;
        let approved = guard.stream.as_ref().context("stream approval")?;
        ensure!(
            cp == f(approved.execution_checkpoint)
                && context.nonce == f(approved.expected_nonce)
                && core.state_transition.start_user_leaf_hash == approved.expected_start_leaf,
            "saved approved checkpoint/nonce/start binding"
        );
        stream_execution::bind_session(
            &self.key,
            spec,
            &self.review,
            &source,
            &vault,
            &current,
            &request,
            context.clone(),
            &active,
            stack,
            count,
            cp,
        )?;
        ensure!(
            serde_json::to_value(stream_execution::logical_infos(spec, &request)?)? == raw["stack"]
                && serde_json::to_value(stack)? == raw["txStackHash"]
                && serde_json::to_value(count)? == raw["txCount"],
            "saved actual stream stack/context changed"
        );
        let mut end = context.current_user_leaf;
        end.nonce = context.nonce;
        ensure!(
            end == core.new_user_leaf
                && core.checkpoint_id == cp
                && core.stats.total_transactions == count
                && context.checkpoint_tree_root == core.state_transition.checkpoint_tree_root_hash,
            "saved stream metadata endpoints"
        );
        ensure!(
            core.state_transition.start_user_leaf_hash
                == if request.fields[0] == 14 {
                    Q::ZERO
                } else {
                    context.start_user_leaf_hash
                },
            "saved stream start endpoint"
        );
        let sig = PsyUserProvingSessionSignatureDataCompact {
            start_user_leaf_hash: context.start_user_leaf_hash,
            end_user_leaf_hash: end.qfhash::<H>(),
            checkpoint_leaf_hash: context.checkpoint_leaf_hash,
            tx_stack_hash: stack,
            tx_count: count,
        }
        .get_sig_action_for_user::<H>(
            psy_config::PSY_NETWORK_MAGIC,
            context.start_user_leaf.user_id,
            context.nonce,
            SignContext {
                checkpoint_tree_root: context.checkpoint_tree_root,
                user_leaf: context.current_user_leaf,
            },
        )
        .get_qhash::<H>();
        let proof: plonky2::plonk::proof::ProofWithPublicInputs<F, C, D> =
            bincode::deserialize(&fs::read(directory.join("stream-sign-proof.bin"))?)?;
        self.key
            .g
            .minifier_chain
            .as_ref()
            .unwrap()
            .verify(proof.clone())?;
        let param = get_sd_key_public_key_param(&Q(HashOut {
            elements: [F::ONE; 4],
        }));
        ensure!(
            source.key_public_param == param
                && proof.public_inputs == H::two_to_one(sig.0, param.0).elements,
            "saved stream signature domain and public key"
        );
        Ok(())
    }
}
