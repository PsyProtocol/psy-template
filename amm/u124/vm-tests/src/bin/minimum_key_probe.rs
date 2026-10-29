//! Synthetic public-session diagnostic. No RPC, wallet input, Endcap or broadcast.
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{hash_types::HashOut, poseidon::PoseidonHash as H},
    iop::target::Target,
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_common_circuit::traits::ToTargets;
use psy_crypto::hash::{merkle::core::MerkleProofCore, traits::qhashable::QFieldHashable};
use psy_template_u124_markets::{
    final_state_coverage::{AssetBinding, Review, Snapshot},
    market_key::{SDKeyCircuitWitnessInput, SDKeySessionContext},
    stream_current::CurrentOpening,
    stream_policy::{Request, StreamKey},
};
use serde_json::{json, Value};
use std::{collections::BTreeMap, fs, path::Path};
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn read(p: impl AsRef<Path>) -> Result<Value> {
    Ok(serde_json::from_slice(&fs::read(p)?)?)
}
#[tokio::main]
async fn main() -> Result<()> {
    let a = std::env::args().collect::<Vec<_>>();
    ensure!(
        a.len() == 6,
        "FIXTURES PUBLIC_CAPTURE FRESH_OUTPUT ROW COLUMN"
    );
    let fixtures = Path::new(&a[1]);
    let capture = Path::new(&a[2]);
    let out = Path::new(&a[3]);
    fs::create_dir(out)?;
    let source: Snapshot = serde_json::from_value(read(capture.join("source.json"))?)?;
    ensure!(
        source.fields[9..13] == [1234, 0, 0, 0],
        "synthetic chain only; never accept wallet secrets"
    );
    let current: CurrentOpening = serde_json::from_value(read(capture.join("current.json"))?)?;
    let request: Request = serde_json::from_value(read(capture.join("intent.json"))?)?;
    let public = read(capture.join("public-session.json"))?;
    let kind = if source.fields[2] == 1 {
        "amm"
    } else {
        "bondingcurve"
    };
    let spec = read(fixtures.join(kind).join("stream-policy.json"))?;
    ensure!(spec["version"] == 11, "replacement key only");
    let artifact = |path: &str| read(fixtures.join(path));
    let mut assets = vec![];
    for (id, path) in [
        (0, "native.json"),
        (42, "token/compilation_artifact.json"),
        (43, "token/compilation_artifact.json"),
    ] {
        let leaf = &current
            .contracts
            .iter()
            .find(|c| c.id == id)
            .context("captured asset")?
            .leaf;
        assets.push(AssetBinding::from_artifact(
            id,
            &artifact(path)?,
            leaf.function_tree_root,
        )?);
    }
    let leaf = &current
        .contracts
        .iter()
        .find(|c| c.id == 1000)
        .context("synthetic market")?
        .leaf;
    let r = Review::from_artifact(
        1000,
        source.fields[2],
        &artifact(&format!("{kind}/compiled/compilation_artifact.json"))?,
        leaf.function_tree_root,
        assets
            .try_into()
            .map_err(|_| anyhow::anyhow!("three assets"))?,
        10u128.pow(18),
    )?;
    let key = StreamKey::build(&spec, &r, [1234, 0, 0, 0])?;
    ensure!(
        key.g.get_fingerprint().to_string()
            == public["keyFingerprint"]
                .as_str()
                .context("recorded fingerprint")?,
        "same compiled key, no verifier substitution"
    );
    let data = key.g.circuit_data.as_ref().unwrap();
    let num = data.common.config.num_wires;
    let degree = data.common.degree();
    let rep = |t: Target| data.prover_only.representative_map[t.index(num, degree)];
    let row = a[4].parse()?;
    let column = a[5].parse()?;
    ensure!(row < degree && column < num, "circuit wire range");
    let target = rep(Target::wire(row, column));
    let mut tags = vec![];
    let mut tag = |name: String, t: Target| {
        if rep(t) == target {
            tags.push(name)
        }
    };
    for (i, t) in key.g.circuit_inputs.iter().enumerate() {
        tag(
            format!(
                "application-public-input-{i}: {:?}",
                key.public_input_labels(i)?
            ),
            *t,
        );
    }
    for (i, s) in key.g.tx_introspection.tx_info_slots.iter().enumerate() {
        for (n, t) in [
            ("contract", s.contract_id),
            ("method", s.method_id),
            ("caller", s.caller_contract_id),
            ("length", s.inputs_length),
        ] {
            tag(format!("logical-slot-{i}-{n}"), t);
        }
        for (j, t) in s.inputs_hash.elements.iter().enumerate() {
            tag(format!("logical-slot-{i}-input-hash-{j}"), *t);
        }
    }
    for (n, ts) in [
        ("signature", key.g.sig_hash.elements.to_vec()),
        (
            "stack",
            key.g.tx_introspection.tx_stack_hash.elements.to_vec(),
        ),
        (
            "start-user",
            key.g.session_context.start_user_leaf.to_targets(),
        ),
        (
            "current-user",
            key.g.session_context.sign_context.user_leaf.to_targets(),
        ),
    ] {
        for (i, t) in ts.into_iter().enumerate() {
            tag(format!("{n}-{i}"), t);
        }
    }
    let fields = key.fields(
        &r,
        &source,
        &source_vault_path(&source)?,
        &current,
        &request,
    )?;
    let input = SDKeyCircuitWitnessInput {
        session_context: serde_json::from_value::<SDKeySessionContext>(public["session"].clone())?,
        circuit_inputs: fields.into_iter().map(f).collect(),
        transaction_infos: serde_json::from_value(public["stack"].clone())?,
        tx_stack_hash: serde_json::from_value(public["txStackHash"].clone())?,
        tx_count: serde_json::from_value(public["txCount"].clone())?,
        state_reader_results: None,
        secp256k1_slots: vec![],
        checkpoint_id: serde_json::from_value(public["checkpoint"].clone())?,
        user_id: serde_json::from_value(public["user"].clone())?,
    };
    let sig_hash: Q<F> = serde_json::from_value(public["sigHash"].clone())?;
    if capture.join("key-proof.bin").exists() {
        use plonky2::plonk::{
            config::{Hasher, PoseidonGoldilocksConfig},
            proof::ProofWithPublicInputs,
        };
        use psy_client_data::qdata::{
            ups_signature::PsyUserProvingSessionSignatureDataCompact,
            user_contract_state::SignContext,
        };
        use psy_template_u124_markets::market_key::compute_tx_stack_hash;
        let context = &input.session_context;
        ensure!(
            context.start_user_leaf.qfhash::<H>() == context.start_user_leaf_hash,
            "saved exact start leaf"
        );
        ensure!(
            context.start_user_leaf.public_key == context.current_user_leaf.public_key
                && context.start_user_leaf.user_id == input.user_id
                && context.current_user_leaf.user_id == input.user_id
                && context.start_user_leaf.nonce == context.current_user_leaf.nonce,
            "saved exact account identity"
        );
        ensure!(
            input.checkpoint_id == context.current_user_leaf.last_checkpoint_id,
            "saved exact checkpoint"
        );
        let mut logical = vec![];
        for call in psy_template_u124_markets::stream_policy::calls(&spec, &request, false)? {
            let id = call["contract_id"].as_u64().context("saved contract")?;
            let path = if id == 0 {
                "native.json".into()
            } else if id == 1000 {
                format!("{kind}/compiled/compilation_artifact.json")
            } else {
                ensure!([42, 43].contains(&id), "synthetic asset identity");
                "token/compilation_artifact.json".into()
            };
            let a = artifact(&path)?;
            let method = a["circuit_definitions"]
                .as_array()
                .context("reviewed definitions")?
                .iter()
                .find(|d| d["name"] == call["method_name"])
                .context("reviewed method")?;
            let values = call["inputs"]
                .as_array()
                .context("saved inputs")?
                .iter()
                .map(|n| n.as_u64().map(f).context("canonical saved input"))
                .collect::<Result<Vec<_>>>()?;
            let info=psy_client_data::dpn::proving_session::DPNProvingSessionCompactMethodCall::new_from_inputs::<H>(f(psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64),f(id),f(method["method_id"].as_u64().context("saved method ID")?),&values);
            logical.push(psy_client_data::dpn::sd_key::SDKeyTransactionInfo::from(
                info,
            ));
        }
        ensure!(
            logical == input.transaction_infos,
            "saved full logical plan, caller and calldata binding"
        );
        let actual = input
            .transaction_infos
            .iter()
            .filter(|v| {
                v.contract_id != f(spec["noop"]["contract_id"].as_u64().unwrap())
                    || v.method_id != f(spec["noop"]["method_id"].as_u64().unwrap())
            })
            .copied()
            .collect::<Vec<_>>();
        ensure!(
            actual.len() as u64 == input.tx_count.to_canonical_u64()
                && compute_tx_stack_hash(&actual) == input.tx_stack_hash,
            "saved exact compact stack"
        );
        let mut end = context.current_user_leaf;
        end.nonce = context.nonce;
        let signature_data = PsyUserProvingSessionSignatureDataCompact {
            start_user_leaf_hash: context.start_user_leaf_hash,
            end_user_leaf_hash: end.qfhash::<H>(),
            checkpoint_leaf_hash: context.checkpoint_leaf_hash,
            tx_stack_hash: input.tx_stack_hash,
            tx_count: input.tx_count,
        };
        let expected = signature_data
            .get_sig_action_for_user::<H>(
                psy_config::PSY_NETWORK_MAGIC,
                input.user_id,
                context.nonce,
                SignContext {
                    checkpoint_tree_root: context.checkpoint_tree_root,
                    user_leaf: context.current_user_leaf,
                },
            )
            .get_qhash::<H>();
        ensure!(expected == sig_hash, "saved exact SDK signature preimage");
        let bytes = fs::read(capture.join("key-proof.bin"))?;
        let proof: ProofWithPublicInputs<F, PoseidonGoldilocksConfig, 2> =
            bincode::deserialize(&bytes)?;
        ensure!(
            bincode::serialize(&proof)? == bytes,
            "canonical complete proof bytes"
        );
        key.g
            .minifier_chain
            .as_ref()
            .unwrap()
            .verify(proof.clone())?;
        ensure!(
            proof.public_inputs == H::two_to_one(sig_hash.0, source.key_public_param.0).elements,
            "saved proof binds this signature and parameter"
        );
        fs::write(
            out.join("REPORT.json"),
            serde_json::to_vec_pretty(
                &json!({"syntheticOnly":true,"keyProofVerified":true,"proofGenerated":false,"sameOriginalProofBytes":true,"exactStackAndSignatureChecked":true,"fingerprint":key.g.get_fingerprint(),"fullUpsVerified":false,"broadcast":false}),
            )?,
        )?;
        return Ok(());
    }
    ensure!(
        std::env::var("PSY_MARKET_ALLOW_SYNTHETIC_PROOF").as_deref() == Ok("1"),
        "saved proof missing; explicit bounded synthetic generation required"
    );
    let result = key
        .g
        .prove(
            Q(HashOut {
                elements: [F::ONE; 4],
            }),
            &input,
            sig_hash,
        )
        .await;
    let mut report = json!({"syntheticOnly":true,"fullUpsVerified":false,"broadcast":false,"source":"recorded public CFC session and exact same key","wire":[row,column],"representativeMatches":tags,"fingerprint":key.g.get_fingerprint()});
    match result {
        Ok(p) => {
            key.g.minifier_chain.as_ref().unwrap().verify(p.clone())?;
            fs::write(out.join("proof.bin"), bincode::serialize(&p)?)?;
            report["keyProofVerified"] = json!(true);
            fs::write(out.join("REPORT.json"), serde_json::to_vec_pretty(&report)?)?;
            Ok(())
        }
        Err(e) => {
            report["keyProofVerified"] = json!(false);
            report["error"] = json!(format!("{e:#}"));
            fs::write(out.join("REPORT.json"), serde_json::to_vec_pretty(&report)?)?;
            Err(e)
        }
    }
}
fn source_vault_path(s: &Snapshot) -> Result<MerkleProofCore<Q<F>>> {
    // All original account leaves are present; reconstruct the complete source
    // tree independently, without asking the current checkpoint for old metadata.
    use psy_crypto::hash::traits::hasher::{FieldQHasher, MerkleZeroHasher};
    let mut levels = vec![s
        .accounts
        .iter()
        .map(|a| (a.leaf.user_id.to_canonical_u64(), a.leaf.qfhash::<H>()))
        .collect::<BTreeMap<_, _>>()];
    for h in 0..32 {
        let mut next = BTreeMap::new();
        for index in levels[h].keys() {
            let p = index / 2;
            let z = H::get_zero_hash(h);
            next.entry(p).or_insert_with(|| {
                H::q_two_to_one(
                    *levels[h].get(&(2 * p)).unwrap_or(&z),
                    *levels[h].get(&(2 * p + 1)).unwrap_or(&z),
                )
            });
        }
        levels.push(next);
    }
    let vault = s.fields[4];
    let leaf = s
        .accounts
        .iter()
        .find(|a| a.leaf.user_id == f(vault))
        .unwrap()
        .leaf;
    let path = MerkleProofCore::new_from_params::<H>(
        vault,
        leaf.qfhash::<H>(),
        (0..32)
            .map(|h| {
                *levels[h]
                    .get(&((vault >> h) ^ 1))
                    .unwrap_or(&H::get_zero_hash(h))
            })
            .collect(),
    );
    ensure!(
        path.root == s.history.roots.user_tree_root,
        "complete original source user root"
    );
    Ok(path)
}
