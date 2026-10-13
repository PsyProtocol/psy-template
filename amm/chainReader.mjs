import {readFile} from 'node:fs/promises';
import {publicState} from '../executor/publicState.mjs';
import {mapReads,readTogether} from '../executor/readConcurrency.mjs';
import {quoteInitialLiquidity, quoteExactIn, quoteRemoveLiquidity} from './referenceMath.mjs';
import {POOL_FEE_ESCROW, POOL_AMOUNT_CAP} from './operationCalls.mjs';
import {createPoolCallBuilder} from './callBuilder.mjs';

export function createAmmReader({amountCap = POOL_AMOUNT_CAP} = {}) {
const {settleAddCalls, settleSwapCalls, settleRemoveCalls, refundSwapCalls,
  refundAddCalls, cancelRemoveCalls, withPoolSignInputs} = createPoolCallBuilder({amountCap});
const cap = BigInt(amountCap), fee = BigInt(POOL_FEE_ESCROW);
const bounded = value => typeof value === 'bigint' && value > 0n && value <= cap;
const number = value => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('unsafe AMM call input');
  return n;
};

function proposeAmmAction({contractId, vaultId, pool, orders, checkpoint}) {
  if (![pool.reservePsy, pool.reserveUsdt, pool.totalShares].every(v => v >= 0n && v <= cap)) return null;
  for (const order of orders) {
    const o = order, ids = {poolContractId: contractId, poolUserId: vaultId, payerId: o.payerId};
    if (o.pool !== BigInt(vaultId) || o.kind < 1n || o.kind > 3n || o.nonce <= o.consumedNonce) continue;
    const dp = o.sentPsy - o.settledPsy, du = o.sentUsdt - o.settledUsdt;
    if (dp < 0n || du < 0n) continue;
    const expired = o.deadline < BigInt(checkpoint);
    let data, kind;
    if (o.kind === 1n) {
      const psy = o.asset === 0n;
      if (!psy && o.asset !== 4n) continue;
      const input = psy ? o.amountPsy : o.amountUsdt;
      if (!bounded(input) || !bounded(o.minOut) || dp !== fee + (psy ? input : 0n) || (!psy && du !== input)) continue;
      if (expired) {
        data = refundSwapCalls({...ids, asset: number(o.asset), amount: number(input)}); kind = 'refund';
      } else {
        try {
          const q = quoteExactIn({reserveIn: psy ? pool.reservePsy : pool.reserveUsdt,
            reserveOut: psy ? pool.reserveUsdt : pool.reservePsy, amountIn: input, minAmountOut: o.minOut});
          if (q.nextReserveIn > cap) continue;
          data = settleSwapCalls({...ids, asset: number(o.asset), amountIn: number(input), amountOut: number(q.amountOut), nonce: number(o.nonce)}); kind = 'swap';
        } catch {continue;}
      }
    } else if (o.kind === 2n) {
      if (!bounded(o.amountPsy) || !bounded(o.amountUsdt) || !bounded(o.minOut)) continue;
      const paidPsy = dp - fee;
      if (paidPsy < 0n || (paidPsy !== 0n && paidPsy !== o.amountPsy) || (du !== 0n && du !== o.amountUsdt)) continue;
      if (expired) {
        if (paidPsy === 0n && du === 0n) continue;
        data = refundAddCalls({...ids, amountPsy: number(paidPsy), amountUsdt: number(du)}); kind = 'refund-add';
      } else {
        if (paidPsy !== o.amountPsy || du !== o.amountUsdt) continue;
        let minted;
        if (pool.totalShares === 0n) {
          if (pool.reservePsy !== 0n || pool.reserveUsdt !== 0n) continue;
          try {minted = quoteInitialLiquidity({amountPsy: paidPsy, amountUsdt: du}).providerShares;} catch {continue;}
        } else {
          if (pool.reservePsy === 0n || pool.reserveUsdt === 0n || paidPsy * pool.reserveUsdt !== du * pool.reservePsy) continue;
          minted = paidPsy * pool.totalShares / pool.reservePsy;
        }
        if (!bounded(minted) || minted < o.minOut || pool.reservePsy + paidPsy > cap || pool.reserveUsdt + du > cap || pool.totalShares + minted + (pool.totalShares === 0n ? 1000n : 0n) > cap) continue;
        data = settleAddCalls({...ids, amountPsy: number(paidPsy), amountUsdt: number(du), minted: number(minted), nonce: number(o.nonce)}); kind = 'add';
      }
    } else {
      if (dp !== fee) continue;
      if (expired) {data = cancelRemoveCalls({...ids, nonce: number(o.nonce)}); kind = 'cancel-remove';}
      else {
        if (!bounded(o.shares) || o.ownedShares < o.shares) continue;
        try {
          const q = quoteRemoveLiquidity({...pool, shares: o.shares});
          if (q.amountPsy < o.minPsy || q.amountUsdt < o.minUsdt) continue;
          data = settleRemoveCalls({...ids, shares: number(o.shares), amountPsy: number(q.amountPsy), amountUsdt: number(q.amountUsdt), nonce: number(o.nonce)}); kind = 'remove';
        } catch {continue;}
      }
    }
    return {kind, submission: withPoolSignInputs(data)};
  }
  return null;
}

async function scanAmm(options, readState = publicState) {
  const s = await readState(options.rpcConfig), abi = JSON.parse(await readFile(options.abi, 'utf8'));
  const fields = new Map(abi.contract.state.map(f => [f.name, f.offset]));
  const field = (name, payer) => s.slot(options.vaultId, options.contractId, fields.get(name) + payer);
  const p = await s.fields(options.vaultId, options.contractId, abi, ['reserve_psy', 'reserve_usdt', 'total_shares']);
  const pool = {reservePsy: p.reserve_psy, reserveUsdt: p.reserve_usdt, totalShares: p.total_shares};
  const orders = await mapReads(options.users, async payerId => {
    if (!Number.isSafeInteger(payerId) || payerId < 1 || payerId >= 16_777_216 || payerId === options.vaultId) throw new RangeError('invalid payer');
    const f = await s.fields(payerId, options.contractId, abi, ['order_kind', 'order_pool_user', 'order_asset',
      'order_amount_psy', 'order_amount_usdt', 'order_min_out', 'order_deadline', 'order_nonce',
      'order_shares', 'order_min_psy', 'order_min_usdt']);
    const [consumedNonce,ownedShares,settledPsy,settledUsdt,sentPsy,sentUsdt] = await readTogether([
      field('consumed_nonce', payerId),field('shares', payerId),field('settled_psy_sent', payerId),field('settled_usdt_sent', payerId),
      s.slot(payerId,0,3+options.vaultId*2),s.slot(payerId,4,3+options.vaultId*2)]);
    return {payerId, kind: f.order_kind, pool: f.order_pool_user, asset: f.order_asset,
      amountPsy: f.order_amount_psy, amountUsdt: f.order_amount_usdt, minOut: f.order_min_out,
      deadline: f.order_deadline, nonce: f.order_nonce, shares: f.order_shares, minPsy: f.order_min_psy, minUsdt: f.order_min_usdt,
      consumedNonce, ownedShares, settledPsy, settledUsdt, sentPsy, sentUsdt};
  });
  return {checkpoint: s.checkpoint, pool, orders, action: proposeAmmAction({...options, pool, orders, checkpoint: s.checkpoint})};
}
return {proposeAmmAction, scanAmm};
}

export const {proposeAmmAction, scanAmm} = createAmmReader();
