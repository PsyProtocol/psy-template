// Offline native preparation/proof ownership. This route has no signing or
// financial callback; a component proof never enables the market write route.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdir,readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {sha256} from './requestBinding.mjs';import {publishFile} from './durableFile.mjs';
import {sealDriver} from './sealedDriver.mjs';import {ExecutionJournal} from './journal.mjs';
import {losslessJson,parseLosslessJson} from '../amm/u124/client.mjs';
import {requireBlockCoverage,requireStreamSettlement} from '../batching/checkpoint-stream/coverage.mjs';
const run=promisify(execFile),read=async p=>parseLosslessJson(await readFile(p,'utf8'));
const publish=async(p,text)=>{try{await publishFile(p,text);}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(p,'utf8'),text,'immutable stream artifact changed');}};
export function validateStreamPlan(manifest,pages){
 assert.equal(manifest.fields.length,41);const f=manifest.fields.map(BigInt),n=Number(f[8]);assert.ok(Number.isSafeInteger(n)&&n>0&&n<2**24);assert.equal(manifest.members.length,n);assert.equal(pages.length,Math.ceil(n/4));
 let cursor=0,previous=null;const seen=new Set();
 for(const p of pages){assert.deepEqual(p.fields,manifest.fields,'frozen scope/seed changed');assert.equal(Number(p.before.cursor),cursor);if(previous)assert.deepEqual(p.before,previous,'stream endpoint discontinuity');assert.equal(p.rows.length,Math.min(4,n-cursor));
  for(const row of p.rows){const i=Number(row.index);assert.ok(Number.isSafeInteger(i)&&i>=0&&i<n&&!seen.has(i));assert.deepEqual(row.member,manifest.members[i]);seen.add(i);cursor++;}
  assert.equal(Number(p.after.cursor),cursor);previous=p.after;
 }
 assert.equal(cursor,n);assert.equal(seen.size,n);
 return {members:n,pages:pages.length,preparationCursor:cursor,settlementCursor:0,rawBlockCoverageAuthenticated:false,canSign:false,canBroadcast:false};
}
export async function prepareCheckpointStream({wallet,walletSha256,input,runtimeDirectory},{runNative=run}={}){
 const bytes=await readFile(input);assert.ok(bytes.length<=4*1024*1024);const initial=parseLosslessJson(bytes.toString()),vault=Number(initial.fields?.[4]);assert.ok(Number.isSafeInteger(vault)&&vault>0&&vault<2**24);
 const driver=await sealDriver({wallet,walletSha256,runtimeDirectory});const id=sha256(walletSha256+'\n'+bytes),dir=join(resolve(runtimeDirectory),'checkpoint-stream',id);await mkdir(dir,{recursive:true,mode:0o700});
 const journal=new ExecutionJournal({directory:dir,network:'offline-stream-component',vaultId:vault,fingerprint:walletSha256});
 const env={...process.env,PSY_NETWORK:'testnet',PSY_MARKET_TESTNET_PROFILE:'mainnet-beta-20261027-v1',RAYON_NUM_THREADS:'2'};
 const native=async(args)=>{await driver.check();return runNative(driver.file,args,{env,timeout:300000,maxBuffer:2000000});};
 const planDir=join(dir,'prepared'),proofDir=join(dir,'proofs');
 const plan=async()=>{const manifest=await read(join(planDir,'manifest.json')),pages=await read(join(planDir,'pages.json'));return {manifest,pages,status:validateStreamPlan(manifest,pages)};};
 await journal.locked(async()=>{
  await publish(join(dir,'input.json'),bytes.toString());assert.equal(await readFile(input,'utf8'),bytes.toString(),'source changed during capture');
  const records=await journal.records();if(!records.some(r=>r.status==='stream-prepared')){
   // A partial native preparation remains visible and blocks a blind overwrite.
   await native(['prepare',join(dir,'input.json'),planDir]);const p=await plan();await journal.append({status:'stream-prepared',inputSha256:sha256(bytes),manifestSha256:sha256(await readFile(join(planDir,'manifest.json'))),pagesSha256:sha256(await readFile(join(planDir,'pages.json'))),summary:p.status});
  }
 });
 const checkPlan=async()=>{const r=(await journal.records()).find(r=>r.status==='stream-prepared');assert.ok(r);assert.equal(sha256(await readFile(join(dir,'input.json'))),r.inputSha256);for(const name of ['manifest','pages'])assert.equal(sha256(await readFile(join(planDir,name+'.json'))),r[name+'Sha256']);await driver.check();return plan();};
 return {directory:dir,status:async()=>(await checkPlan()).status,prove:()=>journal.locked(async()=>{await checkPlan();await native(['prove',planDir,proofDir]);const verified=await read(join(proofDir,'verification.json'));assert.equal(verified.conditionalOrderChainVerified,true);assert.equal(verified.canBroadcast,false);assert.equal(verified.rawBlockCoverageAuthenticated,false);await checkPlan();await journal.append({status:'stream-order-proofs-verified',verificationSha256:sha256(await readFile(join(proofDir,'verification.json'))),financialOperations:0});return {...verified,settlementCursor:0};}),authorizeWholeBlock:()=>requireBlockCoverage(),authorizeSettlement:()=>requireStreamSettlement()};
}
