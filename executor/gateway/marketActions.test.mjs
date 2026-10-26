import test from "node:test";
import assert from "node:assert/strict";
import {
  positionFixture,
  fakePositionState,
  positionNow,
} from "./positionFixtures.mjs";
import { marketActionReader } from "./marketActions.mjs";
import { buildMarketPlan } from "../../market-client/marketPlan.mjs";
import { createMarketActionClient } from "../../market-client/marketActionClient.mjs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const request = (marketId, kind, terms = {}) => ({
  marketId,
  kind,
  terms,
  userId: 12345,
  recipientId: 12345,
  feeCap: "5",
  validForCheckpoints: 64,
});
async function setup(t, index = 0) {
  const f = await positionFixture(t),
    m = f.loaded.registry.markets[index],
    fake = fakePositionState(f.loaded, m.marketId);
  fake.field(m.vaultId, "batch_ready", 1);
  fake.field(m.vaultId, "pool", m.vaultId);
  if (index === 1) fake.field(m.vaultId, "phase", 1);
  const abis = {};
  for (const a of f.loaded.registry.markets) {
    abis[a.marketId] = f.loaded.details.get(a.marketId).abi;
    for (const x of a.assets)
      abis[x.contractId] = JSON.parse(
        await readFile(
          join(f.dir, `${a.marketId}-asset-${x.contractId}-abi.json`),
        ),
      );
    if (a.nftId) abis[a.nftId] = f.loaded.details.get(a.marketId).nft;
  }
  let reads = 0;
  const reader = await marketActionReader(f.loaded, {
    rpcConfig: f.rpcConfig,
    readState: async () => {
      reads++;
      return fake.state;
    },
    now: () => positionNow,
  });
  const build = (r, record) =>
    buildMarketPlan(
      record.snapshot,
      record.context,
      r,
      f.loaded.registry,
      abis,
      { registryHash: f.loaded.registryHash, now: positionNow },
    );
  return {
    ...f,
    m,
    fake,
    reader,
    abis,
    build,
    get reads() {
      return reads;
    },
  };
}
test("fixed-checkpoint ordinary plans preserve two limbs and each market ABI", async (t) => {
  for (let index = 0; index < 3; index++) {
    const f = await setup(t, index),
      { m, fake } = f;
    fake.field(12345, "kind", 0);
    const r =
      index === 0
        ? request(m.marketId, "book-order", {
            side: "0",
            amount: "4.611686018427387921",
            minimum: "1",
          })
        : index === 1
          ? request(m.marketId, "curve-buy", { lots: "1", quoteLimit: "2" })
          : request(m.marketId, "nft-list", {
              slot: 0,
              price: "4.611686018427387921",
              tokenId: ["101", "0", "0", "0"],
              metadataHash: ["0", "0", "0", "0"],
            });
    const result = await f.reader(r);
    assert.equal(f.reads, 1);
    assert.equal(result.plan.financialAuthorization, false);
    assert.equal(result.plan.walletNonce, "8");
    assert.deepEqual(f.build(r, result), result.plan);
    assert.equal(result.plan.calls.length, 3);
    assert.equal(result.plan.calls[1].method_name, "simple_transfer");
    if (index === 0)
      assert.deepEqual(result.plan.calls[0].inputs.slice(2, 4), ["17", "1"]);
    if (index === 1) {
      assert.equal(result.plan.calls[0].method_name, "open_limit_buy");
      assert.equal(result.plan.calls[2].contract_id, "2484");
    }
    if (index === 2) {
      assert.equal(result.plan.calls[0].method_name, "open_listing");
      assert.equal(result.plan.calls[2].contract_id, "2496");
    }
  }
});
test("lifecycle actions enforce actual queue, funding, consumed and NFT FIFO boundaries", async (t) => {
  for (let index = 0; index < 3; index++) {
    const f = await setup(t, index),
      { m, fake } = f;
    for (const kind of ["admit", "cancel", "claim-ft", "claim-native"]) {
      const r = request(
          m.marketId,
          kind,
          kind === "claim-ft" ? { assetId: m.assets[0].contractId } : {},
        ),
        record = await f.reader(r);
      assert.equal(record.plan.callCount, 1);
      assert.deepEqual(f.build(r, record), record.plan);
    }
    fake.field(12345, "admission_epoch", 1);
    fake.field(12345, "admission_nonce", 1);
    fake.field(12345, "cancelled", 1);
    await assert.rejects(
      f.reader(request(m.marketId, "release")),
      /consent closure/,
    );
    fake.field(m.vaultId, "queue_phase", 3);
    assert.equal(
      (await f.reader(request(m.marketId, "release"))).plan.calls[0]
        .method_name,
      "release_unaccepted",
    );
    fake.field(m.vaultId, "consumed", 1, 12345);
    fake.field(12345, "kind", 0);
    fake.put(12345, 0, 3 + 2 * m.vaultId, 1000100000n);
    assert.equal(
      (await f.reader(request(m.marketId, "recover"))).plan.calls[0]
        .method_name,
      "request_recovery",
    );
    fake.field(m.vaultId, "batch_phase", 2);
    await assert.rejects(
      f.reader(request(m.marketId, "recover")),
      /committed batch/,
    );
  }
  const f = await setup(t, 2),
    r = request(f.m.marketId, "claim-nft", {
      slot: 1,
      sequence: "2",
      tokenId: ["202", "0", "0", "0"],
      metadataHash: ["0", "0", "0", "0"],
    });
  assert.equal((await f.reader(r)).plan.calls[0].method_name, "claim");
  for (const terms of [
    { ...r.terms, sequence: "3" },
    { ...r.terms, slot: 0 },
    { ...r.terms, tokenId: ["203", "0", "0", "0"] },
  ])
    await assert.rejects(f.reader({ ...r, terms }));
});
test("plan rejects substitution, wrong decimals/recipients, nonce overflow and stale snapshots", async (t) => {
  const f = await setup(t),
    r = request(f.m.marketId, "claim-ft", { assetId: 2483 }),
    record = await f.reader(r);
  for (const mutate of [
    (x) => (x.recipientId = 222),
    (x) => (x.terms.assetId = 999),
    (x) => (x.terms.amount = "1"),
    (x) => (x.feeCap = "0.0000000001"),
    (x) => (x.validForCheckpoints = 129),
  ]) {
    const bad = structuredClone(r);
    mutate(bad);
    await assert.rejects(f.reader(bad));
  }
  for (const mutate of [
    (x) => (x.snapshot.assets[0].decimals = 9),
    (x) => (x.snapshot.user.nonce = String((1n << 62n) - 1n)),
    (x) => (x.snapshot.observedAt -= 30001),
    (x) => x.context.checkpoint++,
    (x) => (x.snapshot.anchors[1] = x.snapshot.anchors[0]),
  ]) {
    const bad = structuredClone(record);
    mutate(bad);
    assert.throws(() => f.build(r, bad));
  }
});
test("new funding rejects unresolved consent, unused deposits, recovery and occupied NFT slot", async (t) => {
  const f = await setup(t),
    r = request(f.m.marketId, "book-order", {
      side: "0",
      amount: "1",
      minimum: "1",
    });
  await assert.rejects(f.reader(r), /Prior order/);
  f.fake.field(12345, "kind", 0);
  for (const [name, value, who] of [
    ["recovery_pool", 77, 12345],
    ["queue_phase", 2, f.m.vaultId],
    ["batch_phase", 2, f.m.vaultId],
  ]) {
    f.fake.field(who, name, value);
    await assert.rejects(f.reader(r));
    f.fake.field(who, name, name === "queue_phase" ? 1 : 0);
  }
  f.fake.put(12345, 2483, 33554453 + 4 * f.m.vaultId, 1);
  await assert.rejects(f.reader(r), /unused deposits/);
  const c = await setup(t, 1);
  c.fake.field(12345, "kind", 0);
  await assert.rejects(
    c.reader(
      request(c.m.marketId, "curve-buy", { lots: "1", quoteLimit: "0.1" }),
    ),
    /price violates/,
  );
  await assert.rejects(
    c.reader(
      request(c.m.marketId, "curve-sell", { lots: "3", quoteLimit: "1" }),
    ),
    /lot capacity/,
  );
});
test("browser independently recomputes exact plan and record; malformed request never reaches HTTP", async (t) => {
  const f = await setup(t),
    r = request(f.m.marketId, "claim-ft", { assetId: 2483 }),
    record = await f.reader(r);
  let calls = 0,
    alter = (x) => x;
  const client = createMarketActionClient({
    registry: f.loaded.registry,
    registryHash: f.loaded.registryHash,
    abis: f.abis,
    now: () => positionNow,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, "/api/markets/v1/market-plan");
      assert.deepEqual(JSON.parse(options.body), r);
      return new Response(JSON.stringify(alter(structuredClone(record))));
    },
  });
  assert.deepEqual(await client.plan(r), record);
  for (const mutate of [
    (x) => {
      x.plan.calls[0].inputs = ["777"];
      return x;
    },
    (x) => {
      x.plan.maxNetworkFee = "1";
      return x;
    },
    (x) => {
      x.recordId = "0".repeat(64);
      return x;
    },
    (x) => {
      x.request.recipientId = 777;
      return x;
    },
  ]) {
    alter = mutate;
    await assert.rejects(client.plan(r));
  }
  const before = calls;
  await assert.rejects(client.plan({ ...r, terms: { assetId: 999 } }));
  assert.equal(calls, before);
});

