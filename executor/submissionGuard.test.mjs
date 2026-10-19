import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {captureInputs,publishSubmissionGuard} from './submissionGuard.mjs';
import {inspectU124Submission} from './u124Submission.mjs';
const root='a'.repeat(64),options={network:'test',contractId:1000,vaultId:100,fingerprint:root,publicKeyHash:root};
const policy={branches:[{calls:[0,42,1000].map(contract_id=>({contract_id}))}]};
const contracts=[0,42,1000].map(contractId=>({contractId,codeRoot:root,layoutRoot:root,stateTreeHeight:contractId===0?32:31}));
async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'psy-submission-guard-'));try{await fn(directory);}finally{await rm(directory,{recursive:true,force:true});}}
test('every policy dependency including native PSY is pinned and restart cannot rebaseline it',()=>fixture(async directory=>{
 const o={...options,runtimeDirectory:directory};
 for(let i=0;i<contracts.length;i++)await assert.rejects(publishSubmissionGuard(o,policy,contracts.filter((_,j)=>i!==j)),/every policy contract/);
 await assert.rejects(publishSubmissionGuard(o,policy,[...contracts,contracts[0]]),/duplicate guard contract/);
 const first=await publishSubmissionGuard(o,policy,contracts);
 const saved=JSON.parse(await readFile(first.file,'utf8'));assert.deepEqual(saved.contracts,contracts);assert.equal(saved.vaultId,100);
 const again=await publishSubmissionGuard(o,policy,contracts);assert.equal(again.file,first.file);
 for(const key of ['codeRoot','layoutRoot','stateTreeHeight']){
  const changed=structuredClone(contracts);changed[0][key]=key==='stateTreeHeight'?31:'b'.repeat(64);
  await assert.rejects(publishSubmissionGuard(o,policy,changed),/persisted submission bindings changed/);
 }
 assert.deepEqual(JSON.parse(await readFile(first.file,'utf8')),saved);
}));
test('ABI, policy and RPC replacements are detected without printing file contents',()=>fixture(async directory=>{
 const file=join(directory,'rpc.json');await writeFile(file,'{"endpoint":"original"}');const check=await captureInputs([file,file]);await check();
 await writeFile(file,'{"endpoint":"replacement"}');await assert.rejects(check(),error=>/input changed/.test(error.message)&&!error.message.includes('replacement'));
 await rm(file);await assert.rejects(check(),{code:'ENOENT'});
}));
test('a new guarded broadcast cannot be accepted from an old unguarded driver',()=>{
 const binding={...options,requireGuard:true},leaf='e'.repeat(64);
 const verified={fullUpsVerified:true,submitted:false,marketId:1000,fingerprint:root,fee:1000000000,endUserLeafHash:leaf};
 const broadcast={status:'broadcast_intent',userId:100,nonce:1,endUserLeafHash:leaf};
 const log=(...rs)=>rs.map(r=>JSON.stringify(r)).join('\n');
 assert.throws(()=>inspectU124Submission(log(verified,broadcast),binding),/guard verification missing/);
 assert.equal(inspectU124Submission(log({...verified,submissionGuardVerified:true},broadcast),binding).endUserLeafHash,leaf);
 // Existing attempts remain recoverable without authorizing a new submission.
 assert.equal(inspectU124Submission(log(verified,broadcast),{...binding,requireGuard:false}).endUserLeafHash,leaf);
});
