#!/usr/bin/env node
// Read-only gate for the configured 2026-09-30 staging launch token.
// The independently compiled source and the prepared request must match.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_VERIFIER, proofInputs, root } from '../check_deploy_layout.mjs';

const EMPTY_ROOT = 'b768e4fc8b0b79f516c9da6ea83aa4b13c9a42c646c4c1f9e979ed3ee20855e3';
const TOKEN_ROOT = '37b9a3c271e229caafc399538416c01f79ab00cccd8c157a595090cac549a2d9';
const TOKEN_CODE_ROOT = 'dda0654156bc2d99229911678c853416699d6dc566ea5751b38de75f326e6855';
const SOURCE_SHA256 = '6bd08b49e735ffb7234492d857e6bc89521ace35ef83cad6ce775d3801df63c8';
const ABI_SHA256 = '0328d0cc63798f4644b5c55efa51ea9f2c7931218c54bbc03252c3958aa4ebed';
const CODE_SHA256 = '1ca9a497ba05836547520ecfd8734cde9d8ae6401352b180c434c778226df67f';
const FIELD_COUNT = 5;
const SLOT_COUNT = 2_147_483_652;
const METHODS = [194520553, 2324751738, 2394033944];

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export function checkTokenDeploy(request, abi) {
  const contract = abi?.contract;
  const layout = contract?.state_layout;
  if (!layout || !Array.isArray(layout.fields)) throw new Error('compiled ABI has no state layout');
  equal(contract.state_tree_height, 32, 'ABI state tree height');
  equal(layout.layout_version, 1, 'ABI layout version');
  equal(layout.field_count, FIELD_COUNT, 'ABI field count');
  equal(layout.fields.length, FIELD_COUNT, 'ABI fields length');
  equal(layout.slot_count, SLOT_COUNT, 'ABI slot count');
  equal(JSON.stringify(contract.state.slice(0, 4).map(field => field.offset)), '[0,1,2,3]', 'Outbox offsets');
  equal(JSON.stringify(contract.methods.map(method => method.method_id).sort((a, b) => a - b)), JSON.stringify(METHODS), 'ABI method IDs');
  const deploy = request?.deploy_contract;
  if (!deploy || !deploy.deployer || !deploy.code_root || !request.canonical_layout_verifier_fingerprint) {
    throw new Error('expected complete new deploy_contract request');
  }
  if (process.env.EXPECTED_DEPLOYER_HASH) {
    equal(deploy.deployer, process.env.EXPECTED_DEPLOYER_HASH, 'configured deployer public key hash');
  }
  equal(request.canonical_layout_verifier_fingerprint, CANONICAL_VERIFIER, 'canonical verifier fingerprint');
  equal(deploy.code_root, TOKEN_CODE_ROOT, 'pinned token code root');
  equal(deploy.code_definition?.state_tree_height, 32, 'request state tree height');
  equal(JSON.stringify(deploy.code_definition?.functions?.map(fn => fn.method_id).sort((a, b) => a - b)), JSON.stringify(METHODS), 'request method IDs');
  equal(request.layout_protocol_version, 1, 'request layout protocol');
  equal(request.state_layout_root, TOKEN_ROOT, 'request new layout root');
  equal(request.state_layout_field_count, FIELD_COUNT, 'request new field count');
  equal(request.state_layout_slot_count, SLOT_COUNT, 'request new slot count');
  const pi = proofInputs(request.canonical_layout_proof);
  equal(pi[0], 0n, 'new-deployment sentinel');
  equal(pi[1], 1n, 'proof protocol');
  equal(root(pi.slice(2, 6)), EMPTY_ROOT, 'proof old layout root');
  equal(pi[6], 0n, 'proof old field count');
  equal(pi[7], 0n, 'proof old slot count');
  equal(root(pi.slice(8, 12)), TOKEN_ROOT, 'proof new layout root');
  equal(pi[12], BigInt(FIELD_COUNT), 'proof new field count');
  equal(pi[13], BigInt(SLOT_COUNT), 'proof new slot count');
  equal(pi[14], BigInt(FIELD_COUNT), 'proof appended field count');
  return { valid: true, layoutRoot: TOKEN_ROOT, fields: FIELD_COUNT, slots: SLOT_COUNT,
    codeRoot: deploy.code_root, deployer: deploy.deployer };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 6) {
    console.error('usage: node check_deploy_layout.mjs <deploy_cmd.json> <abi.json> <contract_code.bin> <configured-main.psy.rs>');
    process.exitCode = 2;
  } else {
    Promise.all(process.argv.slice(2).map(path => readFile(path)))
      .then(([request, abi, code, source]) => {
        equal(sha(source), SOURCE_SHA256, 'configured source SHA-256');
        equal(sha(abi), ABI_SHA256, 'configured ABI SHA-256');
        equal(sha(code), CODE_SHA256, 'configured code SHA-256');
        return checkTokenDeploy(JSON.parse(request), JSON.parse(abi));
      })
      .then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(error => { console.error(`token deployment preflight failed: ${error.message}`); process.exitCode = 1; });
  }
}
