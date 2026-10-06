#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const issuer = Number(process.env.LAUNCH_ISSUER_ID);
const supply = Number(process.env.LAUNCH_FIXED_SUPPLY);
if (!Number.isSafeInteger(issuer) || issuer < 1 || issuer >= 16_777_216) {
  throw new RangeError('LAUNCH_ISSUER_ID must be a registered 24-bit user ID');
}
if (!Number.isSafeInteger(supply) || supply < 1 || supply > 2_000_000_000_000_000) {
  throw new RangeError('LAUNCH_FIXED_SUPPLY must be an exact positive integer up to 2e15');
}
if (!process.env.LAUNCH_OUTPUT_DIR) throw new Error('LAUNCH_OUTPUT_DIR is required; preserve this deployment candidate');
const output = resolve(process.env.LAUNCH_OUTPUT_DIR);
if (!isAbsolute(output)) throw new Error('invalid output directory');
mkdirSync(output, { recursive: true, mode: 0o700 });
const source = readFileSync(join(here, 'src/main.psy.rs'), 'utf8')
  .replace('const ISSUER_USER_ID: usize = 0;', `const ISSUER_USER_ID: usize = ${issuer};`)
  .replace('const FIXED_SUPPLY: usize = 0;', `const FIXED_SUPPLY: usize = ${supply};`);
if (source.includes('const ISSUER_USER_ID: usize = 0;') || source.includes('const FIXED_SUPPLY: usize = 0;')) {
  throw new Error('launch token template substitution failed');
}
const sourcePath = join(output, 'main.psy.rs');
if (existsSync(sourcePath) && readFileSync(sourcePath, 'utf8') !== source) {
  throw new Error('candidate source already exists with different issuer or supply');
}
if (!existsSync(sourcePath)) writeFileSync(sourcePath, source, { flag: 'wx', mode: 0o600 });
const installed = join(homedir(), '.psy/toolchains/psy-0.1.1/bin/psy_user_cli');
const local = resolve(here, '../../../psy-node/target/release/psy_user_cli');
const cli = process.env.PSY_USER_CLI || (existsSync(local) ? local : existsSync(installed) ? installed : 'psy_user_cli');
const result = spawnSync(cli, ['compile', '--source', sourcePath, '--output-dir', join(output, 'target')], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw new Error(`launch token compilation failed: ${result.error?.message ?? result.status}`);
console.log(`Candidate source and artifacts saved under ${output}`);
