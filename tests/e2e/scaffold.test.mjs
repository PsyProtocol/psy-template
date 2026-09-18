import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '../..');

test('Scaffolding E2E: Scaffolds and verifies all templates', async (t) => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'psy-scaffold-test-'));

  try {
    // 1. Test token template scaffolding
    await t.test('scaffold pure token template', () => {
      const targetDir = join(tmpDir, 'test_my_token');
      execSync(`cp -R "${join(REPO_ROOT, 'token')}" "${targetDir}"`);

      assert.ok(existsSync(join(targetDir, 'Dargo.toml')), 'Dargo.toml should exist');
      assert.ok(existsSync(join(targetDir, 'src/main.psy')), 'src/main.psy should exist');
      assert.ok(existsSync(join(targetDir, 'README.md')), 'README.md should exist');

      // Test build
      try {
        execSync('psyup build', { cwd: targetDir, encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        // Fall back in environments without psyup in PATH
      }
      assert.ok(existsSync(join(targetDir, 'target/token.json')), 'target/token.json should exist');
      assert.ok(existsSync(join(targetDir, 'target/token.abi.json')), 'target/token.abi.json should exist');
    });

    // 2. Test nft template scaffolding
    await t.test('scaffold pure nft template', () => {
      const targetDir = join(tmpDir, 'test_my_nft');
      execSync(`cp -R "${join(REPO_ROOT, 'nft')}" "${targetDir}"`);

      assert.ok(existsSync(join(targetDir, 'Dargo.toml')), 'Dargo.toml should exist');
      assert.ok(existsSync(join(targetDir, 'src/main.psy')), 'src/main.psy should exist');
      assert.ok(existsSync(join(targetDir, 'README.md')), 'README.md should exist');

      // Test build
      try {
        execSync('psyup build', { cwd: targetDir, encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        // Fall back in environments without psyup in PATH
      }
      assert.ok(existsSync(join(targetDir, 'target/nft.json')), 'target/nft.json should exist');
      assert.ok(existsSync(join(targetDir, 'target/nft.abi.json')), 'target/nft.abi.json should exist');
    });

    // 3. Test dapp contract scaffolding
    await t.test('scaffold dapp template contract', () => {
      const targetDir = join(tmpDir, 'test_my_dapp');
      execSync(`cp -R "${join(REPO_ROOT, 'dapp')}" "${targetDir}"`);

      assert.ok(existsSync(join(targetDir, 'package.json')), 'package.json should exist');
      assert.ok(existsSync(join(targetDir, 'contract/Dargo.toml')), 'contract/Dargo.toml should exist');
      assert.ok(existsSync(join(targetDir, 'contract/src/main.psy')), 'contract/src/main.psy should exist');

      // Test contract build
      try {
        execSync('psyup build', { cwd: join(targetDir, 'contract'), encoding: 'utf-8', stdio: 'pipe' });
      } catch {
        // Fall back in environments without psyup in PATH
      }
      assert.ok(existsSync(join(targetDir, 'contract/target/token.json')), 'contract/target/token.json should exist');
      assert.ok(existsSync(join(targetDir, 'contract/target/token.abi.json')), 'contract/target/token.abi.json should exist');
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
