//! Spending authorization for distinct stream vaults. Every source/order/market
//! transition is constrained together with the actual ordered UPS call stack.
use crate::{
    batch_policy::{bind, chosen, eq},
    checkpoint_stream::{Path, State},
    final_state_coverage::{Review, Snapshot},
    market_key::{MarketKeyConfig, SDKeyCircuitGadget},
    stream_context::SourceContextTargets,
    stream_current::{CurrentOpening, CurrentTargets},
    stream_order::StateTargets,
    stream_source::{lt, Progress, ProgressTargets, SourcePage, SourcePageTargets, Tape},
};
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{
        hash_types::{HashOut, HashOutTarget},
        poseidon::PoseidonHash as H,
    },
    iop::{
        target::{BoolTarget, Target},
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::{circuit_builder::CircuitBuilder, circuit_data::CircuitConfig, config::Hasher},
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_common_circuit::hash::merkle::gadgets::merkle_proof::MerkleProofGadget;
use psy_crypto::hash::{merkle::core::MerkleProofCore, traits::hasher::MerkleZeroHasher};
use serde_json::{json, Value};
pub const WIDTH: usize = 80;
pub const OPEN: u64 = 5;
pub const COVER: u64 = 6;
pub const ORDER: u64 = 7;
pub const SETTLE: u64 = 8;
pub const ABORT_SOURCE: u64 = 9;
const METHODS: [(&str, usize); 14] = [
    ("open_source_stream", 16),
    ("initialize_stream_roots", 12),
    ("begin_source_page", 4),
    ("set_source_users", 6),
    ("set_source_manifests", 10),
    ("finish_source_page", 4),
    ("abort_source_stream", 4),
    ("begin_order_page", 4),
    ("set_order_page", 16),
    ("finish_order_page", 4),
    ("begin_stream_settlement", 13),
    ("bind_stream_member", 12),
    ("claim_stream_member", 2),
    ("finish_stream_settlement", 7),
];
fn f(n: u64) -> F {
    F::from_canonical_u64(n)
}
fn h(v: [u64; 4]) -> HashOut<F> {
    HashOut { elements: v.map(f) }
}
fn hash(v: Vec<u64>) -> [u64; 4] {
    H::hash_no_pad(&v.into_iter().map(f).collect::<Vec<_>>())
        .elements
        .map(|x| x.to_canonical_u64())
}
fn gated_hash(b: &mut CircuitBuilder<F, 2>, gate: BoolTarget, a: HashOutTarget, c: HashOutTarget) {
    for (x, y) in a.elements.into_iter().zip(c.elements) {
        eq(b, gate, x, y);
    }
}
fn same(b: &mut CircuitBuilder<F, 2>, gate: BoolTarget, a: &[Target], c: &[Target]) {
    assert_eq!(a.len(), c.len());
    for (x, y) in a.iter().zip(c) {
        eq(b, gate, *x, *y);
    }
}
fn invoke(
    b: &mut CircuitBuilder<F, 2>,
    gate: BoolTarget,
    g: &SDKeyCircuitGadget,
    index: usize,
    c: &Value,
    args: &[Target],
) -> Result<()> {
    let mut call = c.clone();
    call["inputs"] = json!((0..args.len())
        .map(|i| json!({"witness":i}))
        .collect::<Vec<_>>());
    bind(
        b,
        gate,
        &g.tx_introspection.tx_info_slots[index],
        &call,
        args,
    )
}
fn context(
    b: &mut CircuitBuilder<F, 2>,
    mode: u64,
    scope: &[Target],
    facts: &[HashOutTarget],
    source: &ProgressTargets,
    sort: &StateTargets,
    settled: Target,
) -> HashOutTarget {
    let sh = b.hash_n_to_hash_no_pad::<H>(base_scope(scope));
    let fh = b.hash_n_to_hash_no_pad::<H>(facts.iter().flat_map(|h| h.elements).collect());
    let mut v = vec![b.constant(f(0x53545245414d33)), b.constant(f(mode))];
    v.extend(sh.elements);
    v.extend(fh.elements);
    v.extend(facts[0].elements);
    if mode == 1 {
        v.extend([b.zero(); 4]);
    } else {
        v.extend(&scope[17..21]);
    }
    let total = if mode == 1 { b.zero() } else { scope[8] };
    v.extend([scope[5], scope[6], scope[7], total]);
    v.extend(source.fields());
    v.extend(sort.fields());
    v.push(settled);
    b.hash_n_to_hash_no_pad::<H>(v)
}
pub fn context_value(
    mode: u64,
    scope: &[u64],
    facts: &[[u64; 4]],
    source: &Progress,
    sort: &State,
    settled: u64,
) -> [u64; 4] {
    let mut v = vec![0x53545245414d33, mode];
    v.extend(hash(base_scope(scope)));
    v.extend(hash(facts.iter().flatten().copied().collect()));
    v.extend(facts[0]);
    v.extend(if mode == 1 {
        vec![0; 4]
    } else {
        scope[17..21].to_vec()
    });
    v.extend([
        scope[5],
        scope[6],
        scope[7],
        if mode == 1 { 0 } else { scope[8] },
    ]);
    v.extend(source.fields());
    v.push(sort.cursor);
    v.extend(sort.seen);
    v.extend(sort.ordered);
    v.extend(sort.last);
    v.push(settled);
    hash(v)
}
fn base_scope<T: Copy>(v: &[T]) -> Vec<T> {
    v[..8]
        .iter()
        .chain(&v[9..17])
        .chain(&v[21..])
        .copied()
        .collect()
}

struct MemberTargets {
    index: Target,
    terms: HashOutTarget,
    consumed: Target,
    paid_a: [Target; 2],
    paid_b: [Target; 2],
    fee: Target,
    path: MerkleProofGadget,
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct MemberBinding {
    pub index: u64,
    pub terms: [u64; 4],
    pub consumed: u64,
    pub paid_a: [u64; 2],
    pub paid_b: [u64; 2],
    pub fee: u64,
    pub path: Path,
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct Request {
    pub fields: Vec<u64>,
    pub source: SourcePage,
    pub ledger: Progress,
    pub sort: State,
    pub settled: u64,
    pub members: Vec<MemberBinding>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frontier: Option<crate::pair_frontier::Page>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub random: Option<crate::random_stream::Page>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum: Option<crate::random_minimum::Page>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registered_key: Option<[u64; 4]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accepted_seal: Option<crate::stream_seal::AcceptedSeal>,
}
pub struct StreamKey {
    pub g: SDKeyCircuitGadget,
    pub tape: Tape,
    source: SourcePageTargets,
    context: SourceContextTargets,
    current: CurrentTargets,
    ledger: ProgressTargets,
    sort: StateTargets,
    settled: Target,
    members: Vec<MemberTargets>,
    frontier: Option<crate::pair_frontier::Targets>,
    random: Option<crate::random_stream::Targets>,
    minimum: Option<crate::random_minimum::PageTargets>,
    bootstrap_profile: bool,
    accepted_seal: Option<crate::stream_seal::Targets>,
}
fn role<'a>(spec: &'a Value, name: &str) -> &'a Value {
    &spec["stream"][name]
}
pub fn validate(spec: &Value, r: &Review) -> Result<()> {
    ensure!(
        (if r.kind >= 3 {
            spec["version"] == 7 || spec["version"] == 8 || spec["version"] == 9
        } else {
            spec["version"] == 5
                || spec["version"] == 10
                || spec["version"] == 11
                || spec["version"] == 12
                || spec["version"] == 13
        }) && spec["tx_count"] == 40
            && spec["witness_length"] == 80
            && spec["live_authorization"] == false,
        "distinct offline stream profile"
    );
    if spec["version"] == 10 {
        ensure!(
            r.kind <= 2
                && spec["profile"] == "source-covered-producer-random-stream-v1"
                && spec["producer_influence"] == true
                && spec["qualified_randomness"] == false
                && spec["source_window_checkpoints"]
                    .as_u64()
                    .is_some_and(|n| (32..=65536).contains(&n)),
            "explicit producer random stream profile"
        );
        for name in ["expire_unseeded_stream", "restart_expired_random_order"] {
            let c = role(spec, name);
            ensure!(
                c["contract_id"] == r.market
                    && c["method_name"] == name
                    && c["input_count"] == 8
                    && c["method_id"]
                        .as_u64()
                        .is_some_and(|n| n <= u32::MAX as u64),
                "refund-only exit role"
            );
        }
    }
    if spec["version"] == 11 || spec["version"] == 12 || spec["version"] == 13 {
        ensure!(
            r.kind <= 2
                && spec["profile"]
                    == if spec["version"] == 13 {
                        "source-covered-producer-sealed-minimum-v1"
                    } else if spec["version"] == 12 {
                        "source-covered-producer-minimum-bootstrap-v1"
                    } else {
                        "source-covered-producer-minimum-stream-v1"
                    }
                && spec["producer_influence"] == true
                && spec["qualified_randomness"] == false
                && spec["source_window_checkpoints"] == 8192,
            "distinct bounded minimum profile"
        );
        let owner = spec["fee_owner"].as_u64().context("ordinary fee owner")?;
        ensure!(owner > 0 && owner < 1 << 24, "ordinary fee owner range");
        ensure!(
            spec["owner_fee_claim"]
                == json!({"contract_id":0,"method_name":"claim","method_id":3824212239u32,"inputs":[{"constant":owner.to_string()}]}),
            "exact funding-owner native claim"
        );
        for (name, n) in [
            ("advance_minimum_stream", 15),
            ("authorize_fee_budget", 7),
            ("apply_fee_grant", 8),
            ("account_executor_fee", 5),
            ("expire_unseeded_stream", 8),
        ] {
            let c = role(spec, name);
            ensure!(
                c["contract_id"] == r.market
                    && c["method_name"] == name
                    && c["input_count"] == n
                    && c["method_id"]
                        .as_u64()
                        .is_some_and(|n| n <= u32::MAX as u64),
                "minimum and fee role ABI"
            );
        }
    }
    if spec["version"] == 13 {
        ensure!(
            spec["draw_delay_checkpoints"] == crate::stream_seal::DRAW_DELAY
                && spec["accepted_seal_history_binding"] == true
                && spec["seed_unpredictability_authenticated"] == false,
            "fixed delayed draw, conditional accepted-history semantics"
        );
    }
    crate::batch_compact::validate(&spec["base"])?;
    ensure!(
        spec["base"]["native_protocol"] == "mainnet-beta-20261027"
            && if r.kind == 4 {
                spec["base"]["config"]["tokenId"] == r.assets[1].id
                    && spec["base"]["config"]["nftId"] == r.assets[2].id
            } else {
                spec["base"]["config"]["assetA"] == r.assets[1].id
                    && spec["base"]["config"]["assetB"] == r.assets[2].id
            },
        "exact reviewed asset and native identities"
    );
    ensure!(
        spec["base"]["market"]
            == match r.kind {
                1 => "amm",
                2 => "bondingcurve",
                3 => "orderbook",
                4 => "nftmarket",
                _ => "invalid",
            },
        "reviewed market kind"
    );
    if r.kind <= 2 {
        ensure!(
            spec["base"]["config"]["unit"]
                .as_str()
                .context("reviewed unit")?
                .parse::<u128>()?
                == r.unit,
            "reviewed curve unit"
        );
    }
    if r.kind >= 3 {
        ensure!(
            ((spec["version"] == 7
                && spec["profile"] == "source-covered-pair-terminal-refund-v2"
                && spec["trading_enabled"] == false)
                || (spec["version"] == 8
                    && spec["profile"] == "source-covered-pair-global-frontier-v1"
                    && spec["trading_enabled"] == true
                    && spec["scan_capacity"] == 4)
                || (spec["version"] == 9
                    && spec["profile"] == "source-covered-pair-triangular-recovery-v1"
                    && spec["trading_enabled"] == true
                    && spec["scan_capacity"] == 4))
                && spec["page_capacity"] == 2,
            "paired refunds only"
        );
    }
    ensure!(
        spec["base"]["burn"]
            == json!({"contract_id":0,"method_id":3998182541u32,"method_name":"burn","inputs":[{"witness":73}]}),
        "frozen native burn role"
    );
    ensure!(
        spec["base"]["market_id"] == r.market && spec["noop"] == spec["base"]["noop"],
        "source market and noop"
    );
    for (name, n) in METHODS {
        let c = role(spec, name);
        ensure!(
            c["contract_id"] == r.market
                && c["method_name"] == name
                && c["input_count"]
                    == if spec["version"] == 13 && name == "begin_order_page" {
                        10
                    } else if (spec["version"] == 10
                        || spec["version"] == 11
                        || spec["version"] == 12
                        || spec["version"] == 13)
                        && name == "begin_order_page"
                    {
                        9
                    } else {
                        n
                    }
                && c["method_id"]
                    .as_u64()
                    .is_some_and(|n| n <= u32::MAX as u64),
            "exact stream method role {name}"
        );
    }
    Ok(())
}
impl StreamKey {
    /// Labels for synthetic public-session diagnostics, never witness values.
    pub fn public_input_labels(&self, index: usize) -> Result<Vec<String>> {
        let target = self
            .g
            .circuit_inputs
            .get(index)
            .context("public input index")?;
        Ok(self.source.target_labels(*target))
    }
    pub fn build(spec: &Value, r: &Review, chain: [u64; 4]) -> Result<Self> {
        validate(spec, r)?;
        let minimum_mode = spec["version"] == 11 || spec["version"] == 12 || spec["version"] == 13;
        let bootstrap_mode = spec["version"] == 12 || spec["version"] == 13;
        let random_mode = spec["version"] == 10 || minimum_mode;
        let paired = r.kind >= 3;
        let optimized = spec["version"] == 9;
        let global = spec["version"] == 8 || optimized;
        let capacity = if paired { 2 } else { 4 };
        let mut b = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
        let cfg = MarketKeyConfig {
            num_introspectable_transactions: 40,
            can_read_state: false,
            contract_state_tree_height:
                psy_config::network_constants::MAX_CONTRACT_STATE_TREE_HEIGHT,
            requires_secp256k1: false,
            num_secp256k1_slots: 0,
        };
        let mut g = crate::batch_compact::add_virtual_with_width(&mut b, &cfg, spec, WIDTH)?;
        let fields = g.circuit_inputs.clone();
        let gates = [
            chosen(&mut b, fields[0], 4),
            chosen(&mut b, fields[0], OPEN),
            chosen(&mut b, fields[0], COVER),
            chosen(&mut b, fields[0], ORDER),
            chosen(&mut b, fields[0], SETTLE),
            chosen(&mut b, fields[0], ABORT_SOURCE),
        ];
        let mut valid = b._false();
        if !random_mode {
            b.assert_zero(gates[3].target);
        } else {
            b.assert_zero(gates[5].target);
        }
        for x in [gates[0], gates[1], gates[2], gates[4], gates[5]] {
            valid = b.or(valid, x);
        }
        let bootstrap = if bootstrap_mode {
            Some(chosen(&mut b, fields[0], 14))
        } else {
            None
        };
        if let Some(gate) = bootstrap {
            valid = b.or(valid, gate);
        }
        let minimum_gates = if minimum_mode {
            Some([
                chosen(&mut b, fields[0], crate::random_minimum::EXTRACT_MODE),
                chosen(&mut b, fields[0], crate::random_minimum::GRANT_MODE),
            ])
        } else {
            None
        };
        let random_exit = if random_mode {
            let exit = chosen(&mut b, fields[0], crate::random_stream::EXPIRE);
            valid = b.or(valid, exit);
            valid = b.or(valid, gates[3]);
            if let Some([pop, grant]) = minimum_gates {
                valid = b.or(valid, pop);
                valid = b.or(valid, grant);
            } else {
                let restore = chosen(&mut b, fields[0], crate::random_stream::RESTORE);
                valid = b.or(valid, restore);
            }
            Some(exit)
        } else {
            None
        };
        if global {
            for mode in [crate::pair_frontier::SCAN, crate::pair_frontier::CARRY] {
                let g = chosen(&mut b, fields[0], mode);
                valid = b.or(valid, g);
            }
        }
        b.assert_one(valid.target);
        let frontier_gates = if global {
            let scan = chosen(&mut b, fields[0], crate::pair_frontier::SCAN);
            let carry = chosen(&mut b, fields[0], crate::pair_frontier::CARRY);
            Some([scan, carry])
        } else {
            None
        };
        let maintenance_source = if let Some([_, grant]) = minimum_gates {
            b.or(gates[0], grant)
        } else {
            gates[0]
        };
        let maintenance_source = if let Some(gate) = bootstrap {
            b.or(maintenance_source, gate)
        } else {
            maintenance_source
        };
        let source_mode = b.not(maintenance_source);
        let draw_delay = if spec["version"] == 13 {
            crate::stream_seal::DRAW_DELAY
        } else {
            1
        };
        let mut tape = Tape::default();
        let source = SourcePageTargets::add(&mut b, &mut tape, r)?;
        let current = CurrentTargets::add(&mut b, &mut tape, r, &g, chain)?;
        let sc = &source.scope;
        let ctx = SourceContextTargets::add(
            &mut b,
            &mut tape,
            r,
            &g,
            sc,
            &source.facts,
            chain,
            source_mode,
        )?;
        let ledger = ProgressTargets::create(&mut b, &mut tape);
        let sort = StateTargets::add(&mut b, &mut tape);
        let random = if random_mode && !minimum_mode {
            Some(crate::random_stream::Targets::add(
                &mut b, &mut tape, sc, &sort, gates[3],
            ))
        } else {
            None
        };
        let minimum = if let Some([pop, _]) = minimum_gates {
            Some(crate::random_minimum::PageTargets::add(
                &mut b, &mut tape, sc, gates[3], pop,
            ))
        } else {
            None
        };
        let accepted_seal = if spec["version"] == 13 {
            let advance = b.or(gates[3], minimum_gates.unwrap()[0]);
            let scope_hash = b.hash_n_to_hash_no_pad::<H>(base_scope(sc));
            Some(crate::stream_seal::Targets::add(
                &mut b,
                &mut tape,
                r,
                &g,
                sc,
                source.facts[0],
                scope_hash,
                chain,
                advance,
            )?)
        } else {
            None
        };
        let settled = tape.scalar(&mut b);
        b.range_check(settled, 24);
        for t in &fields {
            b.range_check(*t, 62);
        }
        let z = b.zero();
        let one = b.one();
        let trade = if global {
            let op = spec["base"]["operations"]
                .as_array()
                .unwrap()
                .iter()
                .find(|o| {
                    o["name"]
                        == if r.kind == 3 {
                            "match_orders"
                        } else {
                            "settle_sale"
                        }
                })
                .context("paired trade role")?;
            let selected = chosen(&mut b, fields[21], op["branch"].as_u64().unwrap());
            Some(b.and(gates[4], selected))
        } else {
            None
        };
        let reject = if optimized {
            let selected = chosen(&mut b, fields[1], 1);
            Some(b.and(gates[4], selected))
        } else {
            None
        };
        let mut members = vec![];
        let mut remaining = sort.ordered;
        for i in 0..4 {
            let v = &fields[21 + 13 * i..34 + 13 * i];
            let index = tape.scalar(&mut b);
            let terms = tape.hash(&mut b);
            let consumed = tape.scalar(&mut b);
            let pa = [tape.scalar(&mut b), tape.scalar(&mut b)];
            let pb = [tape.scalar(&mut b), tape.scalar(&mut b)];
            let fee = tape.scalar(&mut b);
            let path = tape.proof(&mut b, 56);
            b.range_check(index, 56);
            b.range_check(consumed, 62);
            for x in pa.into_iter().chain(pb).chain([fee]) {
                b.range_check(x, 62);
            }
            let pos = b.constant(f(i as u64));
            let exists = lt(&mut b, pos, fields[2], 3);
            let gate = b.and(gates[4], exists);
            eq(&mut b, gate, path.index, index);
            gated_hash(&mut b, gate, path.root, remaining);
            let value = crate::stream_order::member(&mut b, sc, index, v[1], v[10], terms);
            gated_hash(&mut b, gate, path.value, value);
            let bits = b.split_le(index, 56);
            for j in 0..56 {
                let minimum_gate = if let Some(trade) = trade {
                    let mut refund = b.not(trade);
                    if let Some(reject) = reject {
                        let not = b.not(reject);
                        refund = b.and(refund, not);
                    }
                    b.and(gate, refund)
                } else {
                    gate
                };
                let left = b.and(minimum_gate, bits[j]);
                let empty = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(j).0);
                gated_hash(&mut b, left, path.siblings[j], empty);
            }
            let empty = b.constant_hash(HashOut::ZERO);
            let next = MerkleProofGadget::compute_root::<H, F, 2>(
                &mut b,
                path.index,
                empty,
                &path.siblings,
            );
            remaining = HashOutTarget {
                elements: std::array::from_fn(|j| {
                    b.select(gate, next.elements[j], remaining.elements[j])
                }),
            };
            members.push(MemberTargets {
                index,
                terms,
                consumed,
                paid_a: pa,
                paid_b: pb,
                fee,
                path,
            });
        }
        let expiry = b.add_const(
            sc[6],
            f(if random_mode {
                spec["source_window_checkpoints"].as_u64().unwrap()
            } else {
                32
            }),
        );
        eq(&mut b, gates[1], sc[7], expiry);
        let end = b.add(settled, fields[2]);
        b.range_check(end, 25);
        let too_many = lt(&mut b, sc[8], end, 25);
        eq(&mut b, gates[4], too_many.target, z);
        let terminal = b.is_equal(end, sc[8]);
        let capacity_t = b.constant(f(capacity));
        let full = b.is_equal(fields[2], capacity_t);
        let mut complete = b.or(terminal, full);
        if let Some(reject) = reject {
            complete = b.or(complete, reject);
        }
        eq(&mut b, gates[4], complete.target, one);
        let final_gate = b.and(gates[4], terminal);
        let empty = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(56).0);
        gated_hash(&mut b, final_gate, remaining, empty);
        b.range_check(fields[2], 3);
        b.range_check(fields[4], 24);
        let four = b.constant(f(capacity));
        if paired && !global {
            let expired = lt(&mut b, sc[7], g.checkpoint_id, 32);
            eq(&mut b, gates[4], expired.target, one);
        }
        let positive = lt(&mut b, z, fields[2], 3);
        eq(&mut b, gates[4], positive.target, one);
        let above = lt(&mut b, four, fields[2], 3);
        eq(&mut b, gates[4], above.target, z);
        same(&mut b, gates[2], &ledger.fields(), &source.before.fields());

        eq(&mut b, gates[4], settled, fields[4]);
        eq(&mut b, gates[4], sort.cursor, sc[8]);
        eq(&mut b, gates[1], g.checkpoint_id, sc[6]);
        gated_hash(
            &mut b,
            gates[1],
            g.session_context.start_user_leaf_hash,
            ctx.vault_hash,
        );
        let before_source = context(&mut b, 1, sc, &source.facts, &source.before, &sort, settled);
        let after_source = context(&mut b, 1, sc, &source.facts, &source.after, &sort, settled);
        let before_abort = context(&mut b, 1, sc, &source.facts, &ledger, &sort, settled);
        let mut before_settle = context(&mut b, 3, sc, &source.facts, &ledger, &sort, settled);
        if let Some(random) = &random {
            let expired = lt(&mut b, sc[7], g.checkpoint_id, 32);
            let consuming = b.or(gates[4], gates[3]);
            let only = b.and(consuming, random.refund);
            eq(&mut b, only, expired.target, one);
            before_settle = crate::random_stream::wrap_target(
                &mut b,
                before_settle,
                sc[6],
                random.seed,
                random.refund.target,
            );
            let zero_hash = b.constant_hash(HashOut::ZERO);
            let at_start = b.is_equal(sort.cursor, z);
            let no_refund = b.not(random.refund);
            let first = b.and(at_start, no_refund);
            let old_seed = HashOutTarget {
                elements: std::array::from_fn(|i| {
                    b.select(first, zero_hash.elements[i], random.seed.elements[i])
                }),
            };
            let base = context(&mut b, 2, sc, &source.facts, &ledger, &sort, settled);
            let before = crate::random_stream::wrap_target(
                &mut b,
                base,
                sc[6],
                old_seed,
                random.refund.target,
            );
            let draw = b.add_const(sc[6], f(draw_delay));
            let args = [
                before.elements.to_vec(),
                vec![draw],
                random.seed.elements.to_vec(),
            ]
            .concat();
            invoke(
                &mut b,
                gates[3],
                &g,
                0,
                role(spec, "begin_order_page"),
                &args,
            )?;
            let args = [
                random.after.seen.elements.to_vec(),
                random.after.ordered.elements.to_vec(),
                vec![random.after.cursor],
                random.after.last.to_vec(),
            ]
            .concat();
            invoke(&mut b, gates[3], &g, 1, role(spec, "set_order_page"), &args)?;
            let after = context(
                &mut b,
                2,
                sc,
                &source.facts,
                &ledger,
                &random.after,
                settled,
            );
            let after = crate::random_stream::wrap_target(
                &mut b,
                after,
                sc[6],
                random.seed,
                random.refund.target,
            );
            invoke(
                &mut b,
                gates[3],
                &g,
                2,
                role(spec, "finish_order_page"),
                &after.elements,
            )?;
            for i in 3..39 {
                invoke(&mut b, gates[3], &g, i, &spec["noop"], &[])?;
            }
            let exit = random_exit.unwrap();
            eq(&mut b, exit, sort.cursor, z);
            eq(&mut b, exit, random.refund.target, z);
            gated_hash(&mut b, exit, random.seed, zero_hash);
            eq(&mut b, exit, expired.target, one);
            let manifest = HashOutTarget {
                elements: sc[17..21].try_into().unwrap(),
            };
            gated_hash(&mut b, exit, sort.seen, manifest);
            let empty = b.constant_hash(h(crate::random_stream::empty()));
            gated_hash(&mut b, exit, sort.ordered, empty);
            let before = crate::random_stream::wrap_target(&mut b, base, sc[6], zero_hash, z);
            let args = [before.elements.to_vec(), empty.elements.to_vec()].concat();
            invoke(
                &mut b,
                exit,
                &g,
                0,
                role(spec, "expire_unseeded_stream"),
                &args,
            )?;
            for i in 1..39 {
                invoke(&mut b, exit, &g, i, &spec["noop"], &[])?;
            }
            for i in 1..80 {
                if i != 73 {
                    crate::batch_policy::zero(&mut b, exit, fields[i]);
                }
            }
            let restore = chosen(&mut b, fields[0], crate::random_stream::RESTORE);
            let positive = lt(&mut b, z, sort.cursor, 24);
            eq(&mut b, restore, positive.target, one);
            eq(&mut b, restore, expired.target, one);
            let before = crate::random_stream::wrap_target(
                &mut b,
                base,
                sc[6],
                random.seed,
                random.refund.target,
            );
            let args = [before.elements.to_vec(), empty.elements.to_vec()].concat();
            invoke(
                &mut b,
                restore,
                &g,
                0,
                role(spec, "restart_expired_random_order"),
                &args,
            )?;
            for i in 1..39 {
                invoke(&mut b, restore, &g, i, &spec["noop"], &[])?;
            }
            for i in 1..80 {
                if i != 73 {
                    crate::batch_policy::zero(&mut b, restore, fields[i]);
                }
            }
        }

        if let Some(minimum) = &minimum {
            let [pop, grant] = minimum_gates.unwrap();
            let advance = b.or(gates[3], pop);
            let expired = lt(&mut b, sc[7], g.checkpoint_id, 32);
            let refund = b.and(gates[4], minimum.refund);
            eq(&mut b, refund, expired.target, one);
            before_settle =
                crate::random_minimum::context_target(&mut b, before_settle, sc[6], minimum);
            let current = minimum.public_current();
            let after = minimum.public_after();
            let current_root = crate::random_minimum::state_hash_target(&mut b, &minimum.current);
            let next_root = crate::random_minimum::state_hash_target(&mut b, &minimum.after);
            let first = b.is_equal(current[0], z);
            let first = b.and(gates[3], first);
            let no_refund = b.not(minimum.refund);
            let first = b.and(first, no_refund);
            let zero_hash = b.constant_hash(HashOut::ZERO);
            let old_seed = HashOutTarget {
                elements: std::array::from_fn(|i| {
                    b.select(first, zero_hash.elements[i], minimum.seed.elements[i])
                }),
            };
            let base = context(&mut b, 2, sc, &source.facts, &ledger, &sort, settled);
            let wrapped = crate::random_stream::wrap_target(
                &mut b,
                base,
                sc[6],
                old_seed,
                minimum.refund.target,
            );
            let tag = b.constant(f(crate::random_minimum::CONTEXT_TAG));
            let before = b.hash_n_to_hash_no_pad::<H>(
                [
                    vec![tag],
                    wrapped.elements.to_vec(),
                    current_root.elements.to_vec(),
                ]
                .concat(),
            );
            let draw = b.add_const(sc[6], f(draw_delay));
            invoke(
                &mut b,
                advance,
                &g,
                0,
                role(spec, "begin_order_page"),
                &[
                    before.elements.to_vec(),
                    vec![draw],
                    minimum.seed.elements.to_vec(),
                    accepted_seal
                        .as_ref()
                        .map(|p| vec![p.checkpoint])
                        .unwrap_or_default(),
                ]
                .concat(),
            )?;
            let built = b.is_equal(after[0], sc[8]);
            let extracted = b.is_equal(after[11], sc[8]);
            let terminal = b.and(built, extracted);
            invoke(
                &mut b,
                advance,
                &g,
                1,
                role(spec, "advance_minimum_stream"),
                &[
                    current_root.elements.to_vec(),
                    next_root.elements.to_vec(),
                    vec![after[0], after[11]],
                    after[12..16].to_vec(),
                    vec![terminal.target],
                ]
                .concat(),
            )?;
            for i in 2..38 {
                invoke(&mut b, advance, &g, i, &spec["noop"], &[])?;
            }
            for i in 1..80 {
                if i != 73 {
                    crate::batch_policy::zero(&mut b, advance, fields[i]);
                }
            }
            let exit = random_exit.unwrap();
            eq(&mut b, exit, expired.target, one);
            eq(&mut b, exit, minimum.refund.target, z);
            gated_hash(&mut b, exit, minimum.seed, zero_hash);
            let e24 = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(24).0);
            let e56 = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(56).0);
            let initial = [
                vec![z],
                sc[17..21].to_vec(),
                e24.elements.to_vec(),
                vec![z, z, z],
                e56.elements.to_vec(),
                vec![z],
            ]
            .concat();
            same(&mut b, exit, &current, &initial);
            let before = crate::random_minimum::context_target(&mut b, base, sc[6], minimum);
            invoke(
                &mut b,
                exit,
                &g,
                0,
                role(spec, "expire_unseeded_stream"),
                &[before.elements.to_vec(), e56.elements.to_vec()].concat(),
            )?;
            for i in 1..38 {
                invoke(&mut b, exit, &g, i, &spec["noop"], &[])?;
            }
            for i in 1..80 {
                if i != 73 {
                    crate::batch_policy::zero(&mut b, exit, fields[i]);
                }
            }
            // An OPEN must authenticate at least one genuinely eligible source
            // order. This is a witness sample, not a committed coverage page.
            let positive = lt(
                &mut b,
                source.before.order_count,
                source.after.order_count,
                24,
            );
            eq(&mut b, gates[1], positive.target, one);
            let owner = b.constant(f(spec["fee_owner"].as_u64().unwrap()));
            let own = b.is_equal(g.user_id, owner);
            b.assert_zero(own.target);
            let key = g.session_context.start_user_leaf.public_key;
            if bootstrap_mode {
                // A public executor must not preempt first-use activation with
                // a grant-only UPS that leaves the exact seed check unusable.
                let started = lt(&mut b, z, g.session_context.start_user_leaf.nonce, 62);
                eq(&mut b, grant, started.target, one);
            }
            let n = b.mul(grant.target, fields[21]);
            let cap = b.mul(grant.target, fields[22]);
            let funding = b.mul(grant.target, fields[23]);
            b.range_check(n, 62);
            b.range_check(cap, 62);
            b.range_check(funding, 1);
            invoke(
                &mut b,
                grant,
                &g,
                0,
                role(spec, "apply_fee_grant"),
                &[
                    vec![fields[21], fields[22]],
                    key.elements.to_vec(),
                    vec![owner, fields[23]],
                ]
                .concat(),
            )?;
            let flag = chosen(&mut b, fields[23], 1);
            let claim = b.and(grant, flag);
            let not_flag = b.not(flag);
            let skip = b.and(grant, not_flag);
            bind(
                &mut b,
                claim,
                &g.tx_introspection.tx_info_slots[1],
                &spec["owner_fee_claim"],
                &[],
            )?;
            invoke(&mut b, skip, &g, 1, &spec["noop"], &[])?;
            for i in 2..38 {
                invoke(&mut b, grant, &g, i, &spec["noop"], &[])?;
            }
            for i in 1..80 {
                if ![21, 22, 23, 73].contains(&i) {
                    crate::batch_policy::zero(&mut b, grant, fields[i]);
                }
            }
        }

        if let Some(gate) = bootstrap {
            eq(&mut b, gate, g.session_context.start_user_leaf.nonce, z);
            eq(&mut b, gate, g.session_context.nonce, one);
            let empty_state = b.constant_hash(
                <H as MerkleZeroHasher<Q<F>>>::get_zero_hash(
                    psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize,
                )
                .0,
            );
            gated_hash(
                &mut b,
                gate,
                g.session_context.start_user_leaf.user_state_tree_root,
                empty_state,
            );
            let own_payer = b.is_equal(g.user_id, fields[24]);
            eq(&mut b, gate, own_payer.target, z);
            // Activation observes exactly its original one-fee Native seed.
            // Only after returning both FT seeds do we apply/claim treasury
            // funding. Exact fee accounting and burn end the same first UPS.
            let op = spec["base"]["operations"]
                .as_array()
                .context("operations")?
                .iter()
                .find(|o| o["name"] == "activate_batch_vault" && o["maintenance"] == true)
                .context("reviewed activation")?;
            let mut values = vec![z; 13];
            values[1] = fields[24];
            for (i, call) in op["calls"]
                .as_array()
                .context("activation calls")?
                .iter()
                .enumerate()
            {
                bind(
                    &mut b,
                    gate,
                    &g.tx_introspection.tx_info_slots[i],
                    call,
                    &values,
                )?;
            }
            let key = g.session_context.start_user_leaf.public_key;
            let owner = b.constant(f(spec["fee_owner"].as_u64().unwrap()));
            eq(&mut b, gate, fields[23], one);
            let payer = b.mul(gate.target, fields[24]);
            b.range_check(payer, 24);
            let same = b.is_equal(payer, owner);
            eq(&mut b, gate, same.target, z);
            invoke(
                &mut b,
                gate,
                &g,
                9,
                role(spec, "apply_fee_grant"),
                &[
                    vec![fields[21], fields[22]],
                    key.elements.to_vec(),
                    vec![owner, one],
                ]
                .concat(),
            )?;
            bind(
                &mut b,
                gate,
                &g.tx_introspection.tx_info_slots[10],
                &spec["owner_fee_claim"],
                &[],
            )?;
            for i in 11..38 {
                invoke(&mut b, gate, &g, i, &spec["noop"], &[])?;
            }
            for i in 1..80 {
                if ![21, 22, 23, 24, 73].contains(&i) {
                    crate::batch_policy::zero(&mut b, gate, fields[i]);
                }
            }
        }

        for i in 0..80 {
            if optimized && i == 1 {
                b.range_check(fields[i], 1);
                let not = b.not(gates[4]);
                crate::batch_policy::zero(&mut b, not, fields[i]);
                continue;
            }
            if i == 0 || i == 73 {
                continue;
            }
            if [2, 4, 17, 18, 19, 20].contains(&i) || (21..73).contains(&i) {
                crate::batch_policy::zero(&mut b, gates[1], fields[i]);
                crate::batch_policy::zero(&mut b, gates[2], fields[i]);
                crate::batch_policy::zero(&mut b, gates[3], fields[i]);
                crate::batch_policy::zero(&mut b, gates[5], fields[i]);
            } else {
                let always = b._true();
                crate::batch_policy::zero(&mut b, always, fields[i]);
            }
        }
        for i in [2usize, 4, 17, 18, 19, 20].into_iter().chain(34..73) {
            crate::batch_policy::zero(&mut b, gates[0], fields[i]);
        }
        // Maintenance retains the reviewed base policy's full operation binding.
        let ops = spec["base"]["operations"]
            .as_array()
            .context("base operations")?;
        let mut maintenance = b._false();
        for op in ops {
            if op["maintenance"] == true {
                let selected = chosen(&mut b, fields[21], op["branch"].as_u64().unwrap());
                maintenance = b.or(maintenance, selected);
                let gate = b.and(gates[0], selected);
                let mut used = std::collections::BTreeSet::from([0]);
                for c in op["calls"].as_array().unwrap() {
                    for a in c["inputs"].as_array().unwrap() {
                        if let Some(i) = a["witness"].as_u64() {
                            used.insert(i as usize);
                        }
                    }
                }
                for j in 0..13 {
                    if !used.contains(&j) {
                        crate::batch_policy::zero(&mut b, gate, fields[21 + j]);
                    }
                }
                for (i, c) in op["calls"].as_array().unwrap().iter().enumerate() {
                    bind(
                        &mut b,
                        gate,
                        &g.tx_introspection.tx_info_slots[i],
                        c,
                        &fields[21..34],
                    )?;
                }
            }
        }
        eq(&mut b, gates[0], maintenance.target, one);
        for i in 9..(if minimum_mode { 38 } else { 39 }) {
            invoke(&mut b, gates[0], &g, i, &spec["noop"], &[])?;
        }
        let noop = |b: &mut CircuitBuilder<F, 2>,
                    gate: BoolTarget,
                    start: usize,
                    end: usize|
         -> Result<()> {
            for i in start..end {
                invoke(b, gate, &g, i, &spec["noop"], &[])?;
            }
            Ok(())
        };
        let scope_hash = b.hash_n_to_hash_no_pad::<H>(base_scope(sc));
        let mut open = vec![sc[5], sc[6], sc[7], z];
        open.extend(scope_hash.elements);
        open.extend(source.facts[0].elements);
        open.extend([z; 4]);
        invoke(
            &mut b,
            gates[1],
            &g,
            0,
            role(spec, "open_source_stream"),
            &open,
        )?;
        let facts =
            b.hash_n_to_hash_no_pad::<H>(source.facts.iter().flat_map(|h| h.elements).collect());
        let empty_user = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(32).0);
        let empty_member = b.constant_hash(<H as MerkleZeroHasher<Q<F>>>::get_zero_hash(56).0);
        let roots = [facts.elements, empty_user.elements, empty_member.elements].concat();
        invoke(
            &mut b,
            gates[1],
            &g,
            1,
            role(spec, "initialize_stream_roots"),
            &roots,
        )?;
        noop(&mut b, gates[1], 2, if minimum_mode { 38 } else { 39 })?;
        invoke(
            &mut b,
            gates[2],
            &g,
            0,
            role(spec, "begin_source_page"),
            &before_source.elements,
        )?;
        let mut args = source.after.users.elements.to_vec();
        args.extend([source.after.accounts, source.after.last_owner]);
        invoke(
            &mut b,
            gates[2],
            &g,
            1,
            role(spec, "set_source_users"),
            &args,
        )?;
        let args = [
            source.after.orders.elements.to_vec(),
            vec![source.after.order_count],
            source.after.recovery.elements.to_vec(),
            vec![source.after.recovery_count],
        ]
        .concat();
        invoke(
            &mut b,
            gates[2],
            &g,
            2,
            role(spec, "set_source_manifests"),
            &args,
        )?;
        invoke(
            &mut b,
            gates[2],
            &g,
            3,
            role(spec, "finish_source_page"),
            &after_source.elements,
        )?;
        noop(&mut b, gates[2], 4, if minimum_mode { 38 } else { 39 })?;
        invoke(
            &mut b,
            gates[5],
            &g,
            0,
            role(spec, "abort_source_stream"),
            &before_abort.elements,
        )?;
        noop(&mut b, gates[5], 1, if minimum_mode { 38 } else { 39 })?;
        let args = [
            before_settle.elements.to_vec(),
            (0..4).map(|i| fields[22 + 13 * i]).collect::<Vec<_>>(),
            (0..4).map(|i| fields[31 + 13 * i]).collect::<Vec<_>>(),
            vec![fields[2]],
        ]
        .concat();
        invoke(
            &mut b,
            gates[4],
            &g,
            0,
            role(spec, "begin_stream_settlement"),
            &args,
        )?;
        for row in 0..4 {
            let v = &fields[21 + 13 * row..34 + 13 * row];
            let idx = b.constant(f(row as u64));
            let exists = lt(&mut b, idx, fields[2], 3);
            let active = b.and(gates[4], exists);
            let not = b.not(exists);
            let padding = b.and(gates[4], not);
            for x in v {
                crate::batch_policy::zero(&mut b, padding, *x);
            }
            let m = &members[row];
            let mut args = vec![v[1], v[10]];
            args.extend(m.terms.elements);
            args.push(m.consumed);
            args.extend(m.paid_a);
            args.extend(m.paid_b);
            args.push(m.fee);
            invoke(
                &mut b,
                active,
                &g,
                1 + row,
                role(spec, "bind_stream_member"),
                &args,
            )?;
            let bind_padding = if global && row == 2 {
                let mut reserved = trade.unwrap();
                if let Some(reject) = reject {
                    reserved = b.or(reserved, reject);
                }
                let not_reserved = b.not(reserved);
                b.and(padding, not_reserved)
            } else {
                padding
            };
            invoke(&mut b, bind_padding, &g, 1 + row, &spec["noop"], &[])?;
            let operation_active = if global && row == 1 {
                let not_trade = b.not(trade.unwrap());
                b.and(active, not_trade)
            } else {
                active
            };
            if global && row == 1 {
                for j in 0..13 {
                    if j != 1 && j != 10 {
                        crate::batch_policy::zero(&mut b, trade.unwrap(), v[j]);
                    }
                }
            }
            let mut allowed = b._false();
            for op in ops.iter().filter(|o| o["maintenance"] == false) {
                let selected = chosen(&mut b, v[0], op["branch"].as_u64().unwrap());
                allowed = b.or(allowed, selected);
                let gate = b.and(operation_active, selected);
                let mut used = std::collections::BTreeSet::from([0]);
                for c in op["calls"].as_array().unwrap() {
                    for a in c["inputs"].as_array().unwrap() {
                        if let Some(i) = a["witness"].as_u64() {
                            used.insert(i as usize);
                        }
                    }
                }
                for j in 0..13 {
                    if !used.contains(&j) {
                        crate::batch_policy::zero(&mut b, gate, v[j]);
                    }
                }
                if paired {
                    let is_refund = op["name"]
                        .as_str()
                        .is_some_and(|n| n.starts_with("refund_funding_"));
                    let is_trade = global
                        && op["name"]
                            == if r.kind == 3 {
                                "match_orders"
                            } else {
                                "settle_sale"
                            };
                    if !is_refund && !is_trade {
                        eq(&mut b, gate, one, z);
                    }
                    if row < 2 {
                        for (j, c) in op["calls"].as_array().unwrap().iter().enumerate() {
                            bind(
                                &mut b,
                                gate,
                                &g.tx_introspection.tx_info_slots[5 + 9 * row + j],
                                c,
                                v,
                            )?;
                        }
                    }
                } else {
                    let call_list = op["calls"].as_array().unwrap();
                    bind(
                        &mut b,
                        gate,
                        &g.tx_introspection.tx_info_slots[17 + 5 * row],
                        &call_list[0],
                        v,
                    )?;
                    let native = call_list
                        .iter()
                        .find(|c| c["contract_id"] == 0 && c["method_name"] == "claim");
                    bind(
                        &mut b,
                        gate,
                        &g.tx_introspection.tx_info_slots[18 + 5 * row],
                        native.unwrap_or(&spec["noop"]),
                        v,
                    )?;
                    let outputs = call_list
                        .iter()
                        .filter(|c| c["method_name"] == "transfer")
                        .collect::<Vec<_>>();
                    ensure!(outputs.len() <= 3, "stream output capacity");
                    for j in 0..3 {
                        bind(
                            &mut b,
                            gate,
                            &g.tx_introspection.tx_info_slots[19 + 5 * row + j],
                            outputs.get(j).copied().unwrap_or(&spec["noop"]),
                            v,
                        )?;
                    }
                }
            }
            eq(&mut b, operation_active, allowed.target, one);
            if paired {
                let op_padding = if global && row == 1 {
                    b.or(padding, trade.unwrap())
                } else {
                    padding
                };
                if row < 2 {
                    for j in 0..9 {
                        invoke(&mut b, op_padding, &g, 5 + 9 * row + j, &spec["noop"], &[])?;
                    }
                }
            } else {
                for j in 0..5 {
                    invoke(&mut b, padding, &g, 17 + 5 * row + j, &spec["noop"], &[])?;
                }
            }
        }
        if paired {
            for i in 17..21 {
                crate::batch_policy::zero(&mut b, gates[4], fields[i]);
            }
            noop(&mut b, gates[4], 23, 37)?;
        } else {
            for pos in 0..4 {
                let rank = fields[17 + pos];
                b.range_check(rank, 2);
                for prev in &fields[17..17 + pos] {
                    let equal = b.is_equal(rank, *prev);
                    eq(&mut b, gates[4], equal.target, z);
                }
                let idx = b.constant(f(pos as u64));
                let exists = lt(&mut b, idx, fields[2], 3);
                let active = b.and(gates[4], exists);
                let not = b.not(exists);
                let padding = b.and(gates[4], not);
                eq(&mut b, padding, rank, idx);
                let below = lt(&mut b, rank, fields[2], 3);
                eq(&mut b, active, below.target, one);
                if pos > 0 {
                    let owners = (0..4).map(|i| fields[22 + 13 * i]).collect::<Vec<_>>();
                    let previous = b.random_access(fields[17 + pos - 1], owners.clone());
                    let current = b.random_access(rank, owners);
                    // GRANT reuses field 22 for a 62-bit fee cap. Selecting the
                    // operands before the narrow comparison avoids imposing a
                    // 24-bit trader bound on an inactive grant/maintenance row.
                    // Active settlement still compares the actual full owners.
                    let (previous, current) = if minimum_mode {
                        (
                            b.select(gates[4], previous, z),
                            b.select(gates[4], current, z),
                        )
                    } else {
                        (previous, current)
                    };
                    let less = lt(&mut b, previous, current, 24);
                    eq(&mut b, active, less.target, one);
                }
                for row in 0..4 {
                    let selected = chosen(&mut b, rank, row as u64);
                    let gate = b.and(active, selected);
                    let v = &fields[21 + 13 * row..34 + 13 * row];
                    invoke(
                        &mut b,
                        gate,
                        &g,
                        5 + 3 * pos,
                        role(spec, "claim_stream_member"),
                        &[v[1], v[10]],
                    )?;
                    for op in ops.iter().filter(|o| o["maintenance"] == false) {
                        let selected = chosen(&mut b, v[0], op["branch"].as_u64().unwrap());
                        let gate = b.and(gate, selected);
                        for (j, asset) in [(1, "assetA"), (2, "assetB")] {
                            let claim = op["calls"].as_array().unwrap().iter().find(|c| {
                                c["method_name"] == "claim"
                                    && c["contract_id"] == spec["base"]["config"][asset]
                            });
                            bind(
                                &mut b,
                                gate,
                                &g.tx_introspection.tx_info_slots[5 + 3 * pos + j],
                                claim.unwrap_or(&spec["noop"]),
                                v,
                            )?;
                        }
                    }
                }
                for j in 0..3 {
                    invoke(&mut b, padding, &g, 5 + 3 * pos + j, &spec["noop"], &[])?;
                }
            }
        }
        invoke(
            &mut b,
            gates[4],
            &g,
            37,
            role(spec, "finish_stream_settlement"),
            &[vec![sc[5], settled, fields[2]], remaining.elements.to_vec()].concat(),
        )?;
        if !minimum_mode {
            invoke(&mut b, gates[4], &g, 38, &spec["noop"], &[])?;
        }
        let frontier = if global {
            let [scan, carry] = frontier_gates.unwrap();
            for gate in [scan, carry] {
                for i in 1..80 {
                    if i != 73 {
                        crate::batch_policy::zero(&mut b, gate, fields[i]);
                    }
                }
            }
            let add = if optimized {
                crate::pair_frontier::Targets::add_triangular
            } else {
                crate::pair_frontier::Targets::add
            };
            let t = add(
                &mut b,
                &mut tape,
                r.kind,
                sc,
                sort.ordered,
                sc[8],
                settled,
                scan,
            )?;
            let before = crate::pair_frontier::context_target(&mut b, before_settle, &t.before);
            let mut args = before.elements.to_vec();
            args.extend(t.after.values());
            invoke(
                &mut b,
                scan,
                &g,
                0,
                role(spec, "advance_pair_frontier"),
                &args,
            )?;
            for i in 1..39 {
                invoke(&mut b, scan, &g, i, &spec["noop"], &[])?;
            }
            let count = b.sub(sc[8], settled);
            let mut args = before.elements.to_vec();
            args.push(count);
            invoke(&mut b, carry, &g, 0, role(spec, "finish_pair_carry"), &args)?;
            for i in 1..39 {
                invoke(&mut b, carry, &g, i, &spec["noop"], &[])?;
            }
            eq(&mut b, carry, t.before.complete.target, one);
            eq(&mut b, carry, t.prev_exists.target, z);
            let n2 = if optimized {
                let nm = b.sub(count, one);
                let p = b.mul(count, nm);
                b.mul_const(f(2).inverse(), p)
            } else {
                b.mul(count, count)
            };
            eq(&mut b, carry, t.before.cursor, n2);
            let empty = b.constant_hash(h(crate::pair_frontier::empty()));
            gated_hash(&mut b, carry, t.before.outer, empty);
            gated_hash(&mut b, carry, t.before.inner, empty);
            let trade = trade.unwrap();
            let choice_args = [before.elements.to_vec(), t.before.best.elements.to_vec()].concat();
            invoke(
                &mut b,
                trade,
                &g,
                3,
                role(spec, "bind_pair_choice"),
                &choice_args,
            )?;
            let two = b.constant(f(2));
            eq(&mut b, trade, fields[2], two);
            eq(&mut b, trade, t.before.complete.target, one);
            eq(&mut b, trade, t.prev_exists.target, one);
            let expired = lt(&mut b, sc[7], g.checkpoint_id, 32);
            eq(&mut b, trade, expired.target, z);
            let refund = b.not(trade);
            let refund = b.and(gates[4], refund);
            let normal_refund = if let Some(reject) = reject {
                let not = b.not(reject);
                b.and(refund, not)
            } else {
                refund
            };
            eq(&mut b, normal_refund, expired.target, one);
            if let Some(reject) = reject {
                eq(&mut b, reject, fields[2], one);
                eq(&mut b, reject, t.before.complete.target, one);
                eq(&mut b, reject, t.prev_exists.target, one);
                eq(&mut b, reject, expired.target, z);
                let a = b.is_equal(fields[22], t.prev_a.owner);
                let c = b.is_equal(fields[22], t.prev_b.owner);
                let selected = b.or(a, c);
                eq(&mut b, reject, selected.target, one);
                for (is, record) in [(a, &t.prev_a), (c, &t.prev_b)] {
                    let gate = b.and(reject, is);
                    eq(&mut b, gate, fields[31], record.nonce(r.kind));
                    let terms = record.terms(&mut b, sc);
                    gated_hash(&mut b, gate, terms, members[0].terms);
                }
                let mut args = choice_args.clone();
                args.push(fields[22]);
                invoke(
                    &mut b,
                    reject,
                    &g,
                    3,
                    role(spec, "bind_pair_rejection"),
                    &args,
                )?;
            }
            for (row, record) in [(0, &t.prev_a), (1, &t.prev_b)] {
                let v = &fields[21 + 13 * row..34 + 13 * row];
                eq(&mut b, trade, record.owner, v[1]);
                eq(&mut b, trade, record.nonce(r.kind), v[10]);
                let terms = record.terms(&mut b, sc);
                gated_hash(&mut b, trade, terms, members[row].terms);
            }
            eq(&mut b, trade, fields[23], fields[35]);
            eq(&mut b, trade, fields[32], fields[44]);
            let a = if r.kind == 3 {
                t.prev_a.amount(r.kind, "x")
            } else {
                t.prev_a.amount(r.kind, "price")
            };
            let c = if r.kind == 3 {
                t.prev_b.amount(r.kind, "x")
            } else {
                [z, z]
            };
            for j in 0..2 {
                eq(&mut b, trade, fields[24 + j], a[j]);
                eq(&mut b, trade, fields[26 + j], c[j]);
            }
            // The CFC checks current cancellation/funding and exact prices;
            // the complete authenticated scan selects the global source winner.
            Some(t)
        } else {
            None
        };
        let always = b._true();
        bind(
            &mut b,
            always,
            &g.tx_introspection.tx_info_slots[39],
            &spec["base"]["burn"],
            &fields,
        )?;
        if minimum_mode {
            let key = g.session_context.start_user_leaf.public_key;
            invoke(
                &mut b,
                always,
                &g,
                38,
                role(spec, "account_executor_fee"),
                &[vec![fields[73]], key.elements.to_vec()].concat(),
            )?;
        }

        let mut fee_valid = b._false();
        for n in 0..=100 {
            let allowed = chosen(&mut b, fields[73], 1_000_000_000 + 1000 * n);
            fee_valid = b.or(fee_valid, allowed);
        }
        b.assert_one(fee_valid.target);
        g.circuit_inputs.extend(tape.targets.iter().copied());
        g.build_circuit(b)?;
        Ok(Self {
            g,
            tape,
            source,
            context: ctx,
            current,
            ledger,
            sort,
            settled,
            members,
            frontier,
            random,
            minimum,
            bootstrap_profile: bootstrap_mode,
            accepted_seal,
        })
    }
    pub fn fields(
        &self,
        r: &Review,
        s: &Snapshot,
        vault_path: &MerkleProofCore<Q<F>>,
        current: &CurrentOpening,
        request: &Request,
    ) -> Result<Vec<u64>> {
        ensure!(request.fields.len() == WIDTH, "stream fixed witness");
        let mut pw = PartialWitness::new();
        // V12 maintenance has no historical inventory statement. Use one
        // canonical dummy tape, never a fabricated authenticated source claim.
        if self.bootstrap_profile && [4, 13, 14].contains(&request.fields[0]) {
            let (dummy, page) = crate::stream_source::SourcePage::inactive_maintenance(r, s)?;
            ensure!(
                serde_json::to_value(&request.source)? == serde_json::to_value(&page)?,
                "canonical inactive maintenance tape"
            );
            self.source.set(&mut pw, r, &dummy, &page)?;
        } else {
            self.source.set(&mut pw, r, s, &request.source)?;
        }
        self.current.set(&mut pw, r, current)?;
        if let Some(t) = &self.accepted_seal {
            let active = [ORDER, crate::random_minimum::EXTRACT_MODE].contains(&request.fields[0]);
            ensure!(
                request.accepted_seal.is_some() == active,
                "accepted seal required exactly on ordering pages"
            );
            t.set(
                &mut pw,
                r,
                request.accepted_seal.as_ref(),
                &request.source.scope,
            )?;
        } else {
            ensure!(
                request.accepted_seal.is_none(),
                "accepted seal needs distinct delayed-draw key"
            );
        }
        if request.fields[0] == 4
            || (self.minimum.is_some()
                && [crate::random_minimum::GRANT_MODE, 14].contains(&request.fields[0]))
        {
            self.context.set_empty(&mut pw)?;
        } else {
            self.context.set(&mut pw, r, s, vault_path)?;
        }
        self.ledger.set(&mut pw, &request.ledger)?;
        self.sort.set(&mut pw, &request.sort)?;
        pw.set_target(self.settled, f(request.settled))?;
        for (i, t) in self.members.iter().enumerate() {
            let m = request.members.get(i);
            pw.set_target(t.index, f(m.map(|x| x.index).unwrap_or(0)))?;
            pw.set_hash_target(t.terms, h(m.map(|x| x.terms).unwrap_or([0; 4])))?;
            pw.set_target(t.consumed, f(m.map(|x| x.consumed).unwrap_or(0)))?;
            for (target, value) in t.paid_a.into_iter().chain(t.paid_b).chain([t.fee]).zip(
                m.map(|x| vec![x.paid_a[0], x.paid_a[1], x.paid_b[0], x.paid_b[1], x.fee])
                    .unwrap_or(vec![0; 5]),
            ) {
                pw.set_target(target, f(value))?;
            }
            let proof = m
                .map(|x| {
                    MerkleProofCore::new_from_params::<H>(
                        x.path.index,
                        Q(h(x.path.value)),
                        x.path
                            .siblings
                            .iter()
                            .map(|h| Q(crate::stream_policy::h(*h)))
                            .collect(),
                    )
                })
                .unwrap_or_else(|| {
                    MerkleProofCore::new_from_params::<H>(
                        0,
                        Q::ZERO,
                        (0..56)
                            .map(|i| <H as MerkleZeroHasher<Q<F>>>::get_zero_hash(i))
                            .collect(),
                    )
                });
            t.path.set_witness_core_proof_q(&mut pw, &proof)?;
        }
        if let Some(t) = &self.frontier {
            t.set(
                &mut pw,
                r.kind,
                &request.source.scope,
                request.frontier.as_ref(),
            )?;
        }
        if let Some(t) = &self.random {
            t.set(&mut pw, request.random.as_ref())?;
        } else {
            ensure!(
                request.random.is_none(),
                "random witness requires distinct key"
            );
        }
        if let Some(t) = &self.minimum {
            t.set(&mut pw, request.minimum.as_ref())?;
        } else {
            ensure!(
                request.minimum.is_none(),
                "minimum witness requires replacement key"
            );
        }
        if self.minimum.is_some() {
            let public = H::two_to_one(self.g.get_fingerprint().0, s.key_public_param.0)
                .elements
                .map(|n| n.to_canonical_u64());
            ensure!(
                request.registered_key == Some(public),
                "exact registered key declaration"
            );
        } else {
            ensure!(
                request.registered_key.is_none(),
                "minimum registered key declaration requires replacement profile"
            );
        }
        let mut fields = request.fields.clone();
        fields.extend(self.tape.values(&pw));
        Ok(fields)
    }
}
/// Exact logical call stack. All variable amounts are still independently
/// constrained by the spending circuit and actual market/token bytecode.
pub fn calls(spec: &Value, req: &Request, compact: bool) -> Result<Vec<Value>> {
    let f = &req.fields;
    ensure!(
        f.len() == 80 && req.source.scope.len() == 41 && req.source.facts.len() == 5,
        "stream request shape"
    );
    let sc = &req.source.scope;
    let facts = &req.source.facts;
    let minimum_mode = spec["version"] == 11 || spec["version"] == 12 || spec["version"] == 13;
    let random_mode = spec["version"] == 10;
    let draw_delay = if spec["version"] == 13 {
        crate::stream_seal::DRAW_DELAY
    } else {
        1
    };
    let random_context = |base: [u64; 4]| -> Result<[u64; 4]> {
        if minimum_mode {
            Ok(crate::random_minimum::context_value(
                base,
                sc[6],
                req.minimum.as_ref().context("minimum context")?,
            ))
        } else if random_mode {
            let p = req.random.as_ref().context("fixed random stream context")?;
            Ok(crate::random_stream::wrap(
                base,
                sc[6],
                p.seed,
                p.refund_only,
            ))
        } else {
            Ok(base)
        }
    };
    let convert = |c: &Value, values: &[u64]| -> Result<Value> {
        Ok(
            json!({"contract_id":c["contract_id"],"method_name":c["method_name"],"inputs":c["inputs"].as_array().context("call inputs")?.iter().map(|a|if let Some(i)=a["witness"].as_u64(){values.get(i as usize).copied().context("call argument index")}else{a["constant"].as_str().context("call constant")?.parse::<u64>().map_err(Into::into)}).collect::<Result<Vec<_>>>()?}),
        )
    };
    let nop = json!({"contract_id":spec["noop"]["contract_id"],"method_name":"noop","inputs":[]});
    let mut out = vec![nop.clone(); 40];
    let method = |name: &str, args: Vec<u64>| json!({"contract_id":role(spec,name)["contract_id"],"method_name":name,"inputs":args});
    match f[0] {
        ORDER | crate::random_minimum::EXTRACT_MODE if minimum_mode => {
            let page = req.minimum.as_ref().context("minimum page")?;
            let after = page.after(sc)?;
            ensure!(
                page.rows[0].extract == (f[0] == crate::random_minimum::EXTRACT_MODE),
                "minimum page operation"
            );
            let mut prior = page.clone();
            if f[0] == ORDER && page.current.built == 0 && !page.refund_only {
                prior.seed = [0; 4];
            }
            let before = crate::random_minimum::context_value(
                context_value(2, sc, facts, &req.ledger, &req.sort, req.settled),
                sc[6],
                &prior,
            );
            out[0] = method(
                "begin_order_page",
                [
                    before.to_vec(),
                    vec![sc[6] + draw_delay],
                    page.seed.to_vec(),
                    if spec["version"] == 13 {
                        vec![
                            req.accepted_seal
                                .as_ref()
                                .context("accepted seal")?
                                .snapshot
                                .fields[6],
                        ]
                    } else {
                        vec![]
                    },
                ]
                .concat(),
            );
            let terminal = u64::from(after.built == sc[8] && after.extracted == sc[8]);
            out[1] = method(
                "advance_minimum_stream",
                [
                    crate::random_minimum::state_hash(&page.current).to_vec(),
                    crate::random_minimum::state_hash(&after).to_vec(),
                    vec![after.built, after.extracted],
                    after.queue.to_vec(),
                    vec![terminal],
                ]
                .concat(),
            );
        }
        14 if spec["version"] == 12 || spec["version"] == 13 => {
            let key = req.registered_key.context("registered key")?;
            ensure!(
                f[23] == 1
                    && f[24] > 0
                    && f[24] < 1 << 24
                    && f[24] != spec["fee_owner"].as_u64().unwrap(),
                "exact bootstrap payer/funding"
            );
            let op = spec["base"]["operations"]
                .as_array()
                .context("operations")?
                .iter()
                .find(|o| o["name"] == "activate_batch_vault" && o["maintenance"] == true)
                .context("activation")?;
            let mut values = vec![0; 13];
            values[1] = f[24];
            for (i, c) in op["calls"].as_array().unwrap().iter().enumerate() {
                out[i] = convert(c, &values)?;
            }
            out[9] = method(
                "apply_fee_grant",
                [
                    vec![f[21], f[22]],
                    key.to_vec(),
                    vec![spec["fee_owner"].as_u64().unwrap(), 1],
                ]
                .concat(),
            );
            out[10] = convert(&spec["owner_fee_claim"], &[])?;
        }
        crate::random_minimum::GRANT_MODE if minimum_mode => {
            let key = req.registered_key.context("registered key")?;
            ensure!(f[23] <= 1, "optional funding claim flag");
            out[0] = method(
                "apply_fee_grant",
                [
                    vec![f[21], f[22]],
                    key.to_vec(),
                    vec![spec["fee_owner"].as_u64().context("funding owner")?, f[23]],
                ]
                .concat(),
            );
            if f[23] == 1 {
                out[1] = convert(&spec["owner_fee_claim"], &[])?;
            }
        }
        crate::random_stream::EXPIRE if minimum_mode => {
            let page = req.minimum.as_ref().context("unseeded minimum context")?;
            let before = crate::random_minimum::context_value(
                context_value(2, sc, facts, &req.ledger, &req.sort, req.settled),
                sc[6],
                page,
            );
            out[0] = method(
                "expire_unseeded_stream",
                [before.to_vec(), crate::random_stream::empty().to_vec()].concat(),
            );
        }
        ORDER if random_mode => {
            let p = req.random.as_ref().context("random ordering page")?;
            ensure!(
                !p.rows.is_empty() && p.rows.len() <= 4,
                "bounded random page"
            );
            let old = if req.sort.cursor == 0 && !p.refund_only {
                [0; 4]
            } else {
                p.seed
            };
            let base = context_value(2, sc, facts, &req.ledger, &req.sort, req.settled);
            let before = crate::random_stream::wrap(base, sc[6], old, p.refund_only);
            let args = [before.to_vec(), vec![sc[6] + 1], p.seed.to_vec()].concat();
            out[0] = method("begin_order_page", args);
            let after = crate::random_stream::after(sc, &req.sort, p)?;
            out[1] = method(
                "set_order_page",
                [
                    after.seen.to_vec(),
                    after.ordered.to_vec(),
                    vec![after.cursor],
                    after.last.to_vec(),
                ]
                .concat(),
            );
            out[2] = method(
                "finish_order_page",
                crate::random_stream::wrap(
                    context_value(2, sc, facts, &req.ledger, &after, req.settled),
                    sc[6],
                    p.seed,
                    p.refund_only,
                )
                .to_vec(),
            );
        }
        crate::random_stream::RESTORE if random_mode => {
            let p = req
                .random
                .as_ref()
                .context("original seed required for timeout recovery")?;
            let before = crate::random_stream::wrap(
                context_value(2, sc, facts, &req.ledger, &req.sort, req.settled),
                sc[6],
                p.seed,
                p.refund_only,
            );
            out[0] = method(
                "restart_expired_random_order",
                [before.to_vec(), crate::random_stream::empty().to_vec()].concat(),
            );
        }
        crate::random_stream::EXPIRE if random_mode => {
            let before = crate::random_stream::wrap(
                context_value(2, sc, facts, &req.ledger, &req.sort, req.settled),
                sc[6],
                [0; 4],
                false,
            );
            out[0] = method(
                "expire_unseeded_stream",
                [before.to_vec(), crate::random_stream::empty().to_vec()].concat(),
            );
        }
        crate::pair_frontier::SCAN | crate::pair_frontier::CARRY => {
            ensure!(
                spec["version"] == 8 || spec["version"] == 9,
                "global frontier profile"
            );
            let page = req.frontier.as_ref().context("frontier witness")?;
            let stream = context_value(3, sc, facts, &req.ledger, &req.sort, req.settled);
            let mut args =
                crate::pair_frontier::context_value(stream, &page.before, sc, sc[2]).to_vec();
            if f[0] == crate::pair_frontier::SCAN {
                args.extend(page.after.values(sc, sc[2]));
                out[0] = method("advance_pair_frontier", args);
            } else {
                args.push(sc[8] - req.settled);
                out[0] = method("finish_pair_carry", args);
            }
        }
        4 => {
            let op = spec["base"]["operations"]
                .as_array()
                .unwrap()
                .iter()
                .find(|o| o["branch"] == f[21] && o["maintenance"] == true)
                .context("maintenance branch")?;
            for (i, c) in op["calls"].as_array().unwrap().iter().enumerate() {
                out[i] = convert(c, &f[21..34])?;
            }
        }
        OPEN => {
            let mut args = vec![sc[5], sc[6], sc[7], 0];
            args.extend(hash(base_scope(sc)));
            args.extend(facts[0]);
            args.extend([0; 4]);
            out[0] = method("open_source_stream", args);
            let mut args = hash(facts.iter().flatten().copied().collect()).to_vec();
            args.extend(Progress::empty().users);
            args.extend(Progress::empty().orders);
            out[1] = method("initialize_stream_roots", args);
        }
        COVER => {
            out[0] = method(
                "begin_source_page",
                context_value(1, sc, facts, &req.source.before, &req.sort, req.settled).to_vec(),
            );
            let mut args = req.source.after.users.to_vec();
            args.extend([req.source.after.accounts, req.source.after.last_owner]);
            out[1] = method("set_source_users", args);
            let mut args = req.source.after.orders.to_vec();
            args.push(req.source.after.order_count);
            args.extend(req.source.after.recovery);
            args.push(req.source.after.recovery_count);
            out[2] = method("set_source_manifests", args);
            out[3] = method(
                "finish_source_page",
                context_value(1, sc, facts, &req.source.after, &req.sort, req.settled).to_vec(),
            );
        }
        ABORT_SOURCE => {
            out[0] = method(
                "abort_source_stream",
                context_value(1, sc, facts, &req.ledger, &req.sort, req.settled).to_vec(),
            );
        }
        SETTLE => {
            ensure!(
                (1..=4).contains(&f[2]) && req.members.len() == f[2] as usize,
                "settlement member count"
            );
            let mut args = random_context(context_value(
                3,
                sc,
                facts,
                &req.ledger,
                &req.sort,
                req.settled,
            ))?
            .to_vec();
            args.extend((0..4).map(|i| f[22 + 13 * i]));
            args.extend((0..4).map(|i| f[31 + 13 * i]));
            args.push(f[2]);
            out[0] = method("begin_stream_settlement", args);
            let paired = spec["version"] == 7 || spec["version"] == 8 || spec["version"] == 9;
            let optimized = spec["version"] == 9;
            let global = spec["version"] == 8 || optimized;
            let trade = global
                && spec["base"]["operations"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|o| {
                        o["branch"] == f[21]
                            && ["match_orders", "settle_sale"]
                                .contains(&o["name"].as_str().unwrap_or(""))
                    });
            ensure!(!paired || f[2] <= 2, "paired page capacity");
            for i in 0..f[2] as usize {
                let v = &f[21 + 13 * i..34 + 13 * i];
                let m = &req.members[i];
                let mut args = vec![v[1], v[10]];
                args.extend(m.terms);
                args.push(m.consumed);
                args.extend(m.paid_a);
                args.extend(m.paid_b);
                args.push(m.fee);
                out[1 + i] = method("bind_stream_member", args);
                if trade && i == 1 {
                    continue;
                }
                let op = spec["base"]["operations"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["branch"] == v[0] && o["maintenance"] == false)
                    .context("settlement branch")?;
                let c = op["calls"].as_array().unwrap();
                if paired {
                    ensure!(
                        trade
                            || op["name"]
                                .as_str()
                                .is_some_and(|n| n.starts_with("refund_funding_")),
                        "paired trading frontier not installed"
                    );
                    for (j, c) in c.iter().enumerate() {
                        out[5 + 9 * i + j] = convert(c, v)?;
                    }
                    continue;
                }
                out[17 + 5 * i] = convert(&c[0], v)?;
                if let Some(c) = c
                    .iter()
                    .find(|c| c["contract_id"] == 0 && c["method_name"] == "claim")
                {
                    out[18 + 5 * i] = convert(c, v)?;
                }
                for (j, c) in c
                    .iter()
                    .filter(|c| c["method_name"] == "transfer")
                    .enumerate()
                {
                    ensure!(j < 3, "stream output capacity");
                    out[19 + 5 * i + j] = convert(c, v)?;
                }
            }
            if trade || (optimized && f[1] == 1) {
                let p = req.frontier.as_ref().context("completed frontier")?;
                let stream = context_value(3, sc, facts, &req.ledger, &req.sort, req.settled);
                let mut args =
                    crate::pair_frontier::context_value(stream, &p.before, sc, sc[2]).to_vec();
                args.extend(p.before.best.as_ref().context("winner")?.hash(sc, sc[2]));
                if optimized && f[1] == 1 {
                    ensure!(!trade && f[2] == 1, "one invalid winner only");
                    args.push(f[22]);
                    out[3] = method("bind_pair_rejection", args);
                } else {
                    out[3] = method("bind_pair_choice", args);
                }
            }
            if !paired {
                for pos in 0..f[2] as usize {
                    let row = f[17 + pos] as usize;
                    ensure!(row < f[2] as usize, "claim rank");
                    let v = &f[21 + 13 * row..34 + 13 * row];
                    out[5 + 3 * pos] = method("claim_stream_member", vec![v[1], v[10]]);
                    let op = spec["base"]["operations"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|o| o["branch"] == v[0])
                        .context("claim branch")?;
                    for (j, asset) in [(1, "assetA"), (2, "assetB")] {
                        if let Some(c) = op["calls"].as_array().unwrap().iter().find(|c| {
                            c["method_name"] == "claim"
                                && c["contract_id"] == spec["base"]["config"][asset]
                        }) {
                            out[5 + 3 * pos + j] = convert(c, v)?;
                        }
                    }
                }
            }
            let mut remaining = req.sort.ordered;
            for m in &req.members {
                let proof = MerkleProofCore::new_from_params::<H>(
                    m.index,
                    Q::ZERO,
                    m.path.siblings.iter().map(|x| Q(h(*x))).collect(),
                );
                remaining = proof.root.0.elements.map(|n| n.to_canonical_u64());
            }
            let mut args = vec![sc[5], req.settled, f[2]];
            args.extend(remaining);
            out[37] = method("finish_stream_settlement", args);
        }
        _ => anyhow::bail!("unknown stream mode"),
    }
    if minimum_mode {
        let key = req.registered_key.context("registered key")?;
        out[38] = method("account_executor_fee", [vec![f[73]], key.to_vec()].concat());
    }
    out[39] = convert(&spec["base"]["burn"], f)?;
    if compact {
        out.retain(|c| {
            c["contract_id"] != spec["noop"]["contract_id"] || c["method_name"] != "noop"
        });
    }
    Ok(out)
}
/// Predict the exact FINAL net-word fee, including possible restoration of the
/// native word. No SDK estimate is treated as authorization or silently raised.
pub fn completion_fee(
    prefix_words: u32,
    prefix_native_changed: bool,
    start: [u64; 4],
    current: [u64; 4],
) -> Result<u64> {
    let mut valid = vec![];
    for n in 0..=100u64 {
        let burn = 1_000_000_000 + 1000 * n;
        if let Some(balance) = current[0].checked_sub(burn) {
            let mut after = current;
            after[0] = balance;
            let words = (prefix_words as u64)
                .checked_sub(u64::from(prefix_native_changed))
                .context("native fee prefix count")?
                + u64::from(after != start);
            if burn == psy_config::network_constants::GUTA_FEE + psy_config::DA_FEE * words {
                valid.push(burn);
            }
        }
    }
    ensure!(
        valid.len() == 1,
        "no unique final-net-word fee within the declared stream budget"
    );
    Ok(valid[0])
}
