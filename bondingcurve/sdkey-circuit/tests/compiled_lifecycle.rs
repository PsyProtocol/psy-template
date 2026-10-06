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
        let evidence = root.join("../deployments/staging-2026-09-30");
        let mut world = Self {
            state: InMemoryStateBackend::new(),
            methods: HashMap::new(),
            fields: HashMap::new(),
            checkpoint: 100,
        };
        for (id, path) in [
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

    fn open_sell(&mut self, user: u64, sold: u64, lots: u64, nonce: u64) -> Result<()> {
        let price = Self::buy_quote(sold - lots, lots);
        self.tx(
            user,
            &[
                call(
                    CURVE,
                    "open_sell",
                    &[VAULT, lots, sold, price, self.checkpoint + 10, nonce],
                ),
                call(TOKEN, "transfer", &[VAULT, lots * UNIT]),
                call(0, "simple_transfer", &[VAULT, ESCROW]),
            ],
        )
    }

    fn settle_sell(&mut self, user: u64, sold: u64, lots: u64, nonce: u64) -> Result<()> {
        let price = Self::buy_quote(sold - lots, lots);
        self.vault(vec![
            call(CURVE, "settle_sell", &[user, lots, price, nonce]),
            call(TOKEN, "claim", &[user]),
            call(0, "simple_claim", &[user]),
            call(0, "simple_transfer", &[user, price]),
        ])?;
        self.tx(
            user,
            &[
                call(0, "simple_claim", &[VAULT]),
                call(CURVE, "close_sell", &[]),
            ],
        )
    }

    fn invariant(&self, sold: u64) {
        assert_eq!(self.value(VAULT, CURVE, "sold_lots"), sold);
        assert_eq!(
            self.value(VAULT, CURVE, "psy_reserve"),
            Self::buy_quote(0, sold)
        );
        assert_eq!(self.value(VAULT, TOKEN, "balance"), (6 - sold) * UNIT);
        assert!(self.value(VAULT, 0, "balance") >= Self::buy_quote(0, sold));
        assert_eq!(
            [ISSUER, VAULT, TARGET, ALICE, BOB, CHARLIE]
                .iter()
                .map(|&user| self.value(user, TOKEN, "balance"))
                .sum::<u64>(),
            6 * UNIT
        );
    }
}

#[test]
fn compiled_multiuser_buy_sell_refund_and_graduation() -> Result<()> {
    let mut w = World::new()?;
    w.initialize()?;
    w.invariant(0);
    // Two independently signed orders use the same starting price.
    w.open_buy(ALICE, 0, 2, 1)?;
    w.open_buy(BOB, 0, 1, 1)?;
    w.reject(
        ALICE,
        &[call(CURVE, "close_buy", &[])],
        "unsettled PSY payment",
    );
    w.settle_buy(ALICE, 0, 2, 1)?;
    w.finish_buy(ALICE)?;
    w.reject(
        VAULT,
        &[call(CURVE, "settle_buy", &[BOB, 1, 100_000_000, 1])],
        "stale buy quote",
    );
    let bob_balance = w.value(BOB, 0, "balance");
    w.refund_buy(BOB, 0, 1, 1)?;
    assert_eq!(w.value(BOB, 0, "balance"), bob_balance + 100_000_000);
    w.reject(
        VAULT,
        &[call(CURVE, "refund_buy", &[BOB, 1, 100_000_000, 1])],
        "wrong buy order",
    );
    w.invariant(2);
    w.open_buy(BOB, 2, 1, 2)?;
    w.settle_buy(BOB, 2, 1, 2)?;
    w.finish_buy(BOB)?;
    w.open_sell(ALICE, 3, 1, 2)?;
    w.settle_sell(ALICE, 3, 1, 2)?;
    w.invariant(2);
    w.open_buy(CHARLIE, 2, 1, 1)?;
    w.open_buy(ALICE, 2, 1, 3)?;
    w.settle_buy(ALICE, 2, 1, 3)?;
    w.finish_buy(ALICE)?;
    w.invariant(3);
    let reserve = w.value(VAULT, CURVE, "psy_reserve");
    w.tx(ISSUER, &[call(0, "simple_transfer", &[VAULT, ESCROW])])?;
    w.reject(
        VAULT,
        &[call(CURVE, "graduate", &[BOB, reserve, 3 * UNIT])],
        "wrong graduation target",
    );
    w.vault(vec![
        call(CURVE, "graduate", &[TARGET, reserve, 3 * UNIT]),
        call(0, "simple_claim", &[ISSUER]),
        call(0, "simple_transfer", &[TARGET, reserve]),
        call(TOKEN, "transfer", &[TARGET, 3 * UNIT]),
    ])?;
    w.tx(
        TARGET,
        &[
            call(0, "simple_claim", &[VAULT]),
            call(TOKEN, "claim", &[VAULT]),
        ],
    )?;
    assert_eq!(w.value(VAULT, CURVE, "phase"), 2);
    assert_eq!(w.value(TARGET, TOKEN, "balance"), 3 * UNIT);
    assert_eq!(w.value(TARGET, 0, "balance"), reserve);
    w.reject(
        VAULT,
        &[call(CURVE, "graduate", &[TARGET, reserve, 3 * UNIT])],
        "threshold not reached",
    );
    w.reject(
        BOB,
        &[call(CURVE, "open_buy", &[VAULT, 1, 3, 100_003_000, 200, 3])],
        "vault not trading",
    );
    // A funded stale order remains refundable after graduation.
    w.refund_buy(CHARLIE, 2, 1, 1)?;
    assert_eq!(w.value(VAULT, CURVE, "psy_reserve"), 0);
    assert_eq!(w.value(VAULT, TOKEN, "balance"), 0);
    assert_eq!(w.value(ALICE, TOKEN, "balance"), 2 * UNIT);
    assert_eq!(w.value(BOB, TOKEN, "balance"), UNIT);
    Ok(())
}

