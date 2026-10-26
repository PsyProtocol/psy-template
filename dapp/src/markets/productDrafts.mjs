// Non-financial previews only. No contract IDs, chain nonce, request hash,
// signature, receipt, settlement or claim are invented for these markets.
import {
  parseUnits,
  encodeAmount,
  MAX_AMOUNT,
} from "../../../token/wide/arithmetic.mjs";
import { curveQuote } from "../../../amm/u124/client.mjs";
import { canonical } from "../../../market-client/protocol.mjs";
import { SDK_MANIFEST } from "./domain.mjs";
export const PRODUCT_STORAGE = "psy.markets.product-drafts.v1";
export const FIXTURE_VERSION = "three-markets-ui-20261026-v1";
const U = 10n ** 18n,
  ok = (c, m) => {
    if (!c) throw Error(m);
  };
const clone = (x) => JSON.parse(JSON.stringify(x));
function freeze(x) {
  if (x && typeof x === "object") {
    Object.values(x).forEach(freeze);
    Object.freeze(x);
  }
  return x;
}
const fields = (x, names) =>
  ok(
    x &&
      typeof x === "object" &&
      !Array.isArray(x) &&
      Object.keys(x).sort().join(",") === names.sort().join(","),
    "Unexpected draft fields",
  );
function amount(text) {
  ok(typeof text === "string" && text.length <= 64, "Enter a valid amount");
  let n;
  try {
    n = parseUnits(text, 18);
  } catch {
    throw Error("Amount must fit U124 with at most 18 decimals");
  }
  ok(n > 0n, "Amount must be greater than zero");
  return n;
}
function common(form, now) {
  ok(
    typeof form.userId === "string" &&
      /^[1-9]\d{0,7}$/.test(form.userId) &&
      BigInt(form.userId) < 16777216n,
    "Enter a demo user ID from 1 to 16777215",
  );
  ok(
    ["15", "30", "60"].includes(form.deadlineMinutes),
    "Unsupported draft expiry",
  );
  ok(
    typeof form.feeCap === "string" && form.feeCap.length <= 32,
    "Enter a valid fee cap",
  );
  let fee;
  try {
    fee = parseUnits(form.feeCap, 9);
  } catch {
    throw Error("Fee cap uses test PSY with at most 9 decimals");
  }
  ok(
    fee > 0n && fee <= 50n * 10n ** 9n,
    "Fee cap must be positive and at most 50 test PSY",
  );
  ok(
    Number.isSafeInteger(now) && now > 0 && Number.isSafeInteger(now + 3600000),
    "Invalid draft timestamp",
  );
  return {
    owner: form.userId,
    feeCap: String(fee),
    createdAt: now,
    expiresAt: now + Number(form.deadlineMinutes) * 60000,
  };
}
const ceil = (a, b) => (a + b - 1n) / b;
const bounded = (n) => {
  ok(
    n > 0n && n <= MAX_AMOUNT,
    "Calculated amount exceeds U124 or rounds to zero",
  );
  return n;
};
export function decimalPrice(quote, base, digits = 4) {
  const n = BigInt(quote),
    d = BigInt(base);
  ok(
    d > 0n &&
      n >= 0n &&
      Number.isInteger(digits) &&
      digits >= 1 &&
      digits <= 18,
    "Invalid price",
  );
  const scale = 10n ** BigInt(digits),
    v = (n * scale) / d;
  if (n > 0n && v === 0n) return "< 0." + "0".repeat(digits - 1) + "1";
  return String(v / scale) + "." + String(v % scale).padStart(digits, "0");
}
export const BOOK_ROWS = freeze([
  {
    id: "ASK-1",
    side: "ask",
    base: String(10n * U),
    quote: String(11n * U),
    owner: "30001",
    checkpoint: "100",
  },
  {
    id: "ASK-2",
    side: "ask",
    base: String(8n * U),
    quote: String((88n * U) / 10n),
    owner: "30002",
    checkpoint: "99",
  },
  {
    id: "ASK-3",
    side: "ask",
    base: String(5n * U),
    quote: String((56n * U) / 10n),
    owner: "30003",
    checkpoint: "98",
  },
  {
    id: "BID-1",
    side: "bid",
    base: String(5n * U),
    quote: String((54n * U) / 10n),
    owner: "40001",
    checkpoint: "100",
  },
  {
    id: "BID-2",
    side: "bid",
    base: String(3n * U),
    quote: String((321n * U) / 100n),
    owner: "40002",
    checkpoint: "99",
  },
  {
    id: "BID-3",
    side: "bid",
    base: String(12n * U),
    quote: String((126n * U) / 10n),
    owner: "40003",
    checkpoint: "98",
  },
]);
export function rankBookRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.side !== b.side) return a.side === "ask" ? -1 : 1;
    const left = BigInt(a.quote) * BigInt(b.base),
      right = BigInt(b.quote) * BigInt(a.base);
    if (left !== right)
      return (left < right ? -1 : 1) * (a.side === "ask" ? 1 : -1);
    const cp = BigInt(a.checkpoint) - BigInt(b.checkpoint);
    return cp < 0n
      ? -1
      : cp > 0n
        ? 1
        : BigInt(a.owner) < BigInt(b.owner)
          ? -1
          : BigInt(a.owner) > BigInt(b.owner)
            ? 1
            : 0;
  });
}
function make(market, action, form, now, data) {
  return freeze({
    schema: 1,
    market,
    action,
    source: "local-fixture",
    financialAuthorization: false,
    network: "unverified-demo",
    fixtureVersion: FIXTURE_VERSION,
    sdkReference: SDK_MANIFEST,
    inputForm: clone(form),
    ...common(form, now),
    ...data,
  });
}
export function previewBook(form, now = Date.now()) {
  fields(form, [
    "side",
    "amount",
    "limitPrice",
    "userId",
    "feeCap",
    "deadlineMinutes",
  ]);
  ok(["buy", "sell"].includes(form.side), "Unsupported order side");
  const base = amount(form.amount),
    price = amount(form.limitPrice),
    quote = bounded(ceil(base * price, U)),
    buy = form.side === "buy";
  return make("orderbook", form.side, form, now, {
    spend: { asset: buy ? "QA-B" : "QA-A", units: String(buy ? quote : base) },
    receive: {
      asset: buy ? "QA-A" : "QA-B",
      units: String(buy ? base : quote),
    },
    terms: {
      base: String(base),
      limitPrice: String(price),
      quote: String(quote),
      inputLimbs: encodeAmount(buy ? quote : base).map(String),
      minimumLimbs: encodeAmount(buy ? base : quote).map(String),
      fillPolicy: "whole-order-only",
      pricePriority: "price, order checkpoint, owner ID",
      marketBinding: "unreviewed-demo",
    },
    note: "Both minimums must be satisfied by a whole counter-order. If matched, each offered amount is exchanged in full; there is no partial fill or maker-price change refund.",
  });
}
export const CURVE = freeze({
  cap: 1000,
  threshold: 800,
  sold: 200,
  ownedLots: 20,
  base: "10000000000000000",
  step: "100000000000000",
  unit: "1000000000000000000",
});
export function curvePoints() {
  return Array.from({ length: 11 }, (_, i) => ({
    sold: i * 100,
    price: String(BigInt(CURVE.base) + BigInt(CURVE.step) * BigInt(i * 100)),
  }));
}
export function previewCurve(form, now = Date.now()) {
  fields(form, [
    "side",
    "lots",
    "slippageBps",
    "userId",
    "feeCap",
    "deadlineMinutes",
  ]);
  ok(["buy", "sell"].includes(form.side), "Unsupported curve side");
  ok(
    typeof form.lots === "string" && /^[1-9]\d{0,5}$/.test(form.lots),
    "Lots must be a positive integer",
  );
  ok(
    ["10", "50", "100"].includes(form.slippageBps),
    "Unsupported slippage bound",
  );
  const lots = BigInt(form.lots),
    buy = form.side === "buy";
  ok(
    buy
      ? lots <= BigInt(CURVE.cap - CURVE.sold)
      : lots <= BigInt(CURVE.ownedLots),
    buy
      ? "Exceeds remaining curve capacity"
      : "Exceeds the fixture balance of 20 lots",
  );
  const { quoted, tokenAmount } = curveQuote(
      CURVE,
      BigInt(CURVE.sold),
      lots,
      buy,
    ),
    bps = BigInt(form.slippageBps),
    limit = bounded(
      buy
        ? ceil(quoted * (10000n + bps), 10000n)
        : (quoted * (10000n - bps)) / 10000n,
    );
  return make("curve", form.side, form, now, {
    spend: {
      asset: buy ? "QA-B" : "QA-A",
      units: String(buy ? limit : tokenAmount),
    },
    receive: {
      asset: buy ? "QA-A" : "QA-B",
      units: String(buy ? tokenAmount : limit),
    },
    terms: {
      lots: String(lots),
      quote: String(quoted),
      tokenAmount: String(tokenAmount),
      limit: String(limit),
      soldSnapshot: CURVE.sold,
      inputLimbs: encodeAmount(buy ? limit : tokenAmount).map(String),
      minimumLimbs: encodeAmount(buy ? tokenAmount : limit).map(String),
      pricing: "progressive-integer-lots",
      graduationThreshold: CURVE.threshold,
      marketBinding: "unreviewed-demo",
    },
    note: buy
      ? "The cap is deposited; actual cost follows sequential sold-lots updates. Any unused quote becomes a return output after settlement. Graduation is a separate operation."
      : "Actual output follows sequential sold-lots updates and must meet the minimum. Unsatisfied or unfilled orders return actual deposited tokens under contract rules.",
  });
}
export const NFT_LISTINGS = freeze([
  {
    id: "listing-1",
    title: "QA Study 001",
    collection: "QA Studies",
    collectionRef: "demo-collection-1",
    tokenWords: ["101", "0", "0", "0"],
    metadataWords: ["501", "0", "0", "0"],
    seller: "223344",
    listingNonce: "7",
    price: String(5n * U),
    slot: "0",
    art: 0,
  },
  {
    id: "listing-2",
    title: "QA Study 002",
    collection: "QA Studies",
    collectionRef: "demo-collection-1",
    tokenWords: ["102", "0", "0", "0"],
    metadataWords: ["502", "0", "0", "0"],
    seller: "334455",
    listingNonce: "12",
    price: String((1n << 62n) + 17n),
    slot: "1",
    art: 1,
  },
]);
export const NFT_OWNED = freeze([
  {
    id: "owned-3",
    title: "QA Study 003",
    collection: "QA Studies",
    collectionRef: "demo-collection-1",
    tokenWords: ["103", "0", "0", "0"],
    metadataWords: ["503", "0", "0", "0"],
    owner: "12345",
    slot: "2",
    art: 2,
  },
]);
export function previewNftBuy(form, now = Date.now()) {
  fields(form, [
    "listingId",
    "maxPrice",
    "userId",
    "feeCap",
    "deadlineMinutes",
  ]);
  const item = NFT_LISTINGS.find((x) => x.id === form.listingId);
  ok(item, "Listing fixture unavailable");
  ok(form.userId !== item.seller, "Buyer must differ from seller");
  const cap = amount(form.maxPrice),
    price = BigInt(item.price);
  ok(cap >= price, "Listing price exceeds your maximum price");
  return make("nft", "buy", form, now, {
    spend: { asset: "QA-B", units: item.price },
    receive: { asset: item.title, units: "1" },
    terms: {
      collection: item.collection,
      collectionRef: item.collectionRef,
      tokenWords: [...item.tokenWords],
      metadataWords: [...item.metadataWords],
      seller: item.seller,
      listingNonce: item.listingNonce,
      price: item.price,
      maxPrice: String(cap),
      priceLimbs: encodeAmount(price).map(String),
      listingId: item.id,
      marketBinding: "unreviewed-demo",
    },
    note: "This purchase references one exact collection, token ID, seller and listing nonce at a fixed price. Only one buyer can win on-chain; losing purchases require an actual refund and claim.",
  });
}
export function previewNftListing(form, now = Date.now()) {
  fields(form, ["ownedId", "price", "userId", "feeCap", "deadlineMinutes"]);
  const item = NFT_OWNED.find((x) => x.id === form.ownedId);
  ok(item, "Owned NFT fixture unavailable");
  ok(form.userId === item.owner, "This fixture NFT belongs to demo user 12345");
  const price = amount(form.price);
  return make("nft", "list", form, now, {
    spend: { asset: item.title, units: "1" },
    receive: { asset: "QA-B", units: String(price) },
    terms: {
      collection: item.collection,
      collectionRef: item.collectionRef,
      tokenWords: [...item.tokenWords],
      metadataWords: [...item.metadataWords],
      ownedSlot: item.slot,
      price: String(price),
      priceLimbs: encodeAmount(price).map(String),
      marketBinding: "unreviewed-demo",
    },
    note: "A saved draft does not escrow or list an NFT. A real listing must prove current slot ownership, bind collection/token/metadata and nonce, and deposit exactly that NFT. Cancellation alone does not return escrow.",
  });
}
function rebuild(p) {
  if (p.market === "orderbook") return previewBook(p.inputForm, p.createdAt);
  if (p.market === "curve") return previewCurve(p.inputForm, p.createdAt);
  if (p.market === "nft")
    return (p.action === "list" ? previewNftListing : previewNftBuy)(
      p.inputForm,
      p.createdAt,
    );
  throw Error("Unknown market draft");
}
export function hydrateProductDrafts(text) {
  ok(
    typeof text === "string" && text.length <= 500000,
    "Draft storage limit exceeded",
  );
  const doc = JSON.parse(text);
  fields(doc, ["schema", "records"]);
  ok(
    doc.schema === 1 && Array.isArray(doc.records) && doc.records.length <= 100,
    "Invalid local draft store",
  );
  const seen = new Set();
  for (const r of doc.records) {
    fields(r, ["id", "status", "preview"]);
    ok(
      /^UI-DRAFT-\d{4,8}$/.test(r.id) &&
        Number(r.id.slice(9)) > 0 &&
        !seen.has(r.id),
      "Duplicate or invalid local draft ID",
    );
    ok(
      r.id === "UI-DRAFT-" + String(Number(r.id.slice(9))).padStart(4, "0"),
      "Noncanonical local draft ID",
    );
    seen.add(r.id);
    ok(["draft", "cancelled"].includes(r.status), "Invalid local draft status");
    ok(
      canonical(r.preview) === canonical(rebuild(r.preview)),
      "Draft amounts, route, identity or dependencies were modified",
    );
  }
  return freeze(clone(doc.records));
}
export const serializeProductDrafts = (records) =>
  JSON.stringify({ schema: 1, records });
export function addProductDraft(preview, records) {
  hydrateProductDrafts(serializeProductDrafts(records));
  ok(
    canonical(preview) === canonical(rebuild(preview)),
    "Preview was modified",
  );
  ok(
    records.length < 100,
    "100 local drafts reached; export before adding more",
  );
  const last = Math.max(0, ...records.map((r) => Number(r.id.slice(9))));
  ok(last < 99999999, "Local draft identifiers exhausted");
  if (preview.market === "nft") {
    const key = (p) =>
      [
        p.owner,
        p.action,
        p.terms.collectionRef,
        p.terms.tokenWords.join("/"),
        p.terms.listingNonce ?? "",
      ].join(":");
    ok(
      !records.some(
        (r) =>
          r.status === "draft" &&
          r.preview.market === "nft" &&
          key(r.preview) === key(preview),
      ),
      "An active local draft already references this NFT and action",
    );
  }
  return freeze({
    id: "UI-DRAFT-" + String(last + 1).padStart(4, "0"),
    status: "draft",
    preview: clone(preview),
  });
}
export function cancelProductDraft(record) {
  ok(record.status === "draft", "This local draft is already cancelled");
  return freeze({ ...clone(record), status: "cancelled" });
}
