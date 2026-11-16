//! Explicit new selected-order key profile: authenticate every dependency at
//! the ACTUAL signed UPS checkpoint. No account discovery, queue scan or beacon.
//! Legacy compact keys keep their original circuit and fingerprint.
use anyhow::{ensure, Context, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::{hash_types::HashOutTarget, poseidon::PoseidonHash as H},
    iop::target::Target, plonk::circuit_builder::CircuitBuilder};
use psy_client_common::{data::qhashout::QHashOut as Q, traits::to_qfelts::ToQFelts};
use psy_client_data::qdata::{checkpoint::{PsyCheckpointLeaf, PsyCheckpointGlobalStateRoots}, contract::PsyContractLeaf};
use psy_common_circuit::{builder::hash::core::CircuitBuilderHashCore,
    hash::merkle::gadgets::merkle_proof::MerkleProofGadget};
use psy_crypto::hash::{merkle::core::MerkleProofCore, traits::qhashable::QFieldHashable};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::market_key::SDKeyCircuitGadget;

pub const PROFILE: &str = "selected-dependency-bound-v1";
const BUSINESS_WIDTH: usize = 74;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DependencyPin {
    pub contract_id: u64, pub deployer: u64, pub code_root: String,
    pub layout_root: String, pub function_tree_root: String, pub state_tree_height: u8,
    pub layout_field_count: u64, pub layout_slot_count: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContractOpening {
    pub id: u64, pub leaf: PsyContractLeaf<F>, pub path: MerkleProofCore<Q<F>>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DependencyOpening {
    pub anchor: PsyCheckpointLeaf<F>, pub anchor_path: MerkleProofCore<Q<F>>,
    pub checkpoint: PsyCheckpointLeaf<F>, pub roots: PsyCheckpointGlobalStateRoots<F>,
    pub contracts: Vec<ContractOpening>,
}
pub fn enabled(spec: &Value) -> bool { spec["key_profile"] == PROFILE }
fn canonical(text: &str) -> Result<Q<F>> {
    ensure!(text.len() == 64 && text.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)),
        "dependency-bound canonical hash required");
    let hash: Q<F> = text.parse()?;
    ensure!(hash.to_string() == text && hash != Q::ZERO, "dependency-bound nonzero canonical hash required");
    Ok(hash)
}
impl DependencyPin {
    pub fn leaf(&self) -> Result<PsyContractLeaf<F>> {
        ensure!(self.contract_id < 16777216 && self.deployer < 16777216
            && (1..(1u64 << 62)).contains(&self.layout_field_count)
            && (1..(1u64 << 62)).contains(&self.layout_slot_count),
            "dependency-bound metadata range");
        ensure!((self.contract_id == 0 && self.deployer == 0 && self.state_tree_height == 32)
            || (self.contract_id >= 5 && self.deployer > 0 && [30,31].contains(&self.state_tree_height)),
            "dependency-bound deployer/height profile");
        Ok(PsyContractLeaf { deployer:F::from_canonical_u64(self.deployer),
            code_root:canonical(&self.code_root)?, function_tree_root:canonical(&self.function_tree_root)?,
            state_tree_height:F::from_canonical_u64(self.state_tree_height as u64), state_layout_root:canonical(&self.layout_root)?,
            state_layout_field_count:F::from_canonical_u64(self.layout_field_count),
            state_layout_slot_count:F::from_canonical_u64(self.layout_slot_count) })
    }
}

/// Validate only an explicitly declared new profile. Unknown declarations and
/// stray pins cannot silently fall back to the old stack-only key.
pub fn validate_optional(spec: &Value) -> Result<Option<Vec<DependencyPin>>> {
    if spec.get("key_profile").is_none() {
        ensure!(spec.get("dependency_bindings").is_none(), "dependency pins require explicit new key profile");
        return Ok(None);
    }
    ensure!(enabled(spec), "unknown selected dependency key profile");
    ensure!(cfg!(feature="sdk-audit-v1") && spec["version"] == 2
        && spec["witness_length"] == BUSINESS_WIDTH && spec["tx_count"] == 40
        && spec["execution_scope"] == "explicit-selected-orders-v1"
        && spec["native_protocol"] == "mainnet-beta-20261027"
        && spec["fee_min"] == "1000000000" && spec["fee_max"] == "1000100000"
        && spec["sdk_commit"] == crate::sdk_release::SDK_COMMIT
        && spec["client_commit"] == crate::sdk_release::CLIENT_COMMIT
        && spec["qualified_randomness"] == false && spec["whole_market_completeness"] == false
        && spec["config"]["networkMagic"] == "1384803358401154921",
        "exact frozen selected dependency profile required");
    for value in [spec, &spec["config"]] {
        let object=value.as_object().context("dependency-bound policy/config object")?;
        ensure!(object.get("ordering").is_none() || value["ordering"] == "deterministic", "dependency-bound deterministic ordering required");
        ensure!(["seed","randomSeed","randomSource","randomness","randomnessProof","randomSeedProof","beacon","beaconProof","drawCheckpoint","randomRound","randomOrdering","seedCommitment"]
            .iter().all(|key| !object.contains_key(*key)), "dependency-bound random source is unqualified");
    }
    canonical(spec["chain_root_at1"].as_str().context("dependency-bound chain anchor")?)?;
    let pins:Vec<DependencyPin> = serde_json::from_value(spec["dependency_bindings"].clone())?;
    let market = spec["market_id"].as_u64().context("dependency-bound market identity")?;
    let nft = spec["market"] == "nftmarket";
    let a = spec["config"][if nft {"tokenId"} else {"assetA"}].as_u64().context("dependency-bound asset A")?;
    let b = spec["config"][if nft {"nftId"} else {"assetB"}].as_u64().context("dependency-bound asset B")?;
    ensure!(["amm","orderbook","bondingcurve","nftmarket"].contains(&spec["market"].as_str().unwrap_or("")),
        "dependency-bound supported market required");
    let mut required=vec![0,a,b,market];required.sort_unstable();required.dedup();
    ensure!(required.len()==4 && [a,b,market].iter().all(|id| (5..16777216).contains(id))
        && pins.iter().map(|p|p.contract_id).collect::<Vec<_>>() == required,
        "exact sorted Native, assets and market dependency set required");
    for pin in &pins {
        pin.leaf()?;
        let height=if pin.contract_id==0 {32} else if nft && pin.contract_id==b {30} else {31};
        ensure!(pin.state_tree_height==height, "dependency-bound role/height mismatch");
    }
    Ok(Some(pins))
}

