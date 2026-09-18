#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║        PSY PROTOCOL SMART CONTRACT TEST SUITE (FULL MATRIX)        ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const t0 = Date.now();

try {
  execSync('node tests/run_unit_tests.mjs', { cwd: REPO_ROOT, stdio: 'inherit' });
  execSync('node tests/run_e2e_tests.mjs', { cwd: REPO_ROOT, stdio: 'inherit' });
  const duration = Date.now() - t0;
  console.log('\x1b[32m✔ ALL UNIT AND E2E TESTS PASSED SUCCESSFULLY!\x1b[0m Total time:', duration, 'ms\n');
} catch (err) {
  console.error('\x1b[31m✖ TEST RUN FAILED.\x1b[0m');
  process.exit(1);
}
