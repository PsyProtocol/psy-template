//! Complete final-order snapshot verification against an independently pinned
//! checkpoint-history root. This is Merkle verification, not finality or a UPS.
use crate::checkpoint_stream::{Hash, Manifest, Member, FIELDS};
use anyhow::{ensure, Context, Result};
use plonky2::plonk::config::Hasher;
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, Field64, PrimeField64},
    },
    hash::{hash_types::HashOut, poseidon::PoseidonHash as H},
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::{
    qblock::cmds::deploy_contract::get_code_root_by_code_hashes,
    qdata::{
        checkpoint::{PsyCheckpointGlobalStateRoots, PsyCheckpointLeaf},
        contract::PsyContractLeaf,
        user::PsyUserLeaf,
    },
};
use psy_config::network_constants::{
    CHECKPOINT_TREE_HEIGHT, CONTRACT_FUNCTION_TREE_HEIGHT, GLOBAL_CONTRACT_TREE_HEIGHT,
    GLOBAL_USER_TREE_HEIGHT,
};
use psy_crypto::hash::{
    merkle::core::MerkleProofCore,
    traits::{
        hasher::{FieldQHasher, MerkleZeroHasher},
        qhashable::QFieldHashable,
    },
};
use psy_vm::dpn::{contract::hash_dpn_function, vm::def::DPNFunctionCircuitDefinition};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
const LIMB: u128 = 1u128 << 62;
const FEE: u64 = 1_000_100_000;
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn q(v: &[u64]) -> Q<F> {
    Q(HashOut {
        elements: <[u64; 4]>::try_from(v).expect("four hash limbs").map(f),
    })
}
fn hash(v: &[u64]) -> Hash {
    H::hash_no_pad(&v.iter().copied().map(f).collect::<Vec<_>>())
        .elements
        .map(|n| n.to_canonical_u64())
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryOpening {
    pub anchor: PsyCheckpointLeaf<F>,
    pub anchor_path: MerkleProofCore<Q<F>>,
    pub checkpoint: PsyCheckpointLeaf<F>,
    pub checkpoint_path: MerkleProofCore<Q<F>>,
    pub roots: PsyCheckpointGlobalStateRoots<F>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StateOpening {
    pub contract_path: MerkleProofCore<Q<F>>,
    pub words: Vec<MerkleProofCore<Q<F>>>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Account {
    pub leaf: PsyUserLeaf<F>,
    pub market: StateOpening,
    pub asset_a: Option<StateOpening>,
    pub asset_b: Option<StateOpening>,
    pub native: Option<StateOpening>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContractOpening {
    pub id: u64,
    pub leaf: PsyContractLeaf<F>,
    pub path: MerkleProofCore<Q<F>>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub fields: Vec<u64>,
    pub history: HistoryOpening,
    pub contracts: Vec<ContractOpening>,
    pub accounts: Vec<Account>,
    pub key_public_param: Q<F>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssetBinding {
    pub id: u64,
    pub code_root: Q<F>,
    pub layout_root: Q<F>,
    pub function_root: Q<F>,
    pub height: u8,
    pub fields: u64,
    pub slots: u64,
}
impl AssetBinding {
    pub fn collection(id: u64, artifact: &Value, function_root: Q<F>) -> Result<Self> {
        ensure!(
            id >= 5 && artifact["state_tree_height"] == 30,
            "reviewed collection height"
        );
        let abi = &artifact["abi"];
        let state = abi["contract"]["state"]
            .as_array()
            .context("collection ABI state")?;
        let outbox = state
            .iter()
            .find(|v| v["name"] == "outbox")
            .context("collection FIFO")?;
        ensure!(outbox["offset"] == 1182, "reviewed collection FIFO offset");
        let layout = abi["contract"]["state_layout"]["fields"]
            .as_array()
            .context("collection layout")?;
        let fifo = layout
            .iter()
            .find(|v| v["name"] == "outbox")
            .context("collection FIFO layout")?;
        ensure!(
            fifo["start_slot"] == 1182
                && fifo["type"]["length"] == 16777216
                && fifo["type"]["item_felt_size"] == 35,
            "collection FIFO stride and bound"
        );
        let ty = abi["types"]
            .as_array()
            .context("collection types")?
            .iter()
            .find(|v| v["name"] == "NFTOutbox")
            .context("NFT FIFO type")?;
        ensure!(ty["felt_size"] == 35, "NFT FIFO field count");
        let fields = ty["fields"].as_array().context("NFT FIFO fields")?;
        ensure!(fields.len() == 11, "exact NFT FIFO structure");
        for (i, field) in fields.iter().enumerate() {
            let (name, offset, size, kind) = if i < 8 {
                (
                    format!(
                        "{}_{}",
                        if i % 2 == 0 {
                            "token_id"
                        } else {
                            "metadata_hash"
                        },
                        i / 2
                    ),
                    4 * i,
                    4,
                    "Hash",
                )
            } else {
                (
                    ["nonce_sent", "nonce_claimed", "nonce_acked"][i - 8].into(),
                    i + 24,
                    1,
                    "Felt",
                )
            };
            ensure!(
                field["name"] == name
                    && field["offset_within_parent"] == offset
                    && field["felt_size"] == size
                    && field["type"] == serde_json::json!({"kind":"primitive","name":kind}),
                "exact NFT FIFO field {i}"
            );
        }
        let defs: Vec<DPNFunctionCircuitDefinition> =
            serde_json::from_value(artifact["circuit_definitions"].clone())?;
        ensure!(
            !defs.is_empty() && defs.len() <= 1usize << (CONTRACT_FUNCTION_TREE_HEIGHT - 1),
            "collection methods"
        );
        let code_root = get_code_root_by_code_hashes::<F, H>(
            &defs.iter().map(hash_dpn_function::<F>).collect::<Vec<_>>(),
            CONTRACT_FUNCTION_TREE_HEIGHT - 1,
        );
        let (layout_root, fields, slots) = crate::contract_layout::artifact_layout(id, 30, abi)?;
        Ok(Self {
            id,
            code_root,
            layout_root,
            function_root,
            height: 30,
            fields,
            slots,
        })
    }
    pub fn from_artifact(id: u64, artifact: &Value, function_root: Q<F>) -> Result<Self> {
        let height = artifact["state_tree_height"]
            .as_u64()
            .context("asset height")?;
        ensure!(
            height == if id == 0 { 32 } else { 31 },
            "reviewed funding asset height"
        );
        let defs: Vec<DPNFunctionCircuitDefinition> =
            serde_json::from_value(artifact["circuit_definitions"].clone())?;
        ensure!(
            !defs.is_empty() && defs.len() <= 1usize << (CONTRACT_FUNCTION_TREE_HEIGHT - 1),
            "asset definitions"
        );
        let code_root = get_code_root_by_code_hashes::<F, H>(
            &defs.iter().map(hash_dpn_function::<F>).collect::<Vec<_>>(),
            CONTRACT_FUNCTION_TREE_HEIGHT - 1,
        );
        let (layout_root, fields, slots) =
            crate::contract_layout::artifact_layout(id, height as usize, &artifact["abi"])?;
        if id != 0 {
            let abi = &artifact["abi"];
            let outbox = abi["contract"]["state_layout"]["fields"]
                .as_array()
                .context("U124 fields")?
                .iter()
                .find(|v| v["name"] == "other_user_info")
                .context("U124 outbox")?;
            ensure!(
                outbox["start_slot"] == 33554453u64
                    && outbox["type"]["length"] == 16777216u64
                    && outbox["type"]["item_felt_size"] == 4,
                "U124 outbox layout"
            );
            let ty = abi["types"]
                .as_array()
                .context("U124 types")?
                .iter()
                .find(|v| v["name"] == "OtherUserInfo")
                .context("U124 cursor type")?;
            ensure!(
                ty["felt_size"] == 4 && ty["fields"].as_array().is_some_and(|v| v.len() == 2),
                "exact U124 cursor structure"
            );
            for (i, name) in ["amount_sent", "amount_claimed"].iter().enumerate() {
                let a = &ty["fields"][i];
                ensure!(
                    a["name"] == *name
                        && a["offset_within_parent"] == 2 * i
                        && a["type"]["length"] == 2
                        && a["felt_size"] == 2
                        && a["type"]["item"]
                            == serde_json::json!({"kind":"primitive","name":"Felt"}),
                    "full two-limb funding cursor"
                );
            }
        }
        Ok(Self {
            id,
            code_root,
            layout_root,
            function_root,
            height: height as u8,
            fields,
            slots,
        })
    }
}
#[derive(Clone)]
pub struct Review {
    pub market: u64,
    pub kind: u64,
    pub code_root: Q<F>,
    pub layout_root: Q<F>,
    pub layout_fields: u64,
    pub layout_slots: u64,
    pub function_root: Q<F>,
    pub offsets: BTreeMap<String, u64>,
    pub assets: [AssetBinding; 3],
    pub unit: u128,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Audit {
    pub owner: u64,
    pub nonce: u64,
    pub disposition: String,
    pub terms: Hash,
    pub paid_a: Option<String>,
    pub paid_b: Option<String>,
    pub fee: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Coverage {
    pub source_history_root: Q<F>,
    pub source_user_root: Q<F>,
    pub audit_root: Hash,
    pub accounts: u64,
    pub trading_manifest: Option<Manifest>,
    pub recovery_members: Vec<Member>,
    pub audit: Vec<Audit>,
    pub final_state_complete_relative_to_history: bool,
    pub eligible_funding_verified: bool,
    pub finality_verified: bool,
    pub full_ups_verified: bool,
    pub can_broadcast: bool,
}
impl Review {
    pub fn from_artifact(
        market: u64,
        kind: u64,
        artifact: &Value,
        function_root: Q<F>,
        assets: [AssetBinding; 3],
        unit: u128,
    ) -> Result<Self> {
        ensure!(
            market >= 5
                && market < 1 << 24
                && [1, 2, 3, 4].contains(&kind)
                && artifact["state_tree_height"] == 31,
            "reviewed market profile"
        );
        let abi = &artifact["abi"];
        let (layout_root, layout_fields, layout_slots) =
            crate::contract_layout::artifact_layout(market, 31, abi)?;
        let defs: Vec<DPNFunctionCircuitDefinition> =
            serde_json::from_value(artifact["circuit_definitions"].clone())?;
        ensure!(
            !defs.is_empty() && defs.len() <= 1usize << (CONTRACT_FUNCTION_TREE_HEIGHT - 1),
            "reviewed method count"
        );
        let code_root = get_code_root_by_code_hashes::<F, H>(
            &defs.iter().map(hash_dpn_function::<F>).collect::<Vec<_>>(),
            CONTRACT_FUNCTION_TREE_HEIGHT - 1,
        );
        let mut offsets = BTreeMap::new();
        for row in abi["contract"]["state"]
            .as_array()
            .context("market ABI fields")?
        {
            ensure!(
                offsets
                    .insert(
                        row["name"].as_str().context("field name")?.into(),
                        row["offset"].as_u64().context("field offset")?
                    )
                    .is_none(),
                "duplicate ABI name"
            );
        }
        // NFT funding has one U124 payment asset and one collection FIFO.
        // These aliases describe the generic payment/baseline interfaces only.
        if kind == 4 {
            let payment = *offsets
                .get("settled_payment")
                .context("NFT payment cursor")?;
            offsets.insert("settled_a".into(), payment);
            offsets.insert("settled_b".into(), payment);
        }
        for name in order_fields(kind).iter().map(|(n, _)| *n).chain([
            "consumed",
            "settled_a",
            "settled_b",
            "settled_fee",
            "batch_ready",
            "batch_phase",
        ]) {
            ensure!(
                offsets.contains_key(name),
                "missing reviewed coverage field {name}"
            );
        }
        ensure!(
            assets[0].id == 0
                && assets[0].height == 32
                && assets[1].id >= 5
                && assets[2].id >= 5
                && assets[1].id != assets[2].id
                && assets[1].height == 31
                && assets[2].height == if kind == 4 { 30 } else { 31 },
            "frozen native and distinct U124 assets"
        );
        ensure!(
            !assets.iter().any(|a| a.id == market),
            "market cannot alias a funding asset"
        );
        ensure!(unit > 0 && unit < LIMB * LIMB, "curve unit bound");
        Ok(Self {
            market,
            kind,
            code_root,
            layout_root,
            layout_fields,
            layout_slots,
            function_root,
            offsets,
            assets,
            unit,
        })
    }
}
pub fn order_fields(kind: u64) -> Vec<(&'static str, usize)> {
    if kind == 4 {
        return vec![
            ("kind", 1),
            ("pool", 1),
            ("nonce", 1),
            ("deadline", 1),
            ("cancelled", 1),
            ("order_checkpoint", 1),
            ("price", 2),
            ("seller", 1),
            ("listing_nonce", 1),
            ("nft_sequence", 1),
            ("token_id_0", 1),
            ("token_id_1", 1),
            ("token_id_2", 1),
            ("token_id_3", 1),
            ("metadata_hash_0", 1),
            ("metadata_hash_1", 1),
            ("metadata_hash_2", 1),
            ("metadata_hash_3", 1),
        ];
    }
    let mut v = vec![
        ("kind", 1),
        ("pool", 1),
        ("side", 1),
        ("deadline", 1),
        ("nonce", 1),
        ("x", 2),
        ("y", 2),
        ("z", 2),
        ("order_checkpoint", 1),
        ("cancelled", 1),
    ];
    if kind == 2 {
        v.extend([("lots", 1), ("expected_sold", 1), ("limit_mode", 1)]);
    }
    v
}
pub fn sparse_root(height: u8, leaves: impl IntoIterator<Item = (u64, Q<F>)>) -> Result<Q<F>> {
    ensure!(height <= 32, "snapshot tree height");
    let mut level = BTreeMap::new();
    for (i, v) in leaves {
        ensure!(
            i < 1u64 << height && v != Q::ZERO && level.insert(i, v).is_none(),
            "canonical unique nonempty leaf"
        );
    }
    for h in 0..height as usize {
        let parents = level.keys().map(|i| i / 2).collect::<BTreeSet<_>>();
        let z = H::get_zero_hash(h);
        level = parents
            .into_iter()
            .map(|i| {
                (
                    i,
                    H::q_two_to_one(
                        *level.get(&(2 * i)).unwrap_or(&z),
                        *level.get(&(2 * i + 1)).unwrap_or(&z),
                    ),
                )
            })
            .collect();
    }
    Ok(*level.get(&0).unwrap_or(&H::get_zero_hash(height as usize)))
}
fn membership(
    p: &MerkleProofCore<Q<F>>,
    root: Q<F>,
    index: u64,
    value: Q<F>,
    height: u8,
) -> Result<()> {
    ensure!(
        p.index == index
            && p.value == value
            && p.root == root
            && p.siblings.len() == height as usize
            && index < 1u64 << height
            && p.verify::<H>(),
        "snapshot Merkle mismatch: expected index {index}/height {height}, actual index {}/height {}, root matches {}, value matches {}", p.index, p.siblings.len(), p.root==root, p.value==value
    );
    Ok(())
}
struct Words {
    values: BTreeMap<u64, [u64; 4]>,
    absent: bool,
}
impl Words {
    fn open(user: &PsyUserLeaf<F>, id: u64, p: &StateOpening, height: u8) -> Result<Self> {
        membership(
            &p.contract_path,
            user.user_state_tree_root,
            id,
            p.contract_path.value,
            GLOBAL_CONTRACT_TREE_HEIGHT,
        )?;
        let absent = p.contract_path.value == Q::ZERO;
        ensure!(
            !absent || p.words.is_empty(),
            "absent contract cannot supply words"
        );
        let mut values = BTreeMap::new();
        for w in &p.words {
            membership(w, p.contract_path.value, w.index, w.value, height)?;
            ensure!(
                values
                    .insert(w.index, w.value.0.elements.map(|v| v.to_canonical_u64()))
                    .is_none(),
                "duplicate state word"
            );
        }
        Ok(Self { values, absent })
    }
    fn read(&self, offset: u64) -> Result<u64> {
        if self.absent {
            return Ok(0);
        }
        Ok(self
            .values
            .get(&(offset / 4))
            .context("missing authenticated source word")?[(offset % 4) as usize])
    }
    fn wide(&self, offset: u64) -> Result<u128> {
        let a = self.read(offset)?;
        let b = self.read(offset + 1)?;
        ensure!(a < 1 << 62 && b < 1 << 62, "canonical U124 limbs");
        Ok(a as u128 + LIMB * b as u128)
    }
}
fn checked_fee(n: u64) -> Result<u64> {
    ensure!(n < 1 << 62, "native fee bound");
    Ok(n)
}
fn funding(
    review: &Review,
    owner: u64,
    vault: u64,
    a: &Account,
    vault_words: &[Words; 4],
) -> Result<(u128, u128, u64)> {
    let account = [a.native.as_ref(), a.asset_a.as_ref(), a.asset_b.as_ref()];
    let mut paid = [0u128; 2];
    let mut fee = 0;
    for i in 0..3 {
        let words = Words::open(
            &a.leaf,
            review.assets[i].id,
            account[i].context("source funding opening required")?,
            review.assets[i].height,
        )?;
        if i == 0 {
            let sent = checked_fee(words.read(3 + 2 * vault)?)?;
            let claimed = checked_fee(vault_words[0].read(4 + 2 * owner)?)?;
            let base = checked_fee(vault_words[3].read(review.offsets["settled_fee"] + owner)?)?;
            ensure!(claimed == base, "source native cursor drift");
            fee = sent
                .checked_sub(base)
                .context("source fee cursor regression")?;
        } else if review.kind == 4 && i == 2 {
            let sent = checked_fee(words.read(1182 + 35 * vault + 32)?)?;
            let claimed = checked_fee(vault_words[i].read(1182 + 35 * owner + 33)?)?;
            paid[1] = sent
                .checked_sub(claimed)
                .context("NFT source cursor regression")? as u128;
        } else {
            let sent = words.wide(33554453 + 4 * vault)?;
            let claimed = vault_words[i].wide(33554455 + 4 * owner)?;
            let base = vault_words[3]
                .wide(review.offsets[if i == 1 { "settled_a" } else { "settled_b" }] + 2 * owner)?;
            ensure!(claimed == base, "source asset cursor drift");
            paid[i - 1] = sent
                .checked_sub(base)
                .context("source asset cursor regression")?;
        }
    }
    Ok((paid[0], paid[1], fee))
}
fn funded(
    kind: u64,
    values: &BTreeMap<String, Vec<u64>>,
    a: u128,
    b: u128,
    fee: u64,
    unit: u128,
) -> Result<bool> {
    let scalar = |n: &str| values[n][0];
    let wide = |n: &str| values[n][0] as u128 + LIMB * values[n][1] as u128;
    if kind == 4 {
        return Ok(fee == FEE
            && match scalar("kind") {
                1 => a == 0 && b == 1,
                2 => a == wide("price") && b == 0,
                _ => false,
            });
    }
    let x = wide("x");
    let k = scalar("kind");
    let yes = if kind == 1 || kind == 3 {
        match k {
            1 => match scalar("side") {
                0 => a == x && b == 0,
                1 => b == x && a == 0,
                _ => false,
            },
            2 if kind == 1 => a == x && b == wide("y"),
            3 if kind == 1 => a == 0 && b == 0,
            _ => false,
        }
    } else {
        match k {
            1 => a == 0 && b == x,
            2 => {
                b == 0
                    && unit
                        .checked_mul(scalar("lots") as u128)
                        .is_some_and(|q| q < LIMB * LIMB && a == q)
            }
            _ => false,
        }
    };
    Ok(fee == FEE && yes)
}
pub fn verify_source_context(review: &Review, s: &Snapshot, expected_history: Q<F>) -> Result<()> {
    let v = &s.fields;
    ensure!(
        v.len() == FIELDS
            && v.iter().all(|n| *n < F::ORDER)
            && v[0] == 1
            && v[1] == psy_config::PSY_NETWORK_MAGIC
            && v[2] == review.kind
            && v[3] == review.market
            && v[4] > 0
            && v[4] < 1 << 24
            && v[5] > 0
            && v[5] < 1 << 62
            && v[6] > 1
            && v[6] < v[7]
            && v[7] < 1 << 32,
        "source coverage scope"
    );
    for start in [9, 13, 25, 29, 33, 37] {
        ensure!(
            v[start..start + 4].iter().any(|n| *n != 0),
            "nonzero source identity"
        );
    }
    ensure!(
        expected_history != Q::ZERO,
        "independently pinned history root required"
    );
    membership(
        &s.history.anchor_path,
        expected_history,
        1,
        s.history.anchor.qfhash::<H>(),
        CHECKPOINT_TREE_HEIGHT,
    )?;
    ensure!(
        s.history.anchor.global_chain_root == q(&v[9..13]),
        "source chain instance"
    );
    membership(
        &s.history.checkpoint_path,
        expected_history,
        v[6],
        s.history.checkpoint.qfhash::<H>(),
        CHECKPOINT_TREE_HEIGHT,
    )?;
    ensure!(
        s.history.checkpoint.qfhash::<H>() == q(&v[13..17])
            && s.history.checkpoint.stats.random_seed == q(&v[21..25])
            && s.history.roots.qfhash::<H>() == s.history.checkpoint.global_chain_root,
        "exact source checkpoint/seed/state roots"
    );
    let mut bindings = review
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
        .collect::<Vec<_>>();
    bindings.push((
        review.market,
        review.code_root,
        review.layout_root,
        review.function_root,
        31,
        review.layout_fields,
        review.layout_slots,
    ));
    ensure!(
        s.contracts.len() == bindings.len()
            && s.contracts
                .iter()
                .map(|p| p.id)
                .collect::<BTreeSet<_>>()
                .len()
                == bindings.len(),
        "exact reviewed source dependencies"
    );
    for (id, code, layout, functions, height, fields, slots) in bindings {
        let p = s
            .contracts
            .iter()
            .find(|p| p.id == id)
            .context("missing source dependency")?;
        membership(
            &p.path,
            s.history.roots.contract_tree_root,
            id,
            p.leaf.qfhash::<H>(),
            GLOBAL_CONTRACT_TREE_HEIGHT,
        )?;
        ensure!(
            p.leaf.code_root == code
                && p.leaf.state_layout_root == layout
                && p.leaf.function_tree_root == functions
                && p.leaf.state_tree_height.to_canonical_u64() == height as u64
                && p.leaf.state_layout_field_count.to_canonical_u64() == fields
                && p.leaf.state_layout_slot_count.to_canonical_u64() == slots,
            "reviewed source code/layout/functions/counts"
        );
    }
    ensure!(
        q(&v[25..29]) == review.code_root
            && q(&v[29..33]) == review.layout_root
            && q(&v[37..41]) == review.function_root,
        "scope market identity"
    );
    Ok(())
}
pub fn verify_snapshot(review: &Review, s: &Snapshot, expected_history: Q<F>) -> Result<Coverage> {
    verify_source_context(review, s, expected_history)?;
    let v = &s.fields;
    let mut last = None;
    for a in &s.accounts {
        let id = a.leaf.user_id.to_canonical_u64();
        ensure!(
            id < 1u64 << GLOBAL_USER_TREE_HEIGHT && last.is_none_or(|n| id > n),
            "complete accounts must be canonical and unique"
        );
        ensure!(
            a.leaf.last_checkpoint_id.to_canonical_u64() <= v[6]
                && a.leaf.nonce.to_canonical_u64() < 1 << 62,
            "source account context"
        );
        last = Some(id);
    }
    let root = sparse_root(
        GLOBAL_USER_TREE_HEIGHT,
        s.accounts
            .iter()
            .map(|a| (a.leaf.user_id.to_canonical_u64(), a.leaf.qfhash::<H>())),
    )?;
    ensure!(
        root == s.history.roots.user_tree_root,
        "incomplete or forged source account set"
    );
    let vault = v[4];
    let va = s
        .accounts
        .iter()
        .find(|a| a.leaf.user_id.to_canonical_u64() == vault)
        .context("source vault absent")?;
    ensure!(
        va.leaf.nonce != F::ZERO
            && H::q_two_to_one(q(&v[33..37]), s.key_public_param) == va.leaf.public_key,
        "source vault/key binding"
    );
    let vault_words = [
        Words::open(
            &va.leaf,
            0,
            va.native.as_ref().context("vault native proof")?,
            32,
        )?,
        Words::open(
            &va.leaf,
            review.assets[1].id,
            va.asset_a.as_ref().context("vault asset A proof")?,
            31,
        )?,
        Words::open(
            &va.leaf,
            review.assets[2].id,
            va.asset_b.as_ref().context("vault asset B proof")?,
            review.assets[2].height,
        )?,
        Words::open(&va.leaf, review.market, &va.market, 31)?,
    ];
    ensure!(
        vault_words[3].read(review.offsets["batch_ready"])? == 1
            && [0, 3, 4].contains(&vault_words[3].read(review.offsets["batch_phase"])?),
        "source vault must be initialized and idle"
    );
    let (mut members, mut recovery, mut audit) = (vec![], vec![], vec![]);
    for a in &s.accounts {
        let owner = a.leaf.user_id.to_canonical_u64();
        let words = Words::open(&a.leaf, review.market, &a.market, 31)?;
        for (i, p) in [a.native.as_ref(), a.asset_a.as_ref(), a.asset_b.as_ref()]
            .into_iter()
            .enumerate()
        {
            if let Some(p) = p {
                let _ = Words::open(&a.leaf, review.assets[i].id, p, review.assets[i].height)?;
            }
        }
        let mut nonce = 0;
        let (mut pa, mut pb, mut fee) = (0, 0, 0);
        let mut observed = false;
        let mut terms = [0; 4];
        let reason = if owner == vault {
            "vault"
        } else if words.absent {
            "no-market-state"
        } else {
            let mut values = BTreeMap::new();
            for (name, width) in order_fields(review.kind) {
                let offset = review.offsets[name];
                let row = (0..width)
                    .map(|j| words.read(offset + j as u64))
                    .collect::<Result<Vec<_>>>()?;
                if width == 2 {
                    ensure!(row.iter().all(|n| *n < 1 << 62), "source order U124 range");
                }
                values.insert(name.to_string(), row);
            }
            nonce = values["nonce"][0];
            ensure!(nonce < 1 << 62, "source order nonce");
            let k = values["kind"][0];
            let pool = values["pool"][0];
            if k == 0 {
                "closed"
            } else if pool != vault {
                "other-vault"
            } else if owner == 0 || owner >= 1 << 24 {
                "unsupported-owner"
            } else {
                let consumed = vault_words[3].read(review.offsets["consumed"] + owner)?;
                ensure!(consumed < 1 << 62, "consumed nonce range");
                if nonce <= consumed {
                    "consumed"
                } else {
                    (pa, pb, fee) = funding(review, owner, vault, a, &vault_words)?;
                    observed = true;
                    let cancelled = values["cancelled"][0];
                    let deadline = values["deadline"][0];
                    ensure!(
                        cancelled <= 1
                            && deadline < 1 << 32
                            && values["order_checkpoint"][0] <= v[6],
                        "source deadline/cancellation/context"
                    );
                    let mut raw = vec![0x46494e414c4f5244, v[6], review.market, vault, owner];
                    for (name, _) in order_fields(review.kind) {
                        raw.extend(&values[name]);
                    }
                    raw.extend([
                        consumed,
                        (pa % LIMB) as u64,
                        (pa / LIMB) as u64,
                        (pb % LIMB) as u64,
                        (pb / LIMB) as u64,
                        fee,
                    ]);
                    terms = hash(&raw);
                    let nft_valid = if review.kind == 4 && values["kind"][0] == 1 && pb == 1 {
                        let nft = Words::open(
                            &a.leaf,
                            review.assets[2].id,
                            a.asset_b.as_ref().context("listing collection")?,
                            30,
                        )?;
                        let claimed = vault_words[2].read(1182 + 35 * owner + 33)?;
                        let payload = 1182 + 35 * vault + 8 * (claimed % 4);
                        values["nft_sequence"][0] == claimed
                            && (0..8).all(|i| {
                                let name = if i < 4 {
                                    format!("token_id_{i}")
                                } else {
                                    format!("metadata_hash_{}", i - 4)
                                };
                                nft.read(payload + i).is_ok_and(|n| n == values[&name][0])
                            })
                    } else {
                        true
                    };
                    let prepared = if review.kind >= 3 {
                        [a.native.as_ref(), a.asset_a.as_ref(), a.asset_b.as_ref()].into_iter().enumerate().map(|(i,p)| Words::open(&a.leaf,review.assets[i].id,p.context("funding contract proof")?,review.assets[i].height).map(|w| !w.absent)).collect::<Result<Vec<_>>>()?.into_iter().all(|v|v)
                    } else { true };
                    if cancelled == 1 {
                        "cancelled"
                    } else if deadline < v[6] {
                        "expired"
                    } else if !prepared {
                        "state-unprepared"
                    } else if !nft_valid || !funded(review.kind, &values, pa, pb, fee, review.unit)?
                    {
                        "funding-ineligible"
                    } else {
                        "eligible"
                    }
                }
            }
        };
        if reason == "eligible" {
            members.push(Member {
                owner,
                nonce,
                terms,
            });
        } else if pa > 0 || pb > 0 || fee > 0 {
            recovery.push(Member {
                owner,
                nonce,
                terms,
            });
        }
        audit.push(Audit {
            owner,
            nonce,
            disposition: reason.into(),
            terms,
            paid_a: observed.then(|| pa.to_string()),
            paid_b: observed.then(|| pb.to_string()),
            fee: observed.then_some(fee),
        });
    }
    let mut values = vec![
        0x46494e4155444954,
        v[6],
        review.market,
        vault,
        audit.len() as u64,
    ];
    for row in &audit {
        let status = match row.disposition.as_str() {
            "vault" => 1,
            "no-market-state" => 2,
            "closed" => 3,
            "other-vault" => 4,
            "unsupported-owner" => 5,
            "consumed" => 6,
            "cancelled" => 7,
            "expired" => 8,
            "funding-ineligible" => 9,
            "eligible" => 10,
            "state-unprepared" => 11,
            _ => unreachable!(),
        };
        values.extend([row.owner, row.nonce, status]);
        values.extend(row.terms);
    }
    let trading_manifest = if members.is_empty() {
        ensure!(
            v[8] == 0 && v[17..21] == [0; 4],
            "empty source manifest bounds"
        );
        None
    } else {
        ensure!(
            v[8] == 0 || v[8] == members.len() as u64,
            "source eligible count substitution"
        );
        let mut fields = v.clone();
        fields[8] = members.len() as u64;
        if review.kind >= 3 {
            ensure!(v[17..21] == [0; 4], "unsealed paired source manifest only");
            Some(Manifest { fields, members })
        } else {
            Some(crate::checkpoint_stream::prepare(Manifest { fields, members })?.0)
        }
    };
    Ok(Coverage {
        source_history_root: expected_history,
        source_user_root: root,
        audit_root: hash(&values),
        accounts: audit.len() as u64,
        trading_manifest,
        recovery_members: recovery,
        audit,
        final_state_complete_relative_to_history: true,
        eligible_funding_verified: true,
        finality_verified: false,
        full_ups_verified: false,
        can_broadcast: false,
    })
}

/// The reader supplies untrusted subtree membership data only. Every answer is
/// verified before it can prune a range or yield a nonempty account ID.
pub struct UserTraversal {
    root: Q<F>,
    stack: Vec<(u8, u64, Q<F>)>,
    pending: Option<(u8, u64, Q<F>)>,
    result: Vec<(u64, Q<F>)>,
    reads: usize,
    max_reads: usize,
    max_accounts: usize,
}
impl UserTraversal {
    pub fn new(root: Q<F>, max_reads: usize, max_accounts: usize) -> Result<Self> {
        ensure!(
            GLOBAL_USER_TREE_HEIGHT == 32 && max_reads > 0 && max_accounts > 0,
            "bounded complete source traversal"
        );
        Ok(Self {
            root,
            stack: vec![(0, 0, root)],
            pending: None,
            result: vec![],
            reads: 0,
            max_reads,
            max_accounts,
        })
    }
    pub fn next_request(&mut self) -> Result<Option<(u8, u64)>> {
        ensure!(
            self.pending.is_none(),
            "unanswered source traversal request"
        );
        while let Some((level, index, value)) = self.stack.pop() {
            if value == H::get_zero_hash((GLOBAL_USER_TREE_HEIGHT - level) as usize) {
                continue;
            }
            if level == GLOBAL_USER_TREE_HEIGHT {
                ensure!(
                    self.result.len() < self.max_accounts,
                    "source account budget exhausted; incomplete traversal"
                );
                self.result.push((index, value));
                continue;
            }
            ensure!(
                self.reads < self.max_reads,
                "source read budget exhausted; incomplete traversal"
            );
            self.reads += 1;
            self.pending = Some((level, index, value));
            return Ok(Some((level + 1, 2 * index)));
        }
        Ok(None)
    }
    pub fn accept(&mut self, p: MerkleProofCore<Q<F>>) -> Result<()> {
        let (level, index, value) = self.pending.context("unsolicited traversal answer")?;
        let depth = level + 1;
        membership(&p, self.root, 2 * index, p.value, depth)?;
        let right = p.siblings[0];
        ensure!(
            H::q_two_to_one(p.value, right) == value,
            "subtree parent/root discontinuity"
        );
        self.pending = None;
        self.stack.push((depth, 2 * index + 1, right));
        self.stack.push((depth, 2 * index, p.value));
        Ok(())
    }
    pub fn finish(self) -> Result<Vec<(u64, Q<F>)>> {
        ensure!(
            self.pending.is_none() && self.stack.is_empty(),
            "incomplete source traversal"
        );
        ensure!(
            sparse_root(GLOBAL_USER_TREE_HEIGHT, self.result.iter().copied())? == self.root,
            "complete traversal endpoint"
        );
        Ok(self.result)
    }
}
pub fn discover_users(
    mut read: impl FnMut(u8, u64) -> Result<MerkleProofCore<Q<F>>>,
    root: Q<F>,
    max_reads: usize,
    max_accounts: usize,
) -> Result<Vec<(u64, Q<F>)>> {
    let mut traversal = UserTraversal::new(root, max_reads, max_accounts)?;
    while let Some((level, index)) = traversal.next_request()? {
        traversal.accept(read(level, index)?)?;
    }
    traversal.finish()
}
