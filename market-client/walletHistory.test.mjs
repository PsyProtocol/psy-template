import test from "node:test";
import assert from "node:assert/strict";
import {
  createWalletHistoryClient,
  publicWalletHistory,
  walletNextStep,
} from "./walletHistory.mjs";
const hash = (n) => String(n).repeat(64);
function fixture() {
  let rows = [
    {
      schema: 1,
      intentId: hash(1),
      recordId: hash(2),
      phase: "unresolved",
      preparedHash: hash(3),
      requestSha256: hash(4),
      endUserLeafHash: hash(5),
      contentHash: hash(6),
      actualFee: "1000001",
      confirmedCheckpoint: null,
    },
  ];
  const calls = [];
  let drop = false,
    wait = null;
  const provider = {
    async request(q) {
      calls.push(q);
      if (q.method === "psy_listMarketPreparations")
        return structuredClone(rows);
      if (wait) await wait;
      if (drop) throw Error("Receipt response lost");
      rows[0].phase = "included";
      rows[0].confirmedCheckpoint = 77;
      return structuredClone(rows[0]);
    },
  };
  return {
    calls,
    provider,
    get entry() {
      return structuredClone(rows[0]);
    },
    change: (fields) => Object.assign(rows[0], fields),
    setDrop: () => {
      drop = true;
    },
    setWait: (value) => {
      wait = value;
    },
    client: createWalletHistoryClient(provider, hash(9)),
  };
}
test("history survives a new page client; exact reconciliation never broadcasts or prepares", async () => {
  const f = fixture();
  const first = await f.client.list();
  const restarted = createWalletHistoryClient(f.provider, hash(9));
  const rows = await restarted.recover(first[0]);
  assert.equal(rows[0].phase, "included");
  assert.deepEqual(
    f.calls.map((q) => q.method),
    [
      "psy_listMarketPreparations",
      "psy_listMarketPreparations",
      "psy_reconcileMarketPreparation",
      "psy_listMarketPreparations",
    ],
  );
  assert.deepEqual(f.calls[2].params, [hash(9), hash(1)]);
  assert.match(walletNextStep("included"), /does not prove final delivery/);
});
test("a lost response keeps the original identity; the next operation only reconciles again", async () => {
  const f = fixture();
  f.setDrop();
  await assert.rejects(f.client.recover(f.entry), /lost/);
  assert.equal((await f.client.list())[0].phase, "unresolved");
  await assert.rejects(f.client.recover(f.entry), /lost/);
  assert.equal(
    f.calls.filter((q) => q.method === "psy_reconcileMarketPreparation").length,
    2,
  );
  assert.equal(
    f.calls.some((q) =>
      /broadcast|prepareMarketTransaction|sendTransaction/.test(q.method),
    ),
    false,
  );
});
test("stale cancellation cannot cancel a request that has since entered broadcast", async () => {
  const f = fixture();
  f.change({ phase: "prepared" });
  const stale = f.entry;
  f.change({ phase: "unresolved" });
  await assert.rejects(f.client.recover(stale), /phase changed/);
  assert.equal(f.calls.length, 1);
});
test("coherent request replacement and disappeared originals reject without a recovery mutation", async () => {
  for (const field of [
    "recordId",
    "preparedHash",
    "requestSha256",
    "endUserLeafHash",
    "contentHash",
    "intentId",
  ]) {
    const f = fixture(),
      stale = f.entry;
    f.change({ [field]: hash(8) });
    await assert.rejects(f.client.recover(stale), /identity changed/);
    assert.equal(f.calls.length, 1);
  }
});
test("duplicate recovery is single-flight and terminal receipts do not invoke reconciliation", async () => {
  const f = fixture();
  let release;
  f.setWait(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const first = f.client.recover(f.entry);
  await assert.rejects(f.client.recover(f.entry), /already in progress/);
  release();
  await first;
  const n = f.calls.length;
  await f.client.recover(f.entry);
  assert.equal(f.calls.length, n + 1);
});
test("unbroadcast cancellation is explicit and is not described as a refund", async () => {
  const f = fixture();
  f.change({ phase: "unverified" });
  await f.client.recover(f.entry);
  assert.equal(f.calls[1].method, "psy_cancelMarketPreparation");
  assert.match(
    walletNextStep("cancelled"),
    /not a market cancellation or a refund/,
  );
});
test("public history projects approved fields and rejects malformed, duplicate or unbounded data", () => {
  const f = fixture();
  assert.equal(
    "secretWitness" in
      publicWalletHistory([{ ...f.entry, secretWitness: "not exported" }])[0],
    false,
  );
  for (const value of [
    null,
    {},
    Array(17).fill(f.entry),
    [f.entry, f.entry],
    [{ ...f.entry, schema: 2 }],
    [{ ...f.entry, phase: "trade-completed" }],
    [{ ...f.entry, actualFee: 10 }],
    [{ ...f.entry, actualFee: "-1" }],
    [{ ...f.entry, confirmedCheckpoint: 77 }],
    [{ ...f.entry, contentHash: "bad" }],
  ])
    assert.throws(() => publicWalletHistory(value));
});
