import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {residentProver} from './residentProver.mjs';
import {publicState} from './publicState.mjs';
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
const publish=async(p,v)=>{await mkdir(dirname(p),{recursive:true,mode:0o700});const text=typeof v==='string'?v:JSON.stringify(v,null,2)+'\n';try{await publishFile(p,text);}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(p,'utf8'),text,'immutable Executor artifact changed');}};
export function bindCompactRequest(task,policy){
 assert.equal(task.profile,'compact-v1');const r=parseLosslessJson(task.submission),f=r.software_defined_call.inputs;
 assert.deepEqual(r,parseLosslessJson(losslessJson(compactRequest(policy,f))),'complete compact request differs');
 assert.equal(task.kind,['','batch_commit','batch_settle','batch_expire','batch_maintenance'][Number(f[0])],'compact task mode');
 assert.ok(Number.isSafeInteger(Number(task.validUntilCheckpoint))&&BigInt(task.validUntilCheckpoint)>0n&&BigInt(task.validUntilCheckpoint)<2n**32n);
 return r;
}
export async function createCompactAdmissionAdapter(o,{readState=publicState,readReceipts=receiptReader,runDriver,submitDriver=runDurableSubmission}={}){
 assert.equal(o.profile,'batch-admission-compact-v1');
 const assets=o.kind==='nftmarket'?[o.paymentToken,o.collection]:[o.assetA,o.assetB];
 const inputsCurrent=await captureInputs([o.abi,o.driverConfig,o.policy,o.rpcConfig,o.dependencyBindings,o.admissionPlan,...assets.map(a=>a.abi)]);
 const files=await loadBatchFiles(o);files.admissionPlan=validateAdmissionPlan(await json(o.admissionPlan));
 assert.ok(files.admissionPlan.members.every(m=>m.owner!==o.vaultId&&m.owner!==o.batchSponsorId),'plan members must differ from vault and batch sponsor');
 const [token,other]=await Promise.all(assets.map(a=>json(a.abi)));validateU124TokenAbi(token);if(o.kind==='nftmarket')validateNftAbi(other);else validateU124TokenAbi(other);
 assert.deepEqual(files.policy,makeAdmissionPolicy(o.kind,o.contractId,files.config,files.abi,token,o.kind==='nftmarket'?other:undefined),'admission policy differs from ABI/config');
 for(const [a,id]of assets.map((a,i)=>[a,o.kind==='nftmarket'?(i===0?files.config.tokenId:files.config.nftId):(i===0?files.config.assetA:files.config.assetB)]))assert.equal(a.contractId,id);
 const dependencies=await json(o.dependencyBindings),required=[...new Set(files.policy.branches.flatMap(b=>b.calls.map(c=>c.contract_id)))].sort((a,b)=>a-b);
 assert.ok(Array.isArray(dependencies));assert.deepEqual(dependencies.map(b=>b.contract.contractId).sort((a,b)=>a-b),required,'complete dependency whitelist');
 for(const c of [{contractId:o.contractId,codeRoot:o.codeRoot,layoutRoot:o.layoutRoot},...assets]){const b=dependencies.find(b=>b.contract.contractId===c.contractId);assert.equal(b.contract.codeRoot,c.codeRoot);assert.equal(b.contract.layoutRoot,c.layoutRoot);}
 const identity={version:1,network:o.network,marketId:o.contractId,vaultId:o.vaultId,fingerprint:o.fingerprint,publicKeyHash:o.publicKeyHash,contracts:dependencies.map(b=>b.contract)};
 const pin=join(o.runtimeDirectory,'bindings',o.network,String(o.vaultId),o.fingerprint+'-compact.json');await publish(pin,{identity,dependencies,testnetProfile:o.testnetProfile});
 const bindingCurrent=async()=>{await inputsCurrent();const s=await readState(o.rpcConfig);assert.equal(s.networkName,o.network);assert.equal(BigInt(s.network.magic),BigInt(files.config.networkMagic));
  for(const b of dependencies){const l=await s.contractLeaf(b.contract.contractId);assert.deepEqual({contract:{contractId:b.contract.contractId,codeRoot:l.code_root,layoutRoot:l.state_layout_root,stateTreeHeight:l.state_tree_height},functionTreeRoot:l.function_tree_root,layoutFieldCount:l.state_layout_field_count,layoutSlotCount:l.state_layout_slot_count},b,'live compact dependency changed');}
  assert.deepEqual(await s.userIds(o.publicKeyHash),[o.vaultId],'compact registered identity');await inputsCurrent();return s;};
 await bindingCurrent();const pinCurrent=await captureInputs([pin]),driver=await sealDriver(o);
 const env={...process.env,PSY_MARKET_TESTNET_PROFILE:o.testnetProfile,RAYON_NUM_THREADS:String(o.proverThreads??2)};for(const k of Object.keys(env))if(k.endsWith('_WITNESS_WALLET')||k.endsWith('_LOCAL_DEFS'))delete env[k];
 const resident=o.proverMode==='resident'?residentProver(driver.file,o.policy,o.rpcConfig,{env}):null;
 const id=driverRecords((await runDriver(driver.file,['identity',o.policy],{env,timeout:120000,maxBuffer:2000000})).stdout).find(r=>r.profile==='compact-v1');assert.equal(id?.fingerprint,o.fingerprint);assert.equal(id?.publicKeyHash,o.publicKeyHash);
 const reader=await readReceipts(o.rpcConfig,{maxPages:o.receiptMaxPages??20});
 const root=task=>join(o.runtimeDirectory,'compact',o.network,String(o.vaultId),sha256(task.submission+'\n'+task.validUntilCheckpoint));
 const paths=task=>({calls:join(root(task),'calls.json'),guard:join(root(task),'guard.json')});
 const safePath=(task,prefix,p)=>{assert.ok(typeof p==='string'&&p.startsWith(join(root(task),prefix)+'-')&&/^[0-9a-f-]{36}$/.test(p.slice((join(root(task),prefix)+'-').length)),'compact attempt path binding');return p;};
 const scan=async()=>{await bindingCurrent();return scanExecutorAdmission(o,readState,files);};
 const proofFiles=async(task,p)=>{assert.equal(p.version,1);assert.equal(p.driverSha256,driver.sha256);safePath(task,'proof',p.preparedDirectory);const m=await readFile(join(p.preparedDirectory,'prepared.json'));assert.equal(sha256(m),p.manifestSha256);const v=JSON.parse(m);
  const q=paths(task);for(const[file,hash]of [[o.policy,v.policySha256],[q.calls,v.callsSha256],[q.guard,v.guardSha256],[join(p.preparedDirectory,'preflight.json'),v.preflightSha256],[join(p.preparedDirectory,'request.json'),v.requestSha256]])assert.equal(sha256(await readFile(file)),hash,'prepared artifact changed');
  assert.equal(await readFile(q.calls,'utf8'),task.submission);const pre=await json(join(p.preparedDirectory,'preflight.json'));assert.equal(pre.fullUpsVerified,true);assert.equal(pre.exactStackAndSessionVerified,true);assert.equal(pre.broadcast,false);assert.equal(pre.callsSha256,v.callsSha256);assert.equal(pre.guardSha256,v.guardSha256);assert.equal(pre.core.new_user_leaf.user_id,o.vaultId);assert.equal(pre.core.new_user_leaf.public_key,o.publicKeyHash);return {manifest:v,pre};};
 const reconcile=async attempt=>{const p=attempt.proof;await proofFiles(attempt.task,p);const out=safePath(attempt.task,'send',p.submissionDirectory);
  let intent;try{intent=await json(join(out,'intent.json'));}catch(e){if(e.code!=='ENOENT')throw e;let f;try{f=await json(join(out,'failure.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(f?.ok===false&&f.broadcastMayHaveBeenAttempted===false)return {status:'not-submitted',reason:f.reason,source:'explicit-compact-driver-rejection'};
   return {status:'unresolved',reason:'No durable broadcast identity; child may still be running. Never automatically re-sign.'};}
  const {manifest:m,pre}=await proofFiles(attempt.task,p),verified=await json(join(out,'verification.json'));
  assert.equal(verified.fullUpsVerified,true);assert.equal(verified.reproved,false);assert.equal(verified.preparedManifestSha256,p.manifestSha256);assert.equal(verified.requestSha256,m.requestSha256);assert.equal(intent.requestSha256,m.requestSha256);assert.equal(intent.endUserLeafHash,pre.core.state_transition.end_user_leaf_hash);assert.equal(intent.userId,o.vaultId);assert.equal(intent.nonce,pre.core.new_user_leaf.nonce);
  const receipt=await reader({userId:o.vaultId,endUserLeafHash:intent.endUserLeafHash,minCheckpoint:pre.core.checkpoint_id});if(receipt.status==='included'){const common=await readState(o.rpcConfig);if(common.checkpoint<receipt.checkpoint)return {status:'unresolved',reason:'included-awaiting-common-state',includedReceipt:receipt,commonCheckpoint:common.checkpoint};return {...receipt,commonCheckpoint:common.checkpoint};}return receipt;};
 return {scan,reconcile,close:async()=>resident?.close(),
  isCurrent:async task=>{bindCompactRequest(task,files.policy);await pinCurrent();await driver.check();const s=await bindingCurrent();if(BigInt(s.checkpoint)>BigInt(task.validUntilCheckpoint))return false;const next=(await scanExecutorAdmission(o,async()=>s,files)).action;if(!next)return false;
   const x=structuredClone(next),a=bindCompactRequest(task,files.policy),b=bindCompactRequest(next,files.policy);if(a.software_defined_call.inputs[0]===1n){const f=b.software_defined_call.inputs;f[3]=a.software_defined_call.inputs[3];if(f[3]<=BigInt(s.checkpoint)||f[3]>BigInt(s.checkpoint)+1024n)return false;x.submission=losslessJson(compactRequest(files.policy,f));}x.validUntilCheckpoint=task.validUntilCheckpoint;return JSON.stringify(x)===JSON.stringify(task);},
  validateProof:async(task,p)=>{try{const {pre}=await proofFiles(task,p),s=await bindingCurrent();if(s.checkpoint>Number(task.validUntilCheckpoint))return false;const url=s.network.realm_configs.find(r=>r.id===Math.floor(o.vaultId/s.network.users_per_realm)).rpc_url[0],args={checkpoint_id:s.checkpoint,user_id:o.vaultId};const leaf=await s.rpc(url,'psy_get_user_leaf_data',args),hash=await s.rpc(url,'psy_get_user_tree_leaf_hash',args);return leaf.nonce+1===pre.core.new_user_leaf.nonce&&(hash===pre.core.state_transition.start_user_leaf_hash||(leaf.nonce===0&&pre.core.state_transition.start_user_leaf_hash==='0'.repeat(64)));}catch(e){if(e.code==='ENOENT')return false;throw e;}},
  prove:async task=>{bindCompactRequest(task,files.policy);await bindingCurrent();await pinCurrent();await driver.check();const q=paths(task);await publish(q.calls,task.submission);await publish(q.guard,{identity,dependencies,validUntilCheckpoint:Number(task.validUntilCheckpoint)});const out=join(root(task),'proof-'+randomUUID());
   let result;try{const args=['preflight',o.policy,o.rpcConfig,q.calls,q.guard,out];result=resident?await resident.prove(args):await runDriver(driver.file,args,{env,timeout:900000,maxBuffer:2000000});}catch(error){await publish(out+'.preflight-failure.log',(error.stdout??'')+'\n'+(error.stderr??''));throw error;}await publish(out+'.preflight.log',(result.stdout??'')+'\n'+(result.stderr??''));await inputsCurrent();await pinCurrent();await driver.check();const p={version:1,driverSha256:driver.sha256,preparedDirectory:out,manifestSha256:sha256(await readFile(join(out,'prepared.json')))};await proofFiles(task,p);return p;},
  prepareSubmission:async(task,p)=>({...p,submissionDirectory:join(root(task),'send-'+randomUUID())}),
  submit:async(task,p)=>{await bindingCurrent();await pinCurrent();await driver.check();await proofFiles(task,p);const out=safePath(task,'send',p.submissionDirectory),q=paths(task);let error;try{await submitDriver(driver.file,['broadcast-prepared',o.policy,o.rpcConfig,q.calls,q.guard,p.preparedDirectory,p.manifestSha256,out],{env,timeout:900000,logFile:out+'.log'});}catch(e){error=e.message;}return {error,preparedManifestSha256:p.manifestSha256,submissionDirectory:out,reproved:false};}
 };
}
