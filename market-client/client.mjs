import {
  canonical,
  digest,
  requireThat as ok,
  id,
  hashPattern,
  WRITE_BOUNDARY,
} from "./protocol.mjs";
import { validateSnapshot, buildAmmPlan } from "./ammPlan.mjs";
export function createPublicMarketClient({
  registry,
  registryHash,
  fetcher = fetch,
  base = "/api/markets",
  now = Date.now,
}) {
  ok(
    base === "/api/markets",
    "Only the same-origin reviewed gateway path is supported",
  );
  ok(hashPattern.test(registryHash), "Pinned registry digest required");
  // Every response is independently compared to the app's bundled registry.
  const pinned = JSON.parse(canonical(registry));
  let ready;
  const pin = () =>
    (ready ??= (async () =>
      ok(
        (await digest(pinned)) === registryHash,
        "Bundled registry changed",
      ))());
  const request = async (path, body) => {
    await pin();
    const response = await fetcher(base + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : {},
      ...(body ? { body: canonical(body) } : {}),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    const text = await response.text();
    ok(text.length <= 262144, "Gateway response too large");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw Error(
        "Market gateway is unavailable or returned an invalid response",
      );
    }
    if (!response.ok)
      throw Error(
        typeof data.error === "string"
          ? data.error
          : "Market gateway read failed",
      );
    ok(
      data.registryHash === registryHash,
      "Gateway registry identity mismatch",
    );
    return data;
  };
  return {
    status: async () => {
      const s = await request("/v1/status");
      ok(
        canonical(s.registry) === canonical(pinned),
        "Gateway route substituted",
      );
      ok(
        s.capabilities?.financialSubmission === false &&
          s.capabilities?.walletPreparedProof === false,
        "Unexpected gateway write capability",
      );
      return s;
    },
    snapshot: async (marketId, userId) => {
      id(userId);
      const s = await request("/v1/snapshot", { marketId, userId });
      validateSnapshot(s, pinned, {
        marketId,
        userId,
        now: now(),
        registryHash,
      });
      return s;
    },
    plan: async (input) => {
      const record = await request("/v1/plan", input);
      const recomputed = buildAmmPlan(record.snapshot, input, pinned, {
        now: now(),
        registryHash,
      });
      ok(
        canonical(record.plan) === canonical(recomputed),
        "Gateway plan calls, route or quantities were modified",
      );
      const original = {
        schema: 1,
        request: input,
        snapshot: record.snapshot,
        plan: record.plan,
      };
      ok(
        record.recordId === (await digest(original)),
        "Unsigned plan record mismatch",
      );
      return record;
    },
    receipt: async (identity) => {
      id(identity.userId);
      ok(
        hashPattern.test(identity.endUserLeafHash) &&
          Number.isSafeInteger(identity.minCheckpoint) &&
          identity.minCheckpoint > 0,
        "Exact original receipt identity required",
      );
      const r = await request("/v1/receipt", identity),
        result = r.result;
      ok(
        r.financialAuthorization === false,
        "Receipt cannot authorize another payment",
      );
      ok(
        ["included", "unresolved"].includes(result?.status),
        "Receipt cannot silently release a broadcast lock",
      );
      if (result.status === "included") {
        ok(
          result.userId === identity.userId &&
            result.endUserLeafHash === identity.endUserLeafHash &&
            hashPattern.test(result.contentHash) &&
            Number.isSafeInteger(result.checkpoint) &&
            result.checkpoint >= identity.minCheckpoint,
          "Original receipt identity mismatch",
        );
      }
      return result;
    },
    submit: async () => {
      throw Error(WRITE_BOUNDARY);
    },
  };
}
