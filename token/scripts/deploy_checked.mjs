#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const contractDir = basename(project) === 'dapp' ? join(project, 'contract') : project;
const preflightOnly = process.argv.length === 3 && process.argv[2] === '--preflight-only';

if (process.argv.length > (preflightOnly ? 3 : 2)) {
  console.error('Usage: node scripts/deploy_checked.mjs [--preflight-only]');
  process.exit(2);
}

function run(bin, args, cwd, label, env) {
  const result = spawnSync(bin, args, { cwd, stdio: 'inherit', env });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed${result.status === null ? '' : ` (exit ${result.status})`}`);
  }
}

function readResult(file, label) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error(`${label} did not produce a valid result file`); }
}

function checkDeployer() {
  if (Boolean(process.env.PRIVATE_KEY) === Boolean(process.env.KEYSTORE_PATH)) {
    throw new Error('Set exactly one of PRIVATE_KEY or KEYSTORE_PATH for the deployer');
  }
  if (process.env.KEYSTORE_PATH && !process.env.WALLET_PASSWORD) {
    throw new Error('WALLET_PASSWORD is required with KEYSTORE_PATH');
  }
  if (!process.env.RPC_CONFIG) {
    throw new Error('Set RPC_CONFIG to an explicit network configuration file');
  }
  let rpcConfig;
  try {
    rpcConfig = realpathSync(resolve(contractDir, process.env.RPC_CONFIG));
    if (!statSync(rpcConfig).isFile()) throw new Error('not a file');
  } catch {
    throw new Error('RPC_CONFIG must point to a readable network configuration file');
  }
  const env = { ...process.env, RPC_CONFIG: rpcConfig };

  // Keep wallet-info stdout private: the current CLI prints the private key even
  // when --result-file contains only public, secret-free fields.
  execFileSync(process.execPath, [join(project, 'scripts/configure_issuer.mjs'), '--check', '--strict'],
    { cwd: project, stdio: ['ignore', 'pipe', 'pipe'], env });
  const marker = JSON.parse(readFileSync(join(project, '.issuer_configured'), 'utf8'));
  const expectedId = Number(marker.issuer_user_id);
  if (!Number.isSafeInteger(expectedId) || expectedId < 1 || expectedId >= 16777216) {
    throw new Error('Configured issuer user ID is outside the 24-bit Outbox range');
  }

  const temporary = mkdtempSync(join(tmpdir(), 'psy-deployer-check-'));
  try {
    const walletFile = join(temporary, 'wallet.json');
    const userFile = join(temporary, 'user.json');
    try {
      execFileSync(process.env.PSY_USER_CLI || 'psy_user_cli', ['wallet', 'info', '--result-file', walletFile],
        { cwd: contractDir, stdio: ['ignore', 'pipe', 'pipe'], env });
    } catch {
      throw new Error('Could not read the selected deployer wallet');
    }
    const wallet = readResult(walletFile, 'wallet info');
    if (typeof wallet.public_key_hash !== 'string' || !/^[0-9a-f]{64}$/i.test(wallet.public_key_hash)) {
      throw new Error('Wallet result has no valid deployer public key hash');
    }
    try {
      execFileSync(process.env.PSY_USER_CLI || 'psy_user_cli', ['get-user-id', '--pub-key', wallet.public_key_hash, '--result-file', userFile],
        { cwd: contractDir, stdio: ['ignore', 'pipe', 'pipe'], env });
    } catch {
      throw new Error('Could not query deployer registration on the configured network');
    }
    const registration = readResult(userFile, 'get-user-id');
    if (registration.public_key_hash?.toLowerCase() !== wallet.public_key_hash.toLowerCase()
      || registration.status !== 'registered' || registration.user_id !== expectedId) {
      throw new Error(`Configured issuer user ID ${expectedId} does not match the selected deployer wallet's first registered user ID on this network`);
    }
    console.log(`Deployer check passed: issuer user ID ${expectedId} is registered for the selected wallet.`);
    return env;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  const env = checkDeployer();
  if (!preflightOnly) {
    if (existsSync(join(contractDir, 'src/main.psy.rs'))) {
      run(process.execPath, [join(project, 'scripts/deploy_v3_checked.mjs')], contractDir, 'PSY-20 v3 deployment', env);
    } else {
      run('psyup', ['build'], contractDir, 'Contract build', env);
      run('psyup', ['deploy'], contractDir, 'Contract deployment', env);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
