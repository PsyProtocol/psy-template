// BigInt quote oracle matching the candidate's bounds and exact LP deposit ratio.
import { quoteExactIn, quoteInitialLiquidity, quoteRemoveLiquidity } from '../referenceMath.mjs';
export const CAP = 1_000_000_000_000n;
function bounded(value, name, min = 1n) {
  if (typeof value !== 'bigint' || value < min || value > CAP) throw new RangeError(`${name} exceeds the wide candidate limit`);
  return value;
}
export function swapQuote({ reserveIn, reserveOut, amountIn, minAmountOut = 1n }) {
  for (const [k,v] of Object.entries({reserveIn,reserveOut,amountIn,minAmountOut})) bounded(v,k);
  if (reserveIn + amountIn > CAP) throw new RangeError('reserve cap exceeded');
  return quoteExactIn({reserveIn,reserveOut,amountIn,minAmountOut,feeBps:30n});
}
export function initialQuote({ amountPsy, amountUsdt }) {
  bounded(amountPsy,'amountPsy'); bounded(amountUsdt,'amountUsdt');
  return quoteInitialLiquidity({amountPsy,amountUsdt});
}
export function addQuote({ reservePsy, reserveUsdt, totalShares, amountPsy, amountUsdt }) {
  for (const [k,v] of Object.entries({reservePsy,reserveUsdt,totalShares,amountPsy,amountUsdt})) bounded(v,k);
  if (amountPsy * reserveUsdt !== amountUsdt * reservePsy) throw new RangeError('deposit ratio mismatch');
  const shares = amountPsy * totalShares / reservePsy;
  if (shares === 0n) throw new RangeError('deposit rounds to zero shares');
  if (reservePsy + amountPsy > CAP || reserveUsdt + amountUsdt > CAP || totalShares + shares > CAP) throw new RangeError('reserve or share cap exceeded');
  return {shares,nextReservePsy:reservePsy+amountPsy,nextReserveUsdt:reserveUsdt+amountUsdt,nextTotalShares:totalShares+shares};
}
export function removeQuote({ reservePsy, reserveUsdt, totalShares, shares }) {
  for (const [k,v] of Object.entries({reservePsy,reserveUsdt,totalShares,shares})) bounded(v,k);
  return quoteRemoveLiquidity({reservePsy,reserveUsdt,totalShares,shares});
}
