import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  previewDraft,
  makeDemoOrder,
  demoAction,
  remainingAsset,
  remainingUnits,
  seedOrders,
  hydrateOrders,
  serializeOrders,
  fullAmount,
  displayAmount,
  submitLive,
  LIVE_GATE,
  pendingTotals,
} from "../src/markets/domain.mjs";
import { MAX_AMOUNT, parseUnits } from "../../token/wide/arithmetic.mjs";
import { swapQuote } from "../../amm/u124/client.mjs";
const now = 1793000000000;
const form = {
  mode: "single",
  sell: "A",
  amount: "4.611686018427387921",
  receiver: "1717440",
  slippageBps: "50",
  deadlineMinutes: "30",
  feeCap: "35.0035",
};
const made = (patch = {}) =>
  makeDemoOrder(previewDraft({ ...form, ...patch }, now), []);
const advance = (o) => demoAction(o, "advance", now + 1000);
test("local IDs cannot roll beyond persisted identity bounds", () => {
  const old = {
    ...made(),
    id: "DEMO-99999999",
    requestIdentity: "LOCAL-DEMO-99999999",
  };
  assert.throws(
    () => makeDemoOrder(previewDraft(form, now), [old]),
    /identifiers exhausted/,
  );
});
test("aggregated demo refunds report U124 overflow instead of crashing asset view", () => {
  const amount = MAX_AMOUNT - 1000n * 10n ** 18n;
  const a = advance(
    demoAction(made({ amount: fullAmount(amount) }), "cancel", now),
  );
  const b = { ...a, id: "DEMO-0002", requestIdentity: "LOCAL-DEMO-0002" };
  assert.equal(pendingTotals([a, b]).A.withinU124, false);
  assert.equal(BigInt(pendingTotals([a, b]).A.amount), 2n * amount);
});

