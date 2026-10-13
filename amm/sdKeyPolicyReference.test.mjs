import assert from 'node:assert/strict';
import test from 'node:test';
import { refundAddCalls, refundSwapCalls, settleSwapCalls, settleAddCalls, settleRemoveCalls } from './operationCalls.mjs';
import { authorizePoolTransaction } from './sdKeyPolicyReference.mjs';

const ids = { poolContractId: 12, poolUserId: 123, payerId: 456 };
const burn = { contract_id: 0, method_name: 'simple_burn', inputs: [1_000_010_000] };
const tx = (built) => structuredClone([...built.contract_calls, burn]);
const check = (calls) => authorizePoolTransaction({ contractCalls: calls, poolContractId: 12, poolUserId: 123 });

test('reference policy accepts exact swap and partial LP refund stacks', () => {
  assert.equal(check(tx(settleSwapCalls({ ...ids, asset: 4, amountIn: 50, amountOut: 1000, nonce: 1 }))).payerId, 456);
  assert.equal(check(tx(refundAddCalls({ ...ids, amountPsy: 0, amountUsdt: 50 }))).action, 'refund_add_unclaimed');
});

test('reference policy rejects Bob, amount changes, call insertion, order changes, and fee abuse', () => {
  const valid = tx(refundSwapCalls({ ...ids, asset: 0, amount: 1000 }));
  const bob = structuredClone(valid);
  bob[2].inputs[0] = 789;
  assert.throws(() => check(bob), /differs/);

  const overpay = structuredClone(valid);
  overpay[2].inputs[1] = 1001;
  assert.throws(() => check(overpay), /differs/);

  const inserted = structuredClone(valid);
  inserted.splice(3, 0, { contract_id: 0, method_name: 'simple_transfer', inputs: [789, 1] });
  assert.throws(() => check(inserted), /five guarded/);

  const reordered = structuredClone(valid);
  [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  assert.throws(() => check(reordered), /differs/);

  const excessiveBurn = structuredClone(valid);
  excessiveBurn[5].inputs[0] = 1_100_000_000;
  assert.throws(() => check(excessiveBurn), /fee burn/);

  const noPayment = structuredClone(valid);
  noPayment[0].inputs[0] = 789;
  assert.throws(() => check(noPayment), /differs/);
});

test('all nine pool branches bind every transfer to the payer across repeated inputs', () => {
  const builders = [
    () => settleSwapCalls({ ...ids, asset: 0, amountIn: 1_000, amountOut: 900, nonce: 1 }),
    () => settleSwapCalls({ ...ids, asset: 4, amountIn: 1_000, amountOut: 900, nonce: 2 }),
    () => refundSwapCalls({ ...ids, asset: 0, amount: 1_000 }),
    () => refundSwapCalls({ ...ids, asset: 4, amount: 1_000 }),
    () => settleAddCalls({ ...ids, amountPsy: 1_000, amountUsdt: 1_000, minted: 999, nonce: 3 }),
    () => settleRemoveCalls({ ...ids, shares: 999, amountPsy: 1_000, amountUsdt: 1_000, nonce: 4 }),
    () => refundAddCalls({ ...ids, amountPsy: 1_000, amountUsdt: 0 }),
    () => refundAddCalls({ ...ids, amountPsy: 0, amountUsdt: 1_000 }),
    () => refundAddCalls({ ...ids, amountPsy: 1_000, amountUsdt: 1_000 }),
  ];
  for (let round = 0; round < 10; round++) {
    for (const build of builders) {
      const valid = tx(build());
      assert.equal(check(valid).payerId, ids.payerId);
      for (let index = 1; index < 5; index++) {
        if (valid[index].method_name !== 'simple_transfer') continue;
        const redirected = structuredClone(valid);
        redirected[index].inputs[0] = 789;
        assert.throws(() => check(redirected), /differs/);
      }
    }
  }
});

test('reference fee burn rejects increments absent from the registered Rust policy', () => {
  const calls=tx(settleSwapCalls({...ids,asset:0,amountIn:1000,amountOut:50,nonce:1}));
  calls[5].inputs[0]=1_000_000_001;
  assert.throws(()=>check(calls),/fee burn/);
});
