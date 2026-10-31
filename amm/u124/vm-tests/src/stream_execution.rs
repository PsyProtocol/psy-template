//! Shared native execution binding. Neither a JSON success flag nor an Endcap
//! alone authorizes a stream request. Inputs come from the actual SDK session.
use crate::{
    final_state_coverage::{Review, Snapshot},
    market_key::{compute_tx_stack_hash, SDKeyCircuitWitnessInput, SDKeySessionContext},
    stream_current::CurrentOpening,
    stream_policy::{self, Request, StreamKey},
};
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
use psy_client_data::dpn::{
    proving_session::DPNProvingSessionCompactMethodCall, sd_key::SDKeyTransactionInfo,
};
use psy_crypto::hash::{
    merkle::core::MerkleProofCore,
    traits::{
        hasher::{FieldQHasher, MerkleZeroHasher},
        qhashable::QFieldHashable,
    },
};
use serde_json::Value;
use std::collections::BTreeMap;
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}

pub fn validate_action(action:&str)->Result<()> {
    ensure!(["identity","register","check-registration","preflight","quote",
        "serve-preflight","broadcast-prepared","verify-prepared"].contains(&action),
        "v14 supports only reviewed prepared transport; direct submit is disabled");
    Ok(())
}

pub fn validate_request(review: &Review, source: &Snapshot, request: &Request) -> Result<()> {
    ensure!(
        source.fields.len() == 41 && request.fields.len() == 80,
        "complete source/request widths"
    );
    if [4, 13, 14].contains(&request.fields[0]) {
        let (_, page) = crate::stream_source::SourcePage::inactive_maintenance(review, source)?;
        ensure!(
            serde_json::to_value(&page)? == serde_json::to_value(&request.source)?,
            "canonical inactive maintenance tape"
        );
    }
    Ok(())
}

pub fn source_vault_path(source: &Snapshot) -> Result<MerkleProofCore<Q<F>>> {
    ensure!(source.fields.len() == 41, "complete source header");
    let mut leaves = BTreeMap::new();
    for account in &source.accounts {
        ensure!(
            leaves
                .insert(
                    account.leaf.user_id.to_canonical_u64(),
                    account.leaf.qfhash::<H>()
                )
                .is_none(),
            "duplicate source account"
        );
    }
    let vault = source.fields[4];
    let value = *leaves
        .get(&vault)
        .context("vault missing from authenticated source")?;
    let mut levels = vec![leaves];
    for height in 0..32 {
        let mut next = BTreeMap::new();
        for index in levels[height].keys() {
            let parent = index / 2;
            let zero = H::get_zero_hash(height);
            next.entry(parent).or_insert_with(|| {
                H::q_two_to_one(
                    *levels[height].get(&(2 * parent)).unwrap_or(&zero),
                    *levels[height].get(&(2 * parent + 1)).unwrap_or(&zero),
                )
            });
        }
        levels.push(next);
    }
    let proof = MerkleProofCore::new_from_params::<H>(
        vault,
        value,
        (0..32)
            .map(|height| {
                *levels[height]
                    .get(&((vault >> height) ^ 1))
                    .unwrap_or(&H::get_zero_hash(height))
            })
            .collect(),
    );
    ensure!(
        proof.verify::<H>() && proof.root == source.history.roots.user_tree_root,
        "complete original source user root"
    );
    Ok(proof)
}

pub fn logical_infos(spec: &Value, request: &Request) -> Result<Vec<SDKeyTransactionInfo<F>>> {
    let calls = stream_policy::calls(spec, request, false)?;
    ensure!(calls.len() == 40, "fixed reviewed logical capacity");
    let mut descriptors = spec["stream"]
        .as_object()
        .context("stream roles")?
        .values()
        .collect::<Vec<_>>();
    for op in spec["base"]["operations"]
        .as_array()
        .context("market operations")?
    {
        descriptors.extend(op["calls"].as_array().context("operation calls")?);
    }
    descriptors.extend([
        &spec["noop"],
        &spec["base"]["burn"],
        &spec["owner_fee_claim"],
    ]);
    calls
        .iter()
        .map(|call| {
            let cid = call["contract_id"].as_u64().context("call contract")?;
            let name = call["method_name"].as_str().context("call method")?;
            let ids = descriptors
                .iter()
                .filter(|d| d["contract_id"] == cid && d["method_name"] == name)
                .map(|d| d["method_id"].as_u64().context("reviewed method ID"))
                .collect::<Result<Vec<_>>>()?;
            let id = *ids.first().context("unreviewed stream call")?;
            ensure!(
                id <= u32::MAX as u64 && ids.iter().all(|other| *other == id),
                "ambiguous reviewed method identity"
            );
            let inputs = call["inputs"]
                .as_array()
                .context("call inputs")?
                .iter()
                .map(|v| v.as_u64().context("canonical call input").map(f))
                .collect::<Result<Vec<_>>>()?;
            Ok(DPNProvingSessionCompactMethodCall::new_from_inputs::<H>(
                f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),
                f(cid),
                f(id),
                &inputs,
            )
            .into())
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
pub fn bind_session(
    key: &StreamKey,
    spec: &Value,
    review: &Review,
    source: &Snapshot,
    vault: &MerkleProofCore<Q<F>>,
    current: &CurrentOpening,
    request: &Request,
    context: SDKeySessionContext,
    actual: &[SDKeyTransactionInfo<F>],
    stack: Q<F>,
    count: F,
    checkpoint: F,
) -> Result<SDKeyCircuitWitnessInput> {
    stream_policy::validate(spec, review)?;
    ensure!(source.fields.len() == 41, "complete source header");
    if spec["version"] == 14 {
        validate_request(review, source, request)?;
    }
    ensure!(
        request.fields.len() == 80 && (1_000_000_000..=1_000_100_000).contains(&request.fields[73]),
        "prebound exact fee required"
    );
    let infos = logical_infos(spec, request)?;
    let expected = infos
        .iter()
        .filter(|info| {
            info.contract_id != f(review.market)
                || info.method_id != f(spec["noop"]["method_id"].as_u64().unwrap())
        })
        .copied()
        .collect::<Vec<_>>();
    ensure!(
        actual == expected
            && count == f(actual.len() as u64)
            && compute_tx_stack_hash(actual) == stack,
        "actual ordered SDK stack, callers, input hashes and count differ from approved stream"
    );
    ensure!(
        context.start_user_leaf.user_id == f(source.fields[4])
            && context.start_user_leaf.public_key
                == Q(<H as Hasher<F>>::two_to_one(
                    key.g.get_fingerprint().0,
                    source.key_public_param.0
                )),
        "actual registered stream identity"
    );
    let fields = key.fields(review, source, vault, current, request)?;
    Ok(SDKeyCircuitWitnessInput {
        session_context: context.clone(),
        circuit_inputs: fields.into_iter().map(f).collect(),
        transaction_infos: infos,
        tx_stack_hash: stack,
        tx_count: count,
        state_reader_results: None,
        secp256k1_slots: vec![],
        checkpoint_id: checkpoint,
        user_id: context.start_user_leaf.user_id,
    })
}
