import test from "node:test";
import assert from "node:assert/strict";
import {
  previewBook,
  previewCurve,
  previewNftBuy,
  previewNftListing,
  rankBookRows,
  BOOK_ROWS,
  NFT_LISTINGS,
  addProductDraft,
  cancelProductDraft,
  serializeProductDrafts,
  hydrateProductDrafts,
} from "../src/markets/productDrafts.mjs";
import { MAX_AMOUNT, formatUnits } from "../../token/wide/arithmetic.mjs";
const now = 1793000000000,
  common = { userId: "12345", feeCap: "5", deadlineMinutes: "30" },
  book = { ...common, side: "buy", amount: "10", limitPrice: "1.1" },
  curve = { ...common, side: "buy", lots: "1", slippageBps: "50" },
  buy = { ...common, listingId: "listing-2", maxPrice: "10" },
  listing = { ...common, ownedId: "owned-3", price: "3" };
const copy = (x) => JSON.parse(JSON.stringify(x));
test("book previews whole offers with exact U124 limbs and no implied partial fill", () => {
  const p = previewBook(
    { ...book, amount: "4.611686018427387921", limitPrice: "1" },
    now,
  );
  assert.deepEqual(p.terms.inputLimbs, ["17", "1"]);
  assert.equal(p.spend.asset, "QA-B");
  assert.equal(p.terms.fillPolicy, "whole-order-only");
  assert.equal(p.financialAuthorization, false);
  assert.match(p.note, /exchanged in full/);
  const sell = previewBook({ ...book, side: "sell" }, now);
  assert.equal(sell.spend.units, "10000000000000000000");
  assert.equal(sell.receive.units, "11000000000000000000");
});
test("book price conversion rounds required quote upward rather than weakening the bound", () => {
  const p = previewBook(
    { ...book, amount: "0.000000000000000003", limitPrice: "0.5" },
    now,
  );
  assert.equal(p.terms.quote, "2");
  assert.throws(
    () =>
      previewBook(
        { ...book, amount: formatUnits(MAX_AMOUNT, 18), limitPrice: "2" },
        now,
      ),
    /exceeds U124/,
  );
});
test("book display ranks exact price, then checkpoint and owner ID, on each side", () => {
  const ordered = rankBookRows(BOOK_ROWS);
  assert.deepEqual(
    ordered.slice(0, 3).map((r) => r.id),
    ["ASK-2", "ASK-1", "ASK-3"],
  );
  assert.equal(ordered[3].id, "BID-1");
  const tie = { ...BOOK_ROWS[0], checkpoint: "100", id: "TIE", owner: "1" };
  assert.equal(rankBookRows([BOOK_ROWS[0], tie])[0].id, "TIE");
});
test("curve uses progressive integer lots and distinct buy-cap/sell-minimum rounding", () => {
  const b = previewCurve(curve, now),
    s = previewCurve({ ...curve, side: "sell" }, now);
  assert.equal(b.terms.quote, "30000000000000000");
  assert.equal(b.spend.units, "30150000000000000");
  assert.equal(s.terms.quote, "29900000000000000");
  assert.equal(s.receive.units, "29750500000000000");
  assert.equal(b.terms.pricing, "progressive-integer-lots");
  assert.equal(b.terms.graduationThreshold, 800);
  assert.equal(b.spend.asset, "QA-B");
  assert.equal(s.spend.asset, "QA-A");
});
test("curve rejects fractional/zero lots, capacity and fixture ownership violations", () => {
  for (const change of [
    { lots: "0" },
    { lots: "1.5" },
    { lots: "801" },
    { side: "sell", lots: "21" },
    { slippageBps: "500" },
    { side: "graduate" },
  ])
    assert.throws(() => previewCurve({ ...curve, ...change }, now));
});
test("NFT purchase binds exact collection, token/metadata words, seller and listing nonce", () => {
  const p = previewNftBuy(buy, now);
  assert.equal(p.terms.listingNonce, "12");
  assert.equal(p.terms.collectionRef, "demo-collection-1");
  assert.deepEqual(p.terms.tokenWords, ["102", "0", "0", "0"]);
  assert.deepEqual(p.terms.metadataWords, ["502", "0", "0", "0"]);
  assert.deepEqual(p.terms.priceLimbs, ["17", "1"]);
  assert.equal(p.spend.units, NFT_LISTINGS[1].price);
  assert.equal(p.receive.units, "1");
  assert.throws(
    () => previewNftBuy({ ...buy, userId: "334455" }, now),
    /differ/,
  );
  assert.throws(() => previewNftBuy({ ...buy, maxPrice: "4" }, now), /exceeds/);
});
test("NFT listing binds only the selected fixture owner and slot; prices are U124", () => {
  const p = previewNftListing(listing, now);
  assert.equal(p.terms.ownedSlot, "2");
  assert.deepEqual(p.terms.tokenWords, ["103", "0", "0", "0"]);
  assert.equal(p.receive.asset, "QA-B");
  assert.throws(
    () => previewNftListing({ ...listing, userId: "223344" }, now),
    /belongs/,
  );
  assert.throws(
    () => previewNftListing({ ...listing, slot: "127" }, now),
    /Unexpected/,
  );
  assert.throws(() => previewNftListing({ ...listing, price: "0" }, now));
});
test("all previews reject unknown caller/fee/identity fields and do not assign chain identity", () => {
  for (const build of [
    (f) => previewBook({ ...book, ...f }, now),
    (f) => previewCurve({ ...curve, ...f }, now),
    (f) => previewNftBuy({ ...buy, ...f }, now),
    (f) => previewNftListing({ ...listing, ...f }, now),
  ]) {
    for (const change of [
      { userId: "0" },
      { userId: "16777216" },
      { feeCap: "51" },
      { feeCap: "0.0000000001" },
      { deadlineMinutes: "1" },
      { contractId: 62 },
    ])
      assert.throws(() => build(change));
    const p = build({});
    assert.equal(p.network, "unverified-demo");
    assert.equal(p.financialAuthorization, false);
    assert.equal(p.requestIdentity, undefined);
    assert.equal(p.nonce, undefined);
    assert.ok(Object.isFrozen(p.terms));
  }
});
test("local drafts roundtrip with exact quantities and local-only cancellation", () => {
  const p = previewBook(book, now),
    r = addProductDraft(p, []);
  assert.equal(r.id, "UI-DRAFT-0001");
  const cancelled = cancelProductDraft(r);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.preview.financialAuthorization, false);
  assert.deepEqual(hydrateProductDrafts(serializeProductDrafts([cancelled])), [
    cancelled,
  ]);
  assert.throws(() => cancelProductDraft(cancelled), /already/);
});
test("persisted amount, metadata, listing nonce and source tampering fail revalidation", () => {
  for (const mutate of [
    (r) => (r.preview.spend.units = "1"),
    (r) => (r.preview.terms.listingNonce = "13"),
    (r) => (r.preview.terms.tokenWords[0] = "999"),
    (r) => (r.preview.terms.metadataWords[0] = "999"),
    (r) => (r.preview.sdkReference = "0".repeat(64)),
    (r) => (r.preview.financialAuthorization = true),
    (r) => (r.status = "claimed"),
  ]) {
    const r = copy(addProductDraft(previewNftBuy(buy, now), []));
    mutate(r);
    assert.throws(() => hydrateProductDrafts(serializeProductDrafts([r])));
  }
});
test("duplicate active NFT drafts block locally but never reserve an on-chain listing", () => {
  const p = previewNftBuy(buy, now),
    first = addProductDraft(p, []);
  assert.throws(() => addProductDraft(p, [first]), /active local draft/);
  const second = addProductDraft(p, [cancelProductDraft(first)]);
  assert.equal(second.id, "UI-DRAFT-0002");
  assert.equal(second.preview.financialAuthorization, false);
});
test("local IDs and record limits cannot silently alias, wrap or accept fake terminal states", () => {
  const first = addProductDraft(previewBook(book, now), []),
    alias = copy(first);
  alias.id = "UI-DRAFT-00001";
  assert.throws(() => hydrateProductDrafts(serializeProductDrafts([alias])));
  const last = copy(first);
  last.id = "UI-DRAFT-99999999";
  assert.throws(
    () => addProductDraft(previewBook(book, now), [last]),
    /exhausted/,
  );
  assert.throws(
    () => hydrateProductDrafts(serializeProductDrafts([first, first])),
    /Duplicate/,
  );
});
