import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const installed = join(homedir(), '.psy', 'toolchains', 'psy-0.1.1', 'bin', 'psy_user_cli');
const local = resolve('../psy-node/target/release/psy_user_cli');
const compiler = process.env.PSY_USER_CLI || (existsSync(local) ? local : existsSync(installed) ? installed : 'psy_user_cli');
// Preserve the reviewed ABI and code. Build fresh candidates in a separate directory.
const outputDir = process.env.CURVE_OUTPUT_DIR || 'bondingcurve/contract/target-next';
const result = spawnSync(compiler, [
  'compile',
  '--source', 'bondingcurve/contract/src/main.psy.rs',
  '--output-dir', outputDir,
], { stdio: 'inherit' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
