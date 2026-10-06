// Integer lots keep every intermediate product within a Goldilocks Felt and
// every externally submitted amount within JavaScript's exact integer range.
export const MAX_LOTS = 1_000_000n;
export const MAX_LOT_SIZE = 1_000_000_000n;
export const MAX_BASE_PRICE = 1_000_000_000n;
export const MAX_STEP_PRICE = 10_000n;
export const FEE_ESCROW = 1_000_100_000n;
export const MAX_COST = 6_000_000_000_000_000n;

function bounded(value, name, min, max) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = BigInt(value);
  if (typeof value !== 'bigint' || value < min || value > max) {
    throw new RangeError(`${name} must be an exact integer from ${min} to ${max}`);
  }
  return value;
}

export function validateCurve(config) {
  const maxLots = bounded(config?.maxLots, 'maxLots', 1n, MAX_LOTS);
  const liquidityLots = bounded(config?.liquidityLots, 'liquidityLots', 1n, MAX_LOTS);
  const lotSize = bounded(config?.lotSize, 'lotSize', 1n, MAX_LOT_SIZE);
  const basePrice = bounded(config?.basePrice, 'basePrice', 1n, MAX_BASE_PRICE);
  const stepPrice = bounded(config?.stepPrice, 'stepPrice', 1n, MAX_STEP_PRICE);
  const thresholdLots = bounded(config?.thresholdLots, 'thresholdLots', 1n, maxLots);
  return { maxLots, liquidityLots, lotSize, basePrice, stepPrice, thresholdLots };
}

export function cumulativeCost(config, soldLots) {
  const c = validateCurve(config);
  const sold = bounded(soldLots, 'soldLots', 0n, c.maxLots);
  return c.basePrice * sold + c.stepPrice * sold * (sold - 1n) / 2n;
}

export function quoteBuy(config, soldLots, lots) {
  const c = validateCurve(config);
  const sold = bounded(soldLots, 'soldLots', 0n, c.maxLots);
  const count = bounded(lots, 'lots', 1n, c.maxLots - sold);
  const cost = c.basePrice * count + c.stepPrice * count * (2n * sold + count - 1n) / 2n;
  if (cost > MAX_COST) throw new RangeError('curve cost exceeds safe bound');
  return { cost, tokenAmount: count * c.lotSize, nextSold: sold + count,
    nextReserve: cumulativeCost(c, sold + count) };
}

export function quoteSell(config, soldLots, lots) {
  const c = validateCurve(config);
  const sold = bounded(soldLots, 'soldLots', 1n, c.maxLots);
  const count = bounded(lots, 'lots', 1n, sold);
  const payout = c.basePrice * count + c.stepPrice * count * (2n * sold - count - 1n) / 2n;
  return { payout, tokenAmount: count * c.lotSize, nextSold: sold - count,
    nextReserve: cumulativeCost(c, sold - count) };
}

export function graduationAmounts(config, soldLots) {
  const c = validateCurve(config);
  const sold = bounded(soldLots, 'soldLots', c.thresholdLots, c.maxLots);
  return { psyAmount: cumulativeCost(c, sold),
    tokenAmount: (c.maxLots + c.liquidityLots - sold) * c.lotSize };
}
