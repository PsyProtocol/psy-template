import test from "node:test";
import assert from "node:assert/strict";
import {
  draftState,
  ammActivityState,
  filterDraftActivity,
  filterAmmActivity,
} from "../src/markets/activity.mjs";
import {
  seedOrders,
  pendingTotals,
  fullAmount,
} from "../src/markets/domain.mjs";
import {
  addProductDraft,
  previewBook,
  previewNftBuy,
} from "../src/markets/productDrafts.mjs";
const now = 1793000000000;
const common = { userId: "12345", feeCap: "5", deadlineMinutes: "30" };
const book = () =>
  addProductDraft(
    previewBook(
      { ...common, side: "buy", amount: "10", limitPrice: "1.1" },
      now,
    ),
    [],
  );

test("pending intermediate/final/refund outputs and unknown receipts are never in-progress or completed", () => {
  const original = seedOrders(now)[0];
  for (const stage of ["middle_outbox", "claimable", "refundable"]) {
    const o = { ...original, stage };
    assert.equal(ammActivityState(o), "pending");
    assert.equal(filterAmmActivity([o], { status: "active" }).length, 0);
    assert.equal(filterAmmActivity([o], { status: "completed" }).length, 0);
    assert.equal(filterAmmActivity([o], { status: "pending" }).length, 1);
  }
  assert.equal(ammActivityState({ ...original, stage: "unknown" }), "unknown");
  for (const stage of ["claimed", "refunded"])
    assert.equal(ammActivityState({ ...original, stage }), "completed");
  for (const stage of [
    "submitted",
    "proving",
    "broadcast",
    "cancel_requested",
    "middle_claimed",
    "second_submitted",
  ])
    assert.equal(ammActivityState({ ...original, stage }), "active");
});
test("draft expiry is inclusive, cancellation takes precedence and filtering never mutates originals", () => {
  const draft = book();
  assert.equal(draftState(draft, draft.preview.expiresAt - 1), "draft");
  assert.equal(draftState(draft, draft.preview.expiresAt), "expired");
  assert.equal(
    draftState({ ...draft, status: "cancelled" }, draft.preview.expiresAt),
    "cancelled",
  );
  const before = JSON.stringify(draft);
  assert.equal(
    filterDraftActivity([draft], { status: "expired" }, draft.preview.expiresAt)
      .length,
    1,
  );
  assert.equal(
    filterDraftActivity([draft], { status: "draft" }, draft.preview.expiresAt)
      .length,
    0,
  );
  assert.equal(JSON.stringify(draft), before);
});
test("draft searches combine market/status/words and exact NFT references without granting authority", () => {
  const b = book(),
    n = addProductDraft(
      previewNftBuy({ ...common, listingId: "listing-2", maxPrice: "10" }, now),
      [b],
    );
  assert.deepEqual(
    filterDraftActivity(
      [b, n],
      { query: "  ORDERBOOK   12345 ", market: "orderbook", status: "draft" },
      now,
    ),
    [b],
  );
  assert.deepEqual(
    filterDraftActivity(
      [b, n],
      { query: "QA Studies 102", market: "nft" },
      now,
    ),
    [n],
  );
  assert.equal(
    filterDraftActivity([b, n], { query: "no such owner" }, now).length,
    0,
  );
  assert.equal(n.preview.financialAuthorization, false);
});
test("AMM search matches original identities and exact decimal amounts without numeric conversion", () => {
  const o = seedOrders(now)[0];
  assert.equal(
    filterAmmActivity([o], { query: o.requestIdentity.toLowerCase() }).length,
    1,
  );
  assert.equal(
    filterAmmActivity([o], { query: `QA-A ${fullAmount(o.inputUnits)}` })
      .length,
    1,
  );
  assert.equal(
    filterAmmActivity([o], { query: o.requestIdentity, status: "unknown" })
      .length,
    0,
  );
});
test("intermediate pending totals use actual middle asset and stop counting after claim", () => {
  const original = seedOrders(now)[1];
  const middle = { ...original, stage: "middle_outbox" };
  const totals = pendingTotals([middle]);
  assert.equal(totals.A.amount, "0");
  assert.equal(totals.B.amount, middle.middleUnits);
  assert.equal(
    pendingTotals([{ ...middle, stage: "middle_claimed" }]).B.amount,
    "0",
  );
  assert.notEqual(middle.middleUnits, middle.outputUnits);
});
