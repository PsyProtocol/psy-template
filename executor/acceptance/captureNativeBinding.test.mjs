import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureNativeBinding } from "./captureNativeBinding.mjs";
import { losslessJson } from "../../amm/u124/client.mjs";
const hash = (n) => n.repeat(64);
async function scenario(fn) {
  const parent = await mkdtemp(join(tmpdir(), "psy-native-read-test-"));
  try {
    await fn(join(parent, "capture"));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}
function transport(change = () => null) {
  const calls = [];
  const fetcher = async (url, options) => {
    const q = JSON.parse(options.body);
    calls.push({ url, ...q, redirect: options.redirect });
    const override = change(q, calls.length);
    if (override) return override;
    let result;
    if (q.method === "psy_get_latest_l2_block_state")
      result = { checkpoint_id: 11 };
    else if (q.method === "psy_get_checkpoint_leaf_data")
      result = { global_chain_root: hash("1") };
    else if (q.method === "psy_get_contract_leaf_data")
      result = { code_root: hash("2") };
    else if (q.method === "psy_get_checkpoint_tree_root") result = hash("3");
    else if (q.method === "psy_get_user_leaf_data")
      result = {
        user_id: 223232,
        public_key: hash("4"),
        balance: 9007199254740995n,
        nonce: 1,
      };
    else if (q.method === "psy_get_circuits_data")
      result = JSON.stringify({
        ups_end_cap: {
          fingerprint: hash("5"),
          verifier_config: { synthetic: true },
        },
      });
    else result = {};
    return new Response(losslessJson({ jsonrpc: "2.0", id: 1, result }), {
      status: 200,
    });
  };
  return { calls, fetcher };
}
test("capture keeps full integers and projects public resources without financial authority", async () =>
  scenario(async (out) => {
    const t = transport(),
      s = await captureNativeBinding(out, t);
    assert.equal(s.fundingUser.nativeBalance, "9007199254740995");
    assert.equal(s.financialReady, false);
    assert.equal(s.proofsGenerated, 0);
    assert.equal(s.canonicalFinalityAuthenticated, false);
    assert.equal(t.calls.length, 16);
    assert.ok(
      t.calls.every(
        (c) => c.method.startsWith("psy_get_") && c.redirect === "manual",
      ),
    );
    const projected = JSON.parse(
      await readFile(join(out, "runtime-endcap-envelope.json")),
    );
    assert.deepEqual(Object.keys(JSON.parse(projected.result)), [
      "ups_end_cap",
    ]);
    assert.equal(s.fundingUser.registrationStatus, "not-queried");
  }));
test("an empty stored leaf is not classified as an unregistered identity", async () =>
  scenario(async (out) => {
    const t = transport((q) =>
      q.method === "psy_get_user_leaf_data"
        ? new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: {
                user_id: 223232,
                public_key: hash("0"),
                balance: 0,
                nonce: 0,
              },
            }),
          )
        : null,
    );
    const s = await captureNativeBinding(out, t);
    assert.equal(s.fundingUser.userStateInitialized, false);
    assert.equal(s.fundingUser.registrationStatus, "not-queried");
  }));
test("transport failure is retained once and an existing capture cannot be replaced", async () =>
  scenario(async (out) => {
    const t = transport(() => {
      throw Error("Synthetic TLS failure");
    });
    await assert.rejects(captureNativeBinding(out, t), /TLS/);
    assert.equal(t.calls.length, 1);
    const original = await readFile(join(out, "SUMMARY.json"));
    await assert.rejects(captureNativeBinding(out, t));
    assert.deepEqual(await readFile(join(out, "SUMMARY.json")), original);
    assert.equal(t.calls.length, 1);
  }));
test("redirects, duplicate JSON keys, wrong IDs and RPC errors do not become observations", async () => {
  for (const response of [
    () =>
      new Response("redirect", {
        status: 302,
        headers: { location: "https://example.invalid" },
      }),
    () => new Response('{"jsonrpc":"2.0","id":1,"id":1,"result":{}}'),
    () => new Response('{"jsonrpc":"2.0","id":2,"result":{}}'),
    () => new Response('{"jsonrpc":"2.0","id":1,"error":{"code":1}}'),
  ])
    await scenario(async (out) => {
      const t = transport(response);
      await assert.rejects(captureNativeBinding(out, t));
      assert.equal(t.calls.length, 1);
      assert.equal(
        JSON.parse(await readFile(join(out, "SUMMARY.json"))).complete,
        false,
      );
    });
});
test("different native identities stop before funding and resource requests", async () =>
  scenario(async (out) => {
    let leafReads = 0;
    const t = transport((q) =>
      q.method === "psy_get_contract_leaf_data" && ++leafReads === 2
        ? new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: { code_root: hash("9") },
            }),
          )
        : null,
    );
    await assert.rejects(captureNativeBinding(out, t), /identity changed/);
    assert.ok(
      t.calls.every(
        (c) =>
          c.method !== "psy_get_user_leaf_data" &&
          c.method !== "psy_get_circuits_data",
      ),
    );
  }));
test("wrong funding identity cannot be relabelled as the controlled recipient", async () =>
  scenario(async (out) => {
    const t = transport((q) =>
      q.method === "psy_get_user_leaf_data"
        ? new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: {
                user_id: 123,
                public_key: hash("4"),
                balance: 0,
                nonce: 0,
              },
            }),
          )
        : null,
    );
    await assert.rejects(
      captureNativeBinding(out, t),
      /Funding observation identity/,
    );
    assert.equal(
      t.calls.some((c) => c.method === "psy_get_circuits_data"),
      false,
    );
  }));
