import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readWalletContext } from "./readWallet.mjs";
const config = JSON.parse(
  await readFile("market-client/reviewed/staging-qa-20261026/rpc-config.json"),
);
function wallet(change = {}) {
  const calls = [],
    answers = {
      psy_getNetworkConfig: structuredClone(config),
      psy_getWalletBuildInfo: { buildId: "test-only-build" },
      psy_getUserId: "12345",
      psy_accounts: ["public-account"],
      ...change,
    };
  return {
    calls,
    request: async (q) => {
      calls.push(q);
      assert.ok(
        Object.hasOwn(answers, q.method),
        "No signing request permitted",
      );
      return answers[q.method];
    },
  };
}
test("wallet context requests public metadata only and never treats build ID as SDK/key attestation", async () => {
  const p = wallet(),
    r = await readWalletContext(p, "public-account", config);
  assert.equal(r.userId, 12345);
  assert.equal(r.sdkAttested, false);
  assert.equal(r.keyAttested, false);
  assert.equal(r.financialAuthorization, false);
  assert.deepEqual(
    p.calls.map((c) => c.method),
    [
      "psy_getNetworkConfig",
      "psy_getWalletBuildInfo",
      "psy_getUserId",
      "psy_accounts",
    ],
  );
});
test("same network name/magic with substituted RPC or services endpoints is rejected", async () => {
  for (const mutate of [
    (c) =>
      (c.networks[c.defaultNetwork].realm_configs[0].rpc_url[0] =
        "https://evil.invalid"),
    (c) =>
      (c.networks[c.defaultNetwork].api_services_url = [
        "https://evil.invalid",
      ]),
    (c) => (c.networks[c.defaultNetwork].magic = 42),
  ]) {
    const next = structuredClone(config);
    mutate(next);
    await assert.rejects(
      readWalletContext(
        wallet({ psy_getNetworkConfig: next }),
        "public-account",
        config,
      ),
      /endpoints or domain/,
    );
  }
});
test("switched account, unregistered ID and missing build metadata never become a valid wallet context", async () => {
  for (const change of [
    { psy_accounts: ["another-account"] },
    { psy_getUserId: 0 },
    { psy_getUserId: -1 },
    { psy_getUserId: 16777216 },
    { psy_getWalletBuildInfo: {} },
  ])
    await assert.rejects(
      readWalletContext(wallet(change), "public-account", config),
    );
});
