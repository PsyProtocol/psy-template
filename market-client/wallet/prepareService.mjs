// Extension-owned integration. A web request may supply a reviewed record, never
// a prover, verifier report, persistence adapter or broadcast implementation.
import { createMarketActionClient } from "../marketActionClient.mjs";
import { canonical, digest } from "../protocol.mjs";
import { createStagedWallet } from "./staged.mjs";
import { prepareMarketCapsule } from "./capsule.mjs";
export function createPrepareOnlyMarketService({
  store,
  bundle,
  provider,
  prepareTrace,
  parse,
  stringify,
}) {
  const client = createMarketActionClient(bundle);
  const unavailable = async () => {
    throw Error(
      "Reviewed native full-call/session verifier and exact transport are not connected; market broadcast disabled",
    );
  };
  const service = createStagedWallet({
    store,
    // Historical reconstruction is separate from live state freshness. Proofs
    // take longer than the UI snapshot TTL. Never use this immutable-record
    // check as the fresh native pre-broadcast identity/state/nonce gate.
    verifyRecord: (r) =>
      createMarketActionClient({
        ...bundle,
        now: () => r.snapshot.observedAt,
      }).validate(r),
    backend: {
      prepareOnly: async (r) => {
        // Filled only by the authoritative background wrapper below. No page can
        // replace it and the service never runs preparations concurrently.
        const c = activeContext;
        if (!c) throw Error("Wallet-owned preparation context missing");
        const market = bundle.registry.markets.find(
          (m) => m.marketId === r.plan.marketId,
        );
        const envelope = await prepareTrace(r, c);
        return prepareMarketCapsule({
          record: r,
          context: c,
          provider,
          envelope,
          parse,
          stringify,
          dependencies: market.dependencies,
        });
      },
      verifyPrepared: unavailable,
      recheck: unavailable,
      broadcastExact: unavailable,
      reconcile: unavailable,
    },
  });
  let activeContext,
    tail = Promise.resolve();
  return {
    capabilities: () => ({
      schema: 1,
      prepareOnly: true,
      broadcast: false,
      nativeFullCallVerifier: false,
      financialAuthorization: false,
      registryHash: bundle.registryHash,
      requiredSdkManifestSha256: bundle.registry.sdkManifestSha256,
      boundary:
        "Internal approved prepare-only integration; no web write capability or SDK attestation",
    }),
    async prepare(context, record) {
      const c = structuredClone(context),
        r = structuredClone(record);
      const task = tail
        .catch(() => {})
        .then(async () => {
          await client.validate(r); // Fresh observation required before a new trace.
          activeContext = c;
          try {
            return await service.prepare(c, r);
          } finally {
            activeContext = undefined;
          }
        });
      tail = task;
      return task;
    },
    list: service.list,
    cancelPreparation: service.cancelPreparation,
    async contextFor(identity) {
      return {
        ...structuredClone(identity),
        networkHash: await digest(bundle.registry.network),
      };
    },
    async assertNoPending(account, chainKey) {
      return service.assertNoPending({
        account,
        chainKey,
        networkHash: await digest(bundle.registry.network),
      });
    },
    async assertNetwork(config) {
      const expected = bundle.networkConfig;
      const domain = (c) => ({
        magic: String(BigInt(c.magic)),
        users_per_realm: c.users_per_realm,
        realm_configs: c.realm_configs.map((r) => ({
          id: r.id,
          rpc_url: r.rpc_url,
        })),
        coordinator_configs: c.coordinator_configs.map((r) => ({
          id: r.id,
          rpc_url: r.rpc_url,
        })),
        api_services_url: c.api_services_url,
      });
      if (canonical(domain(config)) !== canonical(domain(expected)))
        throw Error(
          "Market wallet network domain/endpoints differ from reviewed configuration",
        );
    },
  };
}
