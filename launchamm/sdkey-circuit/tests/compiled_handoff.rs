//! Execute reviewed contract bytecode against independent user partitions.
//! These are local VM tests, not live transactions or UPS proof verification.
use std::{collections::HashMap, fs, path::PathBuf};

use anyhow::{bail, Result};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{
    eval::executor::{ExecutionContext, InMemoryStateBackend, StateBackend, VmExecutor},
    vm::def::DPNFunctionCircuitDefinition,
};
use serde::Deserialize;
use serde_json::Value;

const AMM: u64 = 67;
const PSY_UNIT: u64 = 1_000;
const TOKEN_UNIT: u64 = 1_000_000;
const CURVE: u64 = 66;
const TOKEN: u64 = 65;
const ISSUER: u64 = 1_882_112;
const VAULT: u64 = 758_784;
const TARGET: u64 = 1_283_072;
const ALICE: u64 = 111;
const BOB: u64 = 222;
const CHARLIE: u64 = 333;
const UNIT: u64 = 1_000_000_000;
const ESCROW: u64 = 1_000_100_000;
// Explicit simulation fee, within the registered policy's fee envelope.
// The live wallet derives the actual fee from its proved automatic burn.
const FEE: u64 = 1_000_010_000;

#[derive(Deserialize)]
struct Artifact {
    circuit_definitions: Vec<DPNFunctionCircuitDefinition>,
    abi: Value,
}

