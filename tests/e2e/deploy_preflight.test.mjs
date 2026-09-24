import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const keyHash = 'ab'.repeat(32);

test('checked deployment validates the selected wallet before build or submission', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'psy-deploy-preflight-'));
  try {
    const bin = join(temporary, 'bin');
    mkdirSync(bin);
    const cli = join(bin, 'psy_user_cli');
    writeFileSync(cli, `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
const resultFile = args[args.indexOf('--result-file') + 1];
const key = '${keyHash}';
if (process.env.RPC_CONFIG !== process.env.MOCK_EXPECT_RPC_CONFIG) process.exit(4);
if (args[0] === 'wallet' && args[1] === 'info') {
  console.log('private_key: MOCK_SECRET_MUST_NOT_LEAK');
  writeFileSync(resultFile, JSON.stringify({ public_key_hash: key, keystore_path: null }));
} else if (args[0] === 'get-user-id') {
  if (args[args.indexOf('--pub-key') + 1] !== key) process.exit(3);
  writeFileSync(resultFile, JSON.stringify({ public_key_hash: process.env.MOCK_RETURN_KEY || key, status: process.env.MOCK_STATUS || 'registered', user_id: Number(process.env.MOCK_USER_ID || '5') }));
} else { process.exit(2); }
`);
    chmodSync(cli, 0o755);
    const psyup = join(bin, 'psyup');
    writeFileSync(psyup, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
if (process.env.RPC_CONFIG !== process.env.MOCK_EXPECT_RPC_CONFIG) process.exit(4);
appendFileSync(process.env.MOCK_PSYUP_LOG, process.argv[2] + '\\n');
`);
    chmodSync(psyup, 0o755);

    for (const kind of ['token', 'nft', 'dapp']) {
      const project = join(temporary, kind);
      const sourceDir = kind === 'dapp' ? join(project, 'contract/src') : join(project, 'src');
      mkdirSync(sourceDir, { recursive: true });
      mkdirSync(join(project, 'scripts'));
      copyFileSync(join(root, kind, kind === 'dapp' ? 'contract/src/main.psy' : 'src/main.psy'), join(sourceDir, 'main.psy'));
      for (const script of ['configure_issuer.mjs', 'deploy_checked.mjs']) {
        copyFileSync(join(root, kind, 'scripts', script), join(project, 'scripts', script));
      }
      writeFileSync(join(project, '.issuer_configured'), JSON.stringify({ issuer_user_id: '5' }));
      const rpcConfig = join(project, 'network.json');
      writeFileSync(rpcConfig, '{}');
      const log = join(project, 'psyup.log');
      const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PSY_USER_CLI: cli, PRIVATE_KEY: 'MOCK_PRIVATE_KEY', KEYSTORE_PATH: '', RPC_CONFIG: rpcConfig, MOCK_EXPECT_RPC_CONFIG: realpathSync(rpcConfig), MOCK_PSYUP_LOG: log };
      const run = (args, extra = {}) => spawnSync(process.execPath, ['scripts/deploy_checked.mjs', ...args], {
        cwd: project, encoding: 'utf8', env: { ...env, ...extra },
      });

      const mismatch = run(['--preflight-only'], { MOCK_USER_ID: '6' });
      assert.notEqual(mismatch.status, 0, `${kind}: mismatched issuer must fail`);
      assert.match(mismatch.stderr, /does not match/);
      assert.equal(existsSync(log), false, `${kind}: failed preflight must not build or deploy`);

      const unregistered = run(['--preflight-only'], { MOCK_STATUS: 'not_registered' });
      assert.notEqual(unregistered.status, 0, `${kind}: unregistered deployer must fail`);

      const wrongKey = run(['--preflight-only'], { MOCK_RETURN_KEY: 'cd'.repeat(32) });
      assert.notEqual(wrongKey.status, 0, `${kind}: RPC response for another key must fail`);

      const noCredential = run(['--preflight-only'], { PRIVATE_KEY: '' });
      assert.notEqual(noCredential.status, 0, `${kind}: missing credential must fail`);

      const noNetwork = run(['--preflight-only'], { RPC_CONFIG: '' });
      assert.notEqual(noNetwork.status, 0, `${kind}: missing network configuration must fail`);
      const missingNetwork = run(['--preflight-only'], { RPC_CONFIG: join(project, 'absent.json') });
      assert.notEqual(missingNetwork.status, 0, `${kind}: nonexistent network configuration must fail`);

      const check = run(['--preflight-only']);
      assert.equal(check.status, 0, `${kind}: ${check.stderr}`);
      assert.doesNotMatch(check.stdout + check.stderr, /MOCK_SECRET_MUST_NOT_LEAK/);
      assert.equal(existsSync(log), false, `${kind}: check-only mode must not deploy`);

      const deploy = run([]);
      assert.equal(deploy.status, 0, `${kind}: ${deploy.stderr}`);
      assert.equal(readFileSync(log, 'utf8'), 'build\ndeploy\n');
      assert.doesNotMatch(deploy.stdout + deploy.stderr, /MOCK_SECRET_MUST_NOT_LEAK/);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
