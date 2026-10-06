import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOLDILOCKS_MAX, MINIMUM_LIQUIDITY,
  quoteAddLiquidity, quoteExactIn, quoteExactOut, quoteInitialLiquidity, quoteRemoveLiquidity,
} from './referenceMath.mjs';

test('PSY to USDT quote uses exact integer arithmetic and keeps k nondecreasing', () => {
  const result = quoteExactIn({
    reserveIn: 1_000n * 1_000_000_000n,
    reserveOut: 100_000n * 1_000_000n,
    amountIn: 1n * 1_000_000_000n,
    minAmountOut: 90n * 1_000_000n,
  });
  assert.equal(result.amountOut, 99_600_698n);
  assert.ok(result.productAfter >= result.productBefore);
});

test('exact output rounds input up and honors max input', () => {
  const args = { reserveIn: 1_000_000n, reserveOut: 2_000_000n, amountOut: 100_000n };
  const result = quoteExactOut(args);
  const forward = quoteExactIn({ reserveIn: args.reserveIn, reserveOut: args.reserveOut, amountIn: result.amountIn });
  assert.ok(forward.amountOut >= args.amountOut);
  assert.ok(result.productAfter >= result.productBefore);
  assert.throws(() => quoteExactOut({ ...args, maxAmountIn: result.amountIn - 1n }), /input exceeds limit/);
});

test('slippage, dust, and field overflow fail instead of wrapping', () => {
  assert.throws(() => quoteExactIn({ reserveIn: 1_000n, reserveOut: 1_000n, amountIn: 1n, minAmountOut: 2n }), /insufficient output/);
  assert.throws(() => quoteExactIn({ reserveIn: 1n, reserveOut: 1_000n, amountIn: GOLDILOCKS_MAX }), /input reserve/);
  assert.throws(() => quoteExactIn({ reserveIn: 1_000n, reserveOut: 1_000n, amountIn: 1n, feeBps: 10_000n }), /feeBps/);
});

test('initial LP liquidity locks minimum shares; proportional add and remove conserve reserves', () => {
  const initial = quoteInitialLiquidity({ amountPsy: 1_000_000n, amountUsdt: 4_000_000n });
  assert.equal(initial.totalShares, 2_000_000n);
  assert.equal(initial.providerShares + initial.lockedShares, initial.totalShares);
  assert.equal(initial.lockedShares, MINIMUM_LIQUIDITY);
  const added = quoteAddLiquidity({
    reservePsy: initial.nextReservePsy,
    reserveUsdt: initial.nextReserveUsdt,
    totalShares: initial.totalShares,
    amountPsy: 100_000n,
    amountUsdt: 500_000n,
  });
  assert.equal(added.shares, 200_000n);
  assert.equal(added.refundUsdt, 100_000n);
  const removed = quoteRemoveLiquidity({
    reservePsy: added.nextReservePsy,
    reserveUsdt: added.nextReserveUsdt,
    totalShares: added.nextTotalShares,
    shares: added.shares,
  });
  assert.equal(removed.nextReservePsy, initial.nextReservePsy);
  assert.equal(removed.nextReserveUsdt, initial.nextReserveUsdt);
});
