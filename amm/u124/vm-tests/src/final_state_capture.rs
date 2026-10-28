//! Bounded checkpoint-pinned collection. Readers provide data, never authority.
//! Missing routes, unavailable historical state or exhausted budgets abort.
use crate::final_state_coverage::*;
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::PrimeField64},
    hash::poseidon::PoseidonHash as H,
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_client_data::{
    qdata::user::PsyUserLeaf,
    traits::qdatastore::{
        qmetadata::QMetaDataStoreReaderSync, qtreedata::QTreeDataStoreReaderSync,
    },
};
use psy_config::network_constants::COORDINATOR_USER_TREE_HEIGHT;
use psy_crypto::hash::{merkle::core::MerkleProofCore, traits::qhashable::QFieldHashable};
use psy_provider::provider::RpcProvider;
use std::{
    collections::BTreeSet,
    future::Future,
    time::{Duration, Instant},
};

type Proof = MerkleProofCore<Q<F>>;
#[allow(async_fn_in_trait)]
pub trait SourceReader {
    async fn subtree(&mut self, checkpoint: u64, depth: u8, index: u64) -> Result<Proof>;
    async fn user(&mut self, checkpoint: u64, user: u64) -> Result<PsyUserLeaf<F>>;
    async fn contract(&mut self, checkpoint: u64, user: u64, contract: u64) -> Result<Proof>;
    async fn word(
        &mut self,
        checkpoint: u64,
        user: u64,
        contract: u64,
        height: u8,
        index: u64,
    ) -> Result<Proof>;
}
/// Only read methods are used. Upper empty realms must be authenticated through
/// the coordinator, not guessed from whether a realm URL is configured.
pub struct RpcSourceReader(pub RpcProvider);
impl SourceReader for RpcSourceReader {
    async fn subtree(&mut self, c: u64, d: u8, i: u64) -> Result<Proof> {
        if d <= COORDINATOR_USER_TREE_HEIGHT {
            self.0
                .get_user_sub_tree_merkle_proof_inner(&self.0.get_coordinator_url()?, c, 0, d, i)
                .await
        } else {
            self.0.get_user_sub_tree_merkle_proof(c, 0, d, i).await
        }
    }
    async fn user(&mut self, c: u64, u: u64) -> Result<PsyUserLeaf<F>> {
        self.0.get_user_leaf_data(c, u).await
    }
    async fn contract(&mut self, c: u64, u: u64, k: u64) -> Result<Proof> {
        self.0
            .get_user_contract_tree_merkle_proof(c, u, k.try_into()?)
            .await
    }
    async fn word(&mut self, c: u64, u: u64, k: u64, h: u8, i: u64) -> Result<Proof> {
        self.0
            .get_user_contract_state_tree_merkle_proof(c, u, k.try_into()?, h, i)
            .await
    }
}

pub struct ReadBudget {
    deadline: Instant,
    remaining: usize,
    pub reads: usize,
    pub encoded_bytes: usize,
}
impl ReadBudget {
    pub fn new(seconds: u64, reads: usize) -> Result<Self> {
        ensure!(
            seconds > 0 && seconds <= 3600 && reads > 0 && reads <= 2_000_000,
            "bounded source read budget"
        );
        Ok(Self {
            deadline: Instant::now() + Duration::from_secs(seconds),
            remaining: reads,
            reads: 0,
            encoded_bytes: 0,
        })
    }
    pub async fn read<T: serde::Serialize>(
        &mut self,
        task: impl Future<Output = Result<T>>,
    ) -> Result<T> {
        ensure!(
            self.remaining > 0,
            "source logical read budget exhausted; incomplete capture"
        );
        let left = self
            .deadline
            .checked_duration_since(Instant::now())
            .context("source capture deadline; incomplete capture")?;
        self.remaining -= 1;
        self.reads += 1;
        let reply = tokio::time::timeout(left.min(Duration::from_secs(30)), task)
            .await
            .context("source read timeout; incomplete capture")??;
        self.encoded_bytes = self
            .encoded_bytes
            .checked_add(serde_json::to_vec(&reply)?.len())
            .context("source byte budget overflow")?;
        ensure!(
            self.encoded_bytes <= 64 * 1024 * 1024,
            "source encoded response budget exhausted; incomplete capture"
        );
        Ok(reply)
    }
}
fn indices(offsets: impl IntoIterator<Item = (u64, usize)>) -> BTreeSet<u64> {
    offsets
        .into_iter()
        .flat_map(|(o, n)| (0..n).map(move |i| (o + i as u64) / 4))
        .collect()
}
async fn open<R: SourceReader>(
    reader: &mut R,
    budget: &mut ReadBudget,
    c: u64,
    leaf: &PsyUserLeaf<F>,
    id: u64,
    height: u8,
    words: BTreeSet<u64>,
) -> Result<StateOpening> {
    let owner = leaf.user_id.to_canonical_u64();
    let p = budget.read(reader.contract(c, owner, id)).await?;
    ensure!(
        p.index == id
            && p.root == leaf.user_state_tree_root
            && p.siblings.len() == 24
            && id < 1 << 24
            && p.verify::<H>(),
        "source contract opening before word reads"
    );
    let mut out = StateOpening {
        contract_path: p,
        words: vec![],
    };
    if out.contract_path.value != Q::ZERO {
        for index in words {
            let w = budget
                .read(reader.word(c, owner, id, height, index))
                .await?;
            ensure!(
                w.index == index
                    && w.root == out.contract_path.value
                    && w.siblings.len() == height as usize
                    && index < 1u64 << height
                    && w.verify::<H>(),
                "source word opening"
            );
            out.words.push(w);
        }
    }
    Ok(out)
}