test("NFT purchase binds one fixed-checkpoint seller, token, price and listing nonce", async (t) => {
  const f = await setup(t, 2),
    { fake, m } = f,
    sellerId = 222;
  fake.field(12345, "kind", 0);
  fake.put(m.vaultId, m.nftId, 1182 + 35 * 12345 + 32, 0);
  fake.put(12345, m.nftId, 1182 + 35 * m.vaultId + 33, 0);
  for (const [name, value] of [
    ["kind", 1],
    ["pool", m.vaultId],
    ["nonce", 3],
    ["deadline", 1064],
    ["price", 1000000000000000000n],
    ["token_id_0", 900],
  ])
    fake.field(sellerId, name, value);
  const rpc = fake.state.rpc;
  fake.put(sellerId, m.nftId, 1182 + 35 * m.vaultId + 32, 1);
  fake.put(sellerId, m.nftId, 1182 + 35 * m.vaultId, 900);
  fake.put(sellerId, 0, 3 + 2 * m.vaultId, 1000100000n);
  fake.state.rpc = (url, method, params, opts) =>
    rpc(url, method, { ...params, user_id: 12345 }, opts);
  const r = request(m.marketId, "nft-buy", {
    sellerId,
    listingNonce: "3",
    price: "1",
    tokenId: ["900", "0", "0", "0"],
    metadataHash: ["0", "0", "0", "0"],
  });
  const result = await f.reader(r);
  assert.equal(f.reads, 1);
  assert.equal(result.context.seller.checkpoint, result.snapshot.checkpoint);
  assert.deepEqual(
    result.plan.calls.map((c) => c.method_name),
    ["acknowledge", "open_buy", "simple_transfer", "transfer"],
  );
  for (const patch of [
    { listingNonce: "4" },
    { tokenId: ["901", "0", "0", "0"] },
    { price: "2" },
    { sellerId: 12345 },
  ])
    await assert.rejects(f.reader({ ...r, terms: { ...r.terms, ...patch } }));
  for (const change of [
    (x) => x.context.seller.checkpoint++,
    (x) => (x.context.seller.order.cancelled = "1"),
    (x) => (x.context.seller.lifecycle.consumed = "3"),
    (x) => (x.context.sellerEscrow.sent = "0"),
    (x) => (x.context.sellerEscrow.tokenId[0] = "901"),
    (x) => (x.context.sellerEscrow.feeSent = "0"),
  ]) {
    const bad = structuredClone(result);
    change(bad);
    assert.throws(() => f.build(r, bad));
  }
});

