//! Source-only finite fixture checks. This test does not construct a World,
//! circuit, signature, complete UPS, network request or financial operation.
#[path = "support/finite_curve_fixture.rs"]
mod finite_curve_fixture;
use anyhow::Result;
use finite_curve_fixture::{CurveFixtureBudget, CurveFixtureIdentity, FiniteCurveFixture, UNIT, U124_MAX};
use serde_json::{json, Value};

fn identity() -> CurveFixtureIdentity {
    // Synthetic IDs, not an approval to reuse an AMM vault or real QA assets.
    CurveFixtureIdentity {market: 1000, vault: 100, inventory_asset: 60, quote_asset: 61,
        issuer: 5, graduation_target: 400}
}
fn config() -> Value {
    json!({"assetA":60,"assetB":61,"issuer":5,"target":400,"cap":10,"liquidity":10,"threshold":10,
        "unit":UNIT.to_string(),"base":UNIT.to_string(),"step":"100000000000000","networkMagic":"1384803358401154921"})
}
fn budget() -> CurveFixtureBudget { CurveFixtureBudget {inventory_atoms: 100 * UNIT, quote_atoms: 100 * UNIT} }
fn fixture() -> Result<FiniteCurveFixture> { FiniteCurveFixture::from_config(&config(), identity(), budget()) }
fn policy() -> Value {
    json!({"version":2,"market":"bondingcurve","market_id":1000,"config":config(),
        "execution_scope":"explicit-selected-orders-v1","whole_market_completeness":false,"qualified_randomness":false,
        "native_protocol":"mainnet-beta-20261027","sdk_commit":"01b8f2b0a077367a7b9879baba1a72aea8ab5510",
        "client_commit":"7058070057c3242b5d8b29e1a31d498aaa4202c0","chain_root_at1":"1".repeat(64)})
}

#[test]
fn ten_sale_and_ten_liquidity_lots_fit_finite_inventory_without_claiming_seed_reuse() -> Result<()> {
    let c = fixture()?;
    assert_eq!(c.identity(), identity()); assert_eq!(c.cap(), 10); assert_eq!(c.threshold(), 10);
    assert_eq!(c.initial_inventory()?, 20 * UNIT);
    assert_eq!(c.cumulative(10)?, 10 * UNIT + 4_500_000_000_000_000);
    assert!(c.initial_inventory()? + 1 <= budget().inventory_atoms);
    assert!(FiniteCurveFixture::from_config(&config(), identity(), CurveFixtureBudget {
        inventory_atoms: 20 * UNIT, ..budget()}).is_err());
    assert!(FiniteCurveFixture::from_config(&config(), identity(), CurveFixtureBudget {
        quote_atoms: c.cumulative(10)? - 1, ..budget()}).is_err());
    let mut old = config(); old["cap"] = json!(1_000_000); old["liquidity"] = json!(1_000_000);
    assert!(FiniteCurveFixture::from_config(&old, identity(), budget()).is_err());
    Ok(())
}

#[test]
fn exact_prices_match_independent_per_lot_sum_and_reverse_sells() -> Result<()> {
    let c = fixture()?;
    for sold in 0..10 {
        for lots in 1..=10 - sold {
            let q = c.buy(sold, lots)?;
            let sum: u128 = (sold..sold + lots).map(|lot| UNIT + u128::from(lot) * 100_000_000_000_000).sum();
            assert_eq!(q.quote_atoms, sum); assert_eq!(q.token_atoms, u128::from(lots) * UNIT);
            assert_eq!(c.sell(sold + lots, lots)?, q);
        }
    }
    let (first, change) = c.limit_buy_change(0, 1, 2 * UNIT)?;
    assert_eq!(first.quote_atoms + change, 2 * UNIT);
    assert_eq!(c.buy(0, 1)?.quote_atoms + c.buy(1, 1)?.quote_atoms, c.cumulative(2)?);
    assert!(c.limit_buy_change(0, 1, UNIT - 1).is_err());
    for (sold, lots) in [(0, 0), (10, 1), (11, 1), (u64::MAX, 1), (0, u64::MAX)] { assert!(c.buy(sold, lots).is_err()); }
    assert!(c.sell(0, 1).is_err()); assert!(c.sell(11, 1).is_err());
    Ok(())
}

#[test]
fn graduation_returns_original_backing_and_all_remaining_inventory_to_fixed_target() -> Result<()> {
    let c = fixture()?;
    assert!(c.graduation(9).is_err()); assert!(c.graduation(11).is_err());
    let terminal = c.graduation(10)?;
    assert_eq!(terminal.target, 400); assert_eq!(terminal.quote_atoms, c.cumulative(10)?);
    assert_eq!(terminal.token_atoms, 10 * UNIT);
    let mut early = config(); early["threshold"] = json!(8);
    let early = FiniteCurveFixture::from_config(&early, identity(), budget())?;
    let graduation = early.graduation(8)?;
    assert_eq!(graduation.token_atoms, 12 * UNIT);
    assert_eq!(graduation.quote_atoms, early.buy(0, 8)?.quote_atoms);
    assert_eq!(graduation.token_atoms + early.buy(0, 8)?.token_atoms, early.initial_inventory()?);
    Ok(())
}

#[test]
fn invalid_or_substituted_fixed_terms_fail_with_checked_u124_arithmetic() {
    for (field, value) in [("assetA", json!(61)), ("issuer", json!(6)), ("target", json!(401)),
        ("threshold", json!(11)), ("unit", json!(1)), ("unit", json!(U124_MAX.to_string())),
        ("base", json!(U124_MAX.to_string())), ("step", json!(U124_MAX.to_string())),
        ("step", json!("0")), ("base", json!("+1")), ("base", json!("1e18")),
        ("networkMagic", json!("1")), ("bootstrap", json!({})), ("seed", Value::Null)] {
        let mut changed = config(); changed[field] = value;
        assert!(FiniteCurveFixture::from_config(&changed, identity(), budget()).is_err(), "accepted {field}");
    }
    for changed in [CurveFixtureIdentity {vault: 5, ..identity()}, CurveFixtureIdentity {vault: 400, ..identity()},
        CurveFixtureIdentity {market: 60, ..identity()}, CurveFixtureIdentity {graduation_target: 1 << 24, ..identity()}] {
        assert!(FiniteCurveFixture::from_config(&config(), changed, budget()).is_err());
    }
}

#[test]
fn selected_policy_pins_frozen_release_scope_and_reviewed_identity() -> Result<()> {
    assert_eq!(FiniteCurveFixture::from_selected_policy(&policy(), identity(), budget())?, fixture()?);
    for (field, value) in [("version", json!(18)), ("market", json!("amm")), ("market_id", json!(1001)),
        ("execution_scope", json!("source-covered-authorized-exit-v1")), ("whole_market_completeness", json!(true)),
        ("qualified_randomness", json!(true)), ("native_protocol", json!("legacy-v1")),
        ("sdk_commit", json!("old")), ("client_commit", json!("old")), ("chain_root_at1", json!("0".repeat(64)))] {
        let mut changed = policy(); changed[field] = value;
        assert!(FiniteCurveFixture::from_selected_policy(&changed, identity(), budget()).is_err(), "accepted {field}");
    }
    Ok(())
}
