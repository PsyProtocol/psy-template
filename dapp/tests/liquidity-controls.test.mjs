import test from "node:test";
import assert from "node:assert/strict";
import {
  matchDemoDeposit,
  rawShareFraction,
  EXAMPLE_LP_SHARES,
} from "../src/markets/liquidityControls.mjs";
import { MAX_AMOUNT } from "../../token/wide/arithmetic.mjs";
test("example deposit linking preserves two-limb precision and refuses arbitrary pool identities", () => {
  assert.equal(
    matchDemoDeposit("4.611686018427387921", "2485"),
    "4.611686018427387921",
  );
  assert.equal(matchDemoDeposit("", "2486"), "");
  assert.throws(() => matchDemoDeposit("1", "9999"));
  assert.throws(() => matchDemoDeposit("0.0000000000000000001", "2485"));
});
test("raw share shortcuts floor exact U124 integers without Number conversion", () => {
  assert.equal(rawShareFraction(EXAMPLE_LP_SHARES, 25), "2500000000000000000");
  assert.equal(
    rawShareFraction("4611686018427387921", 75),
    "3458764513820540940",
  );
  assert.equal(rawShareFraction(String(MAX_AMOUNT), 100), String(MAX_AMOUNT));
  for (const [n, p] of [
    ["1", 25],
    ["01", 50],
    ["1.5", 50],
    [String(MAX_AMOUNT + 1n), 100],
    ["100", 99],
  ])
    assert.throws(() => rawShareFraction(n, p));
});
