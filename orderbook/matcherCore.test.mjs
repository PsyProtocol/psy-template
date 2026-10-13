import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOrder, decodeFeltSlot, proposeExpiredRefunds, proposeMatch } from './matcherCore.mjs';
import { FEE_ESCROW, PSY, PUSDT } from './operationCalls.mjs';

const opts = { checkpoint: 100, contractId: 64, escrowId: 591872 };
const psy = {
  sellerId: 329728, kind: 1n, poolUser: 591872n, asset: BigInt(PSY),
  sellAmount: 400000n, minBuy: 200000n, deadline: 200n, nonce: 1n, consumedNonce: 0n,
  sentPsy: 400000n + BigInt(FEE_ESCROW), settledPsy: 0n,
  sentUsdt: 0n, settledUsdt: 0n,
};
const usdt = {
  sellerId: 1640448, kind: 1n, poolUser: 591872n, asset: BigInt(PUSDT),
  sellAmount: 200000n, minBuy: 300000n, deadline: 200n, nonce: 1n, consumedNonce: 0n,
  sentPsy: BigInt(FEE_ESCROW), settledPsy: 0n,
  sentUsdt: 200000n, settledUsdt: 0n,
};

test('decode packed Merkle leaf slots in reverse limb order', () => {
  const value = [4n, 3n, 2n, 1n].map(n => n.toString(16).padStart(16, '0')).join('');
  assert.deepEqual([0, 1, 2, 3].map(slot => decodeFeltSlot(value, slot)), [1n, 2n, 3n, 4n]);
  assert.throws(() => decodeFeltSlot(value.slice(1), 0), /invalid/);
});

test('compatible fully funded orders produce one exact SD-key match stack', () => {
  assert.deepEqual(checkOrder(psy, 100, opts.escrowId), []);
  assert.deepEqual(checkOrder(usdt, 100, opts.escrowId), []);
  const proposal = proposeMatch([psy, usdt], opts);
  assert.deepEqual(proposal.args, {
    contractId: 64, escrowId: 591872, psySeller: 329728, usdtSeller: 1640448,
    amountPsy: 400000, amountUsdt: 200000, psyNonce: 1, usdtNonce: 1,
  });
  const calls = proposal.submission.contract_calls;
  assert.deepEqual(calls[4].inputs, [1640448, 400000 + FEE_ESCROW]);
  assert.deepEqual(calls[5].inputs, [329728, 200000]);
});

test('price mismatch, absent payment, wrong escrow, consumed nonce and expiry cannot match', () => {
  assert.equal(proposeMatch([psy, { ...usdt, minBuy: 400001n }], opts), null);
  assert.equal(proposeMatch([psy, { ...usdt, sentUsdt: 199999n }], opts), null);
  assert.equal(proposeMatch([{ ...psy, poolUser: 1n }, usdt], opts), null);
  assert.equal(proposeMatch([{ ...psy, consumedNonce: 1n }, usdt], opts), null);
  assert.equal(proposeMatch([{ ...psy, deadline: 99n }, usdt], opts), null);
  assert.equal(proposeMatch([{ ...psy, sentPsy: 400000n + BigInt(FEE_ESCROW) + 1n }, usdt], opts), null);
});

test('expired refund still binds the original seller and exact unpaid amount', () => {
  const expired = { ...usdt, deadline: 99n };
  const [refund] = proposeExpiredRefunds([expired], opts);
  assert.equal(refund.args.sellerId, 1640448);
  assert.deepEqual(refund.submission.contract_calls[3].inputs, [1640448, 200000]);
  assert.deepEqual(proposeExpiredRefunds([{ ...expired, sentUsdt: 0n }], opts), []);
});

test('limit-price priority is exact and independent of snapshot enumeration', () => {
  const ask=(sellerId,sellAmount,minBuy)=>({...psy,sellerId,sellAmount,minBuy,sentPsy:sellAmount+BigInt(FEE_ESCROW)});
  const bid=(sellerId,sellAmount,minBuy)=>({...usdt,sellerId,sellAmount,minBuy,sentUsdt:sellAmount});
  const orders=[ask(111,400000n,200000n),ask(222,400000n,160000n),bid(333,220000n,400000n),bid(444,240000n,400000n)];
  const expected=proposeMatch(orders,opts);
  assert.equal(expected.args.psySeller,222);
  assert.equal(expected.args.usdtSeller,444);
  for (const permutation of [orders.toReversed?.()??[...orders].reverse(),[orders[2],orders[0],orders[3],orders[1]]]) {
    assert.deepEqual(proposeMatch(permutation,opts),expected);
  }
  assert.deepEqual(orders.map(o=>o.sellerId),[111,222,333,444]);
});

test('equal prices use deterministic seller IDs and skip incompatible full-fill sizes', () => {
  const ask={...psy,sellerId:222};
  const equalAsk={...psy,sellerId:111};
  const tooLarge={...usdt,sellerId:333,minBuy:800000n,sellAmount:1000000n,sentUsdt:1000000n};
  const bid={...usdt,sellerId:444};
  const result=proposeMatch([ask,tooLarge,bid,equalAsk],opts);
  assert.equal(result.args.psySeller,111);
  assert.equal(result.args.usdtSeller,444);
});
