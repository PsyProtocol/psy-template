import test from "node:test";
import assert from "node:assert/strict";
import { validateFormFields } from "../src/markets/formValidation.mjs";
const common = {
  userId: "12345",
  receiver: "12345",
  feeCap: "5",
  deadlineMinutes: "30",
  slippageBps: "50",
};
test("token/fee precision, positive values and user IDs have field-specific errors", () => {
  const errors = validateFormFields("swap", {
    ...common,
    amount: "0.0000000000000000001",
    receiver: "0",
    feeCap: "1.0000000001",
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    "amount",
    "feeCap",
    "receiver",
  ]);
  assert.deepEqual(
    validateFormFields("swap", { ...common, amount: "4.611686018427387921" }),
    {},
  );
  for (const receiver of ["01", " 12345", "16777216", "-1"])
    assert(
      validateFormFields("swap", { ...common, amount: "1", receiver }).receiver,
    );
});
test("example ratio, raw shares and integer lots map to their own fields", () => {
  assert(
    validateFormFields("add", { ...common, amountA: "1", amountB: "2" })
      .amountB,
  );
  assert(validateFormFields("remove", { ...common, shares: "1.5" }).shares);
  assert.deepEqual(
    validateFormFields("remove", { ...common, shares: "4611686018427387921" }),
    {},
  );
  for (const lots of ["0", "1.5", "21"])
    assert(validateFormFields("curve", { ...common, side: "sell", lots }).lots);
});
test("NFT and book feedback cannot weaken original domain bounds", () => {
  assert(validateFormFields("nft-buy", { ...common, maxPrice: "0" }).maxPrice);
  assert(
    validateFormFields("nft-list", {
      ...common,
      price: "-1",
      ownedId: "unknown",
    }).ownedId,
  );
  assert(
    validateFormFields("orderbook", { ...common, amount: "1", limitPrice: "0" })
      .limitPrice,
  );
  assert(
    validateFormFields("orderbook", {
      ...common,
      amount: "1",
      limitPrice: "1",
      feeCap: "51",
    }).feeCap,
  );
});
