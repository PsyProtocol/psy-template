#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const releasedCli = join(homedir(), '.psy', 'toolchains', 'psy-0.1.1', 'bin', 'psy_user_cli');
const cli = process.env.PSY_USER_CLI || (existsSync(releasedCli) ? releasedCli : 'psy_user_cli');
const temporary = mkdtempSync(join(tmpdir(), 'psy-nft-v3-deploy-'));

async function waitForInclusion(txHash) {
  const config = JSON.parse(readFileSync(process.env.RPC_CONFIG, 'utf8'));
  const selected = config.networks?.[config.defaultNetwork];
  const endpoint = selected?.api_services_url?.[0] || selected?.api_services_url;
  if (typeof endpoint !== 'string') return null;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/v1/transaction/hash/${txHash}`,
        { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const transaction = (await response.json()).data;
        if (transaction?.status === 'included') return transaction.result?.contract_id;
        if (transaction?.status === 'failed' || transaction?.status === 'rejected') {
          throw new Error(`Deployment rejected: ${JSON.stringify(transaction.result)}`);
        }
      }
    } catch (error) {
      if (error.message.startsWith('Deployment rejected:')) throw error;
    }
    await delay(2000);
  }
  return null;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: project, encoding: 'utf8', env: process.env,
    maxBuffer: 4 * 1024 * 1024, timeout: 600000 });
  if (result.error || result.status !== 0) {
    let detail = (result.stderr || result.stdout || result.error?.message || '').slice(-1600);
    if (process.env.PRIVATE_KEY) detail = detail.replaceAll(process.env.PRIVATE_KEY, '[redacted]');
    if (detail.includes('canonical layout verifier fingerprint mismatch')) {
      throw new Error(`${label} failed: the selected psy_user_cli uses a different canonical-layout verifier from this network. Set PSY_USER_CLI to a CLI built for the target node. Original error: ${detail}`);
    }
    throw new Error(`${label} failed: ${detail}`);
  }
}

try {
  // This checks the configured source, marker, selected wallet and its registered user ID.
  run(process.execPath, [join(project, 'scripts/deploy_checked.mjs'), '--preflight-only'], 'Deployment preflight');
  run(process.execPath, [join(project, 'scripts/build_v3.mjs')], 'NFT v3 compilation');
  const resultFile = join(temporary, 'deploy.json');
  run(cli, ['deploy-contract', '--contract-path', join(project, 'target/v3/compilation_artifact.json'),
    '--is-deploy', '--result-file', resultFile], 'NFT v3 deployment');
  const result = JSON.parse(readFileSync(resultFile, 'utf8'));
  if (!result.tx_hash || !['submitted', 'included', 'confirmed'].includes(result.status)) {
    throw new Error('Deployment CLI did not return a submitted transaction hash');
  }
  const record = { network: result.network, tx_hash: result.tx_hash, status: result.status,
    contract_id: result.contract_id ?? null, source: 'src/main.psy.rs' };
  if (record.contract_id === null) {
    record.contract_id = await waitForInclusion(record.tx_hash);
    if (record.contract_id !== null) record.status = 'included';
  }
  writeFileSync(join(project, '.psy-deploy-v3.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(`NFT v3 deployment ${record.status}: ${record.tx_hash}`);
  if (record.contract_id === null) {
    console.log('Deployment is pending. Query the transaction by hash to obtain the contract ID before calling methods.');
  } else {
    console.log(`Confirmed contract ID: ${record.contract_id}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
