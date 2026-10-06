import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { authorizeEscrowTransaction } from './sdKeyPolicyReference.mjs';
import { FEE_ESCROW, PSY, PUSDT, cancelCalls, matchCalls, openSellCalls, withEscrowSignInputs } from './operationCalls.mjs';

const ids = { contractId: 62, escrowId: 1_500_000 };
const burn = { contract_id: PSY, method_name: 'simple_burn', inputs: [1_000_010_000] };
const tx = built => [...structuredClone(built.contract_calls), burn];
const check = contractCalls => authorizeEscrowTransaction({ contractCalls, ...ids });

test('compiled ABI exposes the orderbook and preserves token Outbox prefix', () => {
  const abi = JSON.parse(readFileSync(new URL('./contract/target/abi.json', import.meta.url)));
  const methods = abi.contract.methods.map(method => method.name);
  for (const name of ['noop', 'open_sell', 'close_psy_order', 'close_usdt_order', 'match_orders', 'cancel_psy_order', 'cancel_usdt_order']) {
    assert(methods.includes(name), `${name} missing from ABI`);
  }
  const source = readFileSync(new URL('./contract/src/main.psy.rs', import.meta.url), 'utf8');
  assert(source.indexOf('pub other_user_info') < source.indexOf('pub consumed_nonce'));
  assert.match(source, /previous order still active/);
});

test('PSY cancellation and closing never read the seller pUSDT partition', () => {
  const definitions = JSON.parse(readFileSync(new URL('./contract/target/circuit_defs.json', import.meta.url)));
  const psy = definitions.find(method => method.name === 'cancel_psy_order');
  const usdt = definitions.find(method => method.name === 'cancel_usdt_order');
  const closePsy = definitions.find(method => method.name === 'close_psy_order');
  const closeUsdt = definitions.find(method => method.name === 'close_usdt_order');
  const readsPusdt = method => {
    const pusdtConstants = new Set(method.definitions
      .filter(definition => definition.op_type === 1 && definition.inputs?.[0] === PUSDT)
      .map(definition => definition.index));
    return method.state_commands.some(command =>
      command.type === 'GetOtherUserContractStateSlotSingle' && pusdtConstants.has(command.contract_id));
  };
  assert.equal(readsPusdt(psy), false);
  assert.equal(readsPusdt(usdt), true);
  assert.equal(readsPusdt(closePsy), false);
  assert.equal(readsPusdt(closeUsdt), true);
});

test('payer opening stacks include one exact asset deposit and one fee escrow', () => {
  const psy = openSellCalls({ ...ids, sellerId: 123, sellAsset: PSY,
    sellAmount: 1_000, minBuy: 1_100, deadline: 900, nonce: 1 });
  assert.deepEqual(psy.contract_calls[1].inputs, [ids.escrowId, 1_000 + FEE_ESCROW]);
  const usdt = openSellCalls({ ...ids, sellerId: 456, sellAsset: PUSDT,
    sellAmount: 1_200, minBuy: 900, deadline: 900, nonce: 1 });
  assert.deepEqual(usdt.contract_calls.slice(1).map(call => call.inputs), [
    [ids.escrowId, 1_200], [ids.escrowId, FEE_ESCROW],
  ]);
  assert.throws(() => openSellCalls({ ...ids, sellerId: ids.escrowId, sellAsset: PSY,
    sellAmount: 1, minBuy: 1, deadline: 900, nonce: 1 }), /differ/);
});

test('all three SD-key branches bind claim, payout and recipient amounts', () => {
  const examples = [
    matchCalls({ ...ids, psySeller: 123, usdtSeller: 456,
      amountPsy: 1_000, amountUsdt: 1_200, psyNonce: 1, usdtNonce: 2 }),
    cancelCalls({ ...ids, sellerId: 123, sellAsset: PSY, sellAmount: 1_000, nonce: 1 }),
    cancelCalls({ ...ids, sellerId: 456, sellAsset: PUSDT, sellAmount: 1_200, nonce: 2 }),
  ];
  for (const [branch, example] of examples.entries()) {
    const valid = tx(example);
    assert.equal(check(valid).action, branch ? 'cancel' : 'match');
    assert.equal(withEscrowSignInputs(example).software_defined_call.inputs[0], branch + 1);
    for (let index = 1; index < 6; index++) {
      if (valid[index].method_name !== 'simple_transfer') continue;
      const redirected = structuredClone(valid);
      redirected[index].inputs[0] = 789;
      assert.throws(() => check(redirected), /differs/);
      const inflated = structuredClone(valid);
      inflated[index].inputs[1] += 1;
      assert.throws(() => check(inflated), /differs/);
    }
    const extra = structuredClone(valid);
    extra.splice(6, 0, { contract_id: PSY, method_name: 'simple_transfer', inputs: [789, 1] });
    assert.throws(() => check(extra), /six guarded/);
  }
});

test('claim order, fee, and token-contract tampering fail authorization', () => {
  const original = tx(matchCalls({ ...ids, psySeller: 123, usdtSeller: 456,
    amountPsy: 1_000, amountUsdt: 1_200, psyNonce: 1, usdtNonce: 2 }));
  const swappedClaims = structuredClone(original);
  [swappedClaims[1], swappedClaims[2]] = [swappedClaims[2], swappedClaims[1]];
  assert.throws(() => check(swappedClaims), /differs/);
  const badFee = structuredClone(original);
  badFee[6].inputs[0] = 1_000_101_000;
  assert.throws(() => check(badFee), /fee burn/);
  const badContract = structuredClone(original);
  badContract[3].contract_id = PSY;
  assert.throws(() => check(badContract), /differs/);
});