test("formal gateway route persists exact unsigned records and never exposes submission", async (t) => {
  const { fixtureConfig } = await import("./fixtures.mjs");
  const { loadGateway, createGatewayAdapter } = await import("./adapter.mjs");
  const { createPublicGateway } = await import("./server.mjs");
  const { writeFile } = await import("node:fs/promises");
  const f = await setup(t),
    file = await fixtureConfig(join(f.dir, "gateway"));
  const cfg = JSON.parse(await readFile(file));
  cfg.positions = {
    reviewedDirectory: f.dir,
    registrySha256: f.loaded.registryHash,
  };
  await writeFile(file, JSON.stringify(cfg));
  const directory = join(f.dir, "plans");
  const loaded = await loadGateway(file),
    adapter = await createGatewayAdapter(loaded, {
      readState: async () => f.fake.state,
      now: () => positionNow,
      planDirectory: directory,
    });
  const server = createPublicGateway({ adapter });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const base = "http://127.0.0.1:" + server.address().port;
  const client = createMarketActionClient({
    registry: f.loaded.registry,
    registryHash: f.loaded.registryHash,
    abis: f.abis,
    now: () => positionNow,
    fetcher: (url, o) => fetch(base + url.replace("/api/markets", ""), o),
  });
  const r = request(f.m.marketId, "claim-ft", { assetId: 2483 }),
    record = await client.plan(r);
  assert.deepEqual(await client.plan(r), record);
  assert.equal((await readdir(directory)).length, 1);
  const original = JSON.parse(
    await readFile(join(directory, record.recordId + ".json")),
  );
  assert.deepEqual(original.plan, record.plan);
  assert.equal(
    (
      await fetch(base + "/v1/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    404,
  );
});

async function workflowFixture(t, { alter, prepareHook } = {}) {
  const f = await setup(t),
    { createExactMarketWorkflow } = await import("./marketWorkflow.mjs"),
    { positionReader } = await import("./positions.mjs"),
    { createHash } = await import("node:crypto");
  const H = (x) => createHash("sha256").update(x).digest("hex");
  let sends = 0,
    prepares = 0,
    known = false;
  const transport = {
    prepare: async (task) => {
      prepares++;
      const p = {
        schema: 1,
        userId: 12345,
        fingerprint: H("ordinary key"),
        registryHash: f.loaded.registryHash,
        sdkManifestSha256: f.loaded.registry.sdkManifestSha256,
        publicKeyHash: task.snapshot.user.publicKeyHash,
        startUserLeafHash: task.plan.startUserLeafHash,
        walletNonce: task.plan.walletNonce,
        validUntilCheckpoint: task.plan.validUntilCheckpoint,
        actualFee: "1000001000",
        fullCalls: [
          ...task.plan.calls,
          {
            contract_id: "0",
            method_name: "simple_burn",
            inputs: ["1000001000"],
          },
        ],
        requestSha256: H("request"),
        manifestSha256: H("manifest"),
        endUserLeafHash: H("end"),
        sigHash: H("sig"),
        sessionHash: H("session"),
      };
      alter?.(p);
      await prepareHook?.(f);
      return p;
    },
    verifyPrepared: async (task, p) =>
      p.sigHash === H("sig") && p.sessionHash === H("session"),
    recheck: async () => true,
    broadcastPrepared: async () => {
      sends++;
      throw Error("synthetic lost ACK");
    },
    reconcile: async () =>
      known
        ? {
            status: "included",
            success: true,
            userId: 12345,
            endUserLeafHash: H("end"),
            contentHash: H("content"),
            checkpoint: 1000,
          }
        : { status: "unresolved" },
  };
  const snapshot = positionReader(f.loaded, {
    rpcConfig: f.rpcConfig,
    readState: async () => f.fake.state,
    now: () => positionNow,
  });
  const options = {
    directory: join(f.dir, "journal"),
    registry: f.loaded.registry,
    registryHash: f.loaded.registryHash,
    userId: 12345,
    fingerprint: H("ordinary key"),
    abis: f.abis,
    readPlanRecord: f.reader,
    readSnapshot: snapshot,
    transport,
    now: () => positionNow,
  };
  return {
    ...f,
    make: () => createExactMarketWorkflow(options),
    options,
    transport,
    get sends() {
      return sends;
    },
    get prepares() {
      return prepares;
    },
    confirm: () => {
      known = true;
      const rpc = f.fake.state.rpc;
      f.fake.state.rpc = async (url, method, params, o) =>
        method === "psy_get_user_leaf_data"
          ? { ...(await rpc(url, method, params, o)), nonce: 8n }
          : H("end");
    },
  };
}
test("three-market Executor preserves original identity across lost ACK, restart and duplicate task", async (t) => {
  const f = await workflowFixture(t),
    r = request(f.m.marketId, "claim-ft", { assetId: 2483 });
  assert.equal((await f.make().run(r)).status, "unresolved");
  assert.equal(f.prepares, 1);
  assert.equal(f.sends, 1);
  assert.equal((await f.make().run(r)).status, "unresolved");
  assert.equal(f.prepares, 1);
  assert.equal(f.sends, 1);
  f.confirm();
  assert.equal((await f.make().reconcile())[0].result.status, "included");
  assert.equal((await f.make().unresolved()).length, 0);
});
test("Executor rejects altered call/fee/session, wrong ABI and state changes before broadcast", async (t) => {
  for (const alter of [
    (p) => (p.fullCalls[0].inputs = ["777"]),
    (p) => (p.actualFee = "5000000001"),
    (p) => (p.sigHash = "0".repeat(64)),
    (p) => (p.sessionHash = "0".repeat(64)),
    (p) => (p.walletNonce = "9"),
  ]) {
    const f = await workflowFixture(t, { alter });
    await assert.rejects(
      f.make().run(request(f.m.marketId, "claim-ft", { assetId: 2483 })),
    );
    assert.equal(f.sends, 0);
  }
  const f = await workflowFixture(t, {
    prepareHook: (f) => f.fake.field(f.m.vaultId, "consumed", 2, 12345),
  });
  await assert.rejects(
    f.make().run(request(f.m.marketId, "claim-ft", { assetId: 2483 })),
    /state changed/,
  );
  assert.equal(f.sends, 0);
  const bad = structuredClone(f.abis);
  bad[2497].contract.methods[0].method_id++;
  const { createExactMarketWorkflow } = await import("./marketWorkflow.mjs");
  assert.throws(
    () => createExactMarketWorkflow({ ...f.options, abis: bad }),
    /ABI changed/,
  );
});

test("U124 maximum, carry and output/fee cursor overflows are not rounded or wrapped", async (t) => {
  const { MAX_AMOUNT, RADIX, formatUnits } = await import(
    "../../token/wide/arithmetic.mjs"
  );
  const f = await setup(t),
    { fake, m } = f;
  fake.field(12345, "kind", 0);
  fake.put(12345, 2483, 0, RADIX - 1n);
  fake.put(12345, 2483, 1, RADIX - 1n);
  const r = request(m.marketId, "book-order", {
    side: "0",
    amount: formatUnits(MAX_AMOUNT, 18),
    minimum: "0.000000000000000001",
  });
  const record = await f.reader(r);
  assert.deepEqual(record.plan.calls[0].inputs.slice(2, 4), [
    String(RADIX - 1n),
    String(RADIX - 1n),
  ]);
  fake.put(12345, 2483, 33554453 + 4 * m.vaultId, RADIX - 1n);
  fake.put(12345, 2483, 33554454 + 4 * m.vaultId, RADIX - 1n);
  fake.field(m.vaultId, "settled_a", RADIX - 1n, 2 * 12345);
  fake.field(m.vaultId, "settled_a", RADIX - 1n, 2 * 12345 + 1);
  await assert.rejects(
    f.reader({ ...r, terms: { ...r.terms, amount: "0.000000000000000001" } }),
    /funding cursor overflow/,
  );
  await assert.rejects(
    f.reader(request(m.marketId, "claim-ft", { assetId: 2483 })),
    /claim balance overflow/,
  );
  const g = await setup(t);
  g.fake.field(12345, "kind", 0);
  g.fake.put(12345, 0, 3 + 2 * g.m.vaultId, RADIX - 1n);
  g.fake.put(g.m.vaultId, 0, 4 + 2 * 12345, RADIX - 1n);
  g.fake.field(g.m.vaultId, "settled_fee", RADIX - 1n, 12345);
  await assert.rejects(
    g.reader(
      request(g.m.marketId, "book-order", {
        side: "0",
        amount: "1",
        minimum: "1",
      }),
    ),
    /Native fee cursor overflow/,
  );
  const n = await setup(t);
  n.fake.put(12345, 0, 0, RADIX - 1n);
  await assert.rejects(
    n.reader(request(n.m.marketId, "claim-native")),
    /Native claim balance overflow/,
  );
});

test("same-machine competing market Executors do not prove or pay twice", async (t) => {
  let release, started;
  const gate = new Promise((r) => (release = r)),
    entered = new Promise((r) => (started = r));
  const f = await workflowFixture(t, {
      prepareHook: async () => {
        started();
        await gate;
      },
    }),
    r = request(f.m.marketId, "claim-ft", { assetId: 2483 });
  const first = f.make().run(r);
  await entered;
  try {
    const { VaultBusy } = await import("../journal.mjs");
    await assert.rejects(f.make().run(r), VaultBusy);
    assert.equal(f.prepares, 1);
  } finally {
    release();
  }
  assert.equal((await first).status, "unresolved");
  assert.equal(f.sends, 1);
});

test("NFT closure keeps listing and purchase methods distinct", async (t) => {
  const f = await setup(t, 2);
  f.fake.field(f.m.vaultId, "consumed", 1, 12345);
  assert.equal(
    (await f.reader(request(f.m.marketId, "close"))).plan.calls[0].method_name,
    "close_listing",
  );
  f.fake.field(12345, "kind", 2);
  assert.equal(
    (await f.reader(request(f.m.marketId, "close"))).plan.calls[0].method_name,
    "close_buy",
  );
});
