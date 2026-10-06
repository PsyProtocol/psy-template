import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const cli=process.env.PSY_USER_CLI||resolve('../psy-node/target/release/psy_user_cli');
const output=process.env.LAUNCH_AMM_OUTPUT_DIR;
if(!output)throw new Error('LAUNCH_AMM_OUTPUT_DIR is required; build into a fresh candidate directory');
if(existsSync(output))throw new Error('candidate directory exists; preserve it and use a new directory');
const r=spawnSync(cli,['compile','--source','launchamm/contract/src/main.psy.rs','--output-dir',output],{stdio:'inherit'});
if(r.error)throw r.error;process.exitCode=r.status??1;
