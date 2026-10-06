import assert from 'node:assert/strict';
import test from 'node:test';
import {
  POOL_FEE_ESCROW, openSwapCalls, settleSwapCalls, refundSwapCalls,
  openAddCalls, settleAddCalls, refundAddCalls,
  openRemoveCalls, settleRemoveCalls, closeOrderCalls, withPoolSignInputs,
} from './operationCalls.mjs';

const ids = { poolContractId: 12, poolUserId: 123, payerId: 456 };
const call = (contract_id, method_name, ...inputs) => ({ contract_id, method_name, inputs });
const pad = (calls) => [...calls, ...Array.from({ length: 5 - calls.length }, () => call(12, 'noop'))];

test('PSY and pUSDT swaps construct payer-bound calls in the required order', () => {
  const payer = openSwapCalls({ ...ids, asset: 0, amountIn: 1000, minOut: 50, deadline: 900, nonce: 1 });
  assert.deepEqual(payer.contract_calls, [
    call(12, 'open_swap', 123, 0, 1000, 50, 900, 1),
    call(0, 'simple_transfer', 123, 1000 + POOL_FEE_ESCROW),
  ]);
  assert.deepEqual(settleSwapCalls({ ...ids, asset: 0, amountIn: 1000, amountOut: 50, nonce: 1 }).contract_calls, pad([
    call(12, 'swap', 456, 0, 1000, 50, 1),
    call(0, 'simple_claim', 456),
    call(4, 'simple_transfer', 456, 50),
  ]));
  assert.deepEqual(settleSwapCalls({ ...ids, asset: 4, amountIn: 50, amountOut: 1000, nonce: 2 }).contract_calls, pad([
    call(12, 'swap', 456, 4, 50, 1000, 2),
    call(0, 'simple_claim', 456),
    call(4, 'simple_claim', 456),
    call(0, 'simple_transfer', 456, 1000),
  ]));
});

test('refunds transfer only to the original payer and handle one or both LP legs', () => {
  assert.deepEqual(refundSwapCalls({ ...ids, asset: 4, amount: 50 }).contract_calls, pad([
    call(12, 'refund_unclaimed', 456, 4, 50),
    call(0, 'simple_claim', 456),
    call(4, 'simple_claim', 456),
    call(4, 'simple_transfer', 456, 50),
  ]));
  assert.deepEqual(refundAddCalls({ ...ids, amountPsy: 1000, amountUsdt: 0 }).contract_calls, pad([
    call(12, 'refund_add_unclaimed', 456, 1000, 0),
    call(0, 'simple_claim', 456),
    call(0, 'simple_transfer', 456, 1000),
  ]));
  assert.deepEqual(refundAddCalls({ ...ids, amountPsy: 1000, amountUsdt: 2000 }).contract_calls, pad([
    call(12, 'refund_add_unclaimed', 456, 1000, 2000),
    call(0, 'simple_claim', 456),
    call(4, 'simple_claim', 456),
    call(0, 'simple_transfer', 456, 1000),
    call(4, 'simple_transfer', 456, 2000),
  ]));
});

test('LP add/remove calls include fee payment, guard, and exact token calls', () => {
  assert.deepEqual(openAddCalls({ ...ids, amountPsy: 1000, amountUsdt: 2000, minShares: 500, deadline: 900, nonce: 1 }).contract_calls, [
    call(12, 'open_add', 123, 1000, 2000, 500, 900, 1),
    call(0, 'simple_transfer', 123, 1000 + POOL_FEE_ESCROW),
    call(4, 'simple_transfer', 123, 2000),
  ]);
  assert.deepEqual(settleAddCalls({ ...ids, amountPsy: 1000, amountUsdt: 2000, minted: 500, nonce: 1 }).contract_calls, pad([
    call(12, 'add_liquidity', 456, 1000, 2000, 500, 1),
    call(0, 'simple_claim', 456),
    call(4, 'simple_claim', 456),
  ]));
  assert.deepEqual(openRemoveCalls({ ...ids, shares: 500, minPsy: 400, minUsdt: 800, deadline: 900, nonce: 2 }).contract_calls, [
    call(12, 'open_remove', 123, 500, 400, 800, 900, 2),
    call(0, 'simple_transfer', 123, POOL_FEE_ESCROW),
  ]);
  assert.deepEqual(settleRemoveCalls({ ...ids, shares: 500, amountPsy: 400, amountUsdt: 800, nonce: 2 }).contract_calls, pad([
    call(12, 'remove_liquidity', 456, 500, 400, 800, 2),
    call(0, 'simple_claim', 456),
    call(0, 'simple_transfer', 456, 400),
    call(4, 'simple_transfer', 456, 800),
  ]));
});

test('call builder rejects invalid asset, unrelated recipient, and values outside the circuit bound', () => {
  assert.throws(() => refundSwapCalls({ ...ids, asset: 5, amount: 1 }), /asset must/);
  assert.throws(() => refundSwapCalls({ ...ids, poolUserId: 456, asset: 0, amount: 1 }), /differ/);
  assert.throws(() => settleSwapCalls({ ...ids, asset: 0, amountIn: 10_000_001, amountOut: 1, nonce: 1 }), /amountIn/);
  assert.throws(() => refundAddCalls({ ...ids, amountPsy: 0, amountUsdt: 0 }), /at least one/);
});

test('payer closes each order path with its matching compiled method', () => {
  assert.deepEqual(closeOrderCalls({ ...ids, kind: 'swap', asset: 0 }).contract_calls,
    [call(12, 'close_psy_swap')]);
  assert.deepEqual(closeOrderCalls({ ...ids, kind: 'swap', asset: 4 }).contract_calls,
    [call(12, 'close_usdt_swap')]);
  assert.deepEqual(closeOrderCalls({ ...ids, kind: 'add' }).contract_calls,
    [call(12, 'close_add')]);
  assert.deepEqual(closeOrderCalls({ ...ids, kind: 'remove' }).contract_calls,
    [call(12, 'close_remove')]);
  assert.throws(() => closeOrderCalls({ ...ids, kind: 'swap', asset: 9 }), /asset must/);
  assert.throws(() => closeOrderCalls({ ...ids, kind: 'other' }), /kind must/);
});

test('pool submission includes the seven circuit inputs bound to the refund calls', () => {
  const calls = refundAddCalls({ ...ids, amountPsy: 1000, amountUsdt: 2000 });
  const submission = withPoolSignInputs(calls, 1_000_010_000);
  assert.deepEqual(submission.software_defined_call.inputs, [9, 456, 1000, 2000, 0, 0, 1_000_010_000]);
  assert.deepEqual(withPoolSignInputs(calls).software_defined_call.inputs, [9, 456, 1000, 2000, 0, 0, 0]);
  assert.deepEqual(submission.contract_calls, calls.contract_calls);
  assert.throws(() => withPoolSignInputs(calls, 1_000_010_001), /DA fee increment/);
});
