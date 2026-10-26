import {
  canonical,
  digest,
  exactFields,
  hashPattern,
  id,
  requireThat as ok,
} from "./protocol.mjs";
import { MAX_AMOUNT, RADIX } from "../token/wide/arithmetic.mjs";
const P = 18446744069414584321n;
const uint = (v, max = P - 1n) => {
  ok(
    typeof v === "string" &&
      /^(0|[1-9]\d*)$/.test(v) &&
      v.length <= 40 &&
      BigInt(v) <= max,
    "Invalid observed integer",
  );
  return BigInt(v);
};
const words = (v) => {
  ok(Array.isArray(v) && v.length === 4, "Hash word count");
  v.forEach((x) => uint(x));
};
function queryMarket(request, registry) {
  exactFields(request, ["marketId", "userId", "slotStart", "slotCount"]);
  id(request.userId);
  const m = registry.markets.find((x) => x.marketId === request.marketId);
  ok(m, "Unreviewed position market");
  ok(
    Number.isSafeInteger(request.slotStart) &&
      Number.isSafeInteger(request.slotCount) &&
      request.slotStart >= 0 &&
      request.slotCount >= 0 &&
      request.slotCount <= 8 &&
      request.slotStart + request.slotCount <= 128,
    "Invalid NFT query range",
  );
  ok(
    m.nftId
      ? request.slotCount > 0
      : request.slotStart === 0 && request.slotCount === 0,
    "Unexpected NFT range",
  );

  ok(request.userId !== m.vaultId, "Vault is not an ordinary account");
  return m;
}
export function validatePositionSnapshot(
  s,
  request,
  registry,
  registryHash,
  now = Date.now(),
) {
  const m = queryMarket(request, registry);
  ok(
    s.schema === 1 &&
      s.registryHash === registryHash &&
      s.kind === m.kind &&
      s.marketId === m.marketId &&
      s.vaultId === m.vaultId &&
      s.userId === request.userId,
    "Position identity mismatch",
  );
  ok(
    s.assurance === "rpc-observed" &&
      s.financialAuthorization === false &&
      canonical(s.network) === canonical(registry.network),
    "Position assurance/network mismatch",
  );
  ok(
    Number.isSafeInteger(s.checkpoint) &&
      s.checkpoint > 0 &&
      s.checkpoint < 4294967296,
    "Invalid checkpoint",
  );
  ok(
    Number.isSafeInteger(s.observedAt) &&
      Number.isSafeInteger(now) &&
      now >= s.observedAt &&
      now - s.observedAt <= 30000,
    "Position observation expired",
  );
  ok(
    s.userId !== s.vaultId &&
      hashPattern.test(s.user.publicKeyHash) &&
      hashPattern.test(s.user.leafHash),
    "Invalid user observation",
  );
  uint(s.user.nonce, RADIX - 1n);
  uint(s.user.nativeBalance);
  ok(s.assets.length === m.assets.length, "Position asset count");
  m.assets.forEach((a, i) => {
    const x = s.assets[i];
    ok(
      x.contractId === a.contractId &&
        x.decimals === a.decimals &&
        x.symbol === a.symbol,
      "Position asset/decimals mismatch",
    );
    for (const n of ["balance", "sentToVault", "settled", "claimable"])
      uint(x[n], MAX_AMOUNT);
    ok(BigInt(x.sentToVault) >= BigInt(x.settled), "Funding cursor underflow");
  });
  exactFields(s.order, [
    "kind",
    "pool",
    "nonce",
    "deadline",
    "cancelled",
    "order_checkpoint",
    "admission_epoch",
    "admission_nonce",
    "admission_cutoff",
    ...(m.nftId
      ? [
          "seller",
          "listing_nonce",
          "nft_sequence",
          "price",
          "tokenId",
          "metadataHash",
        ]
      : ["side", "x", "y", "z"]),
  ]);
  ok(
    ["0", "1", "2", "3"].includes(s.order.kind) &&
      ["0", "1"].includes(s.order.cancelled) &&
      BigInt(s.order.pool) < 16777216n &&
      BigInt(s.order.deadline) < 4294967296n,
    "Invalid order identity/state",
  );
  for (const [k, v] of Object.entries(s.order)) {
    if (Array.isArray(v)) words(v);
    else uint(v, ["x", "y", "z", "price"].includes(k) ? MAX_AMOUNT : P - 1n);
  }
  exactFields(s.queue, ["epoch", "phase", "cutoff", "count", "root"]);
  exactFields(s.lifecycle, ["consumed", "settledFee"]);
  exactFields(s.nativeOutbox, ["sent", "claimed", "claimable"]);
  for (const v of Object.values(s.queue)) Array.isArray(v) ? words(v) : uint(v);
  ok(
    BigInt(s.queue.count) <= 4n && ["0", "1", "2", "3"].includes(s.queue.phase),
    "Invalid queue state",
  );
  for (const v of Object.values(s.lifecycle)) uint(v);
  for (const v of Object.values(s.nativeOutbox)) uint(v, RADIX - 1n);
  ok(
    BigInt(s.nativeOutbox.sent) >= BigInt(s.nativeOutbox.claimed) &&
      BigInt(s.nativeOutbox.sent) - BigInt(s.nativeOutbox.claimed) ===
        BigInt(s.nativeOutbox.claimable),
    "Native cursor mismatch",
  );
  const seen = new Set();
  ok(
    s.anchors.length === 2 * m.dependencies.length,
    "Missing position anchors",
  );
  for (const a of s.anchors) {
    const k = a.userId + ":" + a.contractId;
    ok(
      !seen.has(k) &&
        [s.userId, m.vaultId].includes(a.userId) &&
        m.dependencies.some((x) => x.contract.contractId === a.contractId) &&
        hashPattern.test(a.root),
      "Invalid/duplicate position anchor",
    );
    seen.add(k);
  }
  if (m.kind === "bondingcurve") {
    exactFields(s.curve, ["phase", "soldLots", "quoteReserve"]);
    for (const [k, v] of Object.entries(s.curve))
      uint(v, k === "quoteReserve" ? MAX_AMOUNT : P - 1n);
  }
  if (m.kind === "nftmarket") {
    const n = s.nft;
    ok(
      n.contractId === m.nftId &&
        n.slotStart === request.slotStart &&
        n.slotCount === request.slotCount &&
        n.slots.length === request.slotCount &&
        n.inventoryComplete === false,
      "NFT scope mismatch",
    );
    uint(n.balance, 128n);
    uint(n.sent, RADIX - 1n);
    uint(n.claimed, RADIX - 1n);
    const count = BigInt(n.sent) - BigInt(n.claimed);
    ok(
      count >= 0n && count <= 4n && n.pending.length === Number(count),
      "NFT cursor mismatch",
    );
    n.slots.forEach((x, i) => {
      ok(
        x.slot === request.slotStart + i && ["0", "1"].includes(x.active),
        "NFT slot mismatch",
      );
      words(x.tokenId);
      words(x.metadataHash);
    });
    n.pending.forEach((x, i) => {
      ok(
        x.sequence === String(BigInt(n.claimed) + 1n + BigInt(i)),
        "NFT sequence mismatch",
      );
      words(x.tokenId);
      words(x.metadataHash);
    });
  }
  return m;
}
export function createPositionClient({
  registry: inputRegistry,
  registryHash,
  fetcher = fetch,
  now = Date.now,
}) {
  const registry = JSON.parse(canonical(inputRegistry));
  let pinned;
  return {
    snapshot: async (input) => {
      const request = JSON.parse(canonical(input));
      pinned ??= digest(registry).then((h) =>
        ok(h === registryHash, "Position registry changed"),
      );
      await pinned;
      queryMarket(request, registry);
      const r = await fetcher("/api/markets/v1/positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: canonical(request),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(90000),
      });
      const raw = await r.text();
      ok(raw.length <= 262144, "Position response limit");
      let s;
      try {
        s = JSON.parse(raw);
      } catch {
        throw Error("Position gateway unavailable");
      }
      if (!r.ok) throw Error(s.error || "Position read failed");
      validatePositionSnapshot(s, request, registry, registryHash, now());
      return s;
    },
  };
}
