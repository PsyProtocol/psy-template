import test from "node:test";
import assert from "node:assert/strict";
import { previewLiquidity } from "../src/markets/liquidity.mjs";
import {
  MAX_AMOUNT,
  RADIX,
  decodeAmount,
} from "../../token/wide/arithmetic.mjs";
import { fullAmount } from "../src/markets/domain.mjs";
const form = {
  pool: "2485",
  amountA: "10",
  amountB: "10",
  receiver: "12345",
  slippageBps: "50",
  feeCap: "35.0035",
};
test("liquidity preview matches exact existing share arithmetic and stays non-authorizing", () => {
  const p = previewLiquidity(form);
  assert.equal(p.minted, "10000000000000000000");
  assert.equal(p.minimum, "9950000000000000000");
  assert.equal(p.financialAuthorization, false);
  assert.equal(p.source, "demo");
  assert.ok(Object.isFrozen(p));
  assert.equal(p.feeCap, "35003500000");
});
test("liquidity U124 limbs preserve both nonzero limbs", () => {
  const n = RADIX + 17n,
    p = previewLiquidity({
      ...form,
      amountA: fullAmount(n),
      amountB: fullAmount(n),
    });
  assert.deepEqual(p.aLimbs, ["17", "1"]);
  assert.equal(decodeAmount(p.mintedLimbs.map(BigInt)), n);
});
test("liquidity requires exact balanced deposits, not a min or silent excess refund", () => {
  assert.throws(
    () => previewLiquidity({ ...form, amountB: "9.999999999999999999" }),
    /ratio exactly/,
  );
});
test("liquidity rejects unsupported pool, owner, fee, precision and extra fields", () => {
  for (const patch of [
    { pool: "2469" },
    { receiver: "0" },
    { receiver: "16777216" },
    { amountA: "0" },
    { amountB: "-1" },
    { amountA: "1.0000000000000000001" },
    { feeCap: "51" },
    { feeCap: "0.0000000001" },
    { slippageBps: "10000" },
    { nonce: "1" },
  ])
    assert.throws(() => previewLiquidity({ ...form, ...patch }));
});
test("liquidity checks resulting reserve/share overflow and dust minimum", () => {
  assert.throws(
    () =>
      previewLiquidity({
        ...form,
        amountA: fullAmount(MAX_AMOUNT),
        amountB: fullAmount(MAX_AMOUNT),
      }),
    /exceeds U124/,
  );
  assert.throws(
    () =>
      previewLiquidity({
        ...form,
        amountA: "0.000000000000000001",
        amountB: "0.000000000000000001",
      }),
    /minimum LP/,
  );
});
