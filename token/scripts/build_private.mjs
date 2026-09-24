#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync('psyup', ['build'], {
  cwd: project,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: process.env,
});
if (result.error || result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || result.error?.message || 'psyup build failed\n');
  process.exit(result.status || 1);
}

const abiPath = join(project, 'target/token.abi.json');
const artifactPath = join(project, 'target/token.json');
const abi = JSON.parse(readFileSync(abiPath, 'utf8'));
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
if (!Array.isArray(artifact)) throw new Error('Complete PSY-20 artifact is not a method list');
const names = new Set(abi.contract?.methods?.map((method) => method.name));
for (const method of ['private_transfer', 'private_claim']) {
  if (!names.has(method)) throw new Error(`Complete PSY-20 build is missing ${method}`);
  if (!artifact.some((definition) => definition.name === method)) {
    throw new Error(`Complete PSY-20 artifact is missing ${method}`);
  }
}
for (const field of ['note_count', 'note_root', 'last_path', 'state_map']) {
  if (!abi.contract?.state?.some((item) => item.name === field)) {
    throw new Error(`Complete PSY-20 build is missing ${field}`);
  }
}
console.log(`Complete PSY-20 built: ${artifactPath}`);
console.log(`ABI verified (${names.size} methods, including private_transfer and private_claim): ${abiPath}`);
