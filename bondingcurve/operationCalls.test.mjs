import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteBuy, quoteSell } from './curveMath.mjs';
import { fundInventoryCalls, initializeCalls, openBuyCalls, openSellCalls,
  settleBuyCalls, settleSellCalls, refundBuyCalls, refundSellCalls,
  graduateCalls, withVaultSignInputs } from './operationCalls.mjs';

const launch = { contractId: 66, tokenId: 65, vaultId: 123, issuerId: 456, targetId: 789,
  maxLots: 10_000n, liquidityLots: 1_000n, lotSize: 1_000_000_000n,
  basePrice: 1_000_000_000n, stepPrice: 1_000n, thresholdLots: 8_000n };
const buyer = { ...launch, payerId: 111, expectedSold: 5, lots: 2, deadline: 90_000, nonce: 1 };

test('issuer funding and initialization bind inventory and both asset claims', () => {
  assert.deepEqual(fundInventoryCalls(launch).contract_calls.map(c => c.method_name), ['transfer', 'simple_transfer']);
  const init = initializeCalls(launch);
  assert.deepEqual(init.contract_calls.slice(0, 3).map(c => c.method_name), ['initialize', 'claim', 'simple_claim']);
  assert.deepEqual(withVaultSignInputs(init).software_defined_call.inputs, [1, 0, 0, 0, 0, 0]);
});

test('buy and sell stacks match exact quoted payment and original user', () => {
  const buyQuote = quoteBuy(launch, 5n, 2n);
  const buy = openBuyCalls(buyer);
  assert.equal(buy.contract_calls[1].inputs[1], Number(buyQuote.cost + 1_000_100_000n));
  assert.deepEqual(settleBuyCalls(buyer).contract_calls.slice(0, 3).map(c => c.method_name),
    ['settle_buy', 'simple_claim', 'transfer']);
  const sell = { ...buyer, expectedSold: 7, nonce: 2 };
  const sellQuote = quoteSell(launch, 7n, 2n);
  assert.equal(openSellCalls(sell).contract_calls[1].inputs[1], Number(sellQuote.tokenAmount));
  assert.deepEqual(settleSellCalls(sell).contract_calls.slice(0, 4).map(c => c.method_name),
    ['settle_sell', 'claim', 'simple_claim', 'simple_transfer']);
  assert.deepEqual(withVaultSignInputs(settleSellCalls(sell)).software_defined_call.inputs,
    [3, 111, 2, Number(sellQuote.payout), 2, 0]);
});

test('refunds and graduation preserve original recipients and exact amounts', () => {
  const buyRefund = refundBuyCalls({ ...buyer, quotedPsy: 12345 });
  assert.deepEqual(buyRefund.contract_calls[2].inputs, [111, 12345]);
  assert.deepEqual(withVaultSignInputs(buyRefund).software_defined_call.inputs, [4, 111, 2, 12345, 1, 0]);
  const sellRefund = refundSellCalls({ ...buyer, expectedSold: 7 });
  assert.deepEqual(sellRefund.contract_calls[3].inputs, [111, 2_000_000_000]);
  assert.deepEqual(withVaultSignInputs(sellRefund).software_defined_call.inputs, [5, 111, 2, 0, 1, 0]);
  const graduate = graduateCalls({ ...launch, soldLots: 8_000 });
  assert.equal(graduate.contract_calls[2].inputs[0], 789);
  assert.equal(graduate.contract_calls[3].inputs[0], 789);
  assert.deepEqual(withVaultSignInputs(graduate).software_defined_call.inputs.slice(0, 2), [6, 0]);
  assert.throws(() => graduateCalls({ ...launch, soldLots: 7_999 }), /soldLots/);
});