#[test]
fn compiled_payment_nonce_expiry_and_cap_guards() -> Result<()> {
    let mut w = World::new()?;
    w.reject(
        BOB,
        &[call(TOKEN, "mint_once", &[])],
        "only launch issuer may mint",
    );
    w.reject(
        VAULT,
        &[call(
            CURVE,
            "initialize",
            &[TOKEN, ISSUER, TARGET, 4, 2, UNIT, 100_000_000, 1_000, 3],
        )],
        "issuer inventory or fee mismatch",
    );
    w.initialize()?;
    w.reject(
        ISSUER,
        &[call(TOKEN, "mint_once", &[])],
        "fixed supply already minted",
    );
    w.reject(
        VAULT,
        &[call(CURVE, "graduate", &[TARGET, 1, 6 * UNIT])],
        "threshold not reached",
    );
    w.reject(
        ALICE,
        &[call(CURVE, "open_buy", &[VAULT, 1, 0, 100_000_000, 99, 1])],
        "expired or replayed order",
    );
    // Underpayment must not advance the vault's inventory or consumed nonce.
    w.tx(
        ALICE,
        &[
            call(CURVE, "open_buy", &[VAULT, 1, 0, 100_000_000, 200, 1]),
            call(0, "simple_transfer", &[VAULT, 100_000_000 + ESCROW - 1]),
        ],
    )?;
    w.reject(
        VAULT,
        &[call(CURVE, "settle_buy", &[ALICE, 1, 100_000_000, 1])],
        "buy payment mismatch",
    );
    assert_eq!(w.slot(VAULT, CURVE, "consumed_nonce", ALICE), 0);
    w.invariant(0);
    w.tx(ALICE, &[call(0, "simple_transfer", &[VAULT, 1])])?;
    w.settle_buy(ALICE, 0, 1, 1)?;
    // Replay while the intent is still active reaches the consumed-nonce guard.
    w.reject(
        VAULT,
        &[call(CURVE, "refund_buy", &[ALICE, 1, 100_000_000, 1])],
        "buy already used",
    );
    w.finish_buy(ALICE)?;
    w.reject(
        ALICE,
        &[call(CURVE, "open_buy", &[VAULT, 1, 1, 100_001_000, 200, 1])],
        "expired or replayed order",
    );
    w.open_buy(BOB, 1, 1, 1)?;
    w.checkpoint += 11;
    w.reject(
        VAULT,
        &[call(CURVE, "settle_buy", &[BOB, 1, 100_001_000, 1])],
        "buy expired",
    );
    w.refund_buy(BOB, 1, 1, 1)?;
    w.open_buy(ALICE, 1, 3, 2)?;
    w.settle_buy(ALICE, 1, 3, 2)?;
    w.finish_buy(ALICE)?;
    w.invariant(4);
    w.open_buy(BOB, 4, 1, 2)?;
    w.reject(
        VAULT,
        &[call(CURVE, "settle_buy", &[BOB, 1, 100_004_000, 2])],
        "sale cap exceeded",
    );
    w.refund_buy(BOB, 4, 1, 2)?;
    w.invariant(4);
    Ok(())
}

#[test]
fn compiled_sell_refund_returns_only_original_inventory() -> Result<()> {
    let mut w = World::new()?;
    w.initialize()?;
    w.open_buy(ALICE, 0, 2, 1)?;
    w.settle_buy(ALICE, 0, 2, 1)?;
    w.finish_buy(ALICE)?;
    w.open_sell(ALICE, 2, 1, 2)?;
    w.reject(
        ALICE,
        &[call(CURVE, "close_sell", &[])],
        "unsettled fee payment",
    );
    w.reject(
        VAULT,
        &[call(CURVE, "refund_sell", &[BOB, 1, 2])],
        "wrong sell order",
    );
    w.vault(vec![
        call(CURVE, "refund_sell", &[ALICE, 1, 2]),
        call(TOKEN, "claim", &[ALICE]),
        call(0, "simple_claim", &[ALICE]),
        call(TOKEN, "transfer", &[ALICE, UNIT]),
    ])?;
    w.reject(
        VAULT,
        &[call(CURVE, "refund_sell", &[ALICE, 1, 2])],
        "sell already used",
    );
    w.tx(
        ALICE,
        &[
            call(TOKEN, "claim", &[VAULT]),
            call(CURVE, "close_sell", &[]),
        ],
    )?;
    w.invariant(2);
    assert_eq!(w.value(ALICE, TOKEN, "balance"), 2 * UNIT);
    assert_eq!(w.value(BOB, TOKEN, "balance"), 0);
    Ok(())
}

#[test]
fn compiled_hundred_rounds_preserve_reserve_and_supply() -> Result<()> {
    let mut w = World::new()?;
    w.initialize()?;
    for round in 0..100 {
        let buyer = [ALICE, BOB, CHARLIE][round % 3];
        let nonce = 2 * (round / 3) as u64 + 1;
        w.open_buy(buyer, 0, 4, nonce)?;
        w.settle_buy(buyer, 0, 4, nonce)?;
        w.finish_buy(buyer)?;
        w.invariant(4);
        w.open_sell(buyer, 4, 4, nonce + 1)?;
        w.settle_sell(buyer, 4, 4, nonce + 1)?;
        w.invariant(0);
        assert_eq!(w.value(buyer, TOKEN, "balance"), 0);
        w.checkpoint += 1;
    }
    Ok(())
}
