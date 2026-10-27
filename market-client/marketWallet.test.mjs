import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarketWalletClient,
  marketWalletPhase,
} from "./marketWallet.mjs";
function fixture(kind = "swap") {
  const calls = [],
    record = {
      recordId: "1".repeat(64),
      registryHash: "2".repeat(64),
      plan: { kind, marketId: 1000, network: { chainRootAt1: "3".repeat(64) } },
    },
    entry = {
      recordId: record.recordId,
      intentId: "4".repeat(64),
      preparedHash: "5".repeat(64),
      phase: "prepared",
    };
  let drop = false,
    usable = true;
  const provider = {
    async request(q) {
      calls.push(q);
      if (q.method === "psy_getMarketWriteCapabilities")
        return {
          prepareOnly: !usable,
          broadcast: usable,
          nativeFullCallVerifier: usable,
          registryHashes: [record.registryHash],
          enabledMarketIds: [1000],
          chainRootAt1: record.plan.network.chainRootAt1,
          nftWrite: false,
        };
      if (q.method === "psy_listMarketPreparations") return [entry];
      if (q.method === "psy_broadcastMarketPreparation") {
        if (drop) throw Error("Lost response");
        return { ...entry, phase: "unresolved" };
      }
      return entry;
    },
  };
  return {
    client: createMarketWalletClient(provider, "a".repeat(64), record),
    calls,
    entry,
    record,
    setDrop: (v) => {
      drop = v;
    },
    setUsable: (v) => {
      usable = v;
    },
  };
}
test("only an exact verified identity is sent, once; unknown response creates no replacement", async () => {
  const f = fixture();
  assert.equal((await f.client.capabilities()).usable, true);
  f.setDrop(true);
  await assert.rejects(f.client.approveAndBroadcast(f.entry), /Lost/);
  assert.equal(
    f.calls.filter((c) => c.method === "psy_broadcastMarketPreparation").length,
    1,
  );
  await f.client.reconcile(f.entry);
  assert.equal(
    f.calls.filter((c) => c.method === "psy_broadcastMarketPreparation").length,
    1,
  );
  assert.equal(
    f.calls.some((c) => c.method === "psy_sendTransaction"),
    false,
  );
  await assert.rejects(async () =>
    f.client.approveAndBroadcast({ ...f.entry, recordId: "0".repeat(64) }),
  );
  assert.match(marketWalletPhase("included"), /Request confirmed/);
  assert.doesNotMatch(marketWalletPhase("included"), /trade completed/i);
});
test("missing resources and NFT postcondition do not advertise usable execution", async () => {
  const f = fixture();
  f.setUsable(false);
  assert.equal((await f.client.capabilities()).usable, false);
  const nft = fixture("nft-buy");
  assert.equal((await nft.client.capabilities()).usable, false);
});
