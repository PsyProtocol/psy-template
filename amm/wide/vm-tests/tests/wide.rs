//! Independent u128 oracle versus the actual compiled candidate VM.
use anyhow::{bail, Result};
use psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64;
use psy_vm::dpn::{eval::executor::{ExecutionContext, InMemoryStateBackend, StateBackend, VmExecutor}, vm::def::DPNFunctionCircuitDefinition};
use serde_json::Value;
use std::{collections::HashMap, fs, path::PathBuf};

const CONTRACT: u64 = 2000;
const POOL: u64 = 100;
const PAYER: u64 = 200;
const CAP: u64 = 1_000_000_000_000;
const ESCROW: u64 = 1_000_100_000;
struct World {
    state: InMemoryStateBackend,
    fields: HashMap<String, u64>,
    methods: HashMap<String, DPNFunctionCircuitDefinition>,
}
impl World {
    fn new() -> Result<Self> {
        let path = std::env::var("AMM_WIDE_ARTIFACT").map(PathBuf::from).unwrap_or_else(|_|
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../verification-2026-10-11/compiled-final/compilation_artifact.json"));
        let a: Value = serde_json::from_slice(&fs::read(path)?)?;
        let fields = a["abi"]["contract"]["state"].as_array().unwrap().iter()
            .map(|f| (f["name"].as_str().unwrap().into(), f["offset"].as_u64().unwrap())).collect();
        let definitions: Vec<DPNFunctionCircuitDefinition> = serde_json::from_value(a["circuit_definitions"].clone())?;
        Ok(Self {state: InMemoryStateBackend::new(), fields, methods: definitions.into_iter().map(|d| (d.name.clone(), d)).collect()})
    }
    fn set(&mut self, user: u64, field: &str, index: u64, value: u64) {
        self.state.set_slot(user, CONTRACT, self.fields[field] + index, value);
    }
    fn get(&self, field: &str, index: u64) -> u64 {
        self.state.get_contract_slot(POOL, CONTRACT, self.fields[field] + index).unwrap()
    }
    fn sent(&mut self, asset: u64, value: u64) {
        self.state.set_slot(PAYER, asset, 3 + 2 * POOL, value);
    }
    fn execute(&mut self, user: u64, name: &str, inputs: &[u64]) -> Result<()> {
        let mut vm = VmExecutor::new(self.state.clone());
        let result = vm.execute(&self.methods[name], &ExecutionContext {user_id: user, contract_id: CONTRACT,
            caller_contract_id: DEFAULT_CALLER_CONTRACT_ID_U64, checkpoint_id: 100,
            nonce: 1, user_public_key_hash: [0; 4]}, inputs)?;
        if !result.success {bail!("{}", result.failure.unwrap().message);}
        self.state.apply_overlay(vm.write_overlay());
        self.state.apply_imt_overlay(vm.imt_write_overlay());
        Ok(())
    }
    fn swap_fixture(rp: u64, ru: u64, asset: u64, input: u64) -> Result<Self> {
        let mut w = Self::new()?;
        w.set(POOL, "reserve_psy", 0, rp);
        w.set(POOL, "reserve_usdt", 0, ru);
        w.execute(PAYER, "open_swap", &[POOL, asset, input, 1, 200, 1])?;
        w.sent(0, ESCROW + if asset == 0 {input} else {0});
        if asset == 4 {w.sent(4, input);}
        Ok(w)
    }
}
fn quote(ri: u64, ro: u64, input: u64) -> u64 {
    (u128::from(input) * 9970 * u128::from(ro) / (u128::from(ri) * 10000 + u128::from(input) * 9970)) as u64
}
fn sqrt(n: u128) -> u64 {
    let (mut lo, mut hi) = (0u128, u128::from(CAP) + 1);
    while lo + 1 < hi {let m = (lo+hi)/2; if m*m <= n {lo=m;} else {hi=m;}}
    lo as u64
}
#[test]
fn large_swap_exact_floor_both_directions_and_off_by_one_rejected() -> Result<()> {
    for asset in [0,4] {
        for (ri,ro,input) in [(900_000_000_000,800_000_000_000,100_000_000_000), (123_456_789_012,876_543_210_987,98_765_432_109), (CAP-1, CAP, 1)] {
            let out=quote(ri,ro,input);
            if out == 0 {continue;}
            let (rp,ru)=if asset==0 {(ri,ro)} else {(ro,ri)};
            for wrong in [out-1,out+1] {
                let mut w=World::swap_fixture(rp,ru,asset,input)?;
                assert!(w.execute(POOL,"swap", &[PAYER,asset,input,wrong,1]).is_err());
                assert_eq!((w.get("reserve_psy",0),w.get("reserve_usdt",0),w.get("consumed_nonce",PAYER)),(rp,ru,0));
            }
            let mut w=World::swap_fixture(rp,ru,asset,input)?;
            w.execute(POOL,"swap", &[PAYER,asset,input,out,1])?;
            let expected=if asset==0 {(ri+input,ro-out)} else {(ro-out,ri+input)};
            assert_eq!((w.get("reserve_psy",0),w.get("reserve_usdt",0)),expected);
            assert!(u128::from(expected.0)*u128::from(expected.1) >= u128::from(rp)*u128::from(ru));
            assert!(w.execute(POOL,"swap", &[PAYER,asset,input,out,1]).is_err());
        }
    }
    Ok(())
}
#[test]
fn initial_lp_square_root_and_large_followup_deposit_and_withdrawal() -> Result<()> {
    for (a,b) in [(900_000_000_000,400_000_000_000),(CAP,CAP),(800_000_000_001,799_999_999_999)] {
        let gross=sqrt(u128::from(a)*u128::from(b));
        let minted=gross-1000;
        let mut w=World::new()?;
        w.execute(PAYER,"open_add", &[POOL,a,b,1,200,1])?;
        w.sent(0,a+ESCROW); w.sent(4,b);
        assert!(w.execute(POOL,"add_liquidity", &[PAYER,a,b,minted+1,1]).is_err());
        assert!(w.execute(POOL,"add_liquidity", &[PAYER,a,b,minted-1,1]).is_err());
        w.execute(POOL,"add_liquidity", &[PAYER,a,b,minted,1])?;
        assert_eq!(w.get("total_shares",0),gross);
        assert_eq!(w.get("shares",PAYER),minted);
        w.execute(PAYER,"close_add", &[])?;
        let burned=minted/2;
        w.execute(PAYER,"open_remove", &[POOL,burned,1,1,200,2])?;
        w.sent(0,a+2*ESCROW);
        let (outp,outu)=((u128::from(burned)*u128::from(a)/u128::from(gross)) as u64,(u128::from(burned)*u128::from(b)/u128::from(gross)) as u64);
        assert!(w.execute(POOL,"remove_liquidity", &[PAYER,burned,outp+1,outu,2]).is_err());
        assert!(w.execute(POOL,"remove_liquidity", &[PAYER,burned,outp,outu-1,2]).is_err());
        w.execute(POOL,"remove_liquidity", &[PAYER,burned,outp,outu,2])?;
        assert_eq!((w.get("reserve_psy",0),w.get("reserve_usdt",0),w.get("total_shares",0)),(a-outp,b-outu,gross-burned));
    }
    let mut w=World::new()?;
    w.set(POOL,"reserve_psy",0,400_000_000_000); w.set(POOL,"reserve_usdt",0,200_000_000_000);
    w.set(POOL,"total_shares",0,300_000_000_000);
    w.execute(PAYER,"open_add", &[POOL,200_000_000_000,100_000_000_000,1,200,1])?;
    w.sent(0,200_000_000_000+ESCROW); w.sent(4,100_000_000_000);
    assert!(w.execute(POOL,"add_liquidity", &[PAYER,200_000_000_000,100_000_000_000,150_000_000_001,1]).is_err());
    w.execute(POOL,"add_liquidity", &[PAYER,200_000_000_000,100_000_000_000,150_000_000_000,1])?;
    assert_eq!((w.get("total_shares",0),w.get("reserve_psy",0),w.get("reserve_usdt",0)),(450_000_000_000,600_000_000_000,300_000_000_000));
    Ok(())
}
#[test]
fn malformed_reserve_cap_payment_and_payer_rejected() -> Result<()> {
    let input=10_000_000_000;
    let mut w=World::swap_fixture(CAP,CAP,0,input)?;
    assert!(w.execute(POOL,"swap", &[PAYER,0,input,quote(CAP,CAP,input),1]).is_err());
    for malformed in [CAP+1,18_446_744_069_414_584_320] {
        let mut w=World::new()?;
        w.set(POOL,"reserve_psy",0,malformed);
        w.execute(PAYER,"open_add", &[POOL,10_000,10_000,1,200,1])?;
        w.sent(0,10_000+ESCROW);w.sent(4,10_000);
        assert!(w.execute(POOL,"add_liquidity", &[PAYER,10_000,10_000,9_000,1]).is_err());
    }
    let mut w=World::swap_fixture(500_000_000_000,500_000_000_000,0,input)?;
    let out=quote(500_000_000_000,500_000_000_000,input);
    assert!(w.execute(POOL,"swap", &[PAYER+1,0,input,out,1]).is_err());
    w.sent(0,input+ESCROW+1);
    assert!(w.execute(POOL,"swap", &[PAYER,0,input,out,1]).is_err());
    assert!(w.execute(PAYER,"open_swap", &[POOL,0,CAP+1,1,200,2]).is_err());
    assert_eq!(w.get("consumed_nonce",PAYER),0);
    Ok(())
}
#[test]
fn deterministic_random_swaps_match_u128_oracle() -> Result<()> {
    let mut seed=0xd541_ef82_9031_6a2fu64;
    fn next(s: &mut u64) -> u64 {*s=s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);*s}
    for i in 0..128 {
        let ri=1_000_000+next(&mut seed)%(CAP/2);
        let ro=1_000_000+next(&mut seed)%(CAP/2);
        let input=1_000_000+next(&mut seed)%(CAP-ri-1_000_000);
        let out=quote(ri,ro,input);
        let asset=if i%2==0 {0} else {4};
        let (rp,ru)=if asset==0 {(ri,ro)} else {(ro,ri)};
        let mut w=World::swap_fixture(rp,ru,asset,input)?;
        w.execute(POOL,"swap", &[PAYER,asset,input,out,1])?;
        let mut bad=World::swap_fixture(rp,ru,asset,input)?;
        assert!(bad.execute(POOL,"swap", &[PAYER,asset,input,out+1,1]).is_err());
    }
    Ok(())
}