/// The caller supplies an independently pinned history root and approved
/// release review. The empty header is authenticated before account discovery.
pub async fn collect_snapshot<R: SourceReader>(
    review: &Review,
    mut header: Snapshot,
    root: Q<F>,
    reader: &mut R,
    budget: &mut ReadBudget,
    max_accounts: usize,
) -> Result<Snapshot> {
    ensure!(
        header.accounts.is_empty() && max_accounts > 0 && max_accounts <= 65536,
        "fresh bounded source capture"
    );
    verify_source_context(review, &header, root)?;
    let c = header.fields[6];
    let vault = header.fields[4];
    let mut tree =
        UserTraversal::new(header.history.roots.user_tree_root, 2_000_000, max_accounts)?;
    while let Some((d, i)) = tree.next_request()? {
        tree.accept(budget.read(reader.subtree(c, d, i)).await?)?;
    }
    let users = tree.finish()?;
    ensure!(
        users.iter().any(|(id, _)| *id == vault),
        "source vault absent"
    );
    let eligible_ids = users
        .iter()
        .map(|(id, _)| *id)
        .filter(|id| *id > 0 && *id < 1 << 24 && *id != vault)
        .collect::<Vec<_>>();
    for (owner, expected) in users {
        let leaf = budget.read(reader.user(c, owner)).await?;
        ensure!(
            leaf.user_id.to_canonical_u64() == owner && leaf.qfhash::<H>() == expected,
            "source metadata hash/index substitution"
        );
        let market_slots = if owner == vault {
            let mut slots = vec![
                (review.offsets["batch_ready"], 1),
                (review.offsets["batch_phase"], 1),
            ];
            for id in &eligible_ids {
                for (name, width) in [
                    ("consumed", 1),
                    ("settled_a", 2),
                    ("settled_b", 2),
                    ("settled_fee", 1),
                ] {
                    slots.push((review.offsets[name] + *id * width as u64, width));
                }
            }
            indices(slots)
        } else {
            indices(
                order_fields(review.kind)
                    .iter()
                    .map(|(name, n)| (review.offsets[*name], *n)),
            )
        };
        let market = open(reader, budget, c, &leaf, review.market, 31, market_slots).await?;
        let mut assets = vec![];
        for i in 0..3 {
            let slots = if owner == vault {
                indices(eligible_ids.iter().map(|u| {
                    if i == 0 {
                        (4 + 2 * u, 1)
                    } else {
                        (33554455 + 4 * u, 2)
                    }
                }))
            } else if i == 0 {
                indices([(3 + 2 * vault, 1)])
            } else {
                indices([(33554453 + 4 * vault, 2)])
            };
            assets.push(
                open(
                    reader,
                    budget,
                    c,
                    &leaf,
                    review.assets[i].id,
                    review.assets[i].height,
                    slots,
                )
                .await?,
            );
        }
        header.accounts.push(Account {
            leaf,
            market,
            native: Some(assets.remove(0)),
            asset_a: Some(assets.remove(0)),
            asset_b: Some(assets.remove(0)),
        });
    }
    verify_snapshot(review, &header, root)?;
    Ok(header)
}
