import test from "node:test";
import assert from "node:assert/strict";
import { buildAmmPlan } from "./ammPlan.mjs";
import { MAX_AMOUNT, RADIX, formatUnits } from "../token/wide/arithmetic.mjs";
import {
  fixtureRegistry,
  fixturePin,
  observed,
  swapRequest,
  NOW,
} from "../executor/gateway/fixtures.mjs";
const registry = await fixtureRegistry(),
  { registrySha256: registryHash } = await fixturePin(),
  make = () => observed(registry, registryHash),
  plan = (s, r = swapRequest()) =>
    buildAmmPlan(s, r, registry, { now: NOW, registryHash });
test("AMM open+fee+deposit uses real reviewed selectors and both Felt limbs", () => {
  const p = plan(make());
  assert.equal(p.callCount, 3);
  assert.deepEqual(
    p.calls.map((c) => c.method_name),
    ["open_swap", "simple_transfer", "transfer"],
  );
  assert.deepEqual(p.calls[2].inputs.slice(1), ["17", "1"]);
  assert.equal(p.walletNonce, "8");
  assert.equal(p.orderNonce, "1");
  assert.equal(p.financialAuthorization, false);
  assert.equal(p.actualNetworkFee, null);
  assert.equal(p.validUntilCheckpoint, 1064);
});
test("exact-ratio LP planning is four calls and owner-bound raw shares", () => {
  const p = plan(make(), {
    ...swapRequest(),
    kind: "add",
    amountA: "10",
    amountB: "10",
  });
  assert.equal(p.callCount, 4);
  assert.equal(p.quote, "10000000000000000000");
  assert.equal(p.minimum, "9950000000000000000");
  assert.throws(
    () =>
      plan(make(), {
        ...swapRequest(),
        kind: "add",
        amountA: "10",
        amountB: "9",
      }),
    /ratio/,
  );
});
test("route, recipient, extra inputs, decimals, stale snapshot and registry tampering reject", () => {
  for (const patch of [
    { marketId: 2469 },
    { recipientId: 223344 },
    { assetIn: 999 },
    { extra: true },
    { validForCheckpoints: 0 },
    { validForCheckpoints: 129 },
    { feeCap: "51" },
    { amountA: "1.0000000000000000001" },
  ])
    assert.throws(() => plan(make(), { ...swapRequest(), ...patch }));
  for (const mutate of [
    (s) => (s.registryHash = "0".repeat(64)),
    (s) => (s.network = { ...s.network, magic: "42" }),
    (s) => (s.assets[0].decimals = 9),
    (s) => (s.observedAt = NOW - 30001),
    (s) => s.anchors.pop(),
    (s) => (s.user.nonce = String(RADIX)),
    (s) => (s.order.deadline = String(RADIX)),
  ]) {
    const s = make();
    mutate(s);
    assert.throws(() => plan(s));
  }
});
test("unsettled funds, active order, sealed/full queue and active prior consent stop new deposits", () => {
  for (const mutate of [
    (s) => (s.assets[0].sentToVault = "1"),
    (s) => (s.funding.feeSent = "1"),
    (s) => (s.order.kind = "1"),
    (s) => (s.queue.phase = "2"),
    (s) => (s.queue.count = "4"),
    (s) => {
      s.order.admission_epoch = "1";
      s.order.admission_nonce = "0";
    },
    (s) => (s.user.nativeBalance = "100"),
  ]) {
    const s = make();
    mutate(s);
    assert.throws(() => plan(s));
  }
});
test("U124 reserve/supply overflow and zero rounded output reject", () => {
  const s = make();
  s.assets[0].balance = String(MAX_AMOUNT);
  assert.throws(() =>
    plan(s, { ...swapRequest(), amountA: formatUnits(MAX_AMOUNT, 18) }),
  );
  const lp = make();
  lp.pool.ownedShares = String(MAX_AMOUNT);
  assert.throws(() =>
    plan(lp, { ...swapRequest(), kind: "add", amountA: "10", amountB: "10" }),
  );
  assert.throws(() =>
    plan(make(), { ...swapRequest(), amountA: "0.000000000000000001" }),
  );
});
test("admission binds the actual open epoch; duplicate consent does not submit again", () => {
  const s = make();
  s.order = {
    ...s.order,
    kind: "1",
    pool: String(registry.markets[0].vaultId),
    nonce: "1",
    deadline: "1100",
  };
  const request = { ...swapRequest(), kind: "admit", amountA: "", amountB: "" },
    p = plan(s, request);
  assert.deepEqual(p.calls[0].inputs, ["1", "1010"]);
  s.order.admission_epoch = "1";
  s.order.admission_nonce = "1";
  assert.throws(() => plan(s, request), /Already consented/);
});
test("cancellation preserves sealed-set outcome; close cannot skip unsettled deposits", () => {
  const s = make();
  s.order = {
    ...s.order,
    kind: "1",
    pool: String(registry.markets[0].vaultId),
    nonce: "1",
    deadline: "1100",
  };
  s.queue.phase = "2";
  const p = plan(s, {
    ...swapRequest(),
    kind: "cancel",
    amountA: "",
    amountB: "",
  });
  assert.deepEqual(
    p.calls.map((c) => c.method_name),
    ["request_cancel"],
  );
  assert.match(p.next, /not immediate withdrawal/);
  s.assets[0].sentToVault = "17";
  assert.throws(
    () =>
      plan(s, { ...swapRequest(), kind: "close", amountA: "", amountB: "" }),
    /Outstanding/,
  );
});
test("claim plans consume only the selected reviewed vault Outbox; no output means no call", () => {
  const s = make(),
    r = {
      ...swapRequest(),
      kind: "claim",
      amountA: "",
      amountB: "",
      assetIn: 2484,
    };
  assert.throws(() => plan(s, r), /No confirmed Outbox/);
  s.assets[1].claimableFromVault = "17";
  const p = plan(s, r);
  assert.equal(p.callCount, 1);
  assert.deepEqual(p.calls[0].inputs, [String(registry.markets[0].vaultId)]);
  assert.equal(p.calls[0].contract_id, "2484");
});