test("full U124 input uses existing limbs/AMM arithmetic and PSY has separate 9 decimals", () => {
  const p = previewDraft(form, now);
  assert.deepEqual(p.inputLimbs, ["17", "1"]);
  const input = (1n << 62n) + 17n,
    reserve = 1000n * 10n ** 18n;
  assert.equal(BigInt(p.outputUnits), swapQuote(input, reserve, reserve));
  assert.equal(
    BigInt(p.minimumUnits),
    (BigInt(p.outputUnits) * 9950n) / 10000n,
  );
  assert.equal(p.feeCapUnits, "35003500000");
  assert.equal(fullAmount(p.inputUnits), form.amount);
  assert.equal(p.financialAuthorization, false);
  assert.equal(p.source, "demo");
  assert.equal(parseUnits(fullAmount(MAX_AMOUNT), 18), MAX_AMOUNT);
});
test("nonzero dust is never displayed as a zero output", () => {
  assert.equal(displayAmount("1"), "< 0.000001");
  assert.equal(displayAmount("0"), "0");
  assert.equal(displayAmount("17"), "< 0.000001");
  assert.throws(() => displayAmount("1", 18, -1));
});
test("wrong amount, identity, asset/path, decimals, fee, extra args and overflow reject", () => {
  for (const patch of [
    { amount: "0" },
    { amount: "1e18" },
    { amount: "-1" },
    { amount: "NaN" },
    { amount: "0.0000000000000000001" },
    { receiver: "16777216" },
    { receiver: "0" },
    { receiver: "1.1" },
    { receiver: "0x123" },
    { sell: "USDT" },
    { mode: "other" },
    { slippageBps: "5000" },
    { feeCap: "1.0000000001" },
    { feeCap: "51" },
    { decimals: 6 },
    { amount: fullAmount(MAX_AMOUNT) },
  ])
    assert.throws(
      () => previewDraft({ ...form, ...patch }, now),
      JSON.stringify(patch),
    );
});
test("preview tampering and changed persisted quantities/dependencies cannot be silently restored", () => {
  const p = previewDraft(form, now);
  assert.throws(() => makeDemoOrder({ ...p, outputUnits: "999" }, []));
  for (const patch of [
    { inputLimbs: ["0", "1"] },
    { outputUnits: "999" },
    { minimumUnits: "1" },
    { sdkReference: "b".repeat(64) },
    { network: "wrong" },
    { buy: "A" },
    { completedHops: 1 },
  ]) {
    const o = { ...made(), ...patch };
    assert.throws(() => hydrateOrders(serializeOrders([o])));
  }
  assert.throws(() => hydrateOrders(serializeOrders([made(), made()])));
  assert.throws(() =>
    hydrateOrders('{"schema":1,"source":"live","orders":[]}'),
  );
});
test("two-hop route cannot consume middle Outbox; first claim and second admission are explicit", () => {
  let o = made({ mode: "double" });
  for (let i = 0; i < 4; i++) o = advance(o);
  assert.equal(o.stage, "middle_outbox");
  assert.equal(o.completedHops, 1);
  assert.throws(() => advance(o), /claim/);
  assert.throws(() => demoAction(o, "claim", now), /No claimable/);
  o = demoAction(o, "claim_middle", now);
  assert.equal(o.stage, "middle_claimed");
  o = advance(o);
  assert.equal(o.stage, "second_submitted");
  for (let i = 0; i < 4; i++) o = advance(o);
  assert.equal(o.stage, "claimable");
  assert.equal(o.completedHops, 2);
  assert.equal(o.buy, "A");
  o = demoAction(o, "claim", now);
  assert.equal(o.stage, "claimed");
  assert.throws(() => demoAction(o, "claim", now));
  assert.equal(hydrateOrders(serializeOrders([o]))[0].stage, "claimed");
});
test("before-fill cancellation returns input; after first-hop exit returns actual middle, never original price", () => {
  let a = demoAction(made(), "cancel", now);
  a = advance(a);
  assert.equal(remainingAsset(a), "A");
  assert.equal(remainingUnits(a), a.inputUnits);
  let b = made({ mode: "double" });
  for (let i = 0; i < 4; i++) b = advance(b);
  b = demoAction(b, "claim_middle", now);
  b = advance(b);
  b = demoAction(b, "cancel", now);
  b = advance(b);
  assert.equal(b.stage, "refundable");
  assert.equal(remainingAsset(b), "B");
  assert.equal(remainingUnits(b), b.middleUnits);
  assert.notEqual(b.middleUnits, b.inputUnits);
  b = demoAction(b, "claim", now);
  assert.equal(b.stage, "refunded");
  assert.throws(() => advance(b));
});
test("frozen set cannot be cancelled; original refund disposition can close expired/failing batch", () => {
  let o = advance(made());
  assert.equal(o.stage, "frozen");
  assert.throws(() => demoAction(o, "cancel", now), /frozen/);
  assert.throws(() => demoAction(o, "advance", now + 3600000), /expired/);
  const refunded = demoAction(o, "resolve_refund", now + 3600000);
  assert.equal(refunded.stage, "refundable");
  assert.equal(refunded.requestIdentity, o.requestIdentity);
  assert.equal(demoAction(refunded, "claim", now + 3600000).stage, "refunded");
});
test("unknown original only reconciles with same identity; no advance, replacement or duplicate credits", () => {
  const o = seedOrders(now).find((x) => x.stage === "unknown");
  assert.throws(() => advance(o), /original identity/);
  assert.throws(() => demoAction(o, "cancel", now));
  const next = demoAction(o, "resolve_original", now);
  assert.equal(next.requestIdentity, o.requestIdentity);
  assert.equal(next.id, o.id);
  assert.equal(next.stage, "claimable");
  assert.throws(() => demoAction(next, "resolve_original", now));
  assert.equal(o.stage, "unknown");
});
test("live gateway is unconditionally closed; npm SDK and signing path are absent from browser bundle", async () => {
  assert.equal(LIVE_GATE.enabled, false);
  assert.throws(() => {
    LIVE_GATE.enabled = true;
  });
  await assert.rejects(submitLive(), /not connected/);
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url)),
  );
  assert.equal(packageJson.dependencies["@psy-protocol/psy-sdk"], undefined);
  const dir = new URL("../dist/assets/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const code = readFileSync(new URL(file, dir), "utf8");
    assert.equal(
      /sendTransaction|broadcast-prepared|private_key|privateKey/.test(code),
      false,
      "no market signing/broadcast/key material in bundle",
    );
  }
});