fn virtual_hash(b:&mut CircuitBuilder<F,2>, targets:&mut Vec<Target>) -> HashOutTarget {
    let hash=b.add_virtual_hash();targets.extend(hash.elements);hash
}
fn virtual_path(b:&mut CircuitBuilder<F,2>,targets:&mut Vec<Target>,height:usize) -> MerkleProofGadget {
    let path=MerkleProofGadget::add_virtual_to::<H,F,2>(b,height);
    targets.push(path.index);targets.extend(path.value.elements);
    for sibling in &path.siblings {targets.extend(sibling.elements);}path
}
fn checkpoint_hash(b:&mut CircuitBuilder<F,2>,root:HashOutTarget,stats:HashOutTarget) -> HashOutTarget {
    b.hash_two_to_one::<H>(root,stats)
}
pub fn append_constraints(b:&mut CircuitBuilder<F,2>,g:&mut SDKeyCircuitGadget,spec:&Value) -> Result<()> {
    let Some(pins)=validate_optional(spec)? else {return Ok(());};
    ensure!(g.circuit_inputs.len()==BUSINESS_WIDTH,"new dependency metadata must follow exact business prefix");
    let chain=canonical(spec["chain_root_at1"].as_str().unwrap())?;
    let mut targets=vec![];
    let anchor_stats=virtual_hash(b,&mut targets);
    let anchor_path=virtual_path(b,&mut targets,psy_config::network_constants::CHECKPOINT_TREE_HEIGHT as usize);
    b.connect_hashes(anchor_path.root,g.session_context.sign_context.checkpoint_tree_root);
    let one=b.one();b.connect(anchor_path.index,one);
    let chain=b.constant_hash(chain.0);
    let ah=checkpoint_hash(b,chain,anchor_stats);b.connect_hashes(anchor_path.value,ah);
    let roots=(0..6).map(|_|virtual_hash(b,&mut targets)).collect::<Vec<_>>();
    let stats=virtual_hash(b,&mut targets);
    let cd=b.hash_two_to_one::<H>(roots[0],roots[1]);let uw=b.hash_two_to_one::<H>(roots[2],roots[3]);
    let base=b.hash_two_to_one::<H>(cd,uw);let rv=b.hash_two_to_one::<H>(roots[4],roots[5]);
    let global=b.hash_two_to_one::<H>(base,rv);let ch=checkpoint_hash(b,global,stats);
    b.connect_hashes(ch,g.session_context.checkpoint_leaf_hash);
    for pin in &pins {
        let path=virtual_path(b,&mut targets,psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize);
        let id=b.constant(F::from_canonical_u64(pin.contract_id));b.connect(path.index,id);
        b.connect_hashes(path.root,roots[0]);
        // Whole typed leaf commits deployer as well as every code/function/
        // layout root, height and endpoint count. No free leaf preimage.
        let expected=b.constant_hash(pin.leaf()?.qfhash::<H>().0);b.connect_hashes(path.value,expected);
    }
    g.circuit_inputs.extend(targets);
    Ok(())
}
fn path_values(out:&mut Vec<F>,path:&MerkleProofCore<Q<F>>) {
    out.push(F::from_canonical_u64(path.index));out.extend(path.value.0.elements);
    for sibling in &path.siblings {out.extend(sibling.0.elements);}
}
/// Returns metadata only; callers append it after their unchanged 74 business
/// fields. Every root must be linked to the actual manager header arguments.
pub fn witness_values(spec:&Value,opening:&DependencyOpening,checkpoint_tree_root:Q<F>,checkpoint_leaf_hash:Q<F>) -> Result<Vec<F>> {
    let pins=validate_optional(spec)?.context("explicit dependency-bound key required")?;
    ensure!(opening.anchor.global_chain_root==canonical(spec["chain_root_at1"].as_str().unwrap())?
        && opening.anchor_path.index==1
        && opening.anchor_path.siblings.len()==psy_config::network_constants::CHECKPOINT_TREE_HEIGHT as usize
        && opening.anchor_path.root==checkpoint_tree_root
        && opening.anchor_path.value==opening.anchor.qfhash::<H>() && opening.anchor_path.verify::<H>(),
        "dependency-bound actual session chain anchor differs");
    ensure!(opening.checkpoint.qfhash::<H>()==checkpoint_leaf_hash
        && opening.roots.qfhash::<H>()==opening.checkpoint.global_chain_root,
        "dependency-bound actual session checkpoint differs");
    ensure!(opening.contracts.iter().map(|o|o.id).collect::<Vec<_>>()==pins.iter().map(|p|p.contract_id).collect::<Vec<_>>(),
        "dependency-bound exact ordered opening set required");
    let mut out=vec![];out.extend(opening.anchor.to_compact::<H>().stats_hash.0.elements);
    path_values(&mut out,&opening.anchor_path);out.extend(opening.roots.to_qfelts());
    out.extend(opening.checkpoint.to_compact::<H>().stats_hash.0.elements);
    for (pin,contract) in pins.iter().zip(&opening.contracts) {
        ensure!(contract.leaf==pin.leaf()? && contract.path.index==pin.contract_id
            && contract.path.siblings.len()==psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize
            && contract.path.value==contract.leaf.qfhash::<H>()
            && contract.path.root==opening.roots.contract_tree_root && contract.path.verify::<H>(),
            "dependency-bound actual contract opening differs");
        path_values(&mut out,&contract.path);
    }
    Ok(out)
}