test("withdrawal uses actual owned raw LP shares, both outputs and no token deposit", () => {
  const s = make();
  s.pool.ownedShares = "10000000000000000000";
  const request = {
    ...swapRequest(),
    kind: "remove",
    amountA: "4611686018427387921",
  };
  const p = plan(s, request);
  assert.deepEqual(
    p.calls.map((c) => c.method_name),
    ["open_remove", "simple_transfer"],
  );
  assert.deepEqual(p.calls[0].inputs.slice(1, 3), ["17", "1"]);
  assert.equal(p.withdrawal.outputA, "4611686018427387921");
  assert.equal(p.withdrawal.minimumA, "4588627588335250981");
  assert.equal(p.orderNonce, "1");
  assert.equal(p.debits.length, 1);
  for (const amountA of ["1.5", "10000000000000000001", "0", "01"])
    assert.throws(() => plan(s, { ...request, amountA }));
  const locked = make();
  locked.pool.ownedShares = locked.pool.totalShares;
  assert.throws(
    () => plan(locked, { ...request, amountA: locked.pool.totalShares }),
    /shares/,
  );
});
test("native claim uses only PSY and the selected vault; contradictory or old snapshots reject", () => {
  const s = make(),
    request = {
      ...swapRequest(),
      kind: "claim-native",
      amountA: "",
      assetIn: 0,
    };
  assert.throws(() => plan(s, request), /No confirmed native/);
  s.funding.nativeSent = "1234567890";
  s.funding.nativeClaimable = "1234567890";
  assert.deepEqual(plan(s, request).calls, [
    {
      contract_id: "0",
      method_name: "simple_claim",
      inputs: [String(registry.markets[0].vaultId)],
    },
  ]);
  assert.throws(() => plan(s, { ...request, assetIn: 2483 }), /asset/);
  s.funding.nativeClaimed = "1";
  assert.throws(() => plan(s, request), /cursor mismatch/);
  const old = make();
  old.schema = 1;
  assert.throws(() => plan(old), /identity mismatch/);
});
test("recovery enrollment requires actual unused funding and cannot bypass an active or committed order", () => {
  const s = make(),
    request = { ...swapRequest(), kind: "recover", amountA: "" };
  assert.throws(() => plan(s, request), /No unused/);
  s.assets[1].sentToVault = "4611686018427387921";
  const p = plan(s, request);
  assert.equal(p.calls[0].method_name, "request_recovery");
  assert.deepEqual(p.calls[0].inputs, [String(registry.markets[0].vaultId)]);
  assert.equal(p.debits.length, 0);
  assert.match(p.next, /does not refund/);
  s.order.kind = "1";
  s.order.pool = String(registry.markets[0].vaultId);
  s.order.nonce = "1";
  assert.throws(() => plan(s, request), /Active order/);
  s.lifecycle.consumed = "1";
  assert.equal(plan(s, request).callCount, 1);
  s.lifecycle.batchPhase = "2";
  assert.throws(() => plan(s, request), /Committed batch/);
  s.lifecycle.batchPhase = "3";
  s.lifecycle.recoveryPool = s.order.pool;
  assert.throws(() => plan(s, request), /already enrolled/);
});
test("release cannot use historical nonmembership or bypass frozen consent", () => {
  const s = make(),
    request = { ...swapRequest(), kind: "release", amountA: "" };
  s.order = {
    ...s.order,
    kind: "1",
    pool: String(registry.markets[0].vaultId),
    nonce: "1",
    cancelled: "1",
    admission_epoch: "1",
    admission_nonce: "1",
  };
  for (const phase of ["1", "2"]) {
    s.queue.phase = phase;
    assert.throws(() => plan(s, request), /consent locks/);
  }
  s.queue.phase = "3";
  assert.equal(plan(s, request).calls[0].method_name, "release_unaccepted");
  s.order.cancelled = "0";
  assert.throws(() => plan(s, request), /Cancel/);
});
test("withdrawal cancellation and closure retain original queue constraints", () => {
  const s = make();
  s.order = {
    ...s.order,
    kind: "3",
    pool: String(registry.markets[0].vaultId),
    nonce: "1",
  };
  const r = { ...swapRequest(), kind: "cancel", amountA: "" };
  assert.equal(plan(s, r).calls[0].method_name, "request_cancel");
  assert.equal(
    plan(s, { ...r, kind: "close" }).calls[0].method_name,
    "close_remove",
  );
  s.order.admission_epoch = "1";
  s.order.admission_nonce = "1";
  assert.throws(() => plan(s, { ...r, kind: "close" }), /locks closure/);
});
test("account lifecycle bounds and funding cursors cannot be omitted or forged", () => {
  for (const mutate of [
    (s) => delete s.lifecycle,
    (s) => (s.lifecycle.batchReady = "2"),
    (s) => (s.lifecycle.batchPhase = "5"),
    (s) => (s.lifecycle.recoveryPool = "16777216"),
    (s) => (s.funding.nativeClaimable = "1"),
    (s) => (s.funding.nativeSent = String(RADIX)),
  ]) {
    const s = make();
    mutate(s);
    assert.throws(() => plan(s));
  }
});
