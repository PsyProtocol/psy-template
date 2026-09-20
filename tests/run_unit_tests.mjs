#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const UNIT_TEST_FILES = [
  'token/tests/token_unit_test.psy',
  'nft/tests/nft_unit_test.psy'
];

console.log('════════════════════════════════════════════════════════════════════');
console.log('  PSY PROTOCOL — NATIVE CONTRACT UNIT TESTS (dargo test)');
console.log('════════════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;
const startTime = Date.now();

for (const relPath of UNIT_TEST_FILES) {
  const fullPath = join(REPO_ROOT, relPath);
  process.stdout.write(`  ⏳ Running ${relPath} ... `);
  const t0 = Date.now();
  try {
    execSync(`dargo test --file "${fullPath}"`, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8'
    });
    const duration = Date.now() - t0;
    console.log(`\x1b[32m✔ PASS\x1b[0m (${duration}ms)`);
    passed++;
  } catch (err) {
    const duration = Date.now() - t0;
    console.log(`\x1b[31m✖ FAIL\x1b[0m (${duration}ms)`);
    console.error(err.stdout || err.stderr || err.message);
    failed++;
  }
}

const totalTime = Date.now() - startTime;
console.log('\n────────────────────────────────────────────────────────────────────');
console.log(`  Unit Tests Summary: ${passed} passed, ${failed} failed (${totalTime}ms)`);
console.log('────────────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  process.exit(1);
}
