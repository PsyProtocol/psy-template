import {
  canonical,
  digest,
  exactFields,
  requireThat as ok,
} from "./protocol.mjs";
import { validateMarketRequest, buildMarketPlan } from "./marketPlan.mjs";
export function createMarketActionClient({
  registry: source,
  registryHash,
  abis: sourceAbis,
  fetcher = fetch,
  now = Date.now,
}) {
  const registry = JSON.parse(canonical(source)),
    abis = JSON.parse(canonical(sourceAbis));
  let ready;
  const abiDigest = async (x) =>
    [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(canonical(x) + "\n"),
        ),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const pin = () =>
    (ready ??= (async () => {
      ok((await digest(registry)) === registryHash, "Market registry changed");
      for (const m of registry.markets) {
        ok(
          (await abiDigest(abis[m.marketId])) === m.abiSha256,
          "Market ABI changed",
        );
        for (const a of m.assets)
          ok(
            (await abiDigest(abis[a.contractId])) === a.abiSha256,
            "Asset ABI changed",
          );
        if (m.nftId)
          ok(
            (await abiDigest(abis[m.nftId])) === m.nftAbiSha256,
            "NFT ABI changed",
          );
      }
    })());
  const validate = async (input, response) => {
    const request = JSON.parse(canonical(input)),
      r = JSON.parse(canonical(response));
    await pin();
    validateMarketRequest(request, registry);
    exactFields(r, [
      "schema",
      "request",
      "snapshot",
      "context",
      "plan",
      "registryHash",
      "recordId",
    ]);
    ok(
      r.schema === 1 &&
        r.registryHash === registryHash &&
        canonical(r.request) === canonical(request),
      "Market plan request substituted",
    );
    const expected = buildMarketPlan(
      r.snapshot,
      r.context,
      request,
      registry,
      abis,
      { registryHash, now: now() },
    );
    ok(
      canonical(r.plan) === canonical(expected),
      "Market plan calls, terms, endpoints or fees changed",
    );
    const record = {
      schema: 1,
      request: r.request,
      snapshot: r.snapshot,
      context: r.context,
      plan: r.plan,
    };
    ok(
      (await digest(record)) === r.recordId,
      "Market plan record identity changed",
    );
    return r;
  };
  return {
    validate: async (response) => validate(response.request, response),
    plan: async (input) => {
      const request = JSON.parse(canonical(input));
      await pin();
      validateMarketRequest(request, registry);
      const response = await fetcher("/api/markets/v1/market-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: canonical(request),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(90000),
      });
      const raw = await response.text();
      ok(raw.length <= 262144, "Market plan response limit");
      let r;
      try {
        r = JSON.parse(raw);
      } catch {
        throw Error("Market plan gateway unavailable");
      }
      if (!response.ok) throw Error(r.error || "Market plan request failed");
      return validate(request, r);
    },
  };
}
