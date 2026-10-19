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
import {bindRequest,sha256} from './requestBinding.mjs';
import {sealDriver} from './sealedDriver.mjs';
import {validateU124TokenAbi} from './u124Abi.mjs';
import {inspectU124Submission} from './u124Submission.mjs';
import {captureInputs,publishSubmissionGuard} from './submissionGuard.mjs';
import {loadFiles as loadNftFiles,scan as scanNftMarket} from '../nft-marketplace/reader.mjs';
import {makePolicy as makeNftPolicy} from '../nft-marketplace/policy.mjs';
import {validateNftAbi} from '../nft-marketplace/abi.mjs';
import {validateResultsAbi} from '../nft-marketplace/status.mjs';
export async function createU124WalletAdapter(options,{readState=publicState,readReceipts=receiptReader,runDriver,submitDriver=runDurableSubmission}={}){
 const nft=options.kind==='nftmarket';
 const assets=nft?[options.paymentToken,options.collection]:[options.assetA,options.assetB];
 const inputsCurrent=await captureInputs([options.abi,options.driverConfig,options.policy,options.rpcConfig,...assets.map(a=>a.abi)]);
 const files=await (nft?loadNftFiles:loadU124Files)(options),{abi,config,policy}=files;
 await inputsCurrent();
 const tokens=await Promise.all(assets.map(async asset=>JSON.parse(await readFile(asset.abi,'utf8'))));
 validateU124TokenAbi(tokens[0]);
 if(nft){
  validateNftAbi(tokens[1]);validateResultsAbi(abi);assert.equal(config.nftId,options.collection.contractId);assert.equal(config.tokenId,options.paymentToken.contractId);
  assert.deepEqual(policy,makeNftPolicy(options.contractId,config,abi,tokens[1],tokens[0]),'NFT policy differs from bound ABI/config');
 }else{
  validateU124TokenAbi(tokens[1]);assert.equal(config.assetA,options.assetA.contractId);assert.equal(config.assetB,options.assetB.contractId);
  for(const method of ['claim','transfer'])assert.equal(tokens[0].contract.methods.find(m=>m.name===method).method_id,tokens[1].contract.methods.find(m=>m.name===method).method_id,'Token method IDs differ');
  assert.deepEqual(policy,makePolicy(options.kind,options.contractId,config,abi,tokens[0]),'policy differs from bound ABI/config');
 }
 const driver=await sealDriver(options);
 const contracts=[{contractId:options.contractId,codeRoot:options.codeRoot,layoutRoot:options.layoutRoot,stateTreeHeight:31},...assets.map(a=>({contractId:a.contractId,codeRoot:a.codeRoot,layoutRoot:a.layoutRoot,stateTreeHeight:nft&&a===options.collection?30:31}))];
 if(options.kind==='bondingcurve'&&config.bootstrap){const b=config.bootstrap;contracts.push({contractId:b.ammContractId,codeRoot:b.codeRoot,layoutRoot:b.layoutRoot,stateTreeHeight:31});}
 const first=await readState(options.rpcConfig);assert.equal(first.networkName,options.network,'network binding');
 const native=await first.contractLeaf(0);assert.equal(native.state_tree_height,32,'native PSY state height');
 contracts.push({contractId:0,codeRoot:native.code_root,layoutRoot:native.state_layout_root,stateTreeHeight:32});
 async function bindingCurrent(){
  await inputsCurrent();
  const s=await readState(options.rpcConfig);assert.equal(s.networkName,options.network,'network binding');
  for(const c of contracts){
   const leaf=await s.contractLeaf(c.contractId);assert.equal(leaf.code_root,c.codeRoot,'code binding');assert.equal(leaf.state_layout_root,c.layoutRoot,'layout binding');assert.equal(leaf.state_tree_height,c.stateTreeHeight,'asset state height');
  }
  assert.deepEqual(await s.userIds(options.publicKeyHash),[options.vaultId],'public vault registration');
  await inputsCurrent();
 }
 await bindingCurrent();
 const env={...process.env};for(const key of Object.keys(env))if(key.endsWith('_WITNESS_WALLET')||key.endsWith('_LOCAL_DEFS'))delete env[key];
 const identity=await runDriver(driver.file,['identity',options.policy],{env,timeout:120000,maxBuffer:2000000});
 const derived=driverRecords(identity.stdout).find(v=>v.fingerprint&&v.publicKeyHash);assert.ok(derived,'public SD-key identity missing');
 assert.equal(derived.fingerprint,options.fingerprint,nft?'NFT fingerprint':'U124 fingerprint');
 assert.equal(derived.publicKeyHash,options.publicKeyHash,nft?'NFT public identity':'U124 public identity');
 await bindingCurrent();
 const binding=await publishSubmissionGuard(options,policy,contracts);
 const guardCurrent=await captureInputs([binding.file]);
 const guardSha256=sha256(await readFile(binding.file));
 const reader=await readReceipts(options.rpcConfig,{maxPages:options.receiptMaxPages??20});
 const serialized=task=>{bindRequest(task.submission,policy,task.kind);return task.submission;};
 const requestBinding=task=>({callsSha256:sha256(serialized(task)),guardSha256});
 const callPath=task=>join(options.runtimeDirectory,'calls',options.network,String(options.vaultId),createHash('sha256').update(serialized(task)).digest('hex')+'.json');
 const logPath=task=>callPath(task)+'.submission.log';
 const validLog=(task,file)=>{const prefix=callPath(task)+'.submission-';assert.ok(typeof file==='string'&&file.startsWith(prefix)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.log$/.test(file.slice(prefix.length)),'submission log binding');return file;};
 const args=(action,file)=>[action,options.policy,file,options.rpcConfig,binding.file];
 const scan=()=>nft?scanNftMarket(options,readState,files):scanU124(options,readState,files);
 return {scan,
  isCurrent:async task=>{await bindingCurrent();return JSON.stringify((await scan()).action)===JSON.stringify(task);},
  validateProof:async(task,proof)=>{try{return proof.requestBindingVersion===1&&proof.driverSha256===driver.sha256&&proof.callsSha256===sha256(serialized(task))&&proof.guardSha256===guardSha256&&proof.submissionGuardVersion===1&&proof.guardFile===binding.file&&proof.file===callPath(task)&&await readFile(proof.file,'utf8')===serialized(task);}catch(e){if(e.code==='ENOENT')return false;throw e;}},
  prepareSubmission:async(task,proof)=>({...proof,submissionLog:callPath(task)+'.submission-'+randomUUID()+'.log'}),
  prove:async task=>{
   await bindingCurrent();await guardCurrent();await driver.check();
   const file=callPath(task);await mkdir(dirname(file),{recursive:true,mode:0o700});
   try{await publishFile(file,serialized(task));}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(file,'utf8'),serialized(task));}
   const result=await retryProofOnlyPreflight(()=>runDriver(driver.file,args('guarded-preflight',file),{env,timeout:900000,maxBuffer:2000000}));
   await inputsCurrent();await guardCurrent();await driver.check();
   inspectU124Submission(result.stdout,{...options,requireGuard:true,...requestBinding(task)});
   const verified=driverRecords(result.stdout).find(v=>v.fullUpsVerified===true&&v.submitted===false);
   assert.ok(verified,'independent UPS preflight missing');assert.equal(verified.submissionGuardVerified,true,'driver submission guard missing');assert.equal(verified.marketId,options.contractId);assert.equal(verified.fingerprint,options.fingerprint);
   assert.ok(!submissionLeaf(result.stdout),'preflight attempted submission');
   return {file,submissionLog:logPath(task),submissionGuardVersion:1,guardFile:binding.file,requestBindingVersion:1,driverSha256:driver.sha256,...requestBinding(task)};
  },
  submit:async(task,proof)=>{
   await bindingCurrent();await guardCurrent();await driver.check();
   assert.equal(proof.file,callPath(task));assert.equal(await readFile(proof.file,'utf8'),serialized(task),'submission calls changed');
   const logFile=validLog(task,proof.submissionLog);
   let output='',error;try{const r=await submitDriver(driver.file,args('guarded-submit',proof.file),{env,timeout:900000,logFile});output=r.stdout+'\n'+r.stderr;}catch(e){output=(e.stdout??'')+'\n'+(e.stderr??'');error=e.message;}
   const inspected=inspectU124Submission(output,{...options,requireGuard:true,...requestBinding(task)});
   return {endUserLeafHash:inspected.endUserLeafHash,error,output,submissionLog:logFile,...(error&&inspected.rejected?{submissionStatus:'not-submitted',reason:inspected.reason}:{})};
  },
  reconcile:async attempt=>{
   let output=attempt.outcome?.output??'',file;
   if(attempt.task){file=attempt.proof?.submissionLog?validLog(attempt.task,attempt.proof.submissionLog):logPath(attempt.task);try{output=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}}
   const inspected=inspectU124Submission(output,{...options,requireGuard:attempt.proof?.submissionGuardVersion===1,...(attempt.proof?.requestBindingVersion===1?requestBinding(attempt.task):{})}),recorded=attempt.outcome?.endUserLeafHash;
   if(recorded&&inspected.endUserLeafHash)assert.equal(recorded,inspected.endUserLeafHash,'journal/log leaf binding');
   if(inspected.rejected){assert.ok(!recorded,'rejected log conflicts with recorded broadcast');return {status:'not-submitted',reason:inspected.reason,source:'explicit-driver-rejection',submissionLog:file};}
   const hash=inspected.endUserLeafHash??recorded;
   if(!hash)return {status:'unresolved',reason:'No broadcast identity persisted; the proof driver may still be running or interrupted. Inspect the durable log; never infer permission to retry.',phase:inspected.phase,submissionLog:file};
   return reader({userId:options.vaultId,endUserLeafHash:hash});
  }
 };
}
