import test from "node:test";
import assert from "node:assert/strict";
import { previewWithdrawal } from "../src/markets/liquidity.mjs";
const form = {
  pool: "2485",
  receiver: "12345",
  shares: "4611686018427387921",
  slippageBps: "50",
  feeCap: "5",
};
test("withdrawal uses raw LP units and complete dual Felt amounts without token decimal assumptions", () => {
  const p = previewWithdrawal(form);
  assert.deepEqual(p.burnedLimbs, ["17", "1"]);
  assert.equal(p.a, form.shares);
  assert.equal(p.minimumA, ((BigInt(form.shares) * 9950n) / 10000n).toString());
  assert.equal(p.financialAuthorization, false);
});
test("withdrawal rejects insufficient ownership, decimal LP input, dust, wrong identity and fee precision", () => {
  for (const change of [
    { shares: "10000000000000000001" },
    { shares: "1.0" },
    { shares: "1" },
    { shares: "0" },
    { receiver: "0" },
    { pool: "2469" },
    { feeCap: "0.0000000001" },
    { slippageBps: "0" },
  ])
    assert.throws(() => previewWithdrawal({ ...form, ...change }));
});
