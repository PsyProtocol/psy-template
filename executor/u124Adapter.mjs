import {readFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {publicState} from './publicState.mjs';
import {receiptReader} from './chainReceipts.mjs';
import {publishFile} from './durableFile.mjs';
import {runDurableSubmission,submissionLeaf,driverRecords} from './driverProcess.mjs';
import {retryProofOnlyPreflight} from './preflight.mjs';
import {scanU124,loadU124Files} from './u124Reader.mjs';
import {makePolicy} from '../amm/u124/policy.mjs';
import {parseLosslessJson} from '../amm/u124/client.mjs';
import {validateU124TokenAbi} from './u124Abi.mjs';
import {inspectU124Submission} from './u124Submission.mjs';
export async function createU124WalletAdapter(options,{readState=publicState,readReceipts=receiptReader,runDriver,submitDriver=runDurableSubmission}={}){
 const files=await loadU124Files(options),{abi,config,policy}=files;
 const tokens=await Promise.all([options.assetA,options.assetB].map(async asset=>JSON.parse(await readFile(asset.abi,'utf8'))));
 for(const token of tokens)validateU124TokenAbi(token);
 assert.equal(config.assetA,options.assetA.contractId);assert.equal(config.assetB,options.assetB.contractId);
 for(const method of ['claim','transfer'])assert.equal(tokens[0].contract.methods.find(m=>m.name===method).method_id,tokens[1].contract.methods.find(m=>m.name===method).method_id,'Token method IDs differ');
 assert.deepEqual(policy,makePolicy(options.kind,options.contractId,config,abi,tokens[0]),'policy differs from bound ABI/config');
 async function bindingCurrent(){
  const s=await readState(options.rpcConfig);assert.equal(s.networkName,options.network,'network binding');
  for(const [id,codeRoot,layoutRoot]of [[options.contractId,options.codeRoot,options.layoutRoot],...[options.assetA,options.assetB].map(a=>[a.contractId,a.codeRoot,a.layoutRoot])]){
   const leaf=await s.contractLeaf(id);assert.equal(leaf.code_root,codeRoot,'code binding');assert.equal(leaf.state_layout_root,layoutRoot,'layout binding');assert.equal(leaf.state_tree_height,31,'U124 state height');
  }
  if(options.kind==='bondingcurve'&&config.bootstrap){const b=config.bootstrap,l=await s.contractLeaf(b.ammContractId);assert.equal(l.code_root,b.codeRoot,'bootstrap AMM code');assert.equal(l.state_layout_root,b.layoutRoot,'bootstrap AMM layout');assert.equal(l.state_tree_height,31,'bootstrap AMM height');}
  assert.deepEqual(await s.userIds(options.publicKeyHash),[options.vaultId],'public vault registration');
 }
 await bindingCurrent();
 const env={...process.env};for(const key of Object.keys(env))if(key.endsWith('_WITNESS_WALLET')||key.endsWith('_LOCAL_DEFS'))delete env[key];
 const identity=await runDriver(options.wallet,['fingerprint',options.policy],{env,timeout:120000,maxBuffer:2000000});assert.equal(identity.stdout.trim(),options.fingerprint,'U124 fingerprint');
 const reader=await readReceipts(options.rpcConfig,{maxPages:options.receiptMaxPages??20});
 const serialized=task=>{assert.equal(typeof task.submission,'string','lossless serialized submission required');parseLosslessJson(task.submission);return task.submission;};
 const callPath=task=>join(options.runtimeDirectory,'calls',options.network,String(options.vaultId),createHash('sha256').update(serialized(task)).digest('hex')+'.json');
 const logPath=task=>callPath(task)+'.submission.log';
 const validLog=(task,file)=>{const prefix=callPath(task)+'.submission-';assert.ok(typeof file==='string'&&file.startsWith(prefix)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.log$/.test(file.slice(prefix.length)),'submission log binding');return file;};
 const args=(action,file)=>[action,options.policy,file,options.rpcConfig];
 const scan=()=>scanU124(options,readState,files);
 return {scan,
  isCurrent:async task=>{await bindingCurrent();return JSON.stringify((await scan()).action)===JSON.stringify(task);},
  validateProof:async(task,proof)=>{try{return proof.file===callPath(task)&&await readFile(proof.file,'utf8')===serialized(task);}catch(e){if(e.code==='ENOENT')return false;throw e;}},
  prepareSubmission:async(task,proof)=>({...proof,submissionLog:callPath(task)+'.submission-'+randomUUID()+'.log'}),
  prove:async task=>{
   const file=callPath(task);await mkdir(dirname(file),{recursive:true,mode:0o700});
   try{await publishFile(file,serialized(task));}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(file,'utf8'),serialized(task));}
   const result=await retryProofOnlyPreflight(()=>runDriver(options.wallet,args('preflight',file),{env,timeout:900000,maxBuffer:2000000}));
   const verified=driverRecords(result.stdout).find(v=>v.fullUpsVerified===true&&v.submitted===false);
   assert.ok(verified,'independent UPS preflight missing');assert.equal(verified.marketId,options.contractId);assert.equal(verified.fingerprint,options.fingerprint);
   assert.ok(!submissionLeaf(result.stdout),'preflight attempted submission');
   return {file,submissionLog:logPath(task)};
  },
  submit:async(task,proof)=>{
   assert.equal(proof.file,callPath(task));assert.equal(await readFile(proof.file,'utf8'),serialized(task),'submission calls changed');
   const logFile=validLog(task,proof.submissionLog);
   let output='',error;try{const r=await submitDriver(options.wallet,args('verified-submit',proof.file),{env,timeout:900000,logFile});output=r.stdout+'\n'+r.stderr;}catch(e){output=(e.stdout??'')+'\n'+(e.stderr??'');error=e.message;}
   const inspected=inspectU124Submission(output,options);
   return {endUserLeafHash:inspected.endUserLeafHash,error,output,submissionLog:logFile,...(error&&inspected.rejected?{submissionStatus:'not-submitted',reason:inspected.reason}:{})};
  },
  reconcile:async attempt=>{
   let output=attempt.outcome?.output??'',file;
   if(attempt.task){file=attempt.proof?.submissionLog?validLog(attempt.task,attempt.proof.submissionLog):logPath(attempt.task);try{output=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}}
   const inspected=inspectU124Submission(output,options),recorded=attempt.outcome?.endUserLeafHash;
   if(recorded&&inspected.endUserLeafHash)assert.equal(recorded,inspected.endUserLeafHash,'journal/log leaf binding');
   if(inspected.rejected){assert.ok(!recorded,'rejected log conflicts with recorded broadcast');return {status:'not-submitted',reason:inspected.reason,source:'explicit-driver-rejection',submissionLog:file};}
   const hash=inspected.endUserLeafHash??recorded;
   if(!hash)return {status:'unresolved',reason:'No broadcast identity persisted; the proof driver may still be running or interrupted. Inspect the durable log; never infer permission to retry.',phase:inspected.phase,submissionLog:file};
   return reader({userId:options.vaultId,endUserLeafHash:hash});
  }
 };
}
