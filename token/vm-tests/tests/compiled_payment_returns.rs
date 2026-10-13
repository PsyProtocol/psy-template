//! Local VM regression for the token-template return methods. No chain writes.
use anyhow::{bail, Result};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{eval::executor::{ExecutionContext, InMemoryStateBackend, StateBackend, VmExecutor}, vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
use std::{collections::HashMap, fs, path::PathBuf};

const TOKEN: u64 = 42;
const SDK: u64 = 100;
const ALICE: u64 = 200;
const BOB: u64 = 300;
const MAX: u64 = 18_446_744_069_414_584_320;

struct World {
    state: InMemoryStateBackend,
    outbox: u64,
    balance: u64,
    notes: Option<(u64, u64)>,
    methods: HashMap<String, DPNFunctionCircuitDefinition>,
}
impl World {
    fn new() -> Result<Self> {
        Self::profile("v3")
    }
    fn profile(name: &str) -> Result<Self> {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join(format!("../target/{name}/compilation_artifact.json"));
        let artifact: Value = serde_json::from_slice(&fs::read(path)?)?;
        Self::load(&artifact["abi"], &artifact["circuit_definitions"])
    }
    fn legacy() -> Result<Self> {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target");
        let abi: Value = serde_json::from_slice(&fs::read(root.join("token.abi.json"))?)?;
        let definitions: Value = serde_json::from_slice(&fs::read(root.join("token.json"))?)?;
        Self::load(&abi, &definitions)
    }
    fn load(abi: &Value, definitions: &Value) -> Result<Self> {
        let fields = abi["contract"]["state"].as_array().unwrap();
        let offset = |name: &str| fields.iter().find(|f| f["name"] == name).unwrap()["offset"].as_u64().unwrap();
        let optional = |name: &str| fields.iter().find(|f| f["name"] == name).and_then(|f| f["offset"].as_u64());
        let defs: Vec<DPNFunctionCircuitDefinition> = serde_json::from_value(definitions.clone())?;
        Ok(Self {state: InMemoryStateBackend::new(), outbox: offset("other_user_info"), balance: offset("balance"), notes: optional("note_count").zip(optional("note_root")), methods: defs.into_iter().map(|m| (m.name.clone(), m)).collect()})
    }
    fn sent(&mut self, user: u64, to: u64, value: u64) {
        self.state.set_slot(user, TOKEN, self.outbox + 2 * to, value);
    }
    fn claimed(&mut self, user: u64, from: u64, value: u64) {
        self.state.set_slot(user, TOKEN, self.outbox + 2 * from + 1, value);
    }
    fn info(&self, user: u64, other: u64) -> (u64, u64) {
        (self.state.get_contract_slot(user, TOKEN, self.outbox + 2 * other).unwrap(),
         self.state.get_contract_slot(user, TOKEN, self.outbox + 2 * other + 1).unwrap())
    }
    fn execute(&mut self, user: u64, method: &str, inputs: &[u64]) -> Result<()> {
        let mut vm = VmExecutor::new(self.state.clone());
        let result = vm.execute(&self.methods[method], &ExecutionContext {user_id: user, contract_id: TOKEN,
            caller_contract_id: DEFAULT_CALLER_CONTRACT_ID_U64, checkpoint_id: 101,
            nonce: 1, user_public_key_hash: [0; 4]}, inputs)?;
        if !result.success {bail!("{}", result.failure.unwrap().message);}
        self.state.apply_overlay(vm.write_overlay());
        self.state.apply_imt_overlay(vm.imt_write_overlay());
        Ok(())
    }
}

#[test]
fn private_profile_cancellation_preserves_private_note_state() -> Result<()> {
    let mut w = World::profile("private-v3")?;
    let (count, root) = w.notes.unwrap();
    w.state.set_slot(SDK, TOKEN, count, 7);
    for i in 0..4 { w.state.set_slot(SDK, TOKEN, root + i, 50 + i); }
    w.sent(ALICE, SDK, 140);
    w.claimed(SDK, ALICE, 40);
    w.state.set_slot(SDK, TOKEN, w.balance, 40);
    assert!(w.execute(SDK, "cancel_unclaimed_payment", &[BOB]).is_err());
    w.execute(SDK, "cancel_unclaimed_payment", &[ALICE])?;
    assert_eq!(w.info(SDK, ALICE), (100, 140));
    assert_eq!(w.state.get_contract_slot(SDK, TOKEN, w.balance)?, 40);
    assert_eq!(w.state.get_contract_slot(SDK, TOKEN, count)?, 7);
    for i in 0..4 { assert_eq!(w.state.get_contract_slot(SDK, TOKEN, root + i)?, 50 + i); }
    assert!(w.execute(SDK, "cancel_unclaimed_payment", &[ALICE]).is_err());
    Ok(())
}

#[test]
fn legacy_compiled_cancellation_preserves_the_same_payer_accounting() -> Result<()> {
    let mut w = World::legacy()?;
    w.sent(ALICE, SDK, 140);
    w.claimed(SDK, ALICE, 40);
    w.state.set_slot(SDK, TOKEN, w.balance, 40);
    assert!(w.execute(SDK, "cancel_unclaimed_payment", &[BOB]).is_err());
    w.execute(SDK, "cancel_unclaimed_payment", &[ALICE])?;
    assert_eq!(w.info(SDK, ALICE), (100, 140));
    assert_eq!(w.info(SDK, BOB), (0, 0));
    assert_eq!(w.state.get_contract_slot(SDK, TOKEN, w.balance)?, 40);
    w.execute(ALICE, "claim", &[SDK])?;
    assert_eq!(w.state.get_contract_slot(ALICE, TOKEN, w.balance)?, 100);
    assert!(w.execute(SDK, "cancel_unclaimed_payment", &[ALICE]).is_err());
    Ok(())
}

#[test]
fn cancellation_returns_only_the_unclaimed_delta_to_its_payer() -> Result<()> {
    let mut w = World::new()?;
    w.sent(ALICE, SDK, 140);
    w.claimed(SDK, ALICE, 40);
    w.state.set_slot(SDK, TOKEN, w.balance, 40);
    w.execute(SDK, "cancel_unclaimed_payment", &[ALICE])?;
    assert_eq!(w.info(SDK, ALICE), (100, 140));
    assert_eq!(w.info(SDK, BOB), (0, 0));
    assert_eq!(w.state.get_contract_slot(SDK, TOKEN, w.balance)?, 40);
    w.execute(ALICE, "claim", &[SDK])?;
    assert_eq!(w.state.get_contract_slot(ALICE, TOKEN, w.balance)?, 100);
    assert!(w.execute(SDK, "cancel_unclaimed_payment", &[ALICE]).is_err());
    assert!(w.execute(ALICE, "claim", &[SDK]).is_err());
    // A later deposit can be returned once, independently of the old refund.
    w.sent(ALICE, SDK, 160);
    w.execute(SDK, "cancel_unclaimed_payment", &[ALICE])?;
    assert_eq!(w.info(SDK, ALICE), (120, 160));
    Ok(())
}

#[test]
fn cancellation_cannot_credit_a_nonpayer_or_overflow_an_outbox() -> Result<()> {
    let mut w = World::new()?;
    w.sent(ALICE, SDK, 100);
    for payer in [0, SDK, BOB, 16_777_216] {
        assert!(w.execute(SDK, "cancel_unclaimed_payment", &[payer]).is_err());
    }
    assert_eq!(w.info(SDK, ALICE), (0, 0));
    w.sent(SDK, ALICE, MAX - 99);
    assert!(w.execute(SDK, "cancel_unclaimed_payment", &[ALICE]).is_err());
    assert_eq!(w.info(SDK, ALICE), (MAX - 99, 0));
    Ok(())
}

#[test]
fn claimed_refunds_and_cancellations_share_one_payer_credit_limit() -> Result<()> {
    let mut w = World::new()?;
    w.sent(ALICE, SDK, 100);
    w.execute(SDK, "claim", &[ALICE])?;
    assert!(w.execute(SDK, "cancel_unclaimed_payment", &[ALICE]).is_err());
    assert!(w.execute(SDK, "refund_claimed_payment", &[BOB, 1]).is_err());
    w.execute(SDK, "refund_claimed_payment", &[ALICE, 40])?;
    assert!(w.execute(SDK, "refund_claimed_payment", &[ALICE, 61]).is_err());
    w.sent(ALICE, SDK, 150);
    w.execute(SDK, "cancel_unclaimed_payment", &[ALICE])?;
    assert_eq!(w.info(SDK, ALICE), (90, 150));
    w.execute(SDK, "refund_claimed_payment", &[ALICE, 60])?;
    assert_eq!(w.info(SDK, ALICE), (150, 150));
    assert_eq!(w.state.get_contract_slot(SDK, TOKEN, w.balance)?, 0);
    assert!(w.execute(SDK, "refund_claimed_payment", &[ALICE, 1]).is_err());
    Ok(())
}
