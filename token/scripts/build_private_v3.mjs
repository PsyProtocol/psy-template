#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = process.env.PSY_PRIVATE_CLI;
if (!cli) {
  console.error('Set PSY_PRIVATE_CLI to the CLI produced by scripts/build_private_toolchain.sh');
  process.exit(2);
}
const output = join(project, 'target/private-v3');
const source = readFileSync(join(project, 'src/main.private.psy.rs'), 'utf8');
const match = source.match(/let private_note_inclusion_fingerprint: Hash = \[\s*([\d,\s]+)\];/);
if (!match) throw new Error('Private-note verifier fingerprint is missing from the contract source');
const contractFingerprint = match[1].split(',').map(value => value.trim()).filter(Boolean);
if (contractFingerprint.length !== 4) throw new Error('Private-note verifier fingerprint must have four limbs');
const fingerprintTool = join(dirname(cli), 'psy_private_note_fingerprint');
const fingerprintResult = spawnSync(fingerprintTool, [], { cwd: project, encoding: 'utf8', env: process.env });
if (fingerprintResult.error || fingerprintResult.status !== 0) {
  throw new Error(`Run build:private-toolchain first; fingerprint helper failed: ${fingerprintResult.stderr || fingerprintResult.error?.message}`);
}
const toolchainFingerprint = JSON.parse(fingerprintResult.stdout.trim()).map(String);
if (contractFingerprint.some((value, index) => value !== toolchainFingerprint[index])) {
  throw new Error(`Private-note verifier fingerprint differs from the selected CLI: source=${contractFingerprint.join(',')} toolchain=${toolchainFingerprint.join(',')}`);
}
const result = spawnSync(cli, ['compile', '--source', join(project, 'src/main.private.psy.rs'),
  '--output-dir', output], { cwd: project, stdio: 'inherit', env: process.env });
if (result.error || result.status !== 0) process.exit(result.status || 1);

const artifact = JSON.parse(readFileSync(join(output, 'compilation_artifact.json'), 'utf8'));
const contract = artifact.abi.contract;
const methodNames = new Set(contract.methods.map(method => method.name));
for (const name of ['private_transfer', 'private_claim', 'mint_to', 'settle_burn']) {
  if (!methodNames.has(name)) throw new Error(`Private v3 ABI is missing ${name}`);
}
const noteRoot = contract.state.find(field => field.name === 'note_root');
if (artifact.state_tree_height !== 32 || noteRoot?.offset !== 33554436) {
  throw new Error(`Private note layout mismatch: height=${artifact.state_tree_height}, note_root=${noteRoot?.offset}`);
}
console.log(`Private v3 artifact verified: ${methodNames.size} methods, tree height 32, note root leaf 8388609`);
