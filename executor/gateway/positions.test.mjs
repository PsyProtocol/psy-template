import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  positionFixture,
  fakePositionState,
  positionNow,
} from "./positionFixtures.mjs";
import { positionReader } from "./positions.mjs";
import {
  validatePositionSnapshot,
  createPositionClient,
} from "../../market-client/positionSnapshot.mjs";
const req = (m) => ({
  marketId: m.marketId,
  userId: 12345,
  slotStart: 0,
  slotCount: m.nftId ? 8 : 0,
});
test("quarantined markets reject before RPC and inactive accounts remain unavailable", async (t) => {
  const f = await positionFixture(t), m = f.loaded.registry.markets[1];
  m.quarantined = true;
  let reads = 0;
  const reader = positionReader(f.loaded, { rpcConfig: f.rpcConfig,
    readState: async () => { reads++; throw Error("unexpected RPC"); } });
  await assert.rejects(reader(req(m)), /quarantined/i);
  assert.equal(reads, 0);
  delete m.quarantined;
  const fake = fakePositionState(f.loaded, m.marketId);
  fake.state.rpc = async (_url, method) => method === "psy_get_user_leaf_data"
    ? { public_key: "0".repeat(64), nonce: 0n } : "1".repeat(64);
  await assert.rejects(positionReader(f.loaded, { rpcConfig: f.rpcConfig,
    readState: async () => fake.state })(req(m)), { code: "ACCOUNT_NOT_ACTIVE" });
});
test("all three real ABI readers preserve exact two-Felt amounts and finite NFT delivery/slot scope", async (t) => {
  const f = await positionFixture(t);
  for (const m of f.loaded.registry.markets) {
    const fake = fakePositionState(f.loaded, m.marketId),
      reader = positionReader(f.loaded, {
        rpcConfig: f.rpcConfig,
        readState: async () => fake.state,
        now: () => positionNow,
      }),
      r = await reader(req(m));
    assert.equal(r.assets[0].balance, "4611686018427387921");
    assert.equal(r.nativeOutbox.claimable, "1000000000");
    assert.equal(r.financialAuthorization, false);
    validatePositionSnapshot(
      r,
      req(m),
      f.loaded.registry,
      f.loaded.registryHash,
      positionNow,
    );
    if (m.nftId) {
      assert.equal(r.nft.slots[0].tokenId[0], "101");
      assert.equal(r.nft.pending[0].tokenId[0], "202");
      assert.equal(r.nft.pending[0].sequence, "2");
      assert.equal(r.nft.inventoryComplete, false);
      assert.equal(r.nft.slots.length, 8);
    } else assert.equal(r.order.x, "4611686018427387921");
    if (m.kind === "bondingcurve")
      assert.equal(r.curve.quoteReserve, "4611686018427387921");
  }
});
test("code/layout, vault registration, metadata and output cursor changes fail closed", async (t) => {
  const f = await positionFixture(t),
    m = f.loaded.registry.markets[0];
  for (const change of [
    (x) => (x.state.contractLeaf = async () => ({})),
    (x) => (x.state.userIds = async () => [1]),
    (x) => x.put(m.assets[0].issuerUserId, m.assets[0].contractId, 33554445, 9),
    (x) => x.put(12345, 0, 4 + 2 * m.vaultId, 3000000000n),
  ]) {
    const x = fakePositionState(f.loaded, m.marketId);
    change(x);
    await assert.rejects(
      positionReader(f.loaded, {
        rpcConfig: f.rpcConfig,
        readState: async () => x.state,
        now: () => positionNow,
      })(req(m)),
    );
  }
});
test("ranges, funding underflow and local pinned artifact tampering reject", async (t) => {
  const f = await positionFixture(t),
    m = f.loaded.registry.markets[2],
    x = fakePositionState(f.loaded, m.marketId),
    read = positionReader(f.loaded, {
      rpcConfig: f.rpcConfig,
      readState: async () => x.state,
      now: () => positionNow,
    });
  await assert.rejects(read({ ...req(m), slotStart: 127 }));
  await assert.rejects(read({ ...req(m), slotCount: 128 }));
  x.put(12345, m.nftId, 1182 + 35 * m.vaultId + 33, 3);
  await assert.rejects(read(req(m)));
  await writeFile(join(f.dir, m.marketId + "-abi.json"), "{}");
  await assert.rejects(read(req(m)), /input changed/);
});
test("browser independently rejects substituted market, asset precision, truncated state, duplicate roots and false inventory coverage", async (t) => {
  const f = await positionFixture(t),
    m = f.loaded.registry.markets[2],
    x = fakePositionState(f.loaded, m.marketId),
    r = await positionReader(f.loaded, {
      rpcConfig: f.rpcConfig,
      readState: async () => x.state,
      now: () => positionNow,
    })(req(m));
  for (const mutate of [
    (s) => (s.marketId = 2497),
    (s) => (s.assets[0].decimals = 9),
    (s) => delete s.order.nonce,
    (s) => (s.anchors[1] = s.anchors[0]),
    (s) => (s.nft.inventoryComplete = true),
    (s) => (s.nft.pending[0].sequence = "3"),
    (s) => (s.observedAt -= 30001),
  ]) {
    const s = structuredClone(r);
    mutate(s);
    assert.throws(() =>
      validatePositionSnapshot(
        s,
        req(m),
        f.loaded.registry,
        f.loaded.registryHash,
        positionNow,
      ),
    );
  }
  let calls = 0;
  const client = createPositionClient({
    registry: f.loaded.registry,
    registryHash: f.loaded.registryHash,
    now: () => positionNow,
    fetcher: async (url, o) => {
      calls++;
      assert.equal(url, "/api/markets/v1/positions");
      assert.deepEqual(JSON.parse(o.body), req(m));
      return new Response(JSON.stringify(r));
    },
  });
  assert.equal((await client.snapshot(req(m))).marketId, m.marketId);
  assert.equal(calls, 1);
});

