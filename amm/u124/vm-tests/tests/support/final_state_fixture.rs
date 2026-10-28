use super::*;
use anyhow::Context;
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{hash_types::HashOut, poseidon::PoseidonHash as H},
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::qdata::{
    checkpoint::{PsyCheckpointGlobalStateRoots, PsyCheckpointLeaf},
    contract::PsyContractLeaf,
    user::PsyUserLeaf,
};
use psy_config::network_constants::{
    CHECKPOINT_TREE_HEIGHT, GLOBAL_CONTRACT_TREE_HEIGHT, GLOBAL_USER_TREE_HEIGHT,
};
use psy_crypto::hash::{
    merkle::core::MerkleProofCore,
    traits::{
        hasher::{FieldQHasher, MerkleZeroHasher},
        qhashable::QFieldHashable,
    },
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
};
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn q(n: u64) -> Q<F> {
    Q(HashOut {
        elements: [f(n), F::ZERO, F::ZERO, F::ZERO],
    })
}
#[derive(Clone)]
struct Tree {
    height: u8,
    levels: Vec<BTreeMap<u64, Q<F>>>,
}
impl Tree {
    fn new(height: u8, leaves: Vec<(u64, Q<F>)>) -> Self {
        let mut levels = vec![leaves
            .into_iter()
            .filter(|(_, v)| *v != Q::ZERO)
            .collect::<BTreeMap<_, _>>()];
        for h in 0..height as usize {
            let parents = levels[h].keys().map(|i| i / 2).collect::<BTreeSet<_>>();
            let z = H::get_zero_hash(h);
            let next = parents
                .into_iter()
                .map(|i| {
                    (
                        i,
                        H::q_two_to_one(
                            *levels[h].get(&(2 * i)).unwrap_or(&z),
                            *levels[h].get(&(2 * i + 1)).unwrap_or(&z),
                        ),
                    )
                })
                .collect();
            levels.push(next);
        }
        Self { height, levels }
    }
    fn root(&self) -> Q<F> {
        *self.levels[self.height as usize]
            .get(&0)
            .unwrap_or(&H::get_zero_hash(self.height as usize))
    }
    fn proof(&self, i: u64) -> MerkleProofCore<Q<F>> {
        let value = *self.levels[0].get(&i).unwrap_or(&Q::ZERO);
        let siblings = (0..self.height as usize)
            .map(|h| {
                *self.levels[h]
                    .get(&((i >> h) ^ 1))
                    .unwrap_or(&H::get_zero_hash(h))
            })
            .collect();
        MerkleProofCore::new_from_params::<H>(i, value, siblings)
    }
}
fn words(height: u8, slots: &BTreeMap<u64, u64>) -> (Tree, Vec<MerkleProofCore<Q<F>>>) {
    let mut values = BTreeMap::<u64, [F; 4]>::new();
    for (o, v) in slots {
        values.entry(o / 4).or_insert([F::ZERO; 4])[(*o % 4) as usize] = f(*v);
    }
    let tree = Tree::new(
        height,
        values
            .iter()
            .map(|(i, v)| (*i, Q(HashOut { elements: *v })))
            .collect(),
    );
    let proofs = values.keys().map(|i| tree.proof(*i)).collect();
    (tree, proofs)
}
fn put_pair(slots: &mut BTreeMap<u64, u64>, o: u64, value: u128) {
    slots.insert(o, (value % LIMB) as u64);
    slots.insert(o + 1, (value / LIMB) as u64);
}
const LIMB: u128 = 1u128 << 62;
pub fn fixture(
    kind: u64,
    invalid_limb: bool,
    cursor_drift: bool,
) -> Result<(Review, Snapshot, Q<F>)> {
    let root = std::env::var("FINAL_STATE_FIXTURES")?;
    let name = if kind == 1 { "amm" } else { "bondingcurve" };
    let artifact: serde_json::Value = serde_json::from_slice(&fs::read(format!(
        "{root}/{name}/compiled/compilation_artifact.json"
    ))?)?;
    let token: serde_json::Value = serde_json::from_slice(&fs::read(format!(
        "{root}/token/compilation_artifact.json"
    ))?)?;
    let native: serde_json::Value =
        serde_json::from_slice(&fs::read(format!("{root}/native.json"))?)?;
    let assets = [
        AssetBinding::from_artifact(0, &native, q(300))?,
        AssetBinding::from_artifact(42, &token, q(342))?,
        AssetBinding::from_artifact(43, &token, q(343))?,
    ];
    let review = Review::from_artifact(1000, kind, &artifact, q(77), assets, 10u128.pow(18))?;
    let (v, m) = (100, 1000);
    let mut all = BTreeMap::<u64, BTreeMap<u64, BTreeMap<u64, u64>>>::new();
    let mut vault = BTreeMap::new();
    for (name, value) in [("batch_ready", 1), ("batch_phase", 0)] {
        vault.insert(review.offsets[name], value);
    }
    for owner in 200..216 {
        vault.insert(
            review.offsets["consumed"] + owner,
            if owner == 212 { 1 } else { 0 },
        );
        vault.insert(review.offsets["settled_fee"] + owner, 0);
        put_pair(&mut vault, review.offsets["settled_a"] + 2 * owner, 0);
        put_pair(&mut vault, review.offsets["settled_b"] + 2 * owner, 0);
    }
    all.entry(v).or_default().insert(m, vault);
    for asset in [0, 42, 43] {
        all.entry(v).or_default().entry(asset).or_default();
    }
    all.entry(5).or_default();
    for owner in 200..216 {
        if owner == 215 {
            all.entry(owner).or_default();
            continue;
        }
        let amount = if kind == 1 {
            if owner == 208 {
                (1u128 << 124) - 1
            } else {
                LIMB + 17
            }
        } else {
            2 * 10u128.pow(18)
        };
        let mut slots = BTreeMap::new();
        for (name, width) in order_fields(kind) {
            let offset = review.offsets[name];
            let value = match name {
                "kind" => {
                    if owner == 214 {
                        0
                    } else {
                        1
                    }
                }
                "pool" => {
                    if owner == 213 {
                        999
                    } else {
                        v
                    }
                }
                "deadline" => {
                    if owner == 210 {
                        100
                    } else {
                        200
                    }
                }
                "nonce" => 1,
                "cancelled" => u64::from(owner == 209),
                "order_checkpoint" => 100,
                "lots" => 1,
                "limit_mode" => 1,
                _ => 0,
            };
            slots.insert(offset, value);
            if width == 2 {
                put_pair(
                    &mut slots,
                    offset,
                    if name == "x" {
                        amount
                    } else if name == "y" {
                        1
                    } else {
                        0
                    },
                );
            }
        }
        if invalid_limb && owner == 200 {
            slots.insert(review.offsets["x"] + 1, 1 << 62);
        }
        all.entry(owner).or_default().insert(m, slots);
        let native = all.entry(owner).or_default().entry(0).or_default();
        native.insert(3 + 2 * v, 1_000_100_000);
        for asset in [42, 43] {
            let token = all.entry(owner).or_default().entry(asset).or_default();
            put_pair(
                token,
                33554453 + 4 * v,
                if owner != 211 && asset == if kind == 1 { 42 } else { 43 } {
                    amount
                } else {
                    0
                },
            );
        }
        let nv = all.get_mut(&v).unwrap().get_mut(&0).unwrap();
        nv.insert(4 + 2 * owner, 0);
        for asset in [42, 43] {
            let tv = all.get_mut(&v).unwrap().get_mut(&asset).unwrap();
            put_pair(
                tv,
                33554455 + 4 * owner,
                if cursor_drift && owner == 200 && asset == 42 {
                    1
                } else {
                    0
                },
            );
        }
    }
    let key_param = q(90);
    let key_fp = q(91);
    let key = H::q_two_to_one(key_fp, key_param);
    let mut accounts = vec![];
    for (owner, contracts) in all {
        let mut trees = BTreeMap::new();
        for (id, slots) in contracts {
            let height = if id == 0 { 32 } else { 31 };
            trees.insert(id, words(height, &slots));
        }
        let user_tree = Tree::new(
            GLOBAL_CONTRACT_TREE_HEIGHT,
            trees.iter().map(|(id, (t, _))| (*id, t.root())).collect(),
        );
        let leaf = PsyUserLeaf {
            user_id: f(owner),
            public_key: if owner == v { key } else { q(owner + 2000) },
            user_state_tree_root: user_tree.root(),
            nonce: F::ONE,
            last_checkpoint_id: f(100),
            ..Default::default()
        };
        let opener = |id| StateOpening {
            contract_path: user_tree.proof(id),
            words: trees.get(&id).map(|(_, p)| p.clone()).unwrap_or_default(),
        };
        accounts.push(Account {
            leaf,
            market: opener(m),
            native: Some(opener(0)),
            asset_a: Some(opener(42)),
            asset_b: Some(opener(43)),
        });
    }
    let user_root = Tree::new(
        GLOBAL_USER_TREE_HEIGHT,
        accounts
            .iter()
            .map(|a| (a.leaf.user_id.to_canonical_u64(), a.leaf.qfhash::<H>()))
            .collect(),
    )
    .root();
    let mut contract_leaves = review
        .assets
        .iter()
        .map(|a| {
            (
                a.id,
                PsyContractLeaf {
                    code_root: a.code_root,
                    state_layout_root: a.layout_root,
                    function_tree_root: a.function_root,
                    state_tree_height: f(a.height as u64),
                    state_layout_field_count: f(a.fields),
                    state_layout_slot_count: f(a.slots),
                    ..Default::default()
                },
            )
        })
        .collect::<Vec<_>>();
    contract_leaves.push((
        m,
        PsyContractLeaf {
            code_root: review.code_root,
            state_layout_root: review.layout_root,
            function_tree_root: review.function_root,
            state_tree_height: f(31),
            state_layout_field_count: f(review.layout_fields),
            state_layout_slot_count: f(review.layout_slots),
            ..Default::default()
        },
    ));
    let ct = Tree::new(
        GLOBAL_CONTRACT_TREE_HEIGHT,
        contract_leaves
            .iter()
            .map(|(id, l)| (*id, l.qfhash::<H>()))
            .collect(),
    );
    let contracts = contract_leaves
        .into_iter()
        .map(|(id, leaf)| ContractOpening {
            id,
            leaf,
            path: ct.proof(id),
        })
        .collect();
    let roots = PsyCheckpointGlobalStateRoots {
        user_tree_root: user_root,
        contract_tree_root: ct.root(),
        ..Default::default()
    };
    let anchor = PsyCheckpointLeaf {
        global_chain_root: q(1234),
        ..Default::default()
    };
    let mut checkpoint = PsyCheckpointLeaf {
        global_chain_root: roots.qfhash::<H>(),
        ..Default::default()
    };
    checkpoint.stats.random_seed = q(5678);
    let tree = Tree::new(
        CHECKPOINT_TREE_HEIGHT,
        vec![(1, anchor.qfhash::<H>()), (101, checkpoint.qfhash::<H>())],
    );
    let mut fields = vec![0; 41];
    fields[..9].copy_from_slice(&[1, psy_config::PSY_NETWORK_MAGIC, kind, m, v, 1, 101, 200, 0]);
    for (start, value) in [
        (9, anchor.global_chain_root),
        (13, checkpoint.qfhash::<H>()),
        (21, checkpoint.stats.random_seed),
        (25, review.code_root),
        (29, review.layout_root),
        (33, key_fp),
        (37, review.function_root),
    ] {
        fields[start..start + 4].copy_from_slice(&value.0.elements.map(|n| n.to_canonical_u64()));
    }
    let snapshot = Snapshot {
        fields,
        history: HistoryOpening {
            anchor,
            anchor_path: tree.proof(1),
            checkpoint,
            checkpoint_path: tree.proof(101),
            roots,
        },
        contracts,
        accounts,
        key_public_param: key_param,
    };
    Ok((review, snapshot, tree.root()))
}
pub fn discovery_reader(s: &Snapshot) -> Result<impl Fn(u8, u64) -> Result<MerkleProofCore<Q<F>>>> {
    let t = Tree::new(
        GLOBAL_USER_TREE_HEIGHT,
        s.accounts
            .iter()
            .map(|a| (a.leaf.user_id.to_canonical_u64(), a.leaf.qfhash::<H>()))
            .collect(),
    );
    Ok(move |depth, index| {
        let height = GLOBAL_USER_TREE_HEIGHT - depth;
        let value = *t.levels[height as usize]
            .get(&index)
            .unwrap_or(&H::get_zero_hash(height as usize));
        let siblings = (height as usize..GLOBAL_USER_TREE_HEIGHT as usize)
            .map(|h| {
                *t.levels[h]
                    .get(&((index >> (h - height as usize)) ^ 1))
                    .unwrap_or(&H::get_zero_hash(h))
            })
            .collect();
        Ok(MerkleProofCore::new_from_params::<H>(
            index, value, siblings,
        ))
    })
}
pub fn account(s: &Snapshot, user: u64) -> Result<&Account> {
    s.accounts
        .iter()
        .find(|a| a.leaf.user_id.to_canonical_u64() == user)
        .context("fixture user")
}
pub fn state(s: &Snapshot, user: u64, id: u64) -> Result<&StateOpening> {
    let a = account(s, user)?;
    Ok(match id {
        0 => a.native.as_ref().context("native fixture")?,
        42 => a.asset_a.as_ref().context("A fixture")?,
        43 => a.asset_b.as_ref().context("B fixture")?,
        1000 => &a.market,
        _ => anyhow::bail!("unexpected fixture contract"),
    })
}
pub fn word_proof(s: &Snapshot, user: u64, id: u64, index: u64) -> Result<MerkleProofCore<Q<F>>> {
    let p = state(s, user, id)?;
    let tree = Tree::new(
        if id == 0 { 32 } else { 31 },
        p.words.iter().map(|w| (w.index, w.value)).collect(),
    );
    ensure!(
        tree.root() == p.contract_path.value,
        "fixture state reconstruction"
    );
    Ok(tree.proof(index))
}
