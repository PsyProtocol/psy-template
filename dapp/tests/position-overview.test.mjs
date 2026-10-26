import test from "node:test";
import assert from "node:assert/strict";
import { positionOverview } from "../src/markets/positionOverview.mjs";
import { seedOrders } from "../src/markets/domain.mjs";
import { addProductDraft, previewBook } from "../src/markets/productDrafts.mjs";
const now = 1793000000000;
test("missing position feeds remain unknown rather than zero or inferred from local drafts", () => {
  const draft = addProductDraft(
    previewBook(
      {
        side: "buy",
        amount: "10",
        limitPrice: "1",
        userId: "12345",
        feeCap: "5",
        deadlineMinutes: "30",
      },
      now,
    ),
    [],
  );
  const before = JSON.stringify(draft),
    cards = positionOverview([draft], seedOrders(now), now);
  assert.equal(cards.length, 4);
  assert(
    cards.every(
      (c) => c.verifiedPosition === null && c.financialAuthorization === false,
    ),
  );
  assert.equal(cards.find((c) => c.market === "orderbook").local.open, 1);
  assert.equal(cards.find((c) => c.market === "amm").demoPending, 2);
  assert.equal(JSON.stringify(draft), before);
  const expired = positionOverview([draft], [], draft.preview.expiresAt).find(
    (c) => c.market === "orderbook",
  );
  assert.equal(expired.local.expired, 1);
  assert.equal(expired.local.open, 0);
  assert.equal(positionOverview([], [], now)[0].verifiedPosition, null);
});
