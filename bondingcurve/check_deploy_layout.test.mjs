import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CANONICAL_VERIFIER, checkDeployLayout, CURVE_ROOT } from './check_deploy_layout.mjs';

const abi = JSON.parse(readFileSync(new URL('./contract/target/abi.json', import.meta.url)));
const emptyRoot = 'b768e4fc8b0b79f516c9da6ea83aa4b13c9a42c646c4c1f9e979ed3ee20855e3';

function felts(root) {
  return Array.from({ length: 4 }, (_, index) =>
    BigInt(`0x${root.slice(48 - index * 16, 64 - index * 16)}`));
}

function proof(oldRoot = emptyRoot, oldFields = 0n, oldSlots = 0n) {
  const inputs = [0n, 1n, ...felts(oldRoot), oldFields, oldSlots,
    ...felts(CURVE_ROOT), 26n, 2_197_815_318n, 26n, 0n, 0n, 0n, 0n];
  const bytes = Buffer.alloc(16 + 160);
  bytes.writeBigUInt64LE(19n, 16);
  inputs.forEach((value, index) => bytes.writeBigUInt64LE(value, 24 + index * 8));
  return [...bytes];
}

function request() {
  return { deploy_contract: {
    deployer: 'sample-deployer', code_root: '6cd2f5e219cfd8c1880f1673027690297c62cd92a43deee7dc3d816fd38a9d24',
    code_definition: { state_tree_height: 32, functions: abi.contract.methods.map(method => ({ method_id: method.method_id })) },
  }, layout_protocol_version: 1, state_layout_root: CURVE_ROOT,
  state_layout_field_count: 26, state_layout_slot_count: 2_197_815_318,
  canonical_layout_verifier_fingerprint: CANONICAL_VERIFIER, canonical_layout_proof: proof() };
}

test('new deployment matches independently derived 26-field ABI root', () => {
  assert.equal(checkDeployLayout(request(), abi).valid, true);
});

test('update-style or mismatched old layout proof cannot pass deployment gate', () => {
  const update = request();
  update.canonical_layout_proof = proof(CURVE_ROOT, 26n, 2_197_815_318n);
  assert.throws(() => checkDeployLayout(update, abi), /empty old layout root/);
  const wrong = request();
  wrong.state_layout_root = emptyRoot;
  assert.throws(() => checkDeployLayout(wrong, abi), /new layout root/);
  const wrongVerifier = request();
  wrongVerifier.canonical_layout_verifier_fingerprint = '71ccedf5edeb805302238b4bef499f618a37ff4f253c93e28ab4920f23d3e7bb';
  assert.throws(() => checkDeployLayout(wrongVerifier, abi), /canonical verifier fingerprint/);
});
