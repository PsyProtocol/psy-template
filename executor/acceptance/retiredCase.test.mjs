import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readdirSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {cohort} from './candidateHarness.mjs';
test('retired case blocks financial cohort before reading any wallet/configuration',()=>{
 const base=mkdtempSync(join(tmpdir(),'psy-retired-case-'));try{mkdirSync(join(base,'public'));writeFileSync(join(base,'public/ABANDONED-DEPLOYMENT-v1.json'),'{}');assert.throws(()=>cohort(base,'missing-original'),/retired QA case/);assert.deepEqual(readdirSync(base),['public']);}finally{rmSync(base,{recursive:true});}
});
test('fresh-deploy CLI refuses a retired case before touching a driver or sending RPC',()=>{
 const base=mkdtempSync(join(tmpdir(),'psy-retired-cli-'));try{mkdirSync(join(base,'public'));writeFileSync(join(base,'public/ABANDONED-DEPLOYMENT-v1.json'),'{}');const r=spawnSync(process.execPath,[fileURLToPath(new URL('./candidateDeploy.mjs',import.meta.url)),base,'missing-original','missing-ordinary','missing-compact','all-four-v1'],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/retired QA case cannot deploy/);assert.deepEqual(readdirSync(base),['public']);}finally{rmSync(base,{recursive:true});}
});