#[cfg(all(test,feature="sdk-audit-v1"))]
mod tests {
    use super::*;
    use serde_json::json;
    fn shape() -> Value {
        let pins=[0,56,57,58].into_iter().map(|id| json!({"contractId":id,"deployer":if id==0 {0} else {123},
            "codeRoot":"1111111111111111111111111111111111111111111111111111111111111111",
            "layoutRoot":"2222222222222222222222222222222222222222222222222222222222222222",
            "functionTreeRoot":"3333333333333333333333333333333333333333333333333333333333333333",
            "stateTreeHeight":if id==0 {32} else {31},"layoutFieldCount":3,"layoutSlotCount":4})).collect::<Vec<_>>();
        json!({"key_profile":PROFILE,"dependency_bindings":pins,"version":2,"witness_length":74,"tx_count":40,
            "execution_scope":"explicit-selected-orders-v1","native_protocol":"mainnet-beta-20261027",
            "fee_min":"1000000000","fee_max":"1000100000","sdk_commit":crate::sdk_release::SDK_COMMIT,
            "client_commit":crate::sdk_release::CLIENT_COMMIT,"qualified_randomness":false,"whole_market_completeness":false,
            "chain_root_at1":"4444444444444444444444444444444444444444444444444444444444444444",
            "market":"amm","market_id":58,"config":{"assetA":56,"assetB":57,"networkMagic":"1384803358401154921"}})
    }
    #[test]
    fn legacy_is_explicit_noop_and_stray_pins_do_not_fallback() {
        assert!(validate_optional(&json!({})).unwrap().is_none());
        assert!(validate_optional(&json!({"dependency_bindings":[]})).is_err());
        assert!(validate_optional(&json!({"key_profile":"unknown"})).is_err());
    }
    #[test]
    fn shape_only_requires_exact_full_dependency_set() {
        // Shape checks only: these invented pins are not network identities,
        // authenticated Merkle paths, a valid key proof or an executable UPS.
        let good=shape();assert_eq!(validate_optional(&good).unwrap().unwrap().len(),4);
        for field in ["codeRoot","layoutRoot","functionTreeRoot","deployer","stateTreeHeight","layoutFieldCount","layoutSlotCount"] {
            let mut bad=good.clone();bad["dependency_bindings"][1].as_object_mut().unwrap().remove(field);
            assert!(validate_optional(&bad).is_err(),"missing {field}");
        }
        for field in ["deployer","stateTreeHeight"] {
            let mut bad=good.clone();bad["dependency_bindings"][1][field]=json!(0);assert!(validate_optional(&bad).is_err());
        }
        let mut bad=good.clone();bad["dependency_bindings"][2]=bad["dependency_bindings"][1].clone();assert!(validate_optional(&bad).is_err());
        let mut bad=good.clone();bad["dependency_bindings"].as_array_mut().unwrap().pop();assert!(validate_optional(&bad).is_err());
        let mut bad=good.clone();bad["config"]["randomSeed"]=json!(1);assert!(validate_optional(&bad).is_err());
        let mut bad=good.clone();bad["fee_max"]=json!("2000000000");assert!(validate_optional(&bad).is_err());
        let mut bad=good;bad["dependency_bindings"][0]["codeRoot"]=json!("0".repeat(64));assert!(validate_optional(&bad).is_err());
    }
}
