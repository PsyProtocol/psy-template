// Registration is not a financial UPS. Its exact public identity has its own
// durable send intent, and unknown sends are reconciled without another send.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sealDriver} from './sealedDriver.mjs';
import {captureInputs} from './submissionGuard.mjs';
import {ExecutionJournal} from './journal.mjs';
import {publicState} from './publicState.mjs';
import {runDurableSubmission,driverRecords} from './driverProcess.mjs';
import {publishFile} from './durableFile.mjs';
import {sha256} from './requestBinding.mjs';
import {assertDurableRuntimeDirectory} from './runtimeStorage.mjs';
import {parseLosslessJson} from '../amm/u124/client.mjs';
export async function continueFundedRegistration(o,{readState=publicState,runDriver=promisify(execFile),submitDriver=runDurableSubmission}={}){
 assert.equal(o.profile,'source-funded-v14');assertDurableRuntimeDirectory(o.runtimeDirectory);
 const policy=JSON.parse(await readFile(o.policy,'utf8'));assert.equal(policy.version,14);assert.equal(policy.qualified_randomness,false);
 assert.equal(policy.executor_binding.sdk_commit,'c92880c8b6e2c8d392f19368bc8801a2584fd427');
 const unchanged=await captureInputs([o.policy,o.rpcConfig]),driver=await sealDriver(o);
 const root=join(o.runtimeDirectory,'funded-registration',o.network,o.publicKeyHash);await mkdir(root,{recursive:true,mode:0o700});
 const lock=new ExecutionJournal({directory:root,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
 const env={...process.env,PSY_NETWORK:'testnet',PSY_MARKET_TESTNET_PROFILE:o.testnetProfile,RAYON_NUM_THREADS:String(o.proverThreads??2)};
 return lock.locked(async()=>{
  await unchanged();await driver.check();const identity=driverRecords((await runDriver(driver.file,['identity',o.policy],{env,timeout:180000,maxBuffer:2000000})).stdout).find(r=>r.profile==='source-funded-v14');
  assert.equal(identity?.publicKeyHash,o.publicKeyHash);assert.equal(identity?.fingerprint,o.fingerprint);
  const state=await readState(o.rpcConfig);assert.equal(state.networkName,o.network);
  assert.equal((await state.rpc(state.network.realm_configs[0].rpc_url[0],'psy_get_checkpoint_leaf_data',{checkpoint_id:1},{exactIntegers:true})).global_chain_root,policy.executor_binding.chain_root);
  const ids=await state.userIds(o.publicKeyHash),marker=join(root,'attempt.json');let original;
  try{original=JSON.parse(await readFile(marker,'utf8'));assert.equal(original.driverSha256,driver.sha256);assert.equal(original.policySha256,sha256(await readFile(o.policy)));assert.equal(original.publicKeyHash,o.publicKeyHash);assert.equal(original.expectedUserId,o.vaultId);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(ids.length){
   assert.deepEqual(ids,[o.vaultId],'registration assigned another identity; review/rebind the instance before funding');
   const out=join(root,'verified-'+randomUUID());await runDriver(driver.file,['check-registration',o.policy,o.rpcConfig,String(o.vaultId),out],{env,timeout:180000,maxBuffer:2000000});
   const raw=await readFile(join(out,'verification.json')),v=parseLosslessJson(raw.toString());
   assert.equal(v.registered,true);assert.equal(v.broadcast,false);assert.equal(v.userId,BigInt(o.vaultId));assert.equal(v.publicKeyHash,o.publicKeyHash);assert.equal(v.fingerprint,o.fingerprint);assert.equal(v.chainRoot,policy.executor_binding.chain_root);
   return{status:'registered',userId:o.vaultId,verificationDirectory:out,verificationSha256:sha256(raw),submitted:false};
  }
  if(original)return{status:'unresolved-registration',original,submitted:false,retryAllowed:false};
  assert.equal(policy.executor_binding.allow_broadcast,true,'instance-specific release is not enabled for registration');
  const out=join(root,'send-'+randomUUID()),intent={driverSha256:driver.sha256,policySha256:sha256(await readFile(o.policy)),publicKeyHash:o.publicKeyHash,expectedUserId:o.vaultId,chainRoot:policy.executor_binding.chain_root,directory:out,retryAllowed:false};
  await publishFile(marker,JSON.stringify(intent)+'\n');
  // Native validates the reviewed dependencies and chain again before saving
  // its exact request/intent and invoking register_user exactly once.
  let error;try{await submitDriver(driver.file,['register',o.policy,o.rpcConfig,out],{env,timeout:180000,logFile:out+'.log'});}catch(e){error=e.message;}
  return{status:'registration-pending',original:intent,error,submitted:true,retryAllowed:false};
 });
}
