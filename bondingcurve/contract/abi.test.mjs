import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const abi = JSON.parse(readFileSync(new URL('./target/abi.json', import.meta.url))).contract;
const tokenAbi = JSON.parse(readFileSync(new URL('../launch-token/target/abi.json', import.meta.url))).contract;
const definitions = JSON.parse(readFileSync(new URL('./target/circuit_defs.json', import.meta.url)));

test('curve ABI preserves PSY and companion-token Outbox prefix and all methods', () => {
  assert.equal(abi.state_tree_height, 32);
  assert.deepEqual(abi.state.slice(0, 4).map(field => field.offset), [0, 1, 2, 3]);
  assert.equal(abi.state[3].type.item_felt_size, 2);
  assert.ok(abi.state[3].type.length >= 16_777_216);
  assert.deepEqual(new Set(abi.methods.map(method => method.name)), new Set([
    'noop', 'initialize', 'open_buy', 'open_sell', 'close_buy', 'close_sell',
    'settle_buy', 'settle_sell', 'refund_buy', 'refund_sell', 'graduate',
  ]));
});

test('companion launch token has the exact claim/transfer ABI and Outbox offsets', () => {
  assert.deepEqual(tokenAbi.state.slice(0, 4).map(field => field.offset), [0, 1, 2, 3]);
  assert.equal(tokenAbi.state[3].type.item_felt_size, 2);
  assert.equal(tokenAbi.state[3].type.length, abi.state[3].type.length);
  const methods = Object.fromEntries(tokenAbi.methods.map(method => [method.name, method.method_id]));
  assert.equal(methods.claim, 2_394_033_944);
  assert.equal(methods.transfer, 194_520_553);
});

test('PSY-only buy close and refund never read a token partition', () => {
  const method = name => definitions.find(definition => definition.name === name);
  for (const name of ['close_buy', 'refund_buy']) {
    const def = method(name);
    assert.ok(def);
    const externalReads = def.state_commands.filter(command =>
      command.type === 'GetSelfUserExternalContractStateSlotSingle' ||
      command.type === 'GetOtherUserContractStateSlotSingle');
    assert.ok(externalReads.length > 0);
    assert.equal(def.state_commands.some(command => command.type === 'GetSelfUserExternalContractStateSlotSingle' &&
      !def.definitions.some(value => value.index === command.contract_id && value.op_type === 1 && value.inputs?.[0] === 0)), false);
  }
});
