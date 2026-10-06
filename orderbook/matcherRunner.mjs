#!/usr/bin/env node
// Read-only by default. Explicit execution proves and submits one match or
// expired refund using the public escrow SD-key; on-chain guards decide validity.
import { execFile as execFileCallback } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { OrderbookChainReader } from './chainReader.mjs';
import { checkOrder, proposeExpiredRefunds, proposeMatch } from './matcherCore.mjs';

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));
const defaults = {
  contractId: 64,
  escrowId: 591872,
  cli: resolve(here, '../../psy-node/target/release/psy_user_cli'),
  rpcConfig: join(homedir(), '.psy/config.json'),
  wallet: resolve(here, '../amm/sdkey-circuit/target/debug/orderbook_wallet'),
  runtimeDir: join(here, '.runtime'),
};

export function parseRunnerArgs(argv) {
  const options = { ...defaults, execute: false, executeRefund: false };
  const values = new Map([
    ['--users', 'users'], ['--contract', 'contractId'], ['--escrow', 'escrowId'],
    ['--checkpoint', 'fixedCheckpoint'],
    ['--cli', 'cli'], ['--rpc-config', 'rpcConfig'], ['--wallet', 'wallet'],
    ['--runtime-dir', 'runtimeDir'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') { options.execute = true; continue; }
    if (arg === '--execute-refund') { options.executeRefund = true; continue; }
    const key = values.get(arg);
    if (!key || !argv[i + 1]) throw new Error(`unknown or incomplete argument: ${arg}`);
    options[key] = argv[++i];
  }
  options.contractId = Number(options.contractId);
  options.escrowId = Number(options.escrowId);
  if (options.fixedCheckpoint !== undefined) options.fixedCheckpoint = Number(options.fixedCheckpoint);
  options.users = [...new Set((options.users || '').split(',').filter(Boolean).map(Number))];
  if (options.execute && options.executeRefund) throw new Error('choose --execute or --execute-refund');
  if (!Number.isSafeInteger(options.contractId) || options.contractId < 5 ||
      !Number.isSafeInteger(options.escrowId) || options.escrowId < 1 || options.escrowId >= 16_777_216 ||
      options.users.length < 1 || options.users.some(id => !Number.isSafeInteger(id) || id < 1 || id >= 16_777_216 || id === options.escrowId)) {
    throw new Error('provide registered seller IDs with --users');
  }
  if (options.fixedCheckpoint !== undefined && (!Number.isSafeInteger(options.fixedCheckpoint) || options.fixedCheckpoint < 0 || options.execute || options.executeRefund)) {
    throw new Error('--checkpoint accepts a nonnegative historical checkpoint only in read-only mode');
  }
  return options;
}

async function snapshot(options, abi) {
  const reader = new OrderbookChainReader({ ...options, abi });
  const checkpoint = options.fixedCheckpoint ?? await reader.latestCheckpoint();
  const orders = await Promise.all(options.users.map(id => reader.readOrder(checkpoint, id)));
  const context = { checkpoint, contractId: options.contractId, escrowId: options.escrowId };
  return {
    checkpoint, orders,
    match: proposeMatch(orders, context),
    expiredRefunds: proposeExpiredRefunds(orders, context),
    eligibility: orders.map(order => ({ sellerId: order.sellerId, reasons: checkOrder(order, checkpoint, options.escrowId) })),
  };
}

async function executeOne(options, abi, first) {
  const actionName = options.executeRefund ? 'refund' : 'match';
  const actionFrom = state => options.executeRefund ? state.expiredRefunds[0] : state.match;
  const action = actionFrom(first);
  if (!action) throw new Error(options.executeRefund
    ? 'no fully funded expired order to refund'
    : 'no fully funded compatible orders to execute');
  await mkdir(options.runtimeDir, { recursive: true, mode: 0o700 });
  const lockPath = join(options.runtimeDir, `escrow-${options.escrowId}.lock`);
  const lock = await open(lockPath, 'wx', 0o600);
  let scratch;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const sameAction = other => {
      const candidate = actionFrom(other);
      return candidate && JSON.stringify(candidate.args) === JSON.stringify(action.args);
    };
    if (!sameAction(await snapshot(options, abi))) throw new Error('order state changed before proof; rescan');
    const ledger = join(options.runtimeDir, 'submissions.jsonl');
    const prior = await readFile(ledger, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    const argsKey = JSON.stringify(action.args);
    if (prior.split('\n').filter(Boolean).some(line => {
      const entry = JSON.parse(line);
      return entry.kind === actionName && JSON.stringify(entry.args) === argsKey &&
        ['submission-attempt', 'submitted'].includes(entry.status);
    })) throw new Error('this order pair has a prior submission attempt; inspect chain status before retrying');
    scratch = await mkdtemp(join(tmpdir(), 'psy-orderbook-match-'));
    const input = join(scratch, `${actionName}.json`);
    await writeFile(input, JSON.stringify(action.submission), { mode: 0o600 });
    const walletArgs = ['submit', String(options.contractId), input, options.rpcConfig];
    await execFile(options.wallet, walletArgs, {
      timeout: 900_000, maxBuffer: 2_000_000,
      env: { ...process.env, ORDERBOOK_PROVE_ONLY: '1' },
    });
    if (!sameAction(await snapshot(options, abi))) throw new Error('order state changed during proof; rescan');
    await appendFile(ledger, JSON.stringify({ at: new Date().toISOString(), status: 'proven',
      kind: actionName, checkpoint: first.checkpoint, args: action.args }) + '\n', { mode: 0o600 });
    await appendFile(ledger, JSON.stringify({ at: new Date().toISOString(), status: 'submission-attempt',
      kind: actionName, args: action.args }) + '\n', { mode: 0o600 });
    const result = await execFile(options.wallet, walletArgs, {
      timeout: 900_000, maxBuffer: 2_000_000,
      env: { ...process.env, ORDERBOOK_PROVE_ONLY: '0' },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    const txHash = output.match(/submitted orderbook escrow transaction ([0-9a-f]{64})/)?.[1];
    if (!txHash) throw new Error('wallet returned without a parseable transaction hash; inspect node status before retrying');
    await appendFile(ledger, JSON.stringify({ at: new Date().toISOString(), status: 'submitted',
      kind: actionName, transactionHash: txHash, args: action.args }) + '\n', { mode: 0o600 });
    return txHash;
  } finally {
    try {
      if (scratch) await rm(scratch, { recursive: true, force: true });
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}

async function main() {
  const options = parseRunnerArgs(process.argv.slice(2));
  const abi = JSON.parse(await readFile(join(here, 'contract/target/abi.json'), 'utf8'));
  const state = await snapshot(options, abi);
  console.log(JSON.stringify(state, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  if (options.execute || options.executeRefund) console.log(`submitted transaction ${await executeOne(options, abi, state)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
