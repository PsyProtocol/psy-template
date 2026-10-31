//! Map a public error wire to frozen ordinary-start copy constraints. This
//! constructs a circuit, never a witness/proof, and never performs an RPC.
use anyhow::{ensure, Context, Result};
use plonky2::{hash::hash_types::HashOutTarget, iop::target::Target};
use psy_client_data::config::store_config::C;
use psy_common_circuit::traits::ToTargets;
use psy_network_circuit::ups::circuits::ups_start::UPSStartSessionCircuit;
use psy_provider::provider::LocalCommonCircuitsData;
use serde::Deserialize;
use serde_json::json;
use std::{env, fs, io::Read, path::Path};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope { jsonrpc: String, id: u64, result: String }

fn hash_fields(fields: &mut Vec<(String, Target)>, label: &str, target: HashOutTarget) {
    for (i, t) in target.elements.into_iter().enumerate() { fields.push((format!("{label}[{i}]"), t)); }
}

fn inspect(bytes: &[u8], row: usize, column: usize) -> Result<serde_json::Value> {
    psy_template_u124_markets::live_guard::require_compiled_verifier_domain()?;
    ensure!(bytes.len() <= 1_048_576, "bounded public registry required");
    let envelope: Envelope = serde_json::from_slice(bytes)?;
    ensure!(envelope.jsonrpc == "2.0" && envelope.id == 1, "public registry response identity");
    let remote: LocalCommonCircuitsData<_> = serde_json::from_str(&envelope.result)?;
    let circuit = UPSStartSessionCircuit::<C, 2>::new();
    ensure!(remote.ups_start.fingerprint == circuit.fingerprint
        && remote.ups_start.verifier_config.to_verifier_data::<C, 2>() == circuit.circuit_data.verifier_only,
        "ordinary-start resource differs from frozen construction");
    let data = &circuit.circuit_data;
    let degree = data.common.degree(); let width = data.common.config.num_wires;
    ensure!(row < degree && column < width, "wire outside frozen circuit");
    let wire = Target::wire(row, column);
    let representative = |t: Target| -> Result<usize> {
        data.prover_only.representative_map.get(t.index(width, degree)).copied().context("target outside representative map")
    };
    let representative_id = representative(wire)?;
    let g = &circuit.start_step_gadget;
    let h = &g.header_gadget;
    let mut fields = vec![];
    hash_fields(&mut fields, "header.whitelist", h.ups_step_circuit_whitelist_root);
    hash_fields(&mut fields, "start.checkpoint_tree_root", h.session_start_context.checkpoint_tree_root);
    hash_fields(&mut fields, "start.checkpoint_leaf_hash", h.session_start_context.checkpoint_leaf_hash);
    hash_fields(&mut fields, "start.user_leaf_hash", h.session_start_context.start_session_user_leaf_hash);
    fields.push(("start.checkpoint_id".into(), h.session_start_context.checkpoint_id));
    for (prefix, u) in [("start.user_leaf", h.session_start_context.start_session_user_leaf), ("current.user_leaf", h.current_state.user_leaf)] {
        hash_fields(&mut fields, &format!("{prefix}.public_key"), u.public_key);
        hash_fields(&mut fields, &format!("{prefix}.state_root"), u.user_state_tree_root);
        for (name, target) in [("balance",u.balance),("nonce",u.nonce),("last_checkpoint_id",u.last_checkpoint_id),("event_index",u.event_index),("user_id",u.user_id)] {
            fields.push((format!("{prefix}.{name}"),target));
        }
    }
    hash_fields(&mut fields, "current.deferred_root", h.current_state.deferred_tx_debt_tree_root);
    hash_fields(&mut fields, "current.inline_root", h.current_state.inline_tx_debt_tree_root);
    hash_fields(&mut fields, "current.tx_hash_stack", h.current_state.tx_hash_stack);
    fields.push(("current.tx_count".into(),h.current_state.tx_count));
    hash_fields(&mut fields, "header.start_context_hash", h.session_start_context_hash);
    hash_fields(&mut fields, "header.current_state_hash", h.current_state_hash);
    for (i,t) in g.checkpoint_leaf_gadget.to_targets().into_iter().enumerate() { fields.push((format!("checkpoint_leaf.target[{i}]"),t)); }
    for (i,t) in g.state_roots_gadget.to_targets().into_iter().enumerate() { fields.push((format!("state_roots.target[{i}]"),t)); }
    for (name,p) in [("checkpoint_proof",&g.checkpoint_tree_proof),("user_proof",&g.user_tree_proof)] {
        fields.push((format!("{name}.index"),p.index));
        hash_fields(&mut fields,&format!("{name}.root"),p.root);
        hash_fields(&mut fields,&format!("{name}.value"),p.value);
        for (i,hash) in p.siblings.iter().enumerate() { hash_fields(&mut fields,&format!("{name}.sibling[{i}]"),*hash); }
    }
    let mut matches=vec![];
    for (name,t) in &fields { if representative(*t)?==representative_id { matches.push(name.clone()); } }
    let routed_wires=(0..degree).flat_map(|r|(0..data.common.config.num_routed_wires).map(move |c|(r,c)))
        .filter_map(|(r,c)| (representative(Target::wire(r,c)).ok()==Some(representative_id)).then_some(json!({"row":r,"column":c})))
        .collect::<Vec<_>>();
    Ok(json!({"schema":1,"kind":"frozen-ordinary-start-copy-constraint-map-v1","wire":{"row":row,"column":column},
        "fingerprint":circuit.fingerprint.to_string(),"compiledNetworkMagic":psy_config::PSY_NETWORK_MAGIC.to_string(),
        "registryVerifierMatches":true,"degree":degree,"wireWidth":width,"representativeId":representative_id,
        "namedTargetsExamined":fields.len(),"matchingNamedTargets":matches,"matchingRoutedWires":routed_wires,
        "scope":"Public circuit topology only; a matching partition does not identify the actual historical witness, operator, runtime build or cause",
        "witnessLoaded":false,"witnessValuesPublished":false,"proofsGenerated":0,"financialOperations":0,
        "historicalFailureReproduced":false,"exactCauseProven":false,"originalRequestResolved":false,"canBroadcast":false}))
}

fn main() -> Result<()> {
    let a=env::args().collect::<Vec<_>>();
    ensure!(a.len()==5,"CAPTURED_PUBLIC_REGISTRY FRESH_REPORT ROW COLUMN");
    let path=Path::new(&a[1]);let metadata=fs::symlink_metadata(path)?;
    ensure!(metadata.is_file() && metadata.len()<=1_048_576,"bounded regular public registry required");
    let mut bytes=vec![];fs::File::open(path)?.take(1_048_577).read_to_end(&mut bytes)?;
    let result=inspect(&bytes,a[3].parse()?,a[4].parse()?);
    let report=match &result {Ok(v)=>v.clone(),Err(_)=>json!({"schema":1,"inspectionPassed":false,"error":"public resource or circuit topology check rejected","witnessValuesPublished":false,"proofsGenerated":0,"financialOperations":0,"canBroadcast":false})};
    psy_template_u124_markets::source_plan_receipt::save(Path::new(&a[2]),&report)?;
    println!("{}",serde_json::to_string(&report)?);result.map(|_|())
}
