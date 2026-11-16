//! Finite selected-order Curve fixture terms, independent of proving/runtime.
//! Supplied budgets and identities are review inputs, not authenticated balances,
//! registrations, compiled-code identities, network receipts or live authority.
use anyhow::{ensure, Context, Result};
use serde_json::Value;

pub const UNIT: u128 = 1_000_000_000_000_000_000;
pub const U124_MAX: u128 = (1u128 << 124) - 1;
const USER_LIMIT: u64 = 1 << 24;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CurveFixtureIdentity {
    pub market: u64,
    pub vault: u64,
    pub inventory_asset: u64,
    pub quote_asset: u64,
    pub issuer: u64,
    pub graduation_target: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CurveFixtureBudget {
    pub inventory_atoms: u128,
    pub quote_atoms: u128,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CurveFixtureQuote {
    pub quote_atoms: u128,
    pub token_atoms: u128,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CurveFixtureGraduation {
    pub target: u64,
    pub quote_atoms: u128,
    pub token_atoms: u128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FiniteCurveFixture {
    identity: CurveFixtureIdentity,
    cap: u64,
    liquidity: u64,
    threshold: u64,
    unit: u128,
    base: u128,
    step: u128,
}

fn amount(value: Option<u128>, label: &str) -> Result<u128> {
    let value = value.with_context(|| format!("{label} integer overflow"))?;
    ensure!(value <= U124_MAX, "{label} exceeds U124");
    Ok(value)
}

fn decimal(config: &Value, name: &str) -> Result<u128> {
    let text = config[name].as_str().with_context(|| format!("decimal string required: {name}"))?;
    ensure!(!text.is_empty() && text.bytes().all(|b| b.is_ascii_digit()), "invalid decimal {name}");
    let value = amount(Some(text.parse::<u128>()?), name)?;
    ensure!(value > 0, "positive {name} required");
    Ok(value)
}

fn lot_count(config: &Value, name: &str) -> Result<u64> {
    let n = config[name].as_u64().with_context(|| format!("integer {name} required"))?;
    ensure!((1..=1_000_000).contains(&n), "invalid {name}");
    Ok(n)
}

impl FiniteCurveFixture {
    pub fn from_selected_policy(
        policy: &Value,
        expected: CurveFixtureIdentity,
        budget: CurveFixtureBudget,
    ) -> Result<Self> {
        ensure!(policy["version"].as_u64() == Some(2), "selected v2 Curve policy required");
        ensure!(policy["market"].as_str() == Some("bondingcurve"), "Curve market required");
        ensure!(policy["market_id"].as_u64() == Some(expected.market), "reviewed market changed");
        ensure!(policy["execution_scope"].as_str() == Some("explicit-selected-orders-v1"), "selected orders required");
        ensure!(policy["native_protocol"].as_str() == Some("mainnet-beta-20261027"), "current Native ABI required");
        ensure!(policy["sdk_commit"].as_str() == Some("01b8f2b0a077367a7b9879baba1a72aea8ab5510"), "frozen SDK required");
        ensure!(policy["client_commit"].as_str() == Some("7058070057c3242b5d8b29e1a31d498aaa4202c0"), "frozen client required");
        ensure!(policy["whole_market_completeness"].as_bool() == Some(false)
            && policy["qualified_randomness"].as_bool() == Some(false), "finite deterministic scope required");
        let anchor = policy["chain_root_at1"].as_str().context("chain anchor required")?;
        ensure!(anchor.len() == 64 && anchor.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            && anchor.bytes().any(|b| b != b'0'), "canonical nonzero chain anchor required");
        Self::from_config(&policy["config"], expected, budget)
    }

    pub fn from_config(config: &Value, expected: CurveFixtureIdentity, budget: CurveFixtureBudget) -> Result<Self> {
        ensure!(config.is_object(), "fixed Curve configuration required");
        ensure!(config["networkMagic"].as_str() == Some("1384803358401154921"), "selected network domain required");
        ensure!(config["bootstrap"].is_null(), "AMM bootstrap is a separate fixture");
        ensure!(config["ordering"].is_null() || config["ordering"].as_str() == Some("deterministic"), "deterministic only");
        for key in ["seed", "randomSeed", "randomSource", "randomness", "randomnessProof", "randomSeedProof",
            "beacon", "beaconProof", "drawCheckpoint", "randomRound", "randomOrdering", "seedCommitment"] {
            ensure!(config.get(key).is_none(), "random source is outside this fixture: {key}");
        }
        for user in [expected.vault, expected.issuer, expected.graduation_target] {
            ensure!(user > 0 && user < USER_LIMIT, "reviewed user ID out of range");
        }
        ensure!(expected.issuer != expected.graduation_target && expected.vault != expected.issuer
            && expected.vault != expected.graduation_target, "distinct vault, issuer and graduation target required");
        for contract in [expected.market, expected.inventory_asset, expected.quote_asset] {
            ensure!(contract >= 5 && contract < USER_LIMIT, "reviewed contract ID out of range");
        }
        ensure!(expected.market != expected.inventory_asset && expected.market != expected.quote_asset
            && expected.inventory_asset != expected.quote_asset, "distinct market and assets required");
        for (name, id) in [("assetA", expected.inventory_asset), ("assetB", expected.quote_asset),
            ("issuer", expected.issuer), ("target", expected.graduation_target)] {
            ensure!(config[name].as_u64() == Some(id), "reviewed Curve identity changed: {name}");
        }
        let result = Self {identity: expected, cap: lot_count(config, "cap")?, liquidity: lot_count(config, "liquidity")?,
            threshold: lot_count(config, "threshold")?, unit: decimal(config, "unit")?,
            base: decimal(config, "base")?, step: decimal(config, "step")?};
        ensure!(result.threshold <= result.cap, "threshold exceeds sale cap");
        amount(Some(budget.inventory_atoms), "inventory budget")?;
        amount(Some(budget.quote_atoms), "quote budget")?;
        // Reserve one transient activation atom separately from inventory. A
        // seed returned to an Outbox is not spendable until its ordinary claim.
        let initialization = result.initial_inventory()?;
        ensure!(amount(initialization.checked_add(1), "inventory plus activation seed")? <= budget.inventory_atoms,
            "finite inventory budget exceeded");
        ensure!(result.cumulative(result.cap)? <= budget.quote_atoms, "finite full-curve quote budget exceeded");
        Ok(result)
    }

    pub fn identity(&self) -> CurveFixtureIdentity { self.identity }
    pub fn cap(&self) -> u64 { self.cap }
    pub fn threshold(&self) -> u64 { self.threshold }

    pub fn initial_inventory(&self) -> Result<u128> {
        amount(u128::from(self.cap + self.liquidity).checked_mul(self.unit), "fixed inventory")
    }

    pub fn cumulative(&self, sold: u64) -> Result<u128> {
        ensure!(sold <= self.cap, "sold lots exceed cap");
        let n = u128::from(sold);
        let triangle = n.checked_mul(n.saturating_sub(1)).context("lot series overflow")? / 2;
        let base = amount(self.base.checked_mul(n), "base cost")?;
        let step = amount(self.step.checked_mul(triangle), "step cost")?;
        amount(base.checked_add(step), "cumulative cost")
    }

    pub fn buy(&self, sold: u64, lots: u64) -> Result<CurveFixtureQuote> {
        ensure!(lots > 0 && sold <= self.cap && lots <= self.cap - sold, "buy lot capacity");
        Ok(CurveFixtureQuote {quote_atoms: self.cumulative(sold + lots)? - self.cumulative(sold)?,
            token_atoms: amount(u128::from(lots).checked_mul(self.unit), "buy token amount")?})
    }

    pub fn sell(&self, sold: u64, lots: u64) -> Result<CurveFixtureQuote> {
        ensure!(lots > 0 && sold <= self.cap && lots <= sold, "sell lot capacity");
        Ok(CurveFixtureQuote {quote_atoms: self.cumulative(sold)? - self.cumulative(sold - lots)?,
            token_atoms: amount(u128::from(lots).checked_mul(self.unit), "sell token amount")?})
    }

    pub fn limit_buy_change(&self, sold: u64, lots: u64, original_limit: u128) -> Result<(CurveFixtureQuote, u128)> {
        amount(Some(original_limit), "original buy limit")?;
        let quote = self.buy(sold, lots)?;
        ensure!(quote.quote_atoms <= original_limit, "buy limit is not executable");
        Ok((quote, original_limit - quote.quote_atoms))
    }

    pub fn graduation(&self, sold: u64) -> Result<CurveFixtureGraduation> {
        ensure!(sold >= self.threshold && sold <= self.cap, "graduation threshold");
        Ok(CurveFixtureGraduation {target: self.identity.graduation_target, quote_atoms: self.cumulative(sold)?,
            token_atoms: amount(u128::from(self.cap + self.liquidity - sold).checked_mul(self.unit), "graduation inventory")?})
    }
}
