import { parseUnits, encodeAmount } from "../../../token/wide/arithmetic.mjs";
import { addShares } from "../../../amm/u124/client.mjs";
import { SDK_MANIFEST } from "./domain.mjs";
// Explicit fixtures, never authenticated pool state or executable authorization.
export const DEMO_POOLS = Object.freeze(["2485", "2486"]);
const RESERVE = 1000n * 10n ** 18n;
export function previewLiquidity(form) {
  if (
    !form ||
    Object.keys(form).sort().join(",") !==
      "amountA,amountB,feeCap,pool,receiver,slippageBps"
  )
    throw Error("Invalid liquidity draft");
  if (!DEMO_POOLS.includes(form.pool)) throw Error("Unsupported demo pool");
  if (!["10", "50", "100"].includes(form.slippageBps))
    throw Error("Unsupported slippage limit");
  if (
    typeof form.receiver !== "string" ||
    !/^[1-9]\d{0,7}$/.test(form.receiver) ||
    BigInt(form.receiver) >= 16777216n
  )
    throw Error("LP owner must be a testnet user ID from 1 to 16777215");
  const amount = (text) => {
    if (typeof text !== "string" || text.length > 64)
      throw Error("Enter a valid token amount");
    let value;
    try {
      value = parseUnits(text, 18);
    } catch {
      throw Error("Token amount must fit U124 with at most 18 decimals");
    }
    if (value === 0n) throw Error("Both token amounts must be positive");
    return value;
  };
  const a = amount(form.amountA),
    b = amount(form.amountB);
  if (a * RESERVE !== b * RESERVE)
    throw Error(
      "Both deposits must match the pool ratio exactly. Excess is not automatically refunded.",
    );
  let fee;
  try {
    if (typeof form.feeCap !== "string" || form.feeCap.length > 32)
      throw Error();
    fee = parseUnits(form.feeCap, 9);
  } catch {
    throw Error("Fee cap uses test PSY with at most 9 decimals");
  }
  if (!fee || fee > 50n * 10n ** 9n)
    throw Error(
      "Fee cap must be positive and at most 50 test PSY (demo limit)",
    );
  let minted;
  try {
    minted = addShares(a, b, RESERVE, RESERVE, RESERVE);
  } catch {
    throw Error(
      "Deposit or resulting reserves/share supply exceeds U124, or minted shares round to zero",
    );
  }
  const minimum = (minted * (10000n - BigInt(form.slippageBps))) / 10000n;
  if (!minimum)
    throw Error("Deposit too small: minimum LP shares round to zero");
  return Object.freeze({
    source: "demo",
    financialAuthorization: false,
    sdkReference: SDK_MANIFEST,
    pool: form.pool,
    owner: form.receiver,
    a: String(a),
    b: String(b),
    minted: String(minted),
    minimum: String(minimum),
    feeCap: String(fee),
    aLimbs: encodeAmount(a).map(String),
    bLimbs: encodeAmount(b).map(String),
    mintedLimbs: encodeAmount(minted).map(String),
  });
}
