// Formal single-stage v14 adapter. It uses the existing journal/worker and
// trusted native producer; a webpage cannot supply verification or send hooks.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseLosslessJson,losslessJson} from '../amm/u124/client.mjs';
import {sha256} from './requestBinding.mjs';
import {captureInputs} from './submissionGuard.mjs';
import {sealDriver} from './sealedDriver.mjs';
import {publishFile} from './durableFile.mjs';
import {runDurableSubmission} from './driverProcess.mjs';
import {publicState} from './publicState.mjs';
import {receiptReader} from './chainReceipts.mjs';
import {pendingPreflight,recheckSavedPreflight,savedPreflightCandidate} from './preflightRecovery.mjs';
import {driverRecords} from './driverProcess.mjs';
const read = async path => parseLosslessJson(await readFile(path,'utf8'));
const fresh = async(path,value)=>{await mkdir(dirname(path),{recursive:true,mode:0o700});const bytes=typeof value==='string'?value:losslessJson(value);try{await publishFile(path,bytes);}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(path,'utf8'),bytes,'immutable stream task changed');}};
const stageNames=new Map([[4n,'maintenance'],[5n,'open'],[6n,'cover'],[8n,'settle'],[9n,'abort'],[13n,'fee-grant'],[14n,'bootstrap']]);
export function validateFundedStage(stage,policy,o){
 assert.equal(stage.schema,1n);assert.equal(stage.profile,'source-funded-v14');assert.equal(policy.version,14n);
 assert.equal(policy.profile,'source-covered-deterministic-funded-bootstrap-v1');assert.equal(policy.qualified_randomness,false);
 assert.equal(policy.market_id,BigInt(o.contractId));assert.equal(policy.executor_binding.sdk_commit,'c92880c8b6e2c8d392f19368bc8801a2584fd427');
 assert.match(stage.stageId,/^[a-zA-Z0-9_-]{1,100}$/);assert.equal(stage.actor,BigInt(o.vaultId));
 const c=stage.context,f=c.request.fields;assert.equal(f.length,80);assert.ok(stageNames.has(f[0]),'reviewed deterministic stage');
 assert.equal(c.source.fields.length,41);assert.equal(c.source.fields[3],BigInt(o.contractId));assert.equal(c.source.fields[4],BigInt(o.vaultId));
 assert.equal(c.expected_nonce,stage.expectedNonce);assert.ok(c.expected_nonce>0n&&c.expected_nonce<2n**62n);assert.match(c.expected_start_leaf,/^[a-f0-9]{64}$/);
 assert.ok(c.execution_checkpoint>0n&&c.execution_checkpoint<=stage.validUntilCheckpoint&&stage.validUntilCheckpoint<2n**32n);
 assert.ok(f[73]>=1_000_000_000n&&f[73]<=1_000_100_000n&&f[73]<=stage.maximumFee,'approved exact bounded fee');
 if(f[0]===5n)assert.equal(c.execution_checkpoint,c.source.fields[6],'post-funding source checkpoint must be fresh');
 if(f[0]===14n){assert.equal(c.expected_start_leaf,'0'.repeat(64));assert.equal(c.expected_nonce,1n);}
 for(const name of ['minimum','random','accepted_seal'])assert.ok(c.request[name]===undefined||c.request[name]===null,'deterministic-only stage');
 assert.equal(policy.base.config.feeOwner,policy.fee_owner);assert.ok(policy.fee_owner!==BigInt(o.vaultId));
 return {profile:'source-funded-v14',kind:'stream_'+stageNames.get(f[0]),stageId:stage.stageId,
  submission:losslessJson(stage),validUntilCheckpoint:stage.validUntilCheckpoint.toString()};
}
export async function createFundedStreamAdapter(o,{readState=publicState,readReceipts=receiptReader,runDriver=promisify(execFile),submitDriver=runDurableSubmission}={}){
 assert.equal(o.profile,'source-funded-v14');assert.ok(['amm','bondingcurve'].includes(o.kind));
 const policy=await read(o.policy),stage=await read(o.streamTask),task=validateFundedStage(stage,policy,o);
 const name=policy.executor_binding.review;assert.ok(typeof name==='string'&&!isAbsolute(name)&&name.split(/[\\/]/).every(p=>p&&p!=='.'&&p!=='..'));
 const reviewPath=resolve(dirname(o.policy),name),rawReview=await readFile(reviewPath);assert.equal(sha256(rawReview),policy.executor_binding.review_sha256);
 const review=parseLosslessJson(rawReview.toString()),artifacts=[review,...review.assets].map(row=>{
  assert.ok(!isAbsolute(row.artifact)&&row.artifact.split(/[\\/]/).every(p=>p&&p!=='.'&&p!=='..'));return {path:resolve(dirname(reviewPath),row.artifact),sha:row.artifact_sha256};
 });
 for(const item of artifacts)assert.equal(sha256(await readFile(item.path)),item.sha);
 const inputs=await captureInputs([o.policy,o.streamTask,o.rpcConfig,o.dependencyBindings,o.abi,o.driverConfig,o.assetA.abi,o.assetB.abi,reviewPath,...artifacts.map(a=>a.path)]);
 const dependencies=JSON.parse(await readFile(o.dependencyBindings,'utf8'));
 assert.deepEqual(dependencies.map(d=>d.contract.contractId).sort((a,b)=>a-b),[0,Number(policy.base.config.assetA),Number(policy.base.config.assetB),o.contractId].sort((a,b)=>a-b));
 for(const expected of [{contractId:o.contractId,codeRoot:o.codeRoot,layoutRoot:o.layoutRoot},o.assetA,o.assetB]){const actual=dependencies.find(d=>d.contract.contractId===expected.contractId);assert.equal(actual.contract.codeRoot,expected.codeRoot);assert.equal(actual.contract.layoutRoot,expected.layoutRoot);}
 const identity={version:1,network:o.network,marketId:o.contractId,vaultId:o.vaultId,fingerprint:o.fingerprint,publicKeyHash:o.publicKeyHash,contracts:dependencies.map(d=>d.contract)};
 const driver=await sealDriver(o),env={...process.env,PSY_NETWORK:'testnet',PSY_MARKET_TESTNET_PROFILE:o.testnetProfile,RAYON_NUM_THREADS:String(o.proverThreads??2)};
 for(const key of Object.keys(env))if(key.endsWith('_WITNESS_WALLET')||key.endsWith('_LOCAL_DEFS')||key==='PSY_MARKET_BENCH_SOURCE_CHECKPOINT')delete env[key];
 const declared=driverRecords((await runDriver(driver.file,['identity',o.policy],{env,timeout:180000,maxBuffer:2000000})).stdout).find(r=>r.profile==='source-funded-v14');
 assert.ok(declared);assert.equal(declared.fingerprint,o.fingerprint);assert.equal(declared.publicKeyHash,o.publicKeyHash);
 const chainCurrent=async()=>{await inputs();await driver.check();const s=await readState(o.rpcConfig);assert.equal(s.networkName,o.network);
  assert.equal(BigInt(s.network.magic),policy.base.config.networkMagic?BigInt(policy.base.config.networkMagic):stage.context.source.fields[1]);
  assert.equal((await s.rpc(s.network.realm_configs[0].rpc_url[0],'psy_get_checkpoint_leaf_data',{checkpoint_id:1},{exactIntegers:true})).global_chain_root,policy.executor_binding.chain_root,'chain instance changed');return s;};
 const current=async()=>{const s=await chainCurrent();
  assert.deepEqual(await s.userIds(o.publicKeyHash),[o.vaultId]);
  for(const b of dependencies){const l=await s.contractLeaf(b.contract.contractId);assert.deepEqual({contract:{contractId:b.contract.contractId,codeRoot:l.code_root,layoutRoot:l.state_layout_root,stateTreeHeight:l.state_tree_height},functionTreeRoot:l.function_tree_root,layoutFieldCount:l.state_layout_field_count,layoutSlotCount:l.state_layout_slot_count},b);}
  return s;};
 const c=stage.context,root=join(o.runtimeDirectory,'funded-stream',o.network,String(o.vaultId),sha256(task.submission));
 const callsPath=join(root,'calls.json'),guardPath=join(root,'guard.json');
 const reader=await readReceipts(o.rpcConfig,{maxPages:o.receiptMaxPages??20,expectedNetwork:o.network});
 const inside=path=>{assert.ok(typeof path==='string'&&dirname(resolve(path))===resolve(root),'owned stream output path required');return path;};
 const proofFiles=async p=>{inside(p.preparedDirectory);assert.equal(p.driverSha256,driver.sha256);await inputs();await driver.check();
  const bytes=await readFile(join(p.preparedDirectory,'prepared.json'));assert.equal(sha256(bytes),p.manifestSha256);
  const m=JSON.parse(bytes);assert.equal(m.version,1);const request=await read(join(p.preparedDirectory,'request.json')),pre=await read(join(p.preparedDirectory,'preflight.json'));
  for(const [key,path]of [['policySha256',o.policy],['callsSha256',callsPath],['guardSha256',guardPath],['requestSha256',join(p.preparedDirectory,'request.json')],['preflightSha256',join(p.preparedDirectory,'preflight.json')],['streamContextSha256',join(p.preparedDirectory,'stream-context.json')],['streamKeyProofSha256',join(p.preparedDirectory,'stream-sign-proof.bin')]])assert.equal(m[key],sha256(await readFile(path)));
  assert.equal(pre.persistenceProfile,'crypto-before-final-guard-v1');assert.equal(pre.benchmarkSourceCheckpoint,null);assert.equal(pre.fullUpsVerified,true);assert.equal(pre.exactStackAndSessionVerified,true);assert.equal(pre.broadcast,false);assert.equal(pre.profile,'source-funded-v14');
  assert.equal(pre.core.checkpoint_id,c.execution_checkpoint);assert.ok(pre.fee<=stage.maximumFee);assert.equal(pre.fee,c.request.fields[73]);assert.deepEqual(pre.core,request.user_ec_input.core);assert.equal(pre.core.new_user_leaf.user_id,BigInt(o.vaultId));assert.equal(pre.core.new_user_leaf.public_key,o.publicKeyHash);assert.equal(pre.core.new_user_leaf.nonce,c.expected_nonce);assert.equal(pre.core.state_transition.start_user_leaf_hash,c.expected_start_leaf);
  if(p.liveRecovery){inside(p.liveRecovery.directory);const bytes=await readFile(join(p.liveRecovery.directory,'verification.json'));assert.equal(sha256(bytes),p.liveRecovery.verificationSha256);const v=JSON.parse(bytes);assert.equal(v.fullUpsVerified,true);assert.equal(v.exactStackAndSessionVerified,true);assert.equal(v.reproved,false);assert.equal(v.broadcast,false);assert.equal(v.requestSha256,m.requestSha256);assert.equal(v.preparedManifestSha256,p.manifestSha256);}
  else{const v=await read(join(p.preparedDirectory,'final-live-state.json'));assert.equal(v.liveGuardsPassed,true);assert.equal(v.broadcast,false);assert.equal(v.requestSha256,m.requestSha256);assert.equal(v.preparedManifestSha256,p.manifestSha256);}
  return {m,pre,request};};
 const isCurrent=async candidate=>{assert.deepEqual(candidate,task);const s=await current();if(BigInt(s.checkpoint)>stage.validUntilCheckpoint)return false;
  const realm=s.network.realm_configs.find(r=>r.id===Math.floor(o.vaultId/s.network.users_per_realm));assert.ok(realm);
  const hash=await s.rpc(realm.rpc_url[0],'psy_get_user_tree_leaf_hash',{checkpoint_id:s.checkpoint,user_id:o.vaultId});return hash===c.expected_start_leaf;};
 return {scan:async()=>{const s=await current();return{checkpoint:s.checkpoint,action:await isCurrent(task)?task:null,reason:'exact immutable v14 stage; lifecycle owns subsequent planning'};},isCurrent,
  validateProof:async(candidate,p)=>{assert.deepEqual(candidate,task);try{await proofFiles(p);return isCurrent(candidate);}catch(e){if(e.code==='ENOENT')return false;throw e;}},
  prove:async candidate=>{assert.deepEqual(candidate,task);assert.ok(await isCurrent(candidate),'stream state changed before proof');
   await fresh(callsPath,stage.calls);await fresh(guardPath,{identity,dependencies,validUntilCheckpoint:stage.validUntilCheckpoint,stream:c});
   const s=await readState(o.rpcConfig),urls=[...s.network.realm_configs,...(s.network.coordinator_configs??[])].flatMap(r=>r.rpc_url);
   const producer={driverSha256:driver.sha256,taskSha256:sha256(task.submission+'\n'+task.validUntilCheckpoint),policySha256:sha256(await readFile(o.policy)),rpcConfigSha256:sha256(await readFile(o.rpcConfig))};
   const existing=await pendingPreflight(root,{...producer,urls});let out,liveRecovery;
   if(existing){out=existing.directory;liveRecovery=await recheckSavedPreflight(existing,{root,driverFile:driver.file,policy:o.policy,rpcConfig:o.rpcConfig,calls:callsPath,guard:guardPath,runDriver,env});}
   else{
    const marker=join(root,'proof-attempt.json');try{await readFile(marker);throw Error('Original proof owner/result requires inspection; no replacement proof is started');}catch(e){if(e.code!=='ENOENT')throw e;}
    out=join(root,'proof-'+randomUUID());await fresh(marker,{...producer,directory:out});await fresh(out+'.producer.json',producer);
    try{await runDriver(driver.file,['preflight',o.policy,o.rpcConfig,callsPath,guardPath,out],{env,timeout:900000,maxBuffer:2000000});}catch(error){await fresh(out+'.failure.log',(error.stdout??'')+'\n'+(error.stderr??''));const saved=await savedPreflightCandidate(out,{...producer,urls});if(!saved)throw error;liveRecovery=await recheckSavedPreflight(saved,{root,driverFile:driver.file,policy:o.policy,rpcConfig:o.rpcConfig,calls:callsPath,guard:guardPath,runDriver,env});}
   }
   const p={version:1,driverSha256:driver.sha256,preparedDirectory:out,manifestSha256:sha256(await readFile(join(out,'prepared.json'))),...(liveRecovery?{liveRecovery}:{})};await proofFiles(p);return p;},
  prepareSubmission:async(candidate,p)=>{assert.equal(policy.executor_binding.allow_broadcast,true,'instance-specific release is not enabled for financial broadcast');assert.deepEqual(candidate,task);await proofFiles(p);return{...p,submissionDirectory:join(root,'send-'+randomUUID())};},
  submit:async(candidate,p)=>{assert.deepEqual(candidate,task);assert.ok(await isCurrent(candidate));await proofFiles(p);const out=inside(p.submissionDirectory);let error;
   try{await submitDriver(driver.file,['broadcast-prepared',o.policy,o.rpcConfig,callsPath,guardPath,p.preparedDirectory,p.manifestSha256,out],{env,timeout:900000,logFile:out+'.log'});}catch(e){error=e.message;}
   return{error,submissionDirectory:out,reproved:false};},
  reconcile:async attempt=>{await chainCurrent();assert.deepEqual(attempt.task,task);const {m,pre}=await proofFiles(attempt.proof);const out=inside(attempt.proof.submissionDirectory);let intent;
   try{intent=await read(join(out,'intent.json'));}catch(e){if(e.code!=='ENOENT')throw e;return{status:'unresolved',reason:'No original durable broadcast identity; never infer rejection or retry'};}
   assert.equal(intent.requestSha256,m.requestSha256);assert.equal(intent.userId,BigInt(o.vaultId));assert.equal(intent.nonce,c.expected_nonce);assert.equal(intent.endUserLeafHash,pre.core.state_transition.end_user_leaf_hash);
   const observed=await reader({userId:o.vaultId,endUserLeafHash:intent.endUserLeafHash,minCheckpoint:Number(pre.core.checkpoint_id)});
   if(observed.status==='included'){const common=await chainCurrent();if(common.checkpoint<observed.checkpoint)return{status:'unresolved',reason:'included-awaiting-common-state',includedReceipt:observed};}
   return observed;
  }};
}