#[derive(Clone)]
struct Call(u64, &'static str, Vec<u64>);
fn call(contract: u64, method: &'static str, inputs: &[u64]) -> Call {
    Call(contract, method, inputs.to_vec())
}

struct World {
    state: InMemoryStateBackend,
    methods: HashMap<(u64, String), DPNFunctionCircuitDefinition>,
    fields: HashMap<(u64, String), u64>,
    checkpoint: u64,
}

impl World {
    fn new() -> Result<Self> {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let evidence = root.join("../../bondingcurve/deployments/staging-2026-09-30");
        let mut world = Self {
            state: InMemoryStateBackend::new(),
            methods: HashMap::new(),
            fields: HashMap::new(),
            checkpoint: 100,
        };
        for (id, path) in [
            (
                AMM,
                root.join("../contract/target-v2/compilation_artifact.json"),
            ),
            (CURVE, evidence.join("curve.compilation.json")),
            (TOKEN, evidence.join("launch-token.compilation.json")),
            (0, root.join("../../../psy-node/psy-genesis/token.json")),
        ] {
            let artifact: Artifact = serde_json::from_slice(&fs::read(path)?)?;
            for field in artifact.abi["contract"]["state"].as_array().unwrap() {
                world.fields.insert(
                    (id, field["name"].as_str().unwrap().into()),
                    field["offset"].as_u64().unwrap(),
                );
            }
            for method in artifact.circuit_definitions {
                world.methods.insert((id, method.name.clone()), method);
            }
            assert_eq!(world.fields[&(id, "other_user_info".into())], 3);
        }
        assert_eq!(
            world.methods[&(0, "simple_transfer".into())].method_id,
            354_447_671
        );
        assert_eq!(
            world.methods[&(0, "simple_claim".into())].method_id,
            2_293_029_357
        );
        assert_eq!(
            world.methods[&(0, "simple_burn".into())].method_id,
            2_923_993_647
        );
        // Fixture money only. This never changes a real wallet balance.
        for user in [ISSUER, ALICE, BOB, CHARLIE] {
            world.state.set_slot(user, 0, 0, 100 * UNIT);
        }
        Ok(world)
    }

    fn value(&self, user: u64, contract: u64, field: &str) -> u64 {
        self.state
            .get_contract_slot(user, contract, self.fields[&(contract, field.into())])
            .unwrap()
    }

    fn slot(&self, user: u64, contract: u64, field: &str, index: u64) -> u64 {
        self.state
            .get_contract_slot(
                user,
                contract,
                self.fields[&(contract, field.into())] + index,
            )
            .unwrap()
    }

    // Keep each transaction's writes private until all calls succeed, like a
    // submitted UPS. This models atomic commit; it does not prove node rollback.
    fn tx(&mut self, user: u64, calls: &[Call]) -> Result<()> {
        let mut draft = self.state.clone();
        for Call(contract, method, inputs) in calls {
            let definition = &self.methods[&(*contract, (*method).into())];
            assert_eq!(definition.circuit_inputs.len(), inputs.len());
            let mut vm = VmExecutor::new(draft.clone());
            let result = vm.execute(
                definition,
                &ExecutionContext {
                    user_id: user,
                    contract_id: *contract,
                    caller_contract_id: DEFAULT_CALLER_CONTRACT_ID_U64,
                    checkpoint_id: self.checkpoint,
                    nonce: 1,
                    user_public_key_hash: [0; 4],
                },
                inputs,
            )?;
            if !result.success {
                bail!("{}: {}", method, result.failure.unwrap().message);
            }
            draft.apply_overlay(vm.write_overlay());
            draft.apply_imt_overlay(vm.imt_write_overlay());
        }
        self.state = draft;
        Ok(())
    }

    fn vault(&mut self, mut calls: Vec<Call>) -> Result<()> {
        while calls.len() < 6 {
            calls.push(call(CURVE, "noop", &[]));
        }
        assert_eq!(calls.len(), 6);
        calls.push(call(0, "simple_burn", &[FEE]));
        self.tx(VAULT, &calls)
    }

    fn reject(&mut self, user: u64, calls: &[Call], expected: &str) {
        let error = self.tx(user, calls).unwrap_err().to_string();
        assert!(error.contains(expected), "expected {expected}, got {error}");
    }

    fn initialize(&mut self) -> Result<()> {
        self.tx(ISSUER, &[call(TOKEN, "mint_once", &[])])?;
        self.tx(
            ISSUER,
            &[
                call(TOKEN, "transfer", &[VAULT, 6 * UNIT]),
                call(0, "simple_transfer", &[VAULT, ESCROW]),
            ],
        )?;
        self.vault(vec![
            call(
                CURVE,
                "initialize",
                &[TOKEN, ISSUER, TARGET, 4, 2, UNIT, 100_000_000, 1_000, 3],
            ),
            call(TOKEN, "claim", &[ISSUER]),
            call(0, "simple_claim", &[ISSUER]),
        ])
    }

    fn buy_quote(sold: u64, lots: u64) -> u64 {
        // Independent sum of the per-lot prices, not the contract's formula.
        (sold..sold + lots)
            .map(|index| 100_000_000 + 1_000 * index)
            .sum()
    }

    fn open_buy(&mut self, user: u64, sold: u64, lots: u64, nonce: u64) -> Result<()> {
        let price = Self::buy_quote(sold, lots);
        self.tx(
            user,
            &[
                call(
                    CURVE,
                    "open_buy",
                    &[VAULT, lots, sold, price, self.checkpoint + 10, nonce],
                ),
                call(0, "simple_transfer", &[VAULT, price + ESCROW]),
            ],
        )
    }

    fn settle_buy(&mut self, user: u64, sold: u64, lots: u64, nonce: u64) -> Result<()> {
        self.vault(vec![
            call(
                CURVE,
                "settle_buy",
                &[user, lots, Self::buy_quote(sold, lots), nonce],
            ),
            call(0, "simple_claim", &[user]),
            call(TOKEN, "transfer", &[user, lots * UNIT]),
        ])
    }

    fn finish_buy(&mut self, user: u64) -> Result<()> {
        self.tx(
            user,
            &[
                call(TOKEN, "claim", &[VAULT]),
                call(CURVE, "close_buy", &[]),
            ],
        )
    }

    fn refund_buy(&mut self, user: u64, sold: u64, lots: u64, nonce: u64) -> Result<()> {
        let price = Self::buy_quote(sold, lots);
        self.vault(vec![
            call(CURVE, "refund_buy", &[user, lots, price, nonce]),
            call(0, "simple_claim", &[user]),
            call(0, "simple_transfer", &[user, price]),
        ])?;
        self.tx(
            user,
            &[
                call(0, "simple_claim", &[VAULT]),
                call(CURVE, "close_buy", &[]),
            ],
        )
    }

    fn pool(&mut self, mut calls: Vec<Call>) -> Result<()> {
        while calls.len() < 5 {
            calls.push(call(AMM, "noop", &[]));
        }
        calls.push(call(0, "simple_burn", &[FEE]));
        self.tx(TARGET, &calls)
    }
    fn graduate(&mut self) -> Result<()> {
        self.initialize()?;
        self.open_buy(ALICE, 0, 3, 1)?;
        self.settle_buy(ALICE, 0, 3, 1)?;
        self.finish_buy(ALICE)?;
        self.tx(ISSUER, &[call(0, "simple_transfer", &[VAULT, ESCROW])])?;
        self.vault(vec![
            call(CURVE, "graduate", &[TARGET, 300_003_000, 3 * UNIT]),
            call(0, "simple_claim", &[ISSUER]),
            call(0, "simple_transfer", &[TARGET, 300_003_000]),
            call(TOKEN, "transfer", &[TARGET, 3 * UNIT]),
        ])
    }
    fn seed(&mut self) -> Result<()> {
        self.tx(ISSUER, &[call(0, "simple_transfer", &[TARGET, ESCROW])])?;
        self.pool(vec![
            call(
                AMM,
                "seed_from_curve",
                &[
                    CURVE, VAULT, TOKEN, ISSUER, PSY_UNIT, TOKEN_UNIT, 300_003, 3_000, 29_000,
                ],
            ),
            call(0, "simple_claim", &[VAULT]),
            call(TOKEN, "claim", &[VAULT]),
            call(0, "simple_claim", &[ISSUER]),
        ])
    }
    fn invariant(&self) -> Result<()> {
        assert_eq!(
            [ISSUER, VAULT, TARGET, ALICE, BOB, CHARLIE]
                .iter()
                .map(|&u| self.value(u, TOKEN, "balance"))
                .sum::<u64>(),
            6 * UNIT
        );
        assert_eq!(
            self.value(TARGET, TOKEN, "balance"),
            self.value(TARGET, AMM, "reserve_token") * TOKEN_UNIT
        );
        assert!(
            self.value(TARGET, 0, "balance") >= self.value(TARGET, AMM, "reserve_psy") * PSY_UNIT
        );
        Ok(())
    }
}
#[test]
fn graduated_seed_then_bidirectional_swap_lp_and_refund() -> Result<()> {
    let mut w = World::new()?;
    w.graduate()?;
    w.seed()?;
    w.invariant()?;
    assert_eq!(w.slot(TARGET, AMM, "shares", ISSUER), 29_000);
    assert_eq!(w.value(TARGET, AMM, "total_shares"), 30_000);
    // Independent exact-in quote, plus base-unit scaling.
    let rp = w.value(TARGET, AMM, "reserve_psy");
    let rt = w.value(TARGET, AMM, "reserve_token");
    let x = 10_000;
    let out = x * 9970 * rt / (rp * 10000 + x * 9970);
    w.tx(
        BOB,
        &[
            call(AMM, "open_swap", &[TARGET, 0, x, out, 200, 1]),
            call(0, "simple_transfer", &[TARGET, x * PSY_UNIT + ESCROW]),
        ],
    )?;
    w.pool(vec![
        call(AMM, "swap", &[BOB, 0, x, out, 1]),
        call(0, "simple_claim", &[BOB]),
        call(TOKEN, "transfer", &[BOB, out * TOKEN_UNIT]),
    ])?;
    w.tx(
        BOB,
        &[
            call(TOKEN, "claim", &[TARGET]),
            call(AMM, "close_psy_swap", &[]),
        ],
    )?;
    w.invariant()?;
    let rp = w.value(TARGET, AMM, "reserve_psy");
    let rt = w.value(TARGET, AMM, "reserve_token");
    let input = out;
    let psy_out = input * 9970 * rp / (rt * 10000 + input * 9970);
    w.tx(
        BOB,
        &[
            call(AMM, "open_swap", &[TARGET, TOKEN, input, psy_out, 200, 2]),
            call(TOKEN, "transfer", &[TARGET, input * TOKEN_UNIT]),
            call(0, "simple_transfer", &[TARGET, ESCROW]),
        ],
    )?;
    w.pool(vec![
        call(AMM, "swap", &[BOB, TOKEN, input, psy_out, 2]),
        call(0, "simple_claim", &[BOB]),
        call(TOKEN, "claim", &[BOB]),
        call(0, "simple_transfer", &[BOB, psy_out * PSY_UNIT]),
    ])?;
    w.tx(
        BOB,
        &[
            call(0, "simple_claim", &[TARGET]),
            call(AMM, "close_token_swap", &[]),
        ],
    )?;
    w.invariant()?;
    // Same-ratio add (whole reserve), then remove the newly minted shares.
    let rp = w.value(TARGET, AMM, "reserve_psy");
    let rt = w.value(TARGET, AMM, "reserve_token");
    let total = w.value(TARGET, AMM, "total_shares");
    w.tx(
        ALICE,
        &[
            call(AMM, "open_add", &[TARGET, rp, rt, total, 200, 1]),
            call(0, "simple_transfer", &[TARGET, rp * PSY_UNIT + ESCROW]),
            call(TOKEN, "transfer", &[TARGET, rt * TOKEN_UNIT]),
        ],
    )?;
    w.pool(vec![
        call(AMM, "add_liquidity", &[ALICE, rp, rt, total, 1]),
        call(0, "simple_claim", &[ALICE]),
        call(TOKEN, "claim", &[ALICE]),
    ])?;
    w.tx(ALICE, &[call(AMM, "close_add", &[])])?;
    w.invariant()?;
    w.tx(
        ALICE,
        &[
            call(AMM, "open_remove", &[TARGET, total, rp, rt, 200, 2]),
            call(0, "simple_transfer", &[TARGET, ESCROW]),
        ],
    )?;
    w.pool(vec![
        call(AMM, "remove_liquidity", &[ALICE, total, rp, rt, 2]),
        call(0, "simple_claim", &[ALICE]),
        call(0, "simple_transfer", &[ALICE, rp * PSY_UNIT]),
        call(TOKEN, "transfer", &[ALICE, rt * TOKEN_UNIT]),
    ])?;
    w.tx(
        ALICE,
        &[
            call(0, "simple_claim", &[TARGET]),
            call(TOKEN, "claim", &[TARGET]),
            call(AMM, "close_remove", &[]),
        ],
    )?;
    w.invariant()?;
    // Cancellation returns only Bob's new payment, without changing reserves.
    w.tx(
        BOB,
        &[
            call(AMM, "open_swap", &[TARGET, 0, 100, 1, 200, 3]),
            call(0, "simple_transfer", &[TARGET, 100 * PSY_UNIT + ESCROW]),
        ],
    )?;
    w.pool(vec![
        call(AMM, "refund_unclaimed", &[BOB, 0, 100]),
        call(0, "simple_claim", &[BOB]),
        call(0, "simple_transfer", &[BOB, 100 * PSY_UNIT]),
    ])?;
    w.reject(
        TARGET,
        &[call(AMM, "refund_unclaimed", &[BOB, 0, 100])],
        "no fee escrow",
    );
    w.tx(
        BOB,
        &[
            call(0, "simple_claim", &[TARGET]),
            call(AMM, "close_psy_swap", &[]),
        ],
    )?;
    w.invariant()
}
#[test]
fn seed_rejects_wrong_source_partial_payment_units_and_replay() -> Result<()> {
    let mut w = World::new()?;
    let good = vec![
        CURVE, VAULT, TOKEN, ISSUER, PSY_UNIT, TOKEN_UNIT, 300_003, 3_000, 29_000,
    ];
    w.reject(
        TARGET,
        &[call(AMM, "seed_from_curve", &good)],
        "curve not graduated",
    );
    w.graduate()?;
    let mut wrong = good.clone();
    wrong[1] = BOB;
    w.reject(
        TARGET,
        &[call(AMM, "seed_from_curve", &wrong)],
        "curve not graduated",
    );
    // Missing fee and incomplete source Outbox cannot initialize reserves.
    w.reject(
        TARGET,
        &[call(AMM, "seed_from_curve", &good)],
        "graduation payment or seed fee mismatch",
    );
    wrong = good.clone();
    wrong[4] = 999;
    w.reject(
        TARGET,
        &[call(AMM, "seed_from_curve", &wrong)],
        "inexact graduation units",
    );
    wrong = good.clone();
    wrong[8] += 1;
    w.tx(ISSUER, &[call(0, "simple_transfer", &[TARGET, ESCROW])])?;
    let outbox = 3 + TARGET * 2;
    w.state.set_slot(VAULT, TOKEN, outbox, 3 * UNIT - 1);
    w.reject(
        TARGET,
        &[call(AMM, "seed_from_curve", &good)],
        "graduation payment or seed fee mismatch",
    );
    assert_eq!(w.value(TARGET, AMM, "phase"), 0);
    assert_eq!(w.value(TARGET, TOKEN, "balance"), 0);
    w.state.set_slot(VAULT, TOKEN, outbox, 3 * UNIT);
    w.reject(
        TARGET,
        &[call(AMM, "seed_from_curve", &wrong)],
        "wrong seed shares",
    );
    // Same seed stack after interrupted/failed proof: no extra funding.
    w.pool(vec![
        call(AMM, "seed_from_curve", &good),
        call(0, "simple_claim", &[VAULT]),
        call(TOKEN, "claim", &[VAULT]),
        call(0, "simple_claim", &[ISSUER]),
    ])?;
    w.reject(
        TARGET,
        &[call(AMM, "seed_from_curve", &good)],
        "already initialized",
    );
    w.invariant()
}
#[test]
fn funded_remove_can_cancel_without_burning_lp_or_moving_reserves() -> Result<()> {
    let mut w = World::new()?;
    w.graduate()?;
    w.seed()?;
    let shares = w.slot(TARGET, AMM, "shares", ISSUER);
    let rp = w.value(TARGET, AMM, "reserve_psy");
    let rt = w.value(TARGET, AMM, "reserve_token");
    w.tx(
        ISSUER,
        &[
            call(AMM, "open_remove", &[TARGET, 1000, 1, 1, 200, 1]),
            call(0, "simple_transfer", &[TARGET, ESCROW]),
        ],
    )?;
    w.pool(vec![
        call(AMM, "cancel_remove", &[ISSUER, 1]),
        call(0, "simple_claim", &[ISSUER]),
    ])?;
    w.reject(
        TARGET,
        &[call(AMM, "cancel_remove", &[ISSUER, 1])],
        "order already used",
    );
    assert_eq!(w.slot(TARGET, AMM, "shares", ISSUER), shares);
    assert_eq!(w.value(TARGET, AMM, "reserve_psy"), rp);
    assert_eq!(w.value(TARGET, AMM, "reserve_token"), rt);
    w.tx(ISSUER, &[call(AMM, "close_remove", &[])])?;
    assert_eq!(w.value(ISSUER, AMM, "order_kind"), 0);
    w.invariant()
}
