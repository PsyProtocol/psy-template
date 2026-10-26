import { request as httpRequest } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadGateway, createGatewayAdapter } from "./adapter.mjs";
import { createPublicGateway } from "./server.mjs";
import { createPublicMarketClient } from "../../market-client/client.mjs";
import { canonical, digest } from "../../market-client/protocol.mjs";
import { ReadUnavailable } from "../readRetry.mjs";
import {
  fixtureConfig,
  observed,
  swapRequest,
  NOW,
  fakePublicState,
} from "./fixtures.mjs";
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "psy-gateway-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = await fixtureConfig(dir),
    loaded = await loadGateway(file),
    s = observed(loaded.registry, loaded.config.registrySha256);
  return { dir, file, loaded, s };
}
async function serverFor(t, adapter) {
  const server = createPublicGateway({ adapter });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  return "http://127.0.0.1:" + server.address().port;
}
test("real gateway adapter + HTTP + browser client computes the same exact unsigned plan", async (t) => {
  const f = await fixture(t),
    state = fakePublicState(f.loaded, f.s),
    plans = join(f.dir, "plans"),
    adapter = await createGatewayAdapter(f.loaded, {
      readState: async () => state,
      now: () => NOW,
      planDirectory: plans,
    }),
    base = await serverFor(t, adapter),
    client = createPublicMarketClient({
      registry: f.loaded.registry,
      registryHash: f.loaded.config.registrySha256,
      now: () => NOW,
      fetcher: (path, o) => fetch(base + path.replace("/api/markets", ""), o),
    });
  assert.equal((await client.status()).capabilities.financialSubmission, false);
  const actual = await client.snapshot(2485, 12345);
  assert.equal(actual.user.nonce, "7");
  const record = await client.plan(swapRequest());
  assert.equal(record.plan.calls.length, 3);
  assert.equal((await readdir(plans)).length, 1);
  assert.equal(
    record.recordId,
    await digest({
      schema: 1,
      request: record.request,
      snapshot: record.snapshot,
      plan: record.plan,
    }),
  );
  await assert.rejects(client.submit(), /No financial submission/);
});
test("network, code/layout, key mapping and immutable metadata drift fail before planning", async (t) => {
  const f = await fixture(t);
  for (const mutate of [
    (s) => (s.network.magic = "42"),
    (s) => (s.contractLeaf = async () => ({ code_root: "0".repeat(64) })),
    (s) => (s.userIds = async () => [1]),
    (s) => {
      const old = s.slot;
      s.slot = async (u, c, o) => (o === 33554445 ? 9n : old(u, c, o));
    },
  ]) {
    const state = fakePublicState(f.loaded, f.s);
    mutate(state);
    const adapter = await createGatewayAdapter(f.loaded, {
      readState: async () => state,
      now: () => NOW,
    });
    await assert.rejects(adapter.snapshot({ marketId: 2485, userId: 12345 }));
  }
});
test("local frozen ABI tampering is detected by hashes, including after startup", async (t) => {
  const f = await fixture(t),
    adapter = await createGatewayAdapter(f.loaded);
  await writeFile(
    join(f.loaded.config.reviewedDirectory, "2485-abi.json"),
    "{}",
  );
  await assert.rejects(adapter.status());
  await assert.rejects(loadGateway(f.file));
});
test("read outage returns 503; request validation, cross-origin and rebinding cannot open writes", async (t) => {
  const f = await fixture(t),
    adapter = await createGatewayAdapter(f.loaded, {
      readState: async () => {
        throw new ReadUnavailable("synthetic outage");
      },
    }),
    base = await serverFor(t, adapter);
  const post = (path, body, headers = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await post("/v1/snapshot", { marketId: 2485, userId: 12345 })).status,
    503,
  );
  assert.equal(
    (
      await post(
        "/v1/snapshot",
        { marketId: 2485, userId: 12345 },
        { origin: "https://evil.invalid" },
      )
    ).status,
    403,
  );
  const wrongHost = await new Promise((resolve, reject) => {
    const r = httpRequest(
      base + "/v1/status",
      { headers: { host: "evil.invalid" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    r.on("error", reject);
    r.end();
  });
  assert.equal(wrongHost, 403);
  assert.equal((await post("/v1/submit", {})).status, 404);
  assert.equal(
    (await post("/v1/plan", { payload: "x".repeat(17000) })).status,
    413,
  );
  assert.equal(
    (await fetch(base + "/v1/status?url=https://evil.invalid")).status,
    400,
  );
});
test("read backpressure bounds concurrent work and never starts an Executor task", async (t) => {
  let release, entered;
  const started = new Promise((r) => (entered = r)),
    hold = new Promise((r) => (release = r));
  const adapter = {
      snapshot: async () => {
        entered();
        await hold;
        return { registryHash: "x" };
      },
      status: async () => ({}),
    },
    server = createPublicGateway({ adapter, maxActive: 1 });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const base = "http://127.0.0.1:" + server.address().port;
  const first = fetch(base + "/v1/snapshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  await started;
  assert.equal((await fetch(base + "/v1/status")).status, 503);
  release();
  assert.equal((await first).status, 200);
});
test("client refuses substituted registry, call params and false write capabilities", async (t) => {
  const f = await fixture(t),
    adapter = await createGatewayAdapter(f.loaded, {
      readState: async () => fakePublicState(f.loaded, f.s),
      now: () => NOW,
    });
  for (const change of [
    (s) => (s.registryHash = "0".repeat(64)),
    (s) => (s.registry.markets[0].vaultId = 1),
    (s) => (s.capabilities.financialSubmission = true),
  ]) {
    const status = structuredClone(await adapter.status());
    change(status);
    const client = createPublicMarketClient({
      registry: f.loaded.registry,
      registryHash: f.loaded.config.registrySha256,
      fetcher: async () => new Response(JSON.stringify(status)),
      now: () => NOW,
    });
    await assert.rejects(client.status());
  }
  const record = await adapter.plan(swapRequest());
  record.plan.calls[2].inputs[0] = "223344";
  const client = createPublicMarketClient({
    registry: f.loaded.registry,
    registryHash: f.loaded.config.registrySha256,
    fetcher: async () => new Response(JSON.stringify(record)),
    now: () => NOW,
  });
  await assert.rejects(client.plan(swapRequest()), /modified/);
});
test("exact receipt route preserves original identity and leaves missing receipts unresolved", async (t) => {
  const f = await fixture(t),
    ident = {
      userId: 12345,
      endUserLeafHash: "a".repeat(64),
      minCheckpoint: 900,
    };
  let seen;
  const adapter = await createGatewayAdapter(f.loaded, {
    readReceipts: async () => async (input) => {
      seen = input;
      return { status: "unresolved", ...input };
    },
  });
  const r = await adapter.receipt(ident);
  assert.deepEqual(seen, ident);
  assert.equal(r.result.status, "unresolved");
  await assert.rejects(adapter.receipt({ ...ident, retry: true }));
});
