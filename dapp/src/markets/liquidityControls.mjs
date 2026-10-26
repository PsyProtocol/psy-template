import {
  parseUnits,
  formatUnits,
  MAX_AMOUNT,
} from "../../../token/wide/arithmetic.mjs";
import { DEMO_POOLS } from "./liquidity.mjs";
export const EXAMPLE_LP_SHARES = "10000000000000000000";
export function matchDemoDeposit(text, pool) {
  if (!DEMO_POOLS.includes(pool)) throw Error("Unknown example pool");
  if (text === "") return "";
  if (typeof text !== "string" || text.length > 64)
    throw Error("Invalid deposit amount");
  // Both existing fixtures are exactly 1:1. Never apply this to RPC reserves.
  return formatUnits(parseUnits(text, 18), 18);
}
export function rawShareFraction(owned, percent) {
  if (
    typeof owned !== "string" ||
    !/^(0|[1-9]\d*)$/.test(owned) ||
    owned.length > 38
  )
    throw Error("Canonical owned raw shares required");
  const n = BigInt(owned);
  if (n > MAX_AMOUNT || ![25, 50, 75, 100].includes(percent))
    throw Error("Unsupported share fraction");
  const result = (n * BigInt(percent)) / 100n;
  if (result === 0n) throw Error("Share fraction rounds to zero");
  return String(result);
}
