// Actual offline native CLI integration. No RPC, wallet approval or funds.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile,writeFile,readdir,unlink} from 'node:fs/promises';import {join} from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {prepareCheckpointStream,validateStreamPlan} from './checkpointStream.mjs';
import {parseLosslessJson} from '../amm/u124/client.mjs';import {sha256} from './requestBinding.mjs';
import {requireBlockCoverage,requireStreamSettlement} from '../batching/checkpoint-stream/coverage.mjs';
const fixtures=process.env.CHECKPOINT_STREAM_PROOFS,out=process.env.CHECKPOINT_STREAM_INTEGRATION_OUT,driver=process.env.CHECKPOINT_STREAM_DRIVER;
const reuseOnly=process.env.CHECKPOINT_STREAM_REUSE_ONLY==='1';
assert.ok(fixtures&&out&&driver,'frozen native driver, complete component fixtures and fresh evidence directory required');
const read=async p=>parseLosslessJson(await readFile(p,'utf8')),exec=promisify(execFile);
const manifest=await read(join(fixtures,'manifest.json')),pages=await read(join(fixtures,'pages.json'));
test('all nine members survive three linked pages, never independent seeds',()=>{
 const s=validateStreamPlan(manifest,pages);assert.equal(s.members,9);assert.equal(s.pages,3);assert.equal(s.settlementCursor,0);assert.equal(s.canBroadcast,false);
 for(const change of [p=>p.pop(),p=>p[1].fields[21]++,p=>p[1].before.cursor++,p=>p[1].before.ordered[0]++,p=>p[1].rows[0].index=p[0].rows[0].index,p=>p[1].rows[0].member.nonce++]){const copy=structuredClone(pages);change(copy);assert.throws(()=>validateStreamPlan(manifest,copy));}
});
test('coverage and financial integration cannot be installed by claimed success',()=>{
 assert.throws(()=>requireBlockCoverage({verified:true,fullBlock:true}),{code:'BLOCK_MARKET_COVERAGE_UNAVAILABLE'});
 assert.throws(()=>requireStreamSettlement({verified:true,fullUpsVerified:true}),{code:'STREAM_MARKET_UPS_UNAVAILABLE'});
});
test('formal native job verifies exact proof reuse, missing-page recovery and local ownership',async()=>{
 await mkdir(out);await copyFile(join(fixtures,'manifest.json'),join(out,'input.json'));const actions=[];
 const opts={wallet:driver,walletSha256:sha256(await readFile(driver)),input:join(out,'input.json'),runtimeDirectory:join(out,'runtime')};
 const runNative=async(...args)=>{try{const r=await exec(...args);actions.push({action:args[1][0],stdout:r.stdout});return r;}catch(e){actions.push({action:args[1][0],failure:e.stderr??e.message});throw e;}};
 const job=await prepareCheckpointStream(opts,{runNative});assert.equal((await job.status()).preparationCursor,9);assert.throws(()=>job.authorizeWholeBlock(),{code:'BLOCK_MARKET_COVERAGE_UNAVAILABLE'});assert.throws(()=>job.authorizeSettlement(),{code:'STREAM_MARKET_UPS_UNAVAILABLE'});
 const proofDir=join(job.directory,'proofs');await mkdir(proofDir);for(const i of reuseOnly?[0,1,2]:[0,1])await copyFile(join(fixtures,`page-${i}.bin`),join(proofDir,`page-${i}.bin`));
 const r=await job.prove();assert.equal(r.conditionalOrderChainVerified,true);assert.equal(r.members,9n);assert.equal(r.settlementCursor,0);const first=JSON.parse(actions.at(-1).stdout.trim());assert.equal(first.proofsGenerated,reuseOnly?0:1);assert.equal(first.proofsReused,reuseOnly?3:2);
 const hashes=await Promise.all([0,1,2].map(async i=>sha256(await readFile(join(proofDir,`page-${i}.bin`)))));
 const restart=await prepareCheckpointStream(opts,{runNative});await restart.prove();const again=JSON.parse(actions.at(-1).stdout.trim());assert.equal(again.proofsGenerated,0);assert.equal(again.proofsReused,3);assert.equal(actions.filter(a=>a.action==='prepare').length,1);assert.deepEqual(await Promise.all([0,1,2].map(async i=>sha256(await readFile(join(proofDir,`page-${i}.bin`))))),hashes);
 const competitors=await Promise.allSettled([restart.prove(),restart.prove()]);assert.equal(competitors.filter(r=>r.status==='fulfilled').length,1);assert.equal(competitors.filter(r=>r.status==='rejected').length,1);assert.equal(JSON.parse(actions.at(-1).stdout.trim()).proofsGenerated,0);
 await exec(driver,['verify',proofDir,join(out,'independent-verification.json')],{env:process.env,timeout:120000});
 // An interrupted native owner is deliberately not auto-reclaimed or replaced.
 await writeFile(join(proofDir,'native-owner.json'),JSON.stringify({pid:process.pid,interruptedTestOwner:true}),{flag:'wx'});await assert.rejects(()=>restart.prove());await unlink(join(proofDir,'native-owner.json'));
 const attack=join(out,'trailing-proof');await mkdir(attack);for(const name of ['manifest.json','pages.json','page-0.bin','page-1.bin','page-2.bin'])await copyFile(join(proofDir,name),join(attack,name));const original=await readFile(join(attack,'page-0.bin'));await writeFile(join(attack,'page-0.bin'),Buffer.concat([original,Buffer.from([0])]));await assert.rejects(()=>exec(driver,['verify',attack,join(out,'must-not-exist.json')],{env:process.env,timeout:120000}),/remaining|trailing/);
 assert.ok(!(await readdir(out)).includes('must-not-exist.json'));
 await writeFile(join(out,'SUMMARY.json'),JSON.stringify({scope:'actual offline native component preparation, proof resume and strict independent verification; no market/key/UPS or network acceptance',members:9,pages:3,newComponentProofs:first.proofsGenerated,reusedFirstRun:first.proofsReused,reusedRestart:3,sameMachineCompetitors:2,sameMachineWinners:1,sourceGateClosed:true,settlementGateClosed:true,settlementCursor:0,proofSha256:hashes,actions,financialOperations:0},null,2)+'\n',{flag:'wx'});
});
