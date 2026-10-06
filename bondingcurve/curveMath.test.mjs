import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cumulativeCost, graduationAmounts, quoteBuy, quoteSell, validateCurve } from './curveMath.mjs';

const config = { maxLots: 10_000n, liquidityLots: 1_000n, lotSize: 1_000_000_000n,
  basePrice: 1_000_000_000n, stepPrice: 1_000n, thresholdLots: 8_000n };

test('buy and reverse sell use one cumulative reserve invariant', () => {
  let sold = 0n;
  let reserve = 0n;
  for (let round = 0; round < 200; round++) {
    const lots = BigInt(round % 7 + 1);
    const buy = quoteBuy(config, sold, lots);
    assert.equal(buy.cost, cumulativeCost(config, sold + lots) - cumulativeCost(config, sold));
    sold = buy.nextSold;
    reserve += buy.cost;
    assert.equal(reserve, cumulativeCost(config, sold));
    if (round % 3 === 0) {
      const sell = quoteSell(config, sold, lots);
      assert.equal(sell.payout, buy.cost);
      sold = sell.nextSold;
      reserve -= sell.payout;
      assert.equal(reserve, cumulativeCost(config, sold));
    }
  }
});

test('cap, bounded products, and graduation reserve are exact', () => {
  const full = quoteBuy(config, 0n, config.maxLots);
  assert.equal(full.nextReserve, cumulativeCost(config, config.maxLots));
  assert.throws(() => quoteBuy(config, config.maxLots, 1n), /lots/);
  assert.throws(() => quoteSell(config, 0n, 1n), /soldLots/);
  assert.deepEqual(graduationAmounts(config, 8_000n), {
    psyAmount: cumulativeCost(config, 8_000n), tokenAmount: 3_000n * config.lotSize,
  });
  assert.throws(() => graduationAmounts(config, 7_999n), /soldLots/);
  const worst = { maxLots: 1_000_000n, liquidityLots: 1_000_000n,
    lotSize: 1_000_000_000n, basePrice: 1_000_000_000n,
    stepPrice: 10_000n, thresholdLots: 1n };
  assert.ok(cumulativeCost(worst, worst.maxLots) < BigInt(Number.MAX_SAFE_INTEGER));
  assert.ok((worst.maxLots + worst.liquidityLots) * worst.lotSize < BigInt(Number.MAX_SAFE_INTEGER));
  assert.throws(() => validateCurve({ ...worst, stepPrice: 10_001n }), /stepPrice/);
});

test('JSON launch configuration uses exact integer quotes', () => {
  const json = JSON.parse(readFileSync(new URL('./launch.example.json', import.meta.url)));
  assert.equal(quoteBuy(json, 5, 2).cost, 2_000_011_000n);
  assert.throws(() => validateCurve({ ...json, basePrice: Number.MAX_SAFE_INTEGER + 1 }), /basePrice/);
});