test("real HTTP route and shared browser client read positions while submission remains absent", async (t) => {
  const { createPublicGateway } = await import("./server.mjs");
  const f = await positionFixture(t),
    m = f.loaded.registry.markets[0],
    x = fakePositionState(f.loaded, m.marketId);
  const reader = positionReader(f.loaded, {
    rpcConfig: f.rpcConfig,
    readState: async () => x.state,
    now: () => positionNow,
  });
  const server = createPublicGateway({ adapter: { positionSnapshot: reader } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const base = "http://127.0.0.1:" + server.address().port;
  const client = createPositionClient({
    registry: f.loaded.registry,
    registryHash: f.loaded.registryHash,
    now: () => positionNow,
    fetcher: (url, options) =>
      fetch(base + url.replace("/api/markets", ""), options),
  });
  assert.equal((await client.snapshot(req(m))).order.x, "4611686018427387921");
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

test("client freezes caller request and registry and rejects oversized ranges before HTTP", async (t) => {
  const f = await positionFixture(t),
    m = f.loaded.registry.markets[2],
    x = fakePositionState(f.loaded, m.marketId),
    r = await positionReader(f.loaded, {
      rpcConfig: f.rpcConfig,
      readState: async () => x.state,
      now: () => positionNow,
    })(req(m));
  let calls = 0;
  const client = createPositionClient({
    registry: f.loaded.registry,
    registryHash: f.loaded.registryHash,
    now: () => positionNow,
    fetcher: async (_u, o) => {
      calls++;
      assert.equal(JSON.parse(o.body).userId, 12345);
      return new Response(JSON.stringify(r));
    },
  });
  const input = req(m),
    pending = client.snapshot(input);
  input.userId = 54321;
  f.loaded.registry.markets[2].assets[0].decimals = 9;
  assert.equal((await pending).userId, 12345);
  await assert.rejects(client.snapshot({ ...req(m), slotCount: 128 }));
  assert.equal(calls, 1);
});
