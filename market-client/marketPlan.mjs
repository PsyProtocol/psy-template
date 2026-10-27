import { nativeMethod } from "./nativeProtocol.mjs";
// Unsigned ordinary-user plans. RPC observations and plans never authorize funds.
import { canonical, exactFields, id, requireThat as ok } from "./protocol.mjs";
import { validatePositionSnapshot } from "./positionSnapshot.mjs";
import { parseUnits, MAX_AMOUNT, RADIX } from "../token/wide/arithmetic.mjs";
import {
  call,
  encodeAmount,
  FEE_ESCROW,
  curveQuote,
} from "../amm/u124/client.mjs";

const common = [
  "kind",
  "marketId",
  "userId",
  "recipientId",
  "validForCheckpoints",
  "feeCap",
  "terms",
];
const shapes = {
  "book-order": ["side", "amount", "minimum"],
  "curve-buy": ["lots", "quoteLimit"],
  "curve-sell": ["lots", "quoteLimit"],
  "nft-list": ["slot", "price", "tokenId", "metadataHash"],
  "nft-buy": ["sellerId", "listingNonce", "price", "tokenId", "metadataHash"],
  "claim-ft": ["assetId"],
  "claim-nft": ["slot", "sequence", "tokenId", "metadataHash"],
  "claim-native": [],
  admit: [],
  cancel: [],
  close: [],
  release: [],
  recover: [],
};
function uint(v, max = RADIX - 1n) {
  ok(
    typeof v === "string" && /^(0|[1-9]\d*)$/.test(v) && v.length <= 40,
    "Canonical integer required",
  );
  const n = BigInt(v);
  ok(n <= max, "Integer overflow");
  return n;
}
function amount(v) {
  ok(typeof v === "string" && v.length <= 64, "Decimal amount required");
  const n = parseUnits(v, 18);
  ok(n > 0n && n <= MAX_AMOUNT, "Positive U124 amount required");
  return n;
}
function slot(v) {
  ok(Number.isSafeInteger(v) && v >= 0 && v < 128, "NFT slot must be 0..127");
  return v;
}
function words(v) {
  ok(Array.isArray(v) && v.length === 4, "Four hash words required");
  v.forEach((x) => uint(x, 18446744069414584320n));
}
export function validateMarketRequest(r, registry) {
  exactFields(r, common);
  ok(Object.hasOwn(shapes, r.kind), "Unsupported market action");
  exactFields(r.terms, shapes[r.kind]);
  id(r.marketId);
  id(r.userId);
  id(r.recipientId);
  const m = registry.markets.find((m) => m.marketId === r.marketId);
  ok(m, "Unreviewed market");
  ok(m.quarantined !== true, "Market quarantined; no action can be prepared");
  ok(
    r.userId !== m.vaultId && r.recipientId === r.userId,
    "Only the ordinary owner can receive this action",
  );
  ok(
    Number.isSafeInteger(r.validForCheckpoints) &&
      r.validForCheckpoints >= 1 &&
      r.validForCheckpoints <= 128,
    "Validity must be 1..128 checkpoints",
  );
  ok(typeof r.feeCap === "string" && r.feeCap.length <= 40, "Invalid fee cap");
  const fee = parseUnits(r.feeCap, 9);
  ok(fee > 0n && fee < RADIX, "Invalid native fee budget");
  const t = r.terms;
  if (r.kind === "book-order") {
    ok(
      m.kind === "orderbook" && ["0", "1"].includes(t.side),
      "Orderbook side required",
    );
    amount(t.amount);
    amount(t.minimum);
  }
  if (r.kind.startsWith("curve-")) {
    ok(m.kind === "bondingcurve", "Curve required");
    ok(uint(t.lots, BigInt(m.config.cap)) > 0n, "Positive whole lots required");
    amount(t.quoteLimit);
  }
  if (["nft-list", "nft-buy", "claim-nft"].includes(r.kind)) {
    ok(m.kind === "nftmarket", "NFT market required");
    words(t.tokenId);
    words(t.metadataHash);
    if (r.kind === "nft-buy") {
      id(t.sellerId);
      ok(![r.userId, m.vaultId].includes(t.sellerId), "Invalid NFT seller");
      ok(uint(t.listingNonce) > 0n, "Listing nonce required");
    } else slot(t.slot);
    if (r.kind === "claim-nft")
      ok(uint(t.sequence) > 0n, "NFT delivery sequence required");
    else amount(t.price);
  }
  if (r.kind === "claim-ft")
    ok(
      m.assets.some((a) => a.contractId === t.assetId),
      "Unreviewed claim asset",
    );
  return m;
}
export function actionQuery(r, registry) {
  const m = validateMarketRequest(r, registry),
    start =
      m.nftId && ["nft-list", "claim-nft"].includes(r.kind)
        ? Math.floor(r.terms.slot / 8) * 8
        : 0;
  return {
    marketId: r.marketId,
    userId: r.userId,
    slotStart: start,
    slotCount: m.nftId ? 8 : 0,
  };
}
export function buildMarketPlan(
  s,
  context,
  r,
  registry,
  abis,
  { registryHash, now = Date.now() } = {},
) {
  const m = validateMarketRequest(r, registry),
    q = actionQuery(r, registry),
    t = r.terms;
  validatePositionSnapshot(s, q, registry, registryHash, now);
  exactFields(context, [
    "checkpoint",
    "feeSent",
    "feeClaimed",
    "recoveryPool",
    "batchReady",
    "batchPhase",
    "vaultPool",
    "nftDeposit",
    "seller",
    "sellerEscrow",
  ]);
  ok(context.checkpoint === s.checkpoint, "Plan context checkpoint mismatch");
  for (const k of [
    "feeSent",
    "feeClaimed",
    "recoveryPool",
    "batchReady",
    "batchPhase",
    "vaultPool",
  ])
    uint(context[k]);
  ok(
    uint(context.feeSent) >= uint(s.lifecycle.settledFee) &&
      uint(context.feeSent) >= uint(context.feeClaimed),
    "Fee cursor underflow",
  );
  ok(
    ["0", "1"].includes(context.batchReady) &&
      ["0", "1", "2", "3", "4"].includes(context.batchPhase),
    "Invalid batch lifecycle",
  );
  ok(
    uint(context.recoveryPool) < 16777216n &&
      uint(context.vaultPool) < 16777216n,
    "Invalid context peer",
  );
  const nft = m.kind === "nftmarket",
    o = s.order,
    queue = s.queue,
    v = BigInt(m.vaultId),
    calls = [],
    debits = [];
  if (nft) {
    exactFields(context.nftDeposit, ["sent", "claimed"]);
    ok(
      uint(context.nftDeposit.sent) >= uint(context.nftDeposit.claimed),
      "NFT deposit cursor underflow",
    );
  } else ok(context.nftDeposit === null, "Unexpected NFT deposit context");
  if (r.kind !== "nft-buy")
    ok(
      context.seller === null && context.sellerEscrow === null,
      "Unexpected seller context",
    );
  ok(uint(s.user.nonce) < RADIX - 1n, "Wallet nonce exhausted");
  const end = s.checkpoint + r.validForCheckpoints;
  ok(end < 4294967296, "Checkpoint expiry overflow");
  const fee = parseUnits(r.feeCap, 9),
    nonce = uint(o.nonce) + 1n;
  const invoke = (contract, name, args = []) => {
    const abi = abis[String(contract)];
    ok(abi, "Reviewed call ABI missing");
    const c = call(BigInt(contract), abi, name, args);
    calls.push({
      contract_id: String(c.contract_id),
      method_id: String(c.method_id),
      method_name: name,
      inputs: c.inputs.map(String),
    });
  };
  const market = (name, args = []) => invoke(m.marketId, name, args);
  const native = (name, args) =>
    calls.push({
      contract_id: "0",
      method_name: name,
      inputs: args.map(String),
    });
  const unlocked = () =>
    o.admission_nonce !== o.nonce ||
    o.admission_epoch === "0" ||
    BigInt(queue.epoch) > BigInt(o.admission_epoch) ||
    (queue.epoch === o.admission_epoch && queue.phase === "3");
  const active = () =>
    ok(
      (m.kind === "orderbook" ? o.kind === "1" : ["1", "2"].includes(o.kind)) &&
        o.pool === String(v),
      "No matching active order",
    );
  const availableBatch = () =>
    context.batchReady === "1" && ["0", "3", "4"].includes(context.batchPhase);
  const unused = (a) => BigInt(a.sentToVault) - BigInt(a.settled);
  const newOrder = () => {
    ok(
      o.kind === "0" && ["0", String(v)].includes(o.pool) && unlocked(),
      "Prior order or consent is unresolved",
    );
    ok(nonce < RADIX, "Order nonce exhausted");
    ok(
      s.assets.every((a) => unused(a) === 0n) &&
        context.feeSent === s.lifecycle.settledFee &&
        context.feeClaimed === s.lifecycle.settledFee,
      "Recover unused deposits before a new order",
    );
    ok(
      context.recoveryPool === "0",
      "Resolve previous recovery enrollment first",
    );
    ok(
      availableBatch() &&
        queue.phase === "1" &&
        BigInt(queue.count) < 4n &&
        Number(queue.cutoff) >= s.checkpoint &&
        Number(queue.cutoff) <= end,
      "No eligible open queue; do not deposit",
    );
    if (nft)
      ok(
        context.vaultPool === String(v) &&
          context.nftDeposit.sent === context.nftDeposit.claimed &&
          BigInt(context.nftDeposit.sent) < RADIX - 1n,
        "NFT vault inactive or previous deposit pending",
      );
  };
  const escrow = () => {
    ok(
      BigInt(context.feeSent) + FEE_ESCROW < RADIX,
      "Native fee cursor overflow",
    );
    native(nativeMethod(registry, "transfer"), [v, FEE_ESCROW]);
    debits.push({ contractId: 0, amount: String(FEE_ESCROW) });
  };
  const fund = (asset, qty) => {
    ok(BigInt(asset.balance) >= qty, "Insufficient spendable FT balance");
    ok(
      BigInt(asset.sentToVault) + qty <= MAX_AMOUNT,
      "FT funding cursor overflow",
    );
    invoke(asset.contractId, "transfer", [v, encodeAmount(qty)]);
    debits.push({ contractId: asset.contractId, amount: String(qty) });
  };
  let effect =
      "No market trade is reversed. Subsequent actions require fresh state and their own authorization.",
    quote = null;
  if (r.kind === "book-order") {
    newOrder();
    const a = amount(t.amount),
      b = amount(t.minimum);
    market("open_sell", [
      v,
      BigInt(t.side),
      encodeAmount(a),
      encodeAmount(b),
      BigInt(end),
      nonce,
    ]);
    escrow();
    fund(s.assets[Number(t.side)], a);
    effect =
      "Whole-order limit terms only. Admission and deterministic matching are separate; no partial fill or immediate output is promised.";
  } else if (["curve-buy", "curve-sell"].includes(r.kind)) {
    newOrder();
    ok(s.curve.phase === "1", "Curve is not active");
    const buy = r.kind === "curve-buy",
      lots = uint(t.lots),
      limit = amount(t.quoteLimit);
    const observed = curveQuote(m.config, BigInt(s.curve.soldLots), lots, buy);
    ok(
      buy
        ? BigInt(s.curve.quoteReserve) + observed.quoted <= MAX_AMOUNT
        : BigInt(s.curve.quoteReserve) >= observed.quoted,
      "Curve reserve cannot support observed trade",
    );
    quote = String(observed.quoted);
    ok(
      buy ? observed.quoted <= limit : observed.quoted >= limit,
      "Observed Curve price violates explicit limit",
    );
    market(buy ? "open_limit_buy" : "open_limit_sell", [
      v,
      lots,
      0n,
      encodeAmount(limit),
      BigInt(end),
      nonce,
    ]);
    escrow();
    fund(s.assets[buy ? 1 : 0], buy ? limit : observed.tokenAmount);
    effect =
      "Contract recomputes progressive price during settlement. Explicit maximum buy spend or minimum sell output remains binding; observations are not a trusted future quote.";
  } else if (r.kind === "nft-list") {
    newOrder();
    const owned = s.nft.slots.find((x) => x.slot === t.slot);
    ok(owned?.active === "1", "NFT slot not owned");
    ok(
      canonical(owned.tokenId) === canonical(t.tokenId) &&
        canonical(owned.metadataHash) === canonical(t.metadataHash),
      "NFT identity changed",
    );
    market("open_listing", [
      v,
      BigInt(t.slot),
      encodeAmount(amount(t.price)),
      BigInt(end),
      nonce,
    ]);
    escrow();
    invoke(m.nftId, "transfer", [BigInt(t.slot), v]);
    effect =
      "Escrows exactly the observed NFT and price. Listing confirmation and admission precede a unique sale or an actual NFT return.";
  } else if (r.kind === "nft-buy") {
    newOrder();
    const seller = context.seller;
    ok(seller, "Seller observation required");
    validatePositionSnapshot(
      seller,
      { marketId: r.marketId, userId: t.sellerId, slotStart: 0, slotCount: 8 },
      registry,
      registryHash,
      now,
    );
    const listing = seller.order;
    const listingEscrow = context.sellerEscrow;
    exactFields(listingEscrow, [
      "sent",
      "claimed",
      "feeSent",
      "tokenId",
      "metadataHash",
    ]);
    words(listingEscrow.tokenId);
    words(listingEscrow.metadataHash);
    ok(
      uint(listingEscrow.sent) === uint(listing.nft_sequence) + 1n &&
        uint(listingEscrow.claimed) === uint(listing.nft_sequence),
      "Listing NFT escrow is not funded at the exact sequence",
    );
    ok(
      canonical(listingEscrow.tokenId) === canonical(t.tokenId) &&
        canonical(listingEscrow.metadataHash) === canonical(t.metadataHash),
      "Escrow NFT identity changed",
    );
    ok(
      uint(listingEscrow.feeSent) >= uint(seller.lifecycle.settledFee) &&
        uint(listingEscrow.feeSent) - uint(seller.lifecycle.settledFee) ===
          FEE_ESCROW,
      "Seller fee escrow is not funded",
    );
    ok(
      seller.checkpoint === s.checkpoint &&
        listing.kind === "1" &&
        listing.pool === String(v) &&
        listing.nonce === t.listingNonce &&
        listing.cancelled === "0" &&
        BigInt(seller.lifecycle.consumed) < BigInt(listing.nonce) &&
        Number(listing.deadline) >= s.checkpoint,
      "Listing unavailable or mixed checkpoint",
    );
    ok(
      BigInt(listing.price) === amount(t.price) &&
        canonical(listing.tokenId) === canonical(t.tokenId) &&
        canonical(listing.metadataHash) === canonical(t.metadataHash),
      "Listing terms or NFT substituted",
    );
    ok(
      s.nft.pending.length === 0 && BigInt(s.nft.balance) < 128n,
      "Claim existing NFT delivery before another purchase",
    );
    invoke(m.nftId, "acknowledge", [v]);
    market("open_buy", [
      v,
      BigInt(t.sellerId),
      uint(t.listingNonce),
      encodeAmount(amount(t.price)),
      BigInt(end),
      nonce,
    ]);
    escrow();
    fund(s.assets[0], amount(t.price));
    effect =
      "Binds the observed seller, listing nonce, NFT and exact price. Unique sale is decided by settlement; losers require actual payment return.";
  } else if (r.kind === "claim-ft") {
    const asset = s.assets.find((a) => a.contractId === t.assetId);
    ok(BigInt(asset.claimable) > 0n, "No confirmed FT Outbox delta");
    ok(
      BigInt(asset.balance) + BigInt(asset.claimable) <= MAX_AMOUNT,
      "FT claim balance overflow",
    );
    invoke(t.assetId, "claim", [v]);
    effect =
      "Claims the actual FT Outbox delta to the ordinary owner. Pending outputs are not spendable until confirmation.";
  } else if (r.kind === "claim-native") {
    ok(BigInt(s.nativeOutbox.claimable) > 0n, "No native Outbox delta");
    ok(
      BigInt(s.user.nativeBalance) + BigInt(s.nativeOutbox.claimable) < RADIX,
      "Native claim balance overflow",
    );
    native(nativeMethod(registry, "claim"), [v]);
  } else if (r.kind === "claim-nft") {
    const pending = s.nft.pending[0],
      destination = s.nft.slots.find((x) => x.slot === t.slot);
    ok(
      pending &&
        pending.sequence === t.sequence &&
        canonical(pending.tokenId) === canonical(t.tokenId) &&
        canonical(pending.metadataHash) === canonical(t.metadataHash),
      "Next FIFO NFT delivery changed",
    );
    ok(
      destination?.active === "0" && BigInt(s.nft.balance) < 128n,
      "NFT destination is occupied or inventory full",
    );
    invoke(m.nftId, "claim", [BigInt(t.slot), v]);
    effect =
      "Claims only the next FIFO NFT into an observed empty slot. It cannot skip deliveries or overwrite ownership.";
  } else if (r.kind === "recover") {
    ok(
      o.kind === "0" ||
        o.pool !== String(v) ||
        BigInt(s.lifecycle.consumed) >= BigInt(o.nonce),
      "Active order must settle or lawfully exit",
    );
    ok(
      context.recoveryPool === "0" && availableBatch(),
      "Recovery already enrolled or committed batch active",
    );
    ok(
      s.assets.some((a) => unused(a) > 0n) ||
        BigInt(context.feeSent) > BigInt(s.lifecycle.settledFee) ||
        (nft && context.nftDeposit.sent !== context.nftDeposit.claimed),
      "No unused funding to recover",
    );
    market("request_recovery", [v]);
    effect =
      "Enrolls only the original payer. Restricted Executor recovery and ordinary claims remain separate; this does not transfer a refund now.";
  } else {
    active();
    if (r.kind === "admit") {
      ok(
        o.cancelled === "0" &&
          BigInt(s.lifecycle.consumed) < BigInt(o.nonce) &&
          queue.phase === "1" &&
          BigInt(queue.epoch) > 0n &&
          BigInt(queue.count) < 4n &&
          Number(queue.cutoff) >= s.checkpoint &&
          Number(o.deadline) >= Number(queue.cutoff),
        "Order cannot enter this queue",
      );
      ok(
        o.admission_epoch !== queue.epoch || o.admission_nonce !== o.nonce,
        "Already consented; reconcile original admission",
      );
      market("request_admission", [BigInt(queue.epoch), BigInt(queue.cutoff)]);
      effect =
        "Consent only. Executor must admit this owner and nonce and process every accepted member; this is not settlement.";
    } else if (r.kind === "cancel") {
      ok(
        o.cancelled === "0" && BigInt(s.lifecycle.consumed) < BigInt(o.nonce),
        "Cancellation already requested or order consumed",
      );
      market("request_cancel");
      effect =
        "Requests cancellation. Frozen membership remains intact; wait for batch outcome or lawful epoch closure before recovery.";
    } else if (r.kind === "release") {
      ok(
        o.cancelled === "1" && unlocked(),
        "Cancellation and consent closure required",
      );
      market("release_unaccepted");
      effect =
        "Clears only the lawfully unlocked order; funds do not move. Refresh before sender-bound recovery and later claims.";
    } else {
      ok(
        unlocked() &&
          s.assets.every((a) => unused(a) === 0n) &&
          context.feeSent === s.lifecycle.settledFee,
        "Consent or deposits prevent closure",
      );
      if (nft)
        ok(
          BigInt(s.lifecycle.consumed) >= BigInt(o.nonce) &&
            context.feeSent === context.feeClaimed &&
            context.nftDeposit.sent === context.nftDeposit.claimed,
          "NFT order is not fully settled",
        );
      market(
        m.kind === "orderbook"
          ? `close_${o.side}`
          : nft
            ? o.kind === "1"
              ? "close_listing"
              : "close_buy"
            : o.kind === "1"
              ? "close_buy"
              : "close_sell",
      );
    }
  }
  const nativeDebit = debits
    .filter((d) => d.contractId === 0)
    .reduce((s, d) => s + BigInt(d.amount), 0n);
  ok(
    BigInt(s.user.nativeBalance) >= nativeDebit + fee,
    "Insufficient current native balance for maximum fee and escrow",
  );
  ok(
    calls.length >= 1 && calls.length <= 4,
    "Ordinary call count outside reviewed planner scope",
  );
  return {
    schema: 1,
    source: "rpc-observed-unsigned",
    financialAuthorization: false,
    kind: r.kind,
    marketId: r.marketId,
    userId: r.userId,
    recipientId: r.userId,
    registryHash,
    sdkManifestSha256: registry.sdkManifestSha256,
    ...(registry.nativeProtocol ? {nativeProtocol: registry.nativeProtocol} : {}),
    network: registry.network,
    vault: {
      userId: m.vaultId,
      publicKeyHash: m.publicKeyHash,
      fingerprint: m.fingerprint,
    },
    startCheckpoint: s.checkpoint,
    validUntilCheckpoint: end,
    startUserLeafHash: s.user.leafHash,
    walletNonce: String(BigInt(s.user.nonce) + 1n),
    orderNonce: [
      "book-order",
      "curve-buy",
      "curve-sell",
      "nft-list",
      "nft-buy",
    ].includes(r.kind)
      ? String(nonce)
      : o.nonce,
    anchors: s.anchors,
    sellerAnchors: context.seller?.anchors ?? [],
    calls,
    callCount: calls.length,
    debits,
    maxNetworkFee: String(fee),
    actualNetworkFee: null,
    observedQuote: quote,
    effect,
    requiredBeforeBroadcast: [
      "origin-approved wallet intent and reviewed dependency/key identity",
      "fresh network/code/layout/state/nonce/expiry and fee bounds",
      "full ordinary call stack including burn; session/sig_hash and independent full UPS verification",
      "durable one-shot exact broadcast and original-identity reconcile",
    ],
  };
}
