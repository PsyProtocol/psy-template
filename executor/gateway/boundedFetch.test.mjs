import test from "node:test";
import assert from "node:assert/strict";
import { publicFetchWith } from "./boundedFetch.mjs";
const request = {
  method: "POST",
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "psy_get_latest_l2_block_state",
    params: {},
  }),
};
test("gateway upstream transport rejects redirects, oversized bodies and wrong RPC envelopes", async () => {
  for (const response of [
    new Response("", {
      status: 302,
      headers: { location: "https://evil.invalid" },
    }),
    new Response("x".repeat(129)),
    new Response("ok", { headers: { "content-length": "129" } }),
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} })),
  ]) {
    const read = publicFetchWith(async (_u, o) => {
      assert.equal(o.redirect, "manual");
      return response;
    }, 128);
    await assert.rejects(read("https://example.invalid", request));
  }
});
test("gateway preserves exact integer text and HTTP outage status instead of rounding or inventing results", async () => {
  const raw = '{"jsonrpc":"2.0","id":1,"result":{"nonce":4611686018427387921}}';
  const read = publicFetchWith(async () => new Response(raw));
  assert.equal(
    await (await read("https://example.invalid", request)).text(),
    raw,
  );
  const down = publicFetchWith(async () => new Response("", { status: 503 }));
  assert.equal((await down("https://example.invalid", request)).status, 503);
});
test("shared public reader uses explicit gateway transport without touching global fetch", async () => {
  const { publicState } = await import("../publicState.mjs");
  let reads = 0;
  const s = await publicState(
    "market-client/reviewed/staging-qa-20261026/rpc-config.json",
    {
      fetchImpl: async (_url, options) => {
        reads++;
        const q = JSON.parse(options.body);
        assert.equal(q.method, "psy_get_latest_l2_block_state");
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: q.id,
            result: { checkpoint_id: 123 },
          }),
        );
      },
    },
  );
  assert.equal(s.checkpoint, 123);
  assert.equal(reads, 2);
  await assert.rejects(
    publicState("market-client/reviewed/staging-qa-20261026/rpc-config.json", {
      fetchImpl: null,
    }),
    /invalid public read transport/,
  );
});
