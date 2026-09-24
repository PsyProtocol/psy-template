#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const releasedCli = join(homedir(), '.psy', 'toolchains', 'psy-0.1.1', 'bin', 'psy_user_cli');
const cli = process.env.PSY_USER_CLI || (existsSync(releasedCli) ? releasedCli : 'psy_user_cli');
const args = ['compile', '--source', join(project, 'src/main.psy.rs'),
  '--output-dir', join(project, 'target/v3')];
const result = spawnSync(cli, args, { cwd: project, stdio: 'inherit', env: process.env });
if (result.error || result.status !== 0) {
  console.error('PSY-20 v3 compilation requires a psy_user_cli with .psy.rs compile support.');
  process.exit(result.status || 1);
}
