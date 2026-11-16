//! Release/instance guard for fresh explicitly selected-order compact keys.
//! These checks do not replace the circuit's complete stack/session binding,
//! runtime contract/function roots, fresh state/nonce checks or finality proof.
use anyhow::{ensure, Context, Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F, types::Field};
use psy_client_common::data::qhashout::QHashOut;
use serde_json::{json, Value};

const SCOPE: &str = "explicit-selected-orders-v1";
const NATIVE: &str = "mainnet-beta-20261027";
const NFT_INITIALIZATION: &str = "explicit-account-version-v1";
const RANDOM_FIELDS: &[&str] = &["seed", "randomSeed", "randomSource", "randomness", "randomnessProof",
    "randomSeedProof", "beacon", "beaconProof", "drawCheckpoint", "randomRound", "randomOrdering", "seedCommitment"];

fn deterministic(value: &Value) -> Result<()> {
    let object = value.as_object().context("selected core configuration object")?;
    ensure!(object.get("ordering").is_none() || value["ordering"] == "deterministic", "deterministic selected core only");
    ensure!(RANDOM_FIELDS.iter().all(|key| !object.contains_key(*key)), "random source qualification is unavailable");
    Ok(())
}

fn contract(value: &Value) -> Result<u64> {
    let id = value.as_u64().context("selected core contract identity")?;
    ensure!((5..16777216).contains(&id), "selected core contract range");
    Ok(id)
}

fn descriptor(id: u64, method: u32, name: &str, inputs: Value) -> Value {
    json!({"contract_id":id,"method_id":method,"method_name":name,"inputs":inputs})
}

fn native_calls(spec: &Value) -> Result<()> {
    let mut calls = vec![&spec["begin"], &spec["finish"], &spec["expire"], &spec["noop"], &spec["burn"]];
    calls.extend(spec["commit"].as_array().context("core commit calls")?);
    let operations = spec["operations"].as_array().context("core operations")?;
    for operation in operations { calls.extend(operation["calls"].as_array().context("core operation calls")?); }
    for call in calls {
        if call["contract_id"] != 0 { continue; }
        let (method, count) = match call["method_name"].as_str() {
            Some("claim") => (3824212239u32, 1),
            Some("transfer") => (2789897329u32, 2),
            Some("burn") => (3998182541u32, 1),
            _ => anyhow::bail!("selected core requires exact current Native methods"),
        };
        ensure!(call["method_id"] == method && call["inputs"].as_array().is_some_and(|a| a.len() == count),
            "selected core Native identity/arity");
    }
    // Coverage is used by the runtime dependency whitelist. It must describe
    // exactly the same calls that the compact key actually authenticates.
    let branches = spec["branches"].as_array().context("core coverage branches")?;
    ensure!(branches.len() == operations.len() + 3 && branches[0]["calls"] == spec["commit"]
        && branches[1]["calls"] == json!([spec["begin"], spec["finish"]])
        && branches.last().context("core burn coverage")?["calls"] == json!([spec["burn"]]),
        "selected core prefix/burn coverage differs");
    for (index, operation) in operations.iter().enumerate() {
        ensure!(branches[2 + index]["calls"] == operation["calls"], "selected core operation coverage differs");
    }
    Ok(())
}

fn nft_activation(spec: &Value, market: u64, token: u64, collection: u64) -> Result<()> {
    ensure!(spec["collection_initialization"] == NFT_INITIALIZATION, "prepared NFT collection marker required");
    let operations = spec["operations"].as_array().context("NFT core operations")?;
    let activations = operations.iter().filter(|op| op["name"] == "activate").collect::<Vec<_>>();
    ensure!(activations.len() == 1 && activations[0]["maintenance"] == true, "one NFT core activation operation required");
    let mut expected = vec![spec["noop"].clone(),
        descriptor(0, 3824212239, "claim", json!([{"witness":1}])),
        descriptor(collection, 1475740684, "prepare_account", json!([])),
        descriptor(token, 2792756730, "claim", json!([{"witness":1}])),
        descriptor(market, 3068320913, "activate", json!([{"witness":1}])),
        descriptor(token, 188091294, "transfer", json!([{"witness":1},{"constant":"1"},{"constant":"0"}]))];
    while expected.len() < 9 { expected.push(spec["noop"].clone()); }
    ensure!(activations[0]["calls"] == json!(expected), "exact prepared NFT activation required; legacy acknowledgement key is separate");
    Ok(())
}

