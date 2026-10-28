// Complete final-order source coverage relative to an operator-pinned history
// root. This composes native verification with ordering preparation, not spending.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {sha256} from './requestBinding.mjs';
import {publishFile} from './durableFile.mjs';
import {sealDriver} from './sealedDriver.mjs';
import {ExecutionJournal} from './journal.mjs';
import {prepareCheckpointStream} from './checkpointStream.mjs';
import {parseLosslessJson} from '../amm/u124/client.mjs';
const run=promisify(execFile);
const read=async p=>parseLosslessJson(await readFile(p,'utf8'));
async function publish(path,bytes){try{await publishFile(path,bytes);}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(await readFile(path),Buffer.from(bytes),'source artifact changed');}}
function relativeArtifact(name){assert.ok(typeof name==='string'&&!isAbsolute(name)&&name.split(/[\\/]/).every(p=>p!==''&&p!=='.'&&p!=='..'),'review artifact path must be confined and relative');return name;}

export async function prepareFinalStateStream(options){
 const {review,snapshot,reviewSha256,historyRoot,runtimeDirectory,sourceWallet,sourceWalletSha256,streamWallet,streamWalletSha256}=options;
 assert.match(reviewSha256??'',/^[a-f0-9]{64}$/);assert.match(historyRoot??'',/^[a-f0-9]{64}$/,'independently pinned canonical history root required');
 const config=await readFile(review),source=await readFile(snapshot);assert.ok(config.length<=1024*1024&&source.length<=64*1024*1024);assert.equal(sha256(config),reviewSha256,'source review pin changed');
 const cfg=parseLosslessJson(config.toString()),initial=parseLosslessJson(source.toString()),vault=Number(initial.fields?.[4]);assert.equal(Number(cfg.schema),1);assert.equal(cfg.assets?.length,3);assert.ok(Number.isSafeInteger(vault)&&vault>0&&vault<2**24);
 const driver=await sealDriver({wallet:sourceWallet,walletSha256:sourceWalletSha256,runtimeDirectory});
 const id=sha256([sourceWalletSha256,streamWalletSha256,reviewSha256,historyRoot,sha256(source)].join('\n'));
 const dir=join(resolve(runtimeDirectory),'final-state-stream',id);await mkdir(dir,{recursive:true,mode:0o700});
 const journal=new ExecutionJournal({directory:dir,network:'offline-final-state-coverage',vaultId:vault,fingerprint:sourceWalletSha256});
 const inputDir=join(dir,'source-input'),resultDir=join(dir,'verified-source');
 const pins=new Map([['review.json',reviewSha256],['snapshot.json',sha256(source)]]);
 const env={...process.env,PSY_NETWORK:'testnet',PSY_MARKET_TESTNET_PROFILE:'mainnet-beta-20261027-v1',RAYON_NUM_THREADS:'2'};
 await journal.locked(async()=>{
  await mkdir(inputDir,{recursive:true,mode:0o700});await publish(join(inputDir,'review.json'),config);await publish(join(inputDir,'snapshot.json'),source);
  for(const row of [cfg,...cfg.assets]){const name=relativeArtifact(row.artifact),path=join(inputDir,name);assert.match(row.artifact_sha256,/^[a-f0-9]{64}$/);assert.ok(!['review.json','snapshot.json'].includes(name));
   const bytes=await readFile(join(dirname(resolve(review)),name));assert.ok(bytes.length<=128*1024*1024);assert.equal(sha256(bytes),row.artifact_sha256,'review artifact changed');if(pins.has(name))assert.equal(pins.get(name),row.artifact_sha256);pins.set(name,row.artifact_sha256);await mkdir(dirname(path),{recursive:true,mode:0o700});await publish(path,bytes);
  }
  assert.deepEqual(await readFile(snapshot),source,'snapshot changed during capture');assert.deepEqual(await readFile(review),config,'review changed during capture');await driver.check();
  if(!(await journal.records()).some(r=>r.status==='final-state-source-verified')){
   await run(driver.file,[join(inputDir,'review.json'),join(inputDir,'snapshot.json'),historyRoot,resultDir],{env,timeout:300000,maxBuffer:2000000});
   const report=await read(join(resultDir,'source.json'));assert.equal(report.historyRoot,historyRoot);assert.equal(report.snapshotSha256,sha256(source));assert.equal(report.reviewSha256,reviewSha256);assert.equal(report.canBroadcast,false);assert.equal(report.fullUpsVerified,false);
   const names=['source.json','coverage.json','snapshot.json','review.json',...(Number(report.eligible)>0?['manifest.json','pages.json']:[])];const outputs={};for(const name of names)outputs[name]=sha256(await readFile(join(resultDir,name)));
   await journal.append({status:'final-state-source-verified',historyRoot,reviewSha256,snapshotSha256:sha256(source),outputs,financialOperations:0});
  }
 });
 const check=async()=>{await driver.check();const record=(await journal.records()).find(r=>r.status==='final-state-source-verified');assert.ok(record);assert.equal(record.historyRoot,historyRoot);assert.equal(record.reviewSha256,reviewSha256);assert.equal(record.snapshotSha256,sha256(source));for(const [name,pin]of pins)assert.equal(sha256(await readFile(join(inputDir,name))),pin,'captured source changed');for(const [name,pin]of Object.entries(record.outputs))assert.equal(sha256(await readFile(join(resultDir,name))),pin,'verified source changed');return read(join(resultDir,'source.json'));};
 const report=await check();
 const ordering=Number(report.eligible)>0?await prepareCheckpointStream({wallet:streamWallet,walletSha256:streamWalletSha256,input:join(resultDir,'manifest.json'),runtimeDirectory:join(dir,'ordering')}):null;
 const status=async()=>{await check();return {scope:'complete final eligible orders at pinned source checkpoint; not transaction history',sourceHistoryRoot:historyRoot,accounts:report.accounts,eligible:report.eligible,fundedRecoveryCandidates:report.fundedRecoveryCandidates,finalStateCoverageRelativeToPinnedRoot:true,finalityVerified:false,fullUpsVerified:false,canSign:false,canBroadcast:false,ordering:ordering?await ordering.status():null};};
 return {directory:dir,sourceDirectory:resultDir,status,prove:async()=>{await check();const proofs=ordering?await ordering.prove():null;await check();return {source:await status(),proofs,settlementCursor:0,canBroadcast:false};},authorizeSettlement:()=>{const e=Error('This legacy preparation route has no installed, reviewed source-covered v3 spending driver. Financial stream execution remains disabled.');e.code='STREAM_MARKET_UPS_UNAVAILABLE';throw e;}};
}
