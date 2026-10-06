import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const deployed = JSON.parse(readFileSync(new URL('./target/abi.json', import.meta.url))).contract;
const candidate = process.env.AMM_ABI_DIR
  ? pathToFileURL(resolve(process.env.AMM_ABI_DIR) + '/')
  : new URL('./target-pusdt-verified/', import.meta.url);
const abi = JSON.parse(readFileSync(new URL('abi.json', candidate))).contract;

test('compiled pool ABI preserves the live token Outbox slot prefix', () => {
  // Checked against the staging PSY (0) and pUSDT (4) genesis ABIs. Both
  // expose balance/reserved/reserved at 0..2 and OtherUserInfo at offset 3.
  assert.equal(abi.state_tree_height, 32);
  assert.deepEqual(abi.state.slice(0, 4).map(({ offset }) => offset), [0, 1, 2, 3]);
  const outbox = abi.state[3];
  assert.equal(outbox.type.kind, 'array');
  assert.equal(outbox.type.item.name, 'OtherUserInfo');
  assert.equal(outbox.type.item_felt_size, 2);
  assert.ok(outbox.type.length >= 16_777_216);
  assert.deepEqual(abi.state_layout, deployed.state_layout, 'candidate must preserve the deployed state layout');
});

test('compiled pool ABI exposes all payer and pool actions', () => {
  assert.deepEqual(new Set(abi.methods.map(({ name }) => name)), new Set([
    'noop',
    'open_swap', 'open_add', 'open_remove',
    'close_psy_swap', 'close_usdt_swap', 'close_add', 'close_remove',
    'cancel_remove',
    'refund_unclaimed', 'refund_add_unclaimed',
    'swap', 'add_liquidity', 'remove_liquidity',
  ]));
  for (const method of abi.methods) assert.ok(Number.isSafeInteger(method.method_id));
  for (const method of deployed.methods) {
    assert.equal(abi.methods.find(candidate => candidate.name === method.name)?.method_id,
      method.method_id, `${method.name} method ID changed`);
  }
});

test('PSY-only close methods do not read a pUSDT partition', () => {
  const definitions = JSON.parse(readFileSync(new URL('circuit_defs.json', candidate)));
  const readsPusdt = name => {
    const method = definitions.find(definition => definition.name === name);
    assert.ok(method, `${name} missing`);
    const constants = new Set(method.definitions
      .filter(definition => definition.op_type === 1 && definition.inputs?.[0] === 4)
      .map(definition => definition.index));
    return method.state_commands.some(command =>
      (command.type === 'GetOtherUserContractStateSlotSingle' ||
        command.type === 'GetSelfUserExternalContractStateSlotSingle') &&
      constants.has(command.contract_id));
  };
  assert.equal(readsPusdt('close_psy_swap'), false);
  assert.equal(readsPusdt('close_remove'), false);
  assert.equal(readsPusdt('close_usdt_swap'), true);
  assert.equal(readsPusdt('close_add'), true);
});

test('close methods use pool settlement cursors rather than token claimed slots', () => {
  const definitions = JSON.parse(readFileSync(new URL('circuit_defs.json', candidate)));
  for (const name of ['close_psy_swap', 'close_usdt_swap', 'close_add', 'close_remove']) {
    const method = definitions.find(definition => definition.name === name);
    assert.ok(method, `${name} missing`);
    const tokenContractConstants = new Set(method.definitions
      .filter(definition => definition.op_type === 1 && [0, 4].includes(definition.inputs?.[0]))
      .map(definition => definition.index));
    assert.equal(method.state_commands.some(command =>
      command.type === 'GetOtherUserContractStateSlotSingle' &&
      tokenContractConstants.has(command.contract_id)), false, `${name} reads pool token claimed state`);
    assert.ok(method.state_commands.some(command =>
      command.type === 'GetOtherUserContractStateSlotSingle'), `${name} lacks pool cursor read`);
  }
});
