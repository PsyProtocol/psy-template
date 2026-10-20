import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir} from 'node:fs/promises';import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {publicState} from './publicState.mjs';import {receiptReader} from './chainReceipts.mjs';
import {retryProofOnlyPreflight} from './preflight.mjs';
import {scanPool} from '../launchamm/chainReader.mjs';
import {scanOrderbook} from '../orderbook/rpcReader.mjs';
import {scanAmm} from '../amm/chainReader.mjs';
import {scanAmm as scanWideAmm, WIDE_AMM_CODE_ROOTS} from '../amm/wide/chainReader.mjs';
import {scanCurve} from '../bondingcurve/chainReader.mjs';
import {runDurableSubmission,submissionLeaf} from './driverProcess.mjs';
import {publishFile} from './durableFile.mjs';
import {createU124WalletAdapter} from './u124Adapter.mjs';
const execFile=promisify(execFileCallback);
const padded=x=>x.toLowerCase().padStart(64,'0');
export async function createPublicWalletAdapter(options,{readState=publicState,readReceipts=receiptReader,runDriver=execFile,submitDriver=runDurableSubmission}={}){
 if(options.profile==='u124'||options.profile==='nft-v3-u124'||options.profile==='batch-v2')return createU124WalletAdapter(options,{readState,readReceipts,runDriver,submitDriver});
 assert.ok(['launchamm','orderbook','amm','bondingcurve'].includes(options.kind),'unsupported public wallet kind');
 const state=await readState(options.rpcConfig),leaf=await state.contractLeaf(options.contractId);
 assert.equal(leaf.code_root,options.codeRoot,'deployed code root');assert.equal(leaf.state_layout_root,options.layoutRoot,'deployed layout root');
 assert.deepEqual(await state.userIds(options.publicKeyHash),[options.vaultId],'public vault registration');
 assert.equal(state.networkName,options.network,'network identity');
 const prefix=['launchamm','bondingcurve'].includes(options.kind)?[String(options.contractId),options.driverConfig]:[String(options.contractId)];
 const env={...process.env,LAUNCH_POOL_USE_LOCAL_PROVER:'1',ORDERBOOK_USE_LOCAL_PROVER:'1',AMM_USE_LOCAL_PROVER:'1',CURVE_USE_LOCAL_PROVER:'1'};
 for(const k of Object.keys(env))if(k.endsWith('_WITNESS_WALLET')||k.endsWith('_LOCAL_DEFS'))delete env[k];
 const identity=await runDriver(options.wallet,['fingerprint',...prefix],{env,timeout:120000,maxBuffer:2000000});
 assert.equal(padded(identity.stdout.trim().split('\n').at(-1)),padded(options.fingerprint),'wallet circuit fingerprint');
 const reader=await readReceipts(options.rpcConfig,{maxPages:options.receiptMaxPages??20});
 async function scan(){
  if(options.kind==='launchamm')return scanPool(options,readState);
  if(options.kind==='amm')return (WIDE_AMM_CODE_ROOTS.includes(options.codeRoot)?scanWideAmm:scanAmm)(options,readState);
  if(options.kind==='bondingcurve')return scanCurve(options,readState);
  return scanOrderbook(options,readState);
 }
 async function reconcile(attempt){
  let leaf=attempt.outcome?.endUserLeafHash;
  if(!leaf&&attempt.task){try{leaf=submissionLeaf(await readFile(logPath(attempt.task),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
  return reader({userId:options.vaultId,endUserLeafHash:leaf});
 }
 async function bindingCurrent(){const s=await readState(options.rpcConfig),l=await s.contractLeaf(options.contractId);assert.equal(l.code_root,options.codeRoot,'code changed during execution');assert.equal(l.state_layout_root,options.layoutRoot,'layout changed during execution');assert.deepEqual(await s.userIds(options.publicKeyHash),[options.vaultId]);assert.equal(s.networkName,options.network,'network changed during execution');}
 const serialized=task=>JSON.stringify(task.submission);
 const callPath=task=>join(options.runtimeDirectory,'calls',options.network,String(options.vaultId),createHash('sha256').update(serialized(task)).digest('hex')+'.json');
 const logPath=task=>callPath(task)+'.submission.log';
 const argsFor=file=>['submit',...prefix,file,options.rpcConfig];
 return {scan,reconcile,
  validateProof:async(task,proof)=>{try{return proof.file===callPath(task)&&await readFile(proof.file,'utf8')===serialized(task);}catch(e){if(e.code==='ENOENT')return false;throw e;}},
  isCurrent:async task=>{await bindingCurrent();return JSON.stringify((await scan()).action)===JSON.stringify(task);},
  prove:async task=>{const file=callPath(task);await mkdir(join(file,'..'),{recursive:true,mode:0o700});
   try{await publishFile(file,serialized(task));}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(file,'utf8'),serialized(task),'persisted calls changed');}
   const args=argsFor(file);await retryProofOnlyPreflight(()=>runDriver(options.wallet,args,{env:{...env,LAUNCH_POOL_PROVE_ONLY:'1',ORDERBOOK_PROVE_ONLY:'1',AMM_PROVE_ONLY:'1',CURVE_PROVE_ONLY:'1'},timeout:900000,maxBuffer:2000000}));return {file,submissionLog:logPath(task)};},
  submit:async(task,proof)=>{assert.equal(proof.file,callPath(task),'unexpected preflight file');assert.equal(await readFile(proof.file,'utf8'),serialized(task),'submission calls changed');
   let output,error;try{const r=await submitDriver(options.wallet,argsFor(proof.file),{env:{...env,LAUNCH_POOL_PROVE_ONLY:'0',ORDERBOOK_PROVE_ONLY:'0',AMM_PROVE_ONLY:'0',CURVE_PROVE_ONLY:'0'},timeout:900000,logFile:logPath(task)});output=r.stdout+'\n'+r.stderr;}catch(e){output=(e.stdout??'')+'\n'+(e.stderr??'');error=e.message;}
   const endUserLeafHash=submissionLeaf(output);
   return {endUserLeafHash,error,output};}
 };
}