/// Return the fixed instance anchor only for a reviewed fresh core policy.
/// Historic non-core profiles retain their own separate validation boundary.
pub fn anchor(spec: &Value) -> Result<Option<QHashOut<F>>> {
    if spec["execution_scope"] != SCOPE { return Ok(None); }
    ensure!(cfg!(feature="sdk-audit-v1")
        && spec["sdk_commit"] == psy_template_u124_markets::sdk_release::SDK_COMMIT
        && spec["client_commit"] == psy_template_u124_markets::sdk_release::CLIENT_COMMIT,
        "exact selected core SDK/client release required");
    ensure!(spec["version"] == 2 && spec["tx_count"] == 40 && spec["witness_length"] == 74
        && spec["native_protocol"] == NATIVE && spec["fee_min"] == "1000000000" && spec["fee_max"] == "1000100000",
        "selected core compact protocol shape");
    ensure!(spec["whole_market_completeness"] == false && spec["qualified_randomness"] == false,
        "explicit selected-order and unqualified-randomness boundary required");
    deterministic(spec)?; deterministic(&spec["config"])?;
    psy_template_u124_markets::dependency_scope::validate_optional(spec)?;
    ensure!(spec["config"]["networkMagic"] == "1384803358401154921", "fixed selected core network domain");
    let market = contract(&spec["market_id"])?;
    let kind = spec["market"].as_str().context("selected core market kind")?;
    let config = &spec["config"];
    match kind {
        "amm" | "orderbook" | "bondingcurve" => {
            let a = contract(&config["assetA"])?; let b = contract(&config["assetB"])?;
            ensure!(a != b && a != market && b != market, "distinct selected market/asset contracts required");
            ensure!(spec.get("collection_initialization").is_none(), "NFT initialization marker belongs to NFT policy only");
        }
        "nftmarket" => {
            let token = contract(&config["tokenId"])?; let collection = contract(&config["nftId"])?;
            ensure!(token != collection && token != market && collection != market, "distinct selected NFT/payment/market contracts required");
            nft_activation(spec, market, token, collection)?;
        }
        _ => anyhow::bail!("unsupported selected core market"),
    }
    // Shape and actual operation slots are checked without building a circuit.
    // Building the same v2 descriptors below preserves existing AMM fingerprints.
    psy_template_u124_markets::batch_policy::validate(spec)?;
    native_calls(spec)?;
    let text = spec["chain_root_at1"].as_str().context("selected core chain anchor required")?;
    let root: QHashOut<F> = text.parse()?;
    ensure!(text.len() == 64 && root != QHashOut::ZERO && root.to_string() == text,
        "canonical nonzero selected core chain anchor");
    Ok(Some(root))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(kind: &str) -> Value {
        let noop=descriptor(1000,1,"noop",json!([]));
        let burn=descriptor(0,3998182541,"burn",json!([{"witness":73}]));
        let commit=vec![descriptor(1000,2,"commit_batch",json!([])),descriptor(0,3824212239,"claim",json!([{"witness":4}]))];
        let begin=descriptor(1000,3,"begin_batch",json!([]));let finish=descriptor(1000,4,"finish_batch",json!([]));
        let mut s=json!({"version":2,"market":kind,"market_id":1000,"config":{"assetA":41,"assetB":42,"tokenId":41,"nftId":42,"networkMagic":"1384803358401154921"},
            "execution_scope":SCOPE,"sdk_commit":psy_template_u124_markets::sdk_release::SDK_COMMIT,
            "client_commit":psy_template_u124_markets::sdk_release::CLIENT_COMMIT,"native_protocol":NATIVE,
            "tx_count":40,"witness_length":74,"fee_min":"1000000000","fee_max":"1000100000",
            "whole_market_completeness":false,"qualified_randomness":false,
            "chain_root_at1":"81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c",
            "begin":begin,"finish":finish,"expire":descriptor(1000,5,"expire_batch",json!([])),"noop":noop,"burn":burn,"commit":commit,
            "operations":[{"name":"maintenance","branch":1,"maintenance":true,"calls":vec![noop.clone();9]}]});
        if kind=="nftmarket" {
            s["collection_initialization"]=json!(NFT_INITIALIZATION);
            s["operations"][0]["name"]=json!("activate");
            let mut calls=vec![noop.clone(),descriptor(0,3824212239,"claim",json!([{"witness":1}])),
                descriptor(42,1475740684,"prepare_account",json!([])),descriptor(41,2792756730,"claim",json!([{"witness":1}])),
                descriptor(1000,3068320913,"activate",json!([{"witness":1}])),descriptor(41,188091294,"transfer",json!([{"witness":1},{"constant":"1"},{"constant":"0"}]))];
            while calls.len()<9{calls.push(noop.clone());}s["operations"][0]["calls"]=json!(calls);
        }
        s["branches"]=json!([{"calls":s["commit"]},{"calls":[s["begin"],s["finish"]]},
            {"calls":s["operations"][0]["calls"]},{"calls":[s["burn"]]}]);s
    }
    #[test]
    #[cfg(feature="sdk-audit-v1")]
    fn all_four_selected_profiles_require_the_same_frozen_release_and_instance() {
        for kind in ["amm","bondingcurve","orderbook","nftmarket"] {
            let s=fixture(kind);assert!(anchor(&s).unwrap().is_some());
            for(field,value)in [("sdk_commit",json!("old")),("client_commit",json!("old")),("version",json!(21)),
                ("tx_count",json!(39)),("witness_length",json!(80)),("native_protocol",json!("legacy-v1")),
                ("qualified_randomness",json!(true)),("whole_market_completeness",json!(true)),("chain_root_at1",json!("0".repeat(64))),
                ("market",json!("unsupported"))] {
                let mut bad=s.clone();bad[field]=value;assert!(anchor(&bad).is_err(),"{} {}",kind,field);
            }
        }
        assert!(anchor(&json!({"version":2})).unwrap().is_none());
    }
    #[test]
    #[cfg(feature="sdk-audit-v1")]
    fn random_domain_and_contract_substitutions_reject_before_any_circuit() {
        let s=fixture("orderbook");
        for field in RANDOM_FIELDS {let mut bad=s.clone();bad["config"][*field]=json!("not-attested");assert!(anchor(&bad).is_err());}
        for patch in [json!({"ordering":"random"}),json!({"networkMagic":"1"}),json!({"assetA":42}),json!({"assetB":1000})] {
            let mut bad=s.clone();for(k,v)in patch.as_object().unwrap(){bad["config"][k]=v.clone();}assert!(anchor(&bad).is_err());
        }
    }
    #[test]
    #[cfg(feature="sdk-audit-v1")]
    fn native_descriptors_and_coverage_cannot_lie_about_actual_calls() {
        let s=fixture("amm");
        for patch in [json!({"method_name":"simple_burn"}),json!({"method_id":3998182542u32}),json!({"inputs":[]})] {
            let mut bad=s.clone();for(k,v)in patch.as_object().unwrap(){bad["burn"][k]=v.clone();}assert!(anchor(&bad).is_err());
        }
        let mut bad=s.clone();bad["branches"][2]["calls"][0]["method_id"]=json!(99);assert!(anchor(&bad).is_err());
    }
    #[test]
    #[cfg(feature="sdk-audit-v1")]
    fn nft_preparation_is_an_exact_new_key_descriptor_not_a_marker_bypass() {
        let s=fixture("nftmarket");assert!(anchor(&s).unwrap().is_some());
        let mut bad=s.clone();bad.as_object_mut().unwrap().remove("collection_initialization");assert!(anchor(&bad).is_err());
        let mut bad=s.clone();bad["operations"][0]["calls"][2]=descriptor(42,1344479563,"acknowledge",json!([{"witness":1}]));
        bad["branches"][2]["calls"]=bad["operations"][0]["calls"].clone();assert!(anchor(&bad).is_err());
        for patch in [json!({"contract_id":41}),json!({"method_id":1475740685u32}),json!({"inputs":[{"witness":1}]})] {
            let mut bad=s.clone();for(k,v)in patch.as_object().unwrap(){bad["operations"][0]["calls"][2][k]=v.clone();}
            bad["branches"][2]["calls"]=bad["operations"][0]["calls"].clone();assert!(anchor(&bad).is_err());
        }
    }
    #[test]
    #[cfg(not(feature="sdk-audit-v1"))]
    fn historical_binaries_cannot_use_the_selected_core_release() {
        for kind in ["amm","bondingcurve","orderbook","nftmarket"] { assert!(anchor(&fixture(kind)).is_err()); }
        assert!(anchor(&json!({"version":2})).unwrap().is_none());
    }
}
