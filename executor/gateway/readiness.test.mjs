import test from "node:test";
import assert from "node:assert/strict";
import { createReadinessReader } from "./readiness.mjs";
import { fixtureRegistry, H, NOW } from "./fixtures.mjs";
import { validateReadiness } from "../../market-client/readiness.mjs";
import { MAINNET_BETA_PROFILE, MAINNET_BETA_MANIFEST, MAINNET_BETA_NATIVE_ROOT } from "../../market-client/nativeProtocol.mjs";
async function setup() {
  const registry = await fixtureRegistry();
  registry.network.chainRootAt1 = H("chain");
  let reads = 0;
  const dep = new Map(
    registry.markets.flatMap((m) =>
      m.dependencies.map((d) => [d.contract.contractId, d]),
    ),
  );
  let checked = [];
  const state = {
    networkName: registry.network.name,
    network: {
      magic: registry.network.magic,
      users_per_realm: registry.network.usersPerRealm,
    },
    checkpoint: 3000,
    coordinator: "https://coordinator.example",
    rpc: async (_url, method, params) => {
      assert.equal(method, "psy_get_checkpoint_leaf_data");
      assert.deepEqual(params, { checkpoint_id: 1 });
      return { global_chain_root: H("chain") };
    },
    contractLeaf: async (id) => {
      checked.push(id);
      const d = dep.get(id);
      return {
        deployer: H("owner"),
        code_root: d.contract.codeRoot,
        state_tree_height: d.contract.stateTreeHeight,
        state_layout_root: d.contract.layoutRoot,
        state_layout_field_count: d.layoutFieldCount,
        state_layout_slot_count: d.layoutSlotCount,
        function_tree_root: d.functionTreeRoot,
      };
    },
  };
  const options = {
    registry,
    registryHash: H("registry"),
    rpcConfig: "fixed-config",
    now: () => NOW,
    readState: async () => {
      reads++;
      await new Promise((r) => setTimeout(r, 5));
      return state;
    },
  };
  return {
    registry,
    state,
    options,
    reader: () => createReadinessReader(options),
    get reads() {
      return reads;
    },
    checked,
  };
}
test("readonly readiness checks pinned chain/native/dependencies and never grants finance", async () => {
  const f = await setup(),
    s = await f.reader()();
  assert.equal(s.state, "registry-matches");
  assert.equal(s.financialSubmission, false);
  assert.equal(s.financialAuthorization, false);
  assert.ok(s.checkedDependencies > 0);
  assert.equal(
    validateReadiness(s, f.registry, H("registry"), NOW).state,
    s.state,
  );
});
test("numeric native owner and changed code root stop before probing old market IDs", async () => {
  const f = await setup();
  const leaf = f.state.contractLeaf;
  f.state.contractLeaf = async (id) => ({ ...(await leaf(id)), deployer: 0 });
  const s = await f.reader()();
  assert.equal(s.state, "protocol-incompatible");
  assert.equal(s.nativeSchemaCompatible, false);
  assert.deepEqual(f.checked, [0]);
});
test("selected SDK accepts its exact numeric native owner and rejects legacy coercion", async () => {
  const f = await setup();
  f.registry.nativeProtocol = MAINNET_BETA_PROFILE;
  f.registry.sdkManifestSha256 = MAINNET_BETA_MANIFEST;
  f.registry.network.name = f.state.networkName = "testnet";
  for (const m of f.registry.markets)
    m.dependencies.find(d => d.contract.contractId === 0).contract.codeRoot = MAINNET_BETA_NATIVE_ROOT;
  const leaf = f.state.contractLeaf;
  let owner = 0;
  f.state.contractLeaf = async id => ({ ...(await leaf(id)), deployer: id === 0 ? owner : 1 });
  assert.equal((await f.reader()()).state, "registry-matches");
  for (const bad of ["0", H("owner"), -1, 4294967296]) {
    owner = bad;
    assert.equal((await f.reader()()).state, "protocol-incompatible");
  }
});
test("missing or changed checkpoint-one identity cannot accept matching contract roots", async () => {
  for (const pinned of [undefined, H("other-chain")]) {
    const f = await setup();
    if (pinned) f.registry.network.chainRootAt1 = pinned;
    else delete f.registry.network.chainRootAt1;
    const s = await f.reader()();
    assert.equal(s.state, "deployment-required");
    assert.equal(s.checkedDependencies, 0);
  }
});
test("readiness coalesces only simultaneous reads and returns independent results", async () => {
  const f = await setup(),
    read = f.reader();
  const [a, b] = await Promise.all([read(), read()]);
  assert.equal(f.reads, 1);
  a.issues[0] = "mutated";
  assert.notEqual(a.issues[0], b.issues[0]);
  f.state.checkpoint++;
  assert.equal((await read()).checkpoint, 3001);
  assert.equal(f.reads, 2);
});
test("outage, malformed identity and wrong network fail closed without fixture fallback", async () => {
  const f = await setup();
  f.options.readState = async () => {
    throw Error("outage");
  };
  assert.equal((await f.reader()()).state, "rpc-unavailable");
  const g = await setup();
  g.state.network.magic = "1";
  assert.equal((await g.reader()()).state, "identity-rejected");
  const h = await setup();
  h.state.rpc = async () => ({ global_chain_root: "bad" });
  assert.equal((await h.reader()()).state, "identity-rejected");
});
test("browser rejects authorization escalation, stale status and malformed identity", async () => {
  const f = await setup(),
    value = await f.reader()();
  for (const mutate of [
    (v) => (v.financialAuthorization = true),
    (v) => (v.financialSubmission = true),
    (v) => (v.observedAt = NOW - 30001),
    (v) => (v.chainRoot = "wrong"),
    (v) => (v.registryHash = H("other")),
    (v) => (v.state = "ready"),
    (v) => (v.checkpoint = 0),
  ]) {
    const v = structuredClone(value);
    mutate(v);
    assert.throws(() => validateReadiness(v, f.registry, H("registry"), NOW));
  }
});
