import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{preSessionTransportFailure}from'./preSessionRetry.mjs';
const failure={ok:false,broadcastMayHaveBeenAttempted:false,phase:'start-compact-session',reason:'Connection error to https://realm.test: error sending request for url (https://realm.test/)'};
async function check(f,extra,key){const dir=await mkdtemp(join(tmpdir(),'psy-pre-session-'));try{await writeFile(join(dir,'failure.json'),JSON.stringify(f));if(extra)await writeFile(join(dir,extra),'{}');return await preSessionTransportFailure(dir,['https://realm.test/'],key);}finally{await rm(dir,{recursive:true,force:true})}}
test('only exact pre-session transport failure without any UPS material qualifies',async()=>{assert.equal(await check(failure),true);for(const file of ['request.json','prepared.json','intent.json','preflight.json'])assert.equal(await check(failure,file),false);});
test('post-call, unknown send, arbitrary errors and foreign endpoints never qualify',async()=>{for(const patch of [{phase:'prove-compact-calls'},{broadcastMayHaveBeenAttempted:true},{reason:'assertion failed'},{reason:failure.reason.replace('realm.test','foreign.test')},{ok:true}])assert.equal(await check({...failure,...patch}),false);});
test('SDK registration wrapper qualifies only for the bound identity and known transport cause',async()=>{
 const key='a'.repeat(64),wrapped={...failure,reason:`User ${key} not registered. Please register first: `+failure.reason};
 assert.equal(await check(wrapped,undefined,key),true);assert.equal(await check(wrapped),false);assert.equal(await check(wrapped,undefined,'b'.repeat(64)),false);
 assert.equal(await check({...wrapped,reason:`User ${key} not registered. Please register first: account absent`},undefined,key),false);
 assert.equal(await check(wrapped,'request.json',key),false);assert.equal(await check({...wrapped,phase:'prove-compact-calls'},undefined,key),false);
});
test('observed SDK Request error qualifies only before calls, without proof material and with both URLs bound',async()=>{
 const request={...failure,automaticRetry:false,reason:failure.reason.replace('Connection error','Request error')};assert.equal(await check(request),true);
 for(const patch of [{automaticRetry:true},{phase:'check-prepared-live-state'},{phase:'prove-compact-calls'},{reason:request.reason.replace('(https://realm.test/)','(https://foreign.test/)')},{reason:'Request error to https://realm.test: HTTP status client error (401 Unauthorized)'},{reason:'Request error to https://realm.test: invalid contract state'}])assert.equal(await check({...request,...patch}),false);
 for(const file of ['request.json','prepared.json','intent.json','preflight.json'])assert.equal(await check(request,file),false);
});
