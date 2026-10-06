#!/usr/bin/env node

// Read-only check of a prepared new-deployment command. The coordinator still
// verifies the canonical layout proof cryptographically before inclusion.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ABI = new URL('./contract/target/abi.json', import.meta.url);
const EMPTY_ROOT = 'b768e4fc8b0b79f516c9da6ea83aa4b13c9a42c646c4c1f9e979ed3ee20855e3';
export const CANONICAL_VERIFIER = 'f2be754869220ac3bd68cfba16bbfdf50159cd667c3b445efb0adf807d175e9f';
export const CURVE_ROOT = '25f75784df8420fe918ac28cc845880f4c4c1e3891976b2a06577b177df51888';
const CURVE_CODE_ROOT = '6cd2f5e219cfd8c1880f1673027690297c62cd92a43deee7dc3d816fd38a9d24';
const PINNED_ABI_SHA256 = 'cd3bdf2224e2fad269ba7871455ed3a6050bba147b865557b5e230959f5b3388';
const FIELD_COUNT = 26;
const SLOT_COUNT = 2_197_815_318;

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

const GOLDILOCKS_MODULUS = 18_446_744_069_414_584_321n;

export function root(values) {
  return [...values].reverse().map(value => value.toString(16).padStart(16, '0')).join('');
}

export function proofInputs(bytes) {
  if (!Array.isArray(bytes) || bytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error('canonical_layout_proof must be a byte array');
  }
  const buffer = Buffer.from(bytes);
  if (buffer.length < 160 || buffer.readBigUInt64LE(buffer.length - 160) !== 19n) {
    throw new Error('canonical_layout_proof has no 19-field public-input trailer');
  }
  // Plonky2 proof serialization can store a noncanonical u64 representation
  // such as p + 5 for the field element 5. Compare canonical field values.
  return Array.from({ length: 19 }, (_, index) =>
    buffer.readBigUInt64LE(buffer.length - 152 + index * 8) % GOLDILOCKS_MODULUS);
}

export function checkDeployLayout(request, abi) {
  const contract = abi?.contract;
  const layout = contract?.state_layout;
  if (!layout || !Array.isArray(layout.fields)) throw new Error('compiled ABI has no layout');
  equal(contract.state_tree_height, 32, 'ABI state tree height');
  equal(layout.layout_version, 1, 'ABI layout version');
  equal(layout.field_count, FIELD_COUNT, 'ABI field count');
  equal(layout.fields.length, FIELD_COUNT, 'ABI layout fields');
  equal(layout.slot_count, SLOT_COUNT, 'ABI slot count');
  equal(contract.methods.length, 11, 'ABI method count');
  const deploy = request?.deploy_contract;
  if (!deploy) throw new Error('expected a deploy_contract request, never update_contract');
  if (!deploy.deployer || !deploy.code_root || !request.canonical_layout_verifier_fingerprint) {
    throw new Error('prepared deployment lacks deployer, code root, or layout verifier');
  }
  if (process.env.EXPECTED_DEPLOYER_HASH) {
    equal(deploy.deployer, process.env.EXPECTED_DEPLOYER_HASH, 'configured deployer public key hash');
  }
  equal(request.canonical_layout_verifier_fingerprint, CANONICAL_VERIFIER, 'canonical verifier fingerprint');
  equal(deploy.code_root, CURVE_CODE_ROOT, 'pinned curve code root');
  equal(deploy.code_definition?.state_tree_height, 32, 'request state tree height');
  equal(deploy.code_definition?.functions?.length, 11, 'request method count');
  equal(
    JSON.stringify(deploy.code_definition.functions.map(fn => fn.method_id).sort((a, b) => a - b)),
    JSON.stringify(contract.methods.map(method => method.method_id).sort((a, b) => a - b)),
    'request method IDs',
  );
  equal(request.layout_protocol_version, 1, 'request layout version');
  equal(request.state_layout_root, CURVE_ROOT, 'request new layout root');
  equal(request.state_layout_field_count, FIELD_COUNT, 'request new field count');
  equal(request.state_layout_slot_count, SLOT_COUNT, 'request new slot count');
  const pi = proofInputs(request.canonical_layout_proof);
  equal(pi[0], 0n, 'proof new-deployment sentinel');
  equal(pi[1], 1n, 'proof layout version');
  equal(root(pi.slice(2, 6)), EMPTY_ROOT, 'proof empty old layout root');
  equal(pi[6], 0n, 'proof old field count');
  equal(pi[7], 0n, 'proof old slot count');
  equal(root(pi.slice(8, 12)), CURVE_ROOT, 'proof new layout root');
  equal(pi[12], BigInt(FIELD_COUNT), 'proof new field count');
  equal(pi[13], BigInt(SLOT_COUNT), 'proof new slot count');
  equal(pi[14], BigInt(FIELD_COUNT), 'proof appended field count');
  return { valid: true, layoutRoot: CURVE_ROOT, fields: FIELD_COUNT, slots: SLOT_COUNT,
    deployer: deploy.deployer, codeRoot: deploy.code_root };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    console.error(`usage: node ${here}check_deploy_layout.mjs <prepared-deploy-command.json>`);
    process.exitCode = 2;
  } else {
    Promise.all([readFile(process.argv[2], 'utf8'), readFile(ABI, 'utf8')])
      .then(([request, abi]) => {
        equal(createHash('sha256').update(abi).digest('hex'), PINNED_ABI_SHA256, 'pinned ABI SHA-256');
        return checkDeployLayout(JSON.parse(request), JSON.parse(abi));
      })
      .then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(error => { console.error(`curve deployment preflight failed: ${error.message}`); process.exitCode = 1; });
  }
}
