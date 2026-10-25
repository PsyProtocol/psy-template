import{savedPreflightCandidate,pendingPreflight,recheckSavedPreflight}from'./preflightRecovery.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {residentProver} from './residentProver.mjs';
import {processCompactIdentity} from './identityCache.mjs';
import{withBulkAdmission}from'../batching/admission/bulk.mjs';
import{preSessionTransportFailure}from'./preSessionRetry.mjs';
import{ReadUnavailable}from'./readRetry.mjs';
import {publicState} from './publicState.mjs';
import {readTogether} from './readConcurrency.mjs';
import {receiptReader} from './chainReceipts.mjs';
import {sealDriver} from './sealedDriver.mjs';
import {captureInputs} from './submissionGuard.mjs';
import {publishFile} from './durableFile.mjs';
import {sha256} from './requestBinding.mjs';
import {driverRecords,runDurableSubmission} from './driverProcess.mjs';
import {loadBatchFiles} from '../batching/v2/reader.mjs';
import {makeAdmissionPolicy} from '../batching/admission/prepare.mjs';
import {compactRequest} from '../batching/admission/reader.mjs';
import {scanExecutorAdmission,validateAdmissionPlan} from './admissionReader.mjs';
import {losslessJson,parseLosslessJson} from '../amm/u124/client.mjs';
import {validateU124TokenAbi} from './u124Abi.mjs';
import {validateNftAbi} from '../nft-marketplace/abi.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const exactJson=async p=>parseLosslessJson(await readFile(p,'utf8'));
const integer=x=>{assert.ok(typeof x==='bigint'||Number.isSafeInteger(x),'unsafe integer metadata');return BigInt(x);};
const publish=async(p,v)=>{await mkdir(dirname(p),{recursive:true,mode:0o700});const text=typeof v==='string'?v:JSON.stringify(v,null,2)+'\n';try{await publishFile(p,text);}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(p,'utf8'),text,'immutable Executor artifact changed');}};
export function bindCompactRequest(task,policy){
 assert.equal(task.profile,'compact-v1');const r=parseLosslessJson(task.submission),f=r.software_defined_call.inputs;
 assert.deepEqual(r,parseLosslessJson(losslessJson(compactRequest(policy,f))),'complete compact request differs');
 assert.equal(task.kind,['','batch_commit','batch_settle','batch_expire','batch_maintenance'][Number(f[0])],'compact task mode');
 assert.ok(Number.isSafeInteger(Number(task.validUntilCheckpoint))&&BigInt(task.validUntilCheckpoint)>0n&&BigInt(task.validUntilCheckpoint)<2n**32n);
 return r;
}
export async function createCompactAdmissionAdapter(o,{readState=publicState,readReceipts=receiptReader,runDriver,submitDriver=runDurableSubmission,residentScope}={}){
 assert.equal(o.profile,'batch-admission-compact-v1');
 const assets=o.kind==='nftmarket'?[o.paymentToken,o.collection]:[o.assetA,o.assetB];
 const inputsCurrent=await captureInputs([o.abi,o.driverConfig,o.policy,o.rpcConfig,o.dependencyBindings,o.admissionPlan,...assets.map(a=>a.abi)]);
 const files=await loadBatchFiles(o);files.admissionPlan=validateAdmissionPlan(await json(o.admissionPlan));
 assert.ok(files.admissionPlan.members.every(m=>m.owner!==o.vaultId&&m.owner!==o.batchSponsorId),'plan members must differ from vault and batch sponsor');
 const [token,other]=await Promise.all(assets.map(a=>json(a.abi)));validateU124TokenAbi(token);if(o.kind==='nftmarket')validateNftAbi(other);else validateU124TokenAbi(other);
 const canonical=makeAdmissionPolicy(o.kind,o.contractId,files.config,files.abi,token,o.kind==='nftmarket'?other:undefined);
 assert.deepEqual(files.policy,o.admissionMode==='all-four-v1'?withBulkAdmission(canonical):canonical,'admission policy differs from ABI/config/mode');
 for(const [a,id]of assets.map((a,i)=>[a,o.kind==='nftmarket'?(i===0?files.config.tokenId:files.config.nftId):(i===0?files.config.assetA:files.config.assetB)]))assert.equal(a.contractId,id);
 const dependencies=await json(o.dependencyBindings),required=[...new Set(files.policy.branches.flatMap(b=>b.calls.map(c=>c.contract_id)))].sort((a,b)=>a-b);
 assert.ok(Array.isArray(dependencies));assert.deepEqual(dependencies.map(b=>b.contract.contractId).sort((a,b)=>a-b),required,'complete dependency whitelist');
 for(const c of [{contractId:o.contractId,codeRoot:o.codeRoot,layoutRoot:o.layoutRoot},...assets]){const b=dependencies.find(b=>b.contract.contractId===c.contractId);assert.equal(b.contract.codeRoot,c.codeRoot);assert.equal(b.contract.layoutRoot,c.layoutRoot);}
 const identity={version:1,network:o.network,marketId:o.contractId,vaultId:o.vaultId,fingerprint:o.fingerprint,publicKeyHash:o.publicKeyHash,contracts:dependencies.map(b=>b.contract)};
 const pin=join(o.runtimeDirectory,'bindings',o.network,String(o.vaultId),o.fingerprint+'-compact.json');await publish(pin,{identity,dependencies,testnetProfile:o.testnetProfile});
 const bindingCurrent=async()=>{await inputsCurrent();const s=await readState(o.rpcConfig);assert.equal(s.networkName,o.network);assert.equal(BigInt(s.network.magic),BigInt(files.config.networkMagic));
  const [leaves,registered]=await readTogether([readTogether(dependencies.map(b=>s.contractLeaf(b.contract.contractId))),s.userIds(o.publicKeyHash)]);
  for(const [i,b]of dependencies.entries()){const l=leaves[i];assert.deepEqual({contract:{contractId:b.contract.contractId,codeRoot:l.code_root,layoutRoot:l.state_layout_root,stateTreeHeight:l.state_tree_height},functionTreeRoot:l.function_tree_root,layoutFieldCount:l.state_layout_field_count,layoutSlotCount:l.state_layout_slot_count},b,'live compact dependency changed');}
  assert.deepEqual(registered,[o.vaultId],'compact registered identity');await inputsCurrent();return s;};
 const initialState=await bindingCurrent(),retryUrls=[...initialState.network.realm_configs,...(initialState.network.coordinator_configs??[])].flatMap(r=>r.rpc_url);const pinCurrent=await captureInputs([pin]),driver=await sealDriver(o);
 const env={...process.env,PSY_MARKET_TESTNET_PROFILE:o.testnetProfile,RAYON_NUM_THREADS:String(o.proverThreads??2),PSY_PROVER_MEMORY_MODE:o.proverMemoryMode??'retain-v1'};for(const k of Object.keys(env))if(k.endsWith('_WITNESS_WALLET')||k.endsWith('_LOCAL_DEFS')||k==='PSY_MARKET_BENCH_SOURCE_CHECKPOINT')delete env[k];
 const makeResident=async()=>o.proverMode!=='resident'?null:residentScope?residentScope.acquire({driverSha256:driver.sha256,policySha256:sha256(await readFile(o.policy)),rpcSha256:sha256(await readFile(o.rpcConfig)),identity,dependencies,env},driver.file,o.policy,o.rpcConfig,{env}):residentProver(driver.file,o.policy,o.rpcConfig,{env});
 // Only public deterministic key metadata is reusable. sealDriver and fresh
 // live dependency/registry checks still run on EVERY factory construction.
 await processCompactIdentity({driverSha256:driver.sha256,policySha256:sha256(await readFile(o.policy)),rpcConfigSha256:sha256(await readFile(o.rpcConfig)),identity,dependencies},async()=>driverRecords((await runDriver(driver.file,['identity',o.policy],{env,timeout:120000,maxBuffer:2000000})).stdout).find(r=>r.profile==='compact-v1'));
 await inputsCurrent();await driver.check();
 const reader=await readReceipts(o.rpcConfig,{maxPages:o.receiptMaxPages??20});
 const root=task=>join(o.runtimeDirectory,'compact',o.network,String(o.vaultId),sha256(task.submission+'\n'+task.validUntilCheckpoint));
 const paths=task=>({calls:join(root(task),'calls.json'),guard:join(root(task),'guard.json')});
 const safePath=(task,prefix,p)=>{assert.ok(typeof p==='string'&&p.startsWith(join(root(task),prefix)+'-')&&/^[0-9a-f-]{36}$/.test(p.slice((join(root(task),prefix)+'-').length)),'compact attempt path binding');return p;};
 // Reuse this call's fixed-checkpoint leaf cache, never a prior check/session.
 const scan=async()=>{const s=await bindingCurrent();return scanExecutorAdmission(o,async()=>s,files);};
 const proofFiles=async(task,p)=>{assert.equal(p.version,1);assert.equal(p.driverSha256,driver.sha256);safePath(task,'proof',p.preparedDirectory);const m=await readFile(join(p.preparedDirectory,'prepared.json'));assert.equal(sha256(m),p.manifestSha256);const v=JSON.parse(m);
  const q=paths(task);for(const[file,hash]of [[o.policy,v.policySha256],[q.calls,v.callsSha256],[q.guard,v.guardSha256],[join(p.preparedDirectory,'preflight.json'),v.preflightSha256],[join(p.preparedDirectory,'request.json'),v.requestSha256]])assert.equal(sha256(await readFile(file)),hash,'prepared artifact changed');
  assert.equal(await readFile(q.calls,'utf8'),task.submission);const pre=await exactJson(join(p.preparedDirectory,'preflight.json'));assert.equal(pre.fullUpsVerified,true);assert.equal(pre.exactStackAndSessionVerified,true);assert.equal(pre.broadcast,false);assert.equal(pre.callsSha256,v.callsSha256);assert.equal(pre.guardSha256,v.guardSha256);assert.equal(pre.core.new_user_leaf.user_id,BigInt(o.vaultId));assert.equal(pre.core.new_user_leaf.public_key,o.publicKeyHash);if(pre.persistenceProfile!==undefined){assert.equal(pre.persistenceProfile,'crypto-before-final-guard-v1');assert.equal(pre.liveGuardsPending,true);if(p.liveRecovery){safePath(task,'recheck',p.liveRecovery.directory);const raw=await readFile(join(p.liveRecovery.directory,'verification.json'));assert.equal(sha256(raw),p.liveRecovery.verificationSha256);const r=JSON.parse(raw);assert.equal(r.fullUpsVerified,true);assert.equal(r.exactStackAndSessionVerified,true);assert.equal(r.broadcast,false);assert.equal(r.reproved,false);assert.equal(r.preparedManifestSha256,p.manifestSha256);assert.equal(r.requestSha256,v.requestSha256);}else{const r=await json(join(p.preparedDirectory,'final-live-state.json'));assert.equal(r.liveGuardsPassed,true);assert.equal(r.broadcast,false);assert.equal(r.preparedManifestSha256,p.manifestSha256);assert.equal(r.requestSha256,v.requestSha256);}}return {manifest:v,pre};};
 const reconcile=async attempt=>{const p=attempt.proof;await proofFiles(attempt.task,p);const out=safePath(attempt.task,'send',p.submissionDirectory);
  let intent;try{intent=await exactJson(join(out,'intent.json'));}catch(e){if(e.code!=='ENOENT')throw e;let f;try{f=await json(join(out,'failure.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(f?.ok===false&&f.broadcastMayHaveBeenAttempted===false)return {status:'not-submitted',reason:f.reason,source:'explicit-compact-driver-rejection'};
   return {status:'unresolved',reason:'No durable broadcast identity; child may still be running. Never automatically re-sign.'};}
  const {manifest:m,pre}=await proofFiles(attempt.task,p),verified=await json(join(out,'verification.json'));
  assert.equal(verified.fullUpsVerified,true);assert.equal(verified.reproved,false);assert.equal(verified.preparedManifestSha256,p.manifestSha256);assert.equal(verified.requestSha256,m.requestSha256);assert.equal(intent.requestSha256,m.requestSha256);assert.equal(intent.endUserLeafHash,pre.core.state_transition.end_user_leaf_hash);assert.equal(intent.userId,BigInt(o.vaultId));assert.equal(intent.nonce,pre.core.new_user_leaf.nonce);
  const receipt=await reader({userId:o.vaultId,endUserLeafHash:intent.endUserLeafHash,minCheckpoint:Number(pre.core.checkpoint_id)});if(receipt.status==='included'){const common=await readState(o.rpcConfig);if(common.checkpoint<receipt.checkpoint)return {status:'unresolved',reason:'included-awaiting-common-state',includedReceipt:receipt,commonCheckpoint:common.checkpoint};return {...receipt,commonCheckpoint:common.checkpoint};}return receipt;};
 const isCurrent=async task=>{bindCompactRequest(task,files.policy);await pinCurrent();await driver.check();const s=await bindingCurrent();if(BigInt(s.checkpoint)>BigInt(task.validUntilCheckpoint))return false;const next=(await scanExecutorAdmission(o,async()=>s,files)).action;if(!next)return false;
   const x=structuredClone(next),a=bindCompactRequest(task,files.policy),b=bindCompactRequest(next,files.policy);if(a.software_defined_call.inputs[0]===1n){const f=b.software_defined_call.inputs;f[3]=a.software_defined_call.inputs[3];if(f[3]<=BigInt(s.checkpoint)||f[3]>BigInt(s.checkpoint)+1024n)return false;x.submission=losslessJson(compactRequest(files.policy,f));}x.validUntilCheckpoint=task.validUntilCheckpoint;return JSON.stringify(x)===JSON.stringify(task);};
 // Acquire only after every fallible factory guard, preventing leaked leases
 // if identity/receipt initialization rejects before returning an adapter.
 let resident=null;const requireResident=async()=>{if(!resident)resident=await makeResident();return resident;};
 const finishProof=async(task,out,liveRecovery)=>{await inputsCurrent();await pinCurrent();await driver.check();const p={version:1,driverSha256:driver.sha256,preparedDirectory:out,manifestSha256:sha256(await readFile(join(out,'prepared.json'))),...(liveRecovery?{liveRecovery}:{})};await proofFiles(task,p);return p;};
 const recoveryOptions=async task=>({driverSha256:driver.sha256,taskSha256:sha256(task.submission+'\n'+task.validUntilCheckpoint),policySha256:sha256(await readFile(o.policy)),rpcConfigSha256:sha256(await readFile(o.rpcConfig)),urls:retryUrls});
 const recoverCandidate=(task,candidate)=>recheckSavedPreflight(candidate,{root:root(task),driverFile:driver.file,policy:o.policy,rpcConfig:o.rpcConfig,calls:paths(task).calls,guard:paths(task).guard,runDriver,env});
 return {scan,reconcile,close:async()=>resident?.close(),
  isCurrent,
  validateProof:async(task,p)=>{try{const {pre}=await proofFiles(task,p),s=await bindingCurrent();if(s.checkpoint>Number(task.validUntilCheckpoint))return false;const url=s.network.realm_configs.find(r=>r.id===Math.floor(o.vaultId/s.network.users_per_realm)).rpc_url[0],args={checkpoint_id:s.checkpoint,user_id:o.vaultId};const [leaf,hash]=await readTogether([s.rpc(url,'psy_get_user_leaf_data',args,{exactIntegers:true}),s.rpc(url,'psy_get_user_tree_leaf_hash',args)]);return integer(leaf.nonce)+1n===pre.core.new_user_leaf.nonce&&(hash===pre.core.state_transition.start_user_leaf_hash||(integer(leaf.nonce)===0n&&pre.core.state_transition.start_user_leaf_hash==='0'.repeat(64)));}catch(e){if(e.code==='ENOENT')return false;throw e;}},
  prove:async task=>{bindCompactRequest(task,files.policy);await bindingCurrent();await pinCurrent();await driver.check();const q=paths(task);await publish(q.calls,task.submission);await publish(q.guard,{identity,dependencies,validUntilCheckpoint:Number(task.validUntilCheckpoint)});let out,result,liveRecovery;const pending=await pendingPreflight(root(task),await recoveryOptions(task));if(pending)return finishProof(task,pending.directory,await recoverCandidate(task,pending));
   for(let attempt=0;attempt<2;attempt++){
    out=join(root(task),'proof-'+randomUUID());await publish(out+'.producer.json',{driverSha256:driver.sha256,taskSha256:sha256(task.submission+'\n'+task.validUntilCheckpoint),policySha256:sha256(await readFile(o.policy)),rpcConfigSha256:sha256(await readFile(o.rpcConfig))});
    try{const args=['preflight',o.policy,o.rpcConfig,q.calls,q.guard,out];const active=await requireResident();result=active?await active.prove(args):await runDriver(driver.file,args,{env,timeout:900000,maxBuffer:2000000});}
    catch(error){
     await publish(out+'.preflight-failure.log',(error.stdout??'')+'\n'+(error.stderr??''));
     const candidate=await savedPreflightCandidate(out,await recoveryOptions(task));if(candidate){await resident?.close();resident=null;liveRecovery=await recoverCandidate(task,candidate);result={stdout:'reused exact persisted crypto candidate after native live verification',stderr:''};break;}
     if(!await preSessionTransportFailure(out,retryUrls,o.publicKeyHash))throw error;
     if(!await isCurrent(task))throw Error('pre-session transport failure: original task no longer current; no retry');
     if(attempt!==0){await resident?.close();resident=null;throw new ReadUnavailable('verified pre-session RPC failure after bounded retries; no UPS or broadcast exists',{cause:error});}
     await publish(out+'.read-retry.json',{version:1,attempt:1,reason:'verified pre-call transport failure',failedDirectory:out,financialBroadcastRetry:false,newSession:true,originalWindowUnchanged:true,scope:'one bounded read-only preflight restart; no request/preflight/prepared/intent exists in failed directory'});
     await resident?.close();resident=null;continue;
    }
    await publish(out+'.preflight.log',(result.stdout??'')+'\n'+(result.stderr??''));break;
   }
   return finishProof(task,out,liveRecovery);},
  prepareSubmission:async(task,p)=>({...p,submissionDirectory:join(root(task),'send-'+randomUUID())}),
  submit:async(task,p)=>{await bindingCurrent();await pinCurrent();await driver.check();await proofFiles(task,p);const out=safePath(task,'send',p.submissionDirectory),q=paths(task);let error;try{await submitDriver(driver.file,['broadcast-prepared',o.policy,o.rpcConfig,q.calls,q.guard,p.preparedDirectory,p.manifestSha256,out],{env,timeout:900000,logFile:out+'.log'});}catch(e){error=e.message;}return {error,preparedManifestSha256:p.manifestSha256,submissionDirectory:out,reproved:false};}
 };
}
