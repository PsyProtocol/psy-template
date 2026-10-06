//! Execute the compiled cancellation guard; no real keys or chain writes.
use anyhow::{bail, Result};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{eval::executor::{ExecutionContext, InMemoryStateBackend, StateBackend, VmExecutor}, vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
use std::{collections::HashMap, fs, path::PathBuf};

const CONTRACT: u64 = 1759;
const POOL: u64 = 100;
const PAYER: u64 = 200;
const ESCROW: u64 = 1_000_100_000;

struct World {
    state: InMemoryStateBackend,
    fields: HashMap<String, u64>,
    cancel: DPNFunctionCircuitDefinition,
    checkpoint: u64,
}
impl World {
    fn new() -> Result<Self> {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../contract/target-pusdt-verified/compilation_artifact.json");
        let a: Value = serde_json::from_slice(&fs::read(path)?)?;
        let fields: HashMap<String, u64> = a["abi"]["contract"]["state"].as_array().unwrap().iter()
            .map(|f| (f["name"].as_str().unwrap().into(), f["offset"].as_u64().unwrap())).collect();
        let methods: Vec<DPNFunctionCircuitDefinition> = serde_json::from_value(a["circuit_definitions"].clone())?;
        let mut w = Self {state: InMemoryStateBackend::new(), fields, cancel: methods.into_iter().find(|d| d.name == "cancel_remove").unwrap(), checkpoint: 101};
        for (name, value) in [("order_kind", 3), ("order_pool_user", POOL), ("order_nonce", 7), ("order_deadline", 100)] {
            w.set(PAYER, name, 0, value);
        }
        w.set(POOL, "shares", PAYER, 29_000);
        w.set(POOL, "total_shares", 0, 30_000);
        w.set(POOL, "reserve_psy", 0, 300_000);
        w.set(POOL, "reserve_usdt", 0, 3_000);
        w.state.set_slot(PAYER, 0, 3 + 2 * POOL, ESCROW);
        Ok(w)
    }
    fn set(&mut self, user: u64, field: &str, index: u64, value: u64) {
        self.state.set_slot(user, CONTRACT, self.fields[field] + index, value);
    }
    fn get(&self, field: &str, index: u64) -> u64 {
        self.state.get_contract_slot(POOL, CONTRACT, self.fields[field] + index).unwrap()
    }
    fn execute(&mut self, payer: u64, nonce: u64) -> Result<()> {
        let mut vm = VmExecutor::new(self.state.clone());
        let result = vm.execute(&self.cancel, &ExecutionContext {user_id: POOL, contract_id: CONTRACT,
            caller_contract_id: DEFAULT_CALLER_CONTRACT_ID_U64, checkpoint_id: self.checkpoint,
            nonce: 1, user_public_key_hash: [0; 4]}, &[payer, nonce])?;
        if !result.success {bail!("{}", result.failure.unwrap().message);}
        self.state.apply_overlay(vm.write_overlay());
        self.state.apply_imt_overlay(vm.imt_write_overlay());
        Ok(())
    }
}

#[test]
fn cancellation_consumes_only_the_exact_payer_fee_and_nonce() -> Result<()> {
    let mut w = World::new()?;
    w.execute(PAYER, 7)?;
    assert_eq!(w.get("settled_psy_sent", PAYER), ESCROW);
    assert_eq!(w.get("consumed_nonce", PAYER), 7);
    assert_eq!((w.get("shares", PAYER), w.get("total_shares", 0), w.get("reserve_psy", 0), w.get("reserve_usdt", 0)), (29_000, 30_000, 300_000, 3_000));
    assert!(w.execute(PAYER, 7).unwrap_err().to_string().contains("order already used"));
    Ok(())
}

#[test]
fn cancellation_rejects_live_orders_other_users_and_wrong_fees() -> Result<()> {
    let mut w = World::new()?;
    w.checkpoint = 100;
    assert!(w.execute(PAYER, 7).unwrap_err().to_string().contains("not expired"));
    w.checkpoint = 101;
    assert!(w.execute(300, 7).is_err());
    assert!(w.execute(PAYER, 8).is_err());
    w.state.set_slot(PAYER, 0, 3 + 2 * POOL, ESCROW - 1);
    assert!(w.execute(PAYER, 7).unwrap_err().to_string().contains("fee escrow mismatch"));
    assert_eq!(w.get("consumed_nonce", PAYER), 0);
    assert_eq!(w.get("settled_psy_sent", PAYER), 0);
    assert_eq!(w.get("shares", PAYER), 29_000);
    Ok(())
}
