#!/usr/bin/env node
// Read-only AMM update gate. Proof public-input checks are not proof verification.
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import { proofPublicInputs } from '../orderbook/check_update_layout.mjs';

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const CONTRACT_ID = 59;
const LIVE_OLD_ROOT = '5ff1d11b3ceac86c3b1e7eb587964371e98b3cab316e774bd0e724775c961f81';
const LIVE_OLD_CODE_ROOT = '2bf37d3c38869cafd5ad9b4e09247ac9ee2f437fa89468d009b69f50e7fc42bf';
const cli = resolve(here, '../../psy-node/target/release/psy_user_cli');

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function root(values) {
  return [...values].reverse().map(value => value.toString(16).padStart(16, '0')).join('');
}

export function checkAmmUpdate({ oldAbi, nextAbi, chainLeaf, request }) {
  const old = oldAbi.contract;
  const next = nextAbi.contract;
  const leaf = chainLeaf?.data?.Contract ?? chainLeaf;
  if (!old?.state_layout || !next?.state_layout || !leaf) throw new Error('missing ABI or chain leaf');
  expect(old.state_layout.field_count, 22, 'old field count');
  expect(old.state_layout.slot_count, 2_214_592_529, 'old slot count');
  if (!isDeepStrictEqual(next.state_layout, old.state_layout)) {
    throw new Error('candidate layout differs from the deployed layout');
  }
  expect(next.state_tree_height, old.state_tree_height, 'candidate tree height');
  for (const method of old.methods) {
    expect(next.methods.find(candidate => candidate.name === method.name)?.method_id,
      method.method_id, `method ID ${method.name}`);
  }
  expect(leaf.state_layout_root, LIVE_OLD_ROOT, 'chain old layout root');
  expect(leaf.code_root, LIVE_OLD_CODE_ROOT, 'chain old code root');
  expect(leaf.state_layout_field_count, old.state_layout.field_count, 'chain old field count');
  expect(leaf.state_layout_slot_count, old.state_layout.slot_count, 'chain old slot count');
  expect(leaf.state_tree_height, old.state_tree_height, 'chain state tree height');
  if (request) {
    expect(request.contract_id, CONTRACT_ID, 'request contract ID');
    expect(request.deployer, leaf.deployer, 'request deployer');
    expect(request.layout_protocol_version, old.state_layout.layout_version, 'request layout version');
    expect(request.state_layout_root, LIVE_OLD_ROOT, 'request new layout root');
    expect(request.state_layout_field_count, next.state_layout.field_count, 'request new field count');
    expect(request.state_layout_slot_count, next.state_layout.slot_count, 'request new slot count');
    expect(request.code_definition?.state_tree_height, leaf.state_tree_height, 'request tree height');
    const pi = proofPublicInputs(request.canonical_layout_proof);
    expect(pi[0], BigInt(CONTRACT_ID), 'proof contract ID');
    expect(pi[1], BigInt(old.state_layout.layout_version), 'proof layout version');
    expect(root(pi.slice(2, 6)), LIVE_OLD_ROOT, 'proof old layout root');
    expect(pi[6], BigInt(old.state_layout.field_count), 'proof old field count');
    expect(pi[7], BigInt(old.state_layout.slot_count), 'proof old slot count');
    expect(root(pi.slice(8, 12)), LIVE_OLD_ROOT, 'proof new layout root');
    expect(pi[12], BigInt(next.state_layout.field_count), 'proof new field count');
    expect(pi[13], BigInt(next.state_layout.slot_count), 'proof new slot count');
    expect(pi[14], 0n, 'proof appended field count');
  }
  return { contractId: CONTRACT_ID, oldCodeRoot: leaf.code_root,
    layoutRoot: leaf.state_layout_root, fields: leaf.state_layout_field_count,
    slots: leaf.state_layout_slot_count, requestChecked: Boolean(request) };
}

async function liveLeaf() {
  const dir = await mkdtemp(join(tmpdir(), 'psy-amm-layout-'));
  const output = join(dir, 'leaf.json');
  try {
    await execFile(cli, ['get-contract-leaf-data', '--contract-id', String(CONTRACT_ID),
      '--result-file', output, '--rpc-config', process.env.RPC_CONFIG || join(homedir(), '.psy/config.json')],
    { timeout: 120_000, maxBuffer: 2_000_000 });
    return JSON.parse(await readFile(output, 'utf8'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length % 2) throw new Error('usage: check_update_layout.mjs [--request prepared.json] [--chain-leaf saved.json]');
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--request', '--chain-leaf'].includes(argv[i]) || !argv[i + 1]) throw new Error(`invalid argument ${argv[i]}`);
    options[argv[i]] = argv[i + 1];
  }
  const [oldAbi, nextAbi, chainLeaf, request] = await Promise.all([
    readFile(join(here, 'contract/target/abi.json'), 'utf8').then(JSON.parse),
    readFile(join(here, 'contract/target-next/abi.json'), 'utf8').then(JSON.parse),
    options['--chain-leaf'] ? readFile(options['--chain-leaf'], 'utf8').then(JSON.parse) : liveLeaf(),
    options['--request'] ? readFile(options['--request'], 'utf8').then(JSON.parse) : undefined,
  ]);
  console.log(JSON.stringify(checkAmmUpdate({ oldAbi, nextAbi, chainLeaf, request }), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`AMM update gate failed: ${error.message}`); process.exitCode = 1; });
}
