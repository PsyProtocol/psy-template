import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkAmmUpdate } from './check_update_layout.mjs';

const oldAbi = JSON.parse(readFileSync(new URL('./contract/target/abi.json', import.meta.url)));
const nextAbi = JSON.parse(readFileSync(new URL('./contract/target-next/abi.json', import.meta.url)));
const chainLeaf = { data: { Contract: {
  deployer: 'test-deployer',
  code_root: '2bf37d3c38869cafd5ad9b4e09247ac9ee2f437fa89468d009b69f50e7fc42bf',
  state_layout_root: '5ff1d11b3ceac86c3b1e7eb587964371e98b3cab316e774bd0e724775c961f81',
  state_layout_field_count: 22,
  state_layout_slot_count: 2_214_592_529,
  state_tree_height: 32,
} } };

test('AMM candidate preserves the pinned live layout and original methods', () => {
  assert.equal(checkAmmUpdate({ oldAbi, nextAbi, chainLeaf }).requestChecked, false);
});

test('AMM layout gate ignores JSON key order but rejects changed field offsets', () => {
  const reordered = structuredClone(oldAbi);
  const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]))
      : value;
  reordered.contract.state_layout = reverseKeys(oldAbi.contract.state_layout);
  assert.equal(checkAmmUpdate({oldAbi: reordered, nextAbi, chainLeaf}).requestChecked, false);
  const changed = structuredClone(nextAbi);
  changed.contract.state_layout.fields[4].start_slot++;
  assert.throws(() => checkAmmUpdate({oldAbi, nextAbi: changed, chainLeaf}), /candidate layout/);
});

test('AMM update gate rejects stale chain layout and changed old method IDs', () => {
  const changedLeaf = structuredClone(chainLeaf);
  changedLeaf.data.Contract.state_layout_field_count = 23;
  assert.throws(() => checkAmmUpdate({ oldAbi, nextAbi, chainLeaf: changedLeaf }), /chain old field count/);
  const changedAbi = structuredClone(nextAbi);
  changedAbi.contract.methods.find(method => method.name === 'swap').method_id++;
  assert.throws(() => checkAmmUpdate({ oldAbi, nextAbi: changedAbi, chainLeaf }), /method ID swap/);
});

test('AMM update gate binds both proof endpoints to the live 22-field layout', () => {
  const layoutRoot = chainLeaf.data.Contract.state_layout_root;
  const rootValues = value => Array.from({ length: 4 }, (_, index) =>
    BigInt(`0x${value.slice((3 - index) * 16, (4 - index) * 16)}`));
  const makeProof = oldRoot => {
    const values = [59n, 1n, ...rootValues(oldRoot), 22n, 2_214_592_529n,
      ...rootValues(layoutRoot), 22n, 2_214_592_529n, 0n, 0n, 0n, 0n, 0n];
    const bytes = Buffer.alloc(160);
    bytes.writeBigUInt64LE(19n, 0);
    values.forEach((value, index) => bytes.writeBigUInt64LE(value, 8 + index * 8));
    return [...bytes];
  };
  const request = { contract_id: 59, deployer: 'test-deployer',
    layout_protocol_version: oldAbi.contract.state_layout.layout_version,
    state_layout_root: layoutRoot, state_layout_field_count: 22,
    state_layout_slot_count: 2_214_592_529,
    code_definition: { state_tree_height: 32 }, canonical_layout_proof: makeProof(layoutRoot) };
  assert.equal(checkAmmUpdate({ oldAbi, nextAbi, chainLeaf, request }).requestChecked, true);
  request.canonical_layout_proof = makeProof('0'.repeat(64));
  assert.throws(() => checkAmmUpdate({ oldAbi, nextAbi, chainLeaf, request }), /proof old layout root/);
});
