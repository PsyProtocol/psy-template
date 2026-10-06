// Exact integer arithmetic for a proposed PSY/USDT constant-product pool.
// This is reference code. The same checks must be enforced in the pool circuit.
export const GOLDILOCKS_MAX = 18446744069414584320n;
export const FEE_DENOMINATOR = 10000n;
export const MINIMUM_LIQUIDITY = 1000n;

function felt(value, name, { positive = false } = {}) {
  if (typeof value !== 'bigint' || value < 0n || value > GOLDILOCKS_MAX || (positive && value === 0n)) {
    throw new RangeError(`${name} must be ${positive ? 'a positive' : 'a nonnegative'} Goldilocks Felt bigint`);
  }
  return value;
}

function fee(value) {
  if (typeof value !== 'bigint' || value < 0n || value >= FEE_DENOMINATOR) {
    throw new RangeError('feeBps must be a bigint from 0 to 9999');
  }
  return value;
}

function checkedSum(left, right, name) {
  const result = left + right;
  if (result > GOLDILOCKS_MAX) throw new RangeError(`${name} exceeds a Goldilocks Felt`);
  return result;
}

function ceilDiv(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

function sqrt(value) {
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

export function quoteExactIn({ reserveIn, reserveOut, amountIn, feeBps = 30n, minAmountOut = 1n }) {
  felt(reserveIn, 'reserveIn', { positive: true });
  felt(reserveOut, 'reserveOut', { positive: true });
  felt(amountIn, 'amountIn', { positive: true });
  felt(minAmountOut, 'minAmountOut', { positive: true });
  fee(feeBps);
  const effectiveIn = amountIn * (FEE_DENOMINATOR - feeBps);
  const amountOut = reserveOut * effectiveIn / (reserveIn * FEE_DENOMINATOR + effectiveIn);
  if (amountOut === 0n || amountOut >= reserveOut || amountOut < minAmountOut) {
    throw new RangeError('insufficient output or slippage limit exceeded');
  }
  const nextReserveIn = checkedSum(reserveIn, amountIn, 'input reserve');
  const nextReserveOut = reserveOut - amountOut;
  return {
    amountIn,
    amountOut,
    nextReserveIn,
    nextReserveOut,
    productBefore: reserveIn * reserveOut,
    productAfter: nextReserveIn * nextReserveOut,
  };
}

export function quoteExactOut({ reserveIn, reserveOut, amountOut, feeBps = 30n, maxAmountIn = GOLDILOCKS_MAX }) {
  felt(reserveIn, 'reserveIn', { positive: true });
  felt(reserveOut, 'reserveOut', { positive: true });
  felt(amountOut, 'amountOut', { positive: true });
  felt(maxAmountIn, 'maxAmountIn', { positive: true });
  fee(feeBps);
  if (amountOut >= reserveOut) throw new RangeError('output must be smaller than reserve');
  const amountIn = reserveIn * amountOut * FEE_DENOMINATOR /
    ((reserveOut - amountOut) * (FEE_DENOMINATOR - feeBps)) + 1n;
  if (amountIn > maxAmountIn) throw new RangeError('input exceeds limit');
  const nextReserveIn = checkedSum(reserveIn, amountIn, 'input reserve');
  return {
    amountIn,
    amountOut,
    nextReserveIn,
    nextReserveOut: reserveOut - amountOut,
    productBefore: reserveIn * reserveOut,
    productAfter: nextReserveIn * (reserveOut - amountOut),
  };
}

export function quoteInitialLiquidity({ amountPsy, amountUsdt }) {
  felt(amountPsy, 'amountPsy', { positive: true });
  felt(amountUsdt, 'amountUsdt', { positive: true });
  const totalShares = sqrt(amountPsy * amountUsdt);
  if (totalShares <= MINIMUM_LIQUIDITY) throw new RangeError('initial liquidity too small');
  return {
    providerShares: totalShares - MINIMUM_LIQUIDITY,
    lockedShares: MINIMUM_LIQUIDITY,
    totalShares,
    nextReservePsy: amountPsy,
    nextReserveUsdt: amountUsdt,
  };
}

export function quoteAddLiquidity({ reservePsy, reserveUsdt, totalShares, amountPsy, amountUsdt }) {
  for (const [name, value] of Object.entries({ reservePsy, reserveUsdt, totalShares, amountPsy, amountUsdt })) {
    felt(value, name, { positive: true });
  }
  const shares = [amountPsy * totalShares / reservePsy, amountUsdt * totalShares / reserveUsdt]
    .reduce((a, b) => a < b ? a : b);
  if (shares === 0n) throw new RangeError('deposit too small to mint an LP share');
  const usedPsy = ceilDiv(shares * reservePsy, totalShares);
  const usedUsdt = ceilDiv(shares * reserveUsdt, totalShares);
  return {
    shares,
    usedPsy,
    usedUsdt,
    refundPsy: amountPsy - usedPsy,
    refundUsdt: amountUsdt - usedUsdt,
    nextReservePsy: checkedSum(reservePsy, usedPsy, 'PSY reserve'),
    nextReserveUsdt: checkedSum(reserveUsdt, usedUsdt, 'USDT reserve'),
    nextTotalShares: checkedSum(totalShares, shares, 'LP shares'),
  };
}

export function quoteRemoveLiquidity({ reservePsy, reserveUsdt, totalShares, shares }) {
  for (const [name, value] of Object.entries({ reservePsy, reserveUsdt, totalShares, shares })) {
    felt(value, name, { positive: true });
  }
  if (shares > totalShares - MINIMUM_LIQUIDITY) throw new RangeError('locked minimum liquidity cannot be withdrawn');
  const amountPsy = shares * reservePsy / totalShares;
  const amountUsdt = shares * reserveUsdt / totalShares;
  if (amountPsy === 0n || amountUsdt === 0n) throw new RangeError('withdrawal rounds to zero');
  return {
    amountPsy,
    amountUsdt,
    nextReservePsy: reservePsy - amountPsy,
    nextReserveUsdt: reserveUsdt - amountUsdt,
    nextTotalShares: totalShares - shares,
  };
}
