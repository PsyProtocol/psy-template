//! Opt-in finite fixture consumer of actual local VM bytecode. This is neither
//! a host-only arithmetic test nor a complete UPS or network acceptance test.
use super::*;
use super::finite_curve_fixture::{CurveFixtureBudget, CurveFixtureIdentity, FiniteCurveFixture, UNIT};

#[test]
#[ignore = "requires separately reviewed fresh selected Curve artifacts in BATCH_BUILD and exact compile-time fixture identities; no proving or network"]
fn finite_curve_config_drives_genesis_inventory_buy_and_fixed_target_graduation() -> Result<()> {
    let expected = CurveFixtureIdentity {
        market: M, vault: V, inventory_asset: A, quote_asset: B, issuer: I,
        graduation_target: fixture_integer(option_env!("BATCH_FIXTURE_TARGET"), 400),
    };
    let budget = CurveFixtureBudget {inventory_atoms: 100 * UNIT, quote_atoms: 100 * UNIT};
    let mut w = World::new_finite_curve(expected, budget)?;
    let terms = FiniteCurveFixture::from_selected_policy(&w.policy, expected, budget)?;
    let inventory = terms.initial_inventory()?;
    let purchase = terms.buy(0, terms.cap())?;
    let terminal = terms.graduation(terms.cap())?;

    // The constructor has returned both seeds to the issuer's Outboxes. They
    // are not part of the spendable inventory or the buyer's backing.
    ensure!(w.balance(I, A) == inventory && w.balance(I, B) == 0, "finite issuer balances");
    ensure!(w.balance(200, A) == 0 && w.balance(200, B) == purchase.quote_atoms, "finite buyer balances");
    ensure!(w.balance(V, A) == 0 && w.balance(V, B) == 0, "activation retained FT dust");
    let before = w.slots.clone();
    ensure!(w.pay(I, A, terms.genesis_inventory()?).is_err(), "unclaimed activation atom reused");
    ensure!(w.slots == before, "rejected seed reuse changed state");

    w.fee(I)?;
    w.pay(I, A, inventory)?;
    w.operation_maintenance("initialize", 0, 0, 0, 0, 0, 0)?;
    ensure!(w.balance(V, A) == inventory && w.balance(I, A) == 0, "fixed initialization inventory");
    w.run(200, M, "open_limit_buy", &args(&[V, terms.cap(), 0], &[purchase.quote_atoms], &[200, 1]))?;
    w.fee(200)?;
    w.pay(200, B, purchase.quote_atoms)?;
    w.commit(&[200])?;
    let buy = w.fields("settle_limit_buy_exact", 200, 0, purchase.quote_atoms, purchase.token_atoms, 0, terms.cap(), 1, 0);
    w.settle(vec![buy], [0; 4])?;
    w.run(200, A, "claim", &[V])?;
    ensure!(w.balance(200, A) == purchase.token_atoms, "ordinary buyer claim");
    ensure!(w.wide(V, "quote_reserve") == terminal.quote_atoms, "fixed backing");

    w.fee(I)?;
    let before = w.slots.clone();
    let wrong = if terminal.target == 400 {401} else {400};
    ensure!(w.run(V, M, "graduate", &args(&[wrong], &[terminal.quote_atoms, terminal.token_atoms], &[])).is_err(), "substituted graduation target accepted");
    ensure!(w.slots == before, "rejected recipient changed state");
    w.operation_maintenance("graduate", 0, 0, terminal.quote_atoms, terminal.token_atoms, 0, 0)?;
    ensure!(w.val(V, "phase", 0) == 2 && w.wide(V, "quote_reserve") == 0, "graduation state");
    ensure!(w.balance(V, A) == 0 && w.balance(V, B) == 0, "graduation retained assets");
    ensure!(w.balance(terminal.target, A) == 0 && w.balance(terminal.target, B) == 0, "target Outbox prematurely spendable");
    w.run(terminal.target, A, "claim", &[V])?;
    w.run(terminal.target, B, "claim", &[V])?;
    ensure!(w.balance(terminal.target, A) == terminal.token_atoms && w.balance(terminal.target, B) == terminal.quote_atoms, "fixed target ordinary claims");
    w.run(I, A, "claim", &[V])?;
    w.run(I, B, "claim", &[V])?;
    ensure!(w.balance(I, A) == 1 && w.balance(I, B) == 1, "activation seeds require separate ordinary claims");
    Ok(())
}
