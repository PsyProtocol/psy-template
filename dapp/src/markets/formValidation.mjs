// Usability checks for local forms. Domain/contract and fresh RPC checks remain.
import { parseUnits, MAX_AMOUNT } from "../../../token/wide/arithmetic.mjs";
export const FIELD_LABELS = {
  amount: "Amount",
  amountA: "Deposit QA-A",
  amountB: "Deposit QA-B",
  receiver: "Owner / recipient ID",
  userId: "Demo user ID",
  feeCap: "Fee cap",
  shares: "Raw LP shares",
  lots: "Whole lots",
  limitPrice: "Limit price",
  slippageBps: "Slippage",
  deadlineMinutes: "Draft expiry",
  maxPrice: "Maximum NFT price",
  price: "Listing price",
  ownedId: "Owned NFT",
};
export function validateFormFields(kind, f) {
  const errors = {};
  const amount = (key, decimals = 18) => {
    try {
      const text = f[key];
      if (typeof text !== "string" || text.length > 64) throw Error();
      const n = parseUnits(text, decimals);
      if (n <= 0n || n > MAX_AMOUNT) throw Error();
      return n;
    } catch {
      errors[key] =
        `Enter a positive amount with at most ${decimals} decimals within the supported range.`;
      return null;
    }
  };
  const owner = (key) => {
    if (
      typeof f[key] !== "string" ||
      !/^\d{1,8}$/.test(f[key]) ||
      !/^\S+$/.test(f[key]) ||
      BigInt(f[key]) < 1n ||
      BigInt(f[key]) >= 16777216n ||
      f[key][0] === "0"
    )
      errors[key] =
        "Enter a user ID from 1 to 16777215, without spaces or leading zeros.";
  };
  const fee = amount("feeCap", 9);
  if (fee !== null && fee > 50n * 10n ** 9n)
    errors.feeCap = "Fee cap must be at most 50 test PSY.";
  if (
    ["swap", "add", "remove", "curve"].includes(kind) &&
    !["10", "50", "100"].includes(f.slippageBps)
  )
    errors.slippageBps = "Choose an available slippage limit.";
  if (
    ["swap", "orderbook", "curve", "nft-buy", "nft-list"].includes(kind) &&
    !["15", "30", "60"].includes(f.deadlineMinutes)
  )
    errors.deadlineMinutes = "Choose a local draft expiry.";
  if (["swap", "add", "remove"].includes(kind)) owner("receiver");
  else owner("userId");
  if (kind === "swap") amount("amount");
  if (kind === "add") {
    const a = amount("amountA"),
      b = amount("amountB");
    if (a !== null && b !== null && a !== b)
      errors.amountB =
        "This example pool requires an exact 1:1 ratio. Match both deposits or enable linking.";
  }
  if (kind === "remove") {
    if (
      typeof f.shares !== "string" ||
      !/^[1-9]\d{0,37}$/.test(f.shares) ||
      BigInt(f.shares) > 10000000000000000000n
    )
      errors.shares =
        "Enter positive raw integer shares within the 10000000000000000000-share example position.";
  }
  if (kind === "orderbook") {
    amount("amount");
    amount("limitPrice");
  }
  if (
    kind === "curve" &&
    (typeof f.lots !== "string" ||
      !/^[1-9]\d{0,3}$/.test(f.lots) ||
      BigInt(f.lots) > (f.side === "sell" ? 20n : 800n))
  )
    errors.lots = `Enter whole lots from 1 to ${f.side === "sell" ? 20 : 800} for this example.`;
  if (kind === "nft-buy") amount("maxPrice");
  if (kind === "nft-list") {
    amount("price");
    if (f.ownedId !== "owned-3")
      errors.ownedId = "Select the available example NFT.";
  }
  return errors;
}
