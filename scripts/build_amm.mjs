import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const installed = join(homedir(), '.psy', 'toolchains', 'psy-0.1.2', 'bin', 'psy_user_cli');
const compiler = process.env.PSY_USER_CLI || (existsSync(installed) ? installed : 'psy_user_cli');
// Preserve the artifact used for staging contract 59. A source change must
// first be compiled and checked as a separate candidate.
const outputDir = process.env.AMM_OUTPUT_DIR || 'amm/contract/target-candidate';
if (existsSync(outputDir)) {
  console.error(`Output directory already exists: ${outputDir}. Set AMM_OUTPUT_DIR to a fresh path to preserve prior artifacts.`);
  process.exit(1);
}
const result = spawnSync(compiler, [
  'compile',
  '--source', 'amm/contract/src/main.psy.rs',
  '--output-dir', outputDir,
], { stdio: 'inherit' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
const artifact = JSON.parse(readFileSync(join(outputDir, 'compilation_artifact.json'), 'utf8'));
if (!artifact.abi?.contract?.state_layout || artifact.abi.contract.methods.length !== 14) {
  console.error('Compiler output lacks the current canonical layout or 14-method ABI. Use PSY_USER_CLI with the reviewed SDK compiler.');
  process.exit(1);
}
console.log(`Candidate compiled to ${outputDir}. Run AMM_ABI_DIR=${outputDir} npm run test:amm before deployment review.`);
