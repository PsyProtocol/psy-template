import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
import{residentScope}from'./residentScope.mjs';import{sha256}from'./requestBinding.mjs';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'resident-scope-'));try{const binary=join(dir,'binary'),policy=join(dir,'policy'),config=join(dir,'config'),copy=join(dir,'copy');for(const[p,v]of[[binary,'driver'],[policy,'policy'],[copy,'policy'],[config,'config']])await writeFile(p,v);const binding={driverSha256:sha256('driver'),policySha256:sha256('policy'),rpcSha256:sha256('config'),identity:{network:'qa',key:'a',code:'b',layout:'c'},dependencies:['asset-a','asset-b'],env:{RAYON_NUM_THREADS:'2'}};await fn({binary,policy,config,copy,binding});}finally{await rm(dir,{recursive:true,force:true});}}
test('warm leases reuse only exact immutable bindings and reject changed files before native access',()=>fixture(async f=>{
 let starts=0,warms=0;const scope=residentScope({create:()=>{starts++;return{warm:async()=>{warms++;return{residentStartup:{sessionConstructionMs:1}};},close:async()=>{}};}});
 const a=await scope.acquire(f.binding,f.binary,f.policy,f.config,{env:f.binding.env});await a.warm();await a.close();
 const b=await scope.acquire(f.binding,f.binary,f.copy,f.config,{env:f.binding.env});await b.warm();assert.equal(starts,1);assert.equal(warms,2);
 await writeFile(f.config,'changed-network');await assert.rejects(b.warm(),/network config changed/);assert.equal(warms,2);await b.close();await scope.close();
}));
test('stages retain exact resources while each job supplies new calls, guards and output',()=>fixture(async f=>{
 let starts=0,stops=0;const jobs=[],scope=residentScope({create:()=>{starts++;return{prove:async a=>{jobs.push(a);return{freshJob:jobs.length};},close:async()=>{stops++;}};}});
 const a=await scope.acquire(f.binding,f.binary,f.policy,f.config,{env:f.binding.env});await a.prove(['preflight',f.policy,f.config,'calls-1','guard-1','out-1']);await a.close();
 const b=await scope.acquire(f.binding,f.binary,f.copy,f.config,{env:f.binding.env});await b.prove(['preflight',f.copy,f.config,'calls-2','guard-2','out-2']);assert.equal(starts,1);assert.deepEqual(jobs[1],['preflight',f.policy,f.config,'calls-2','guard-2','out-2']);await assert.rejects(scope.close());await b.close();await scope.close();assert.equal(stops,1);await assert.rejects(b.prove([]));
}));
test('network, key, code/layout, dependency, driver and environment identity split scope',()=>fixture(async f=>{
 let starts=0;const scope=residentScope({maxEntries:4,create:()=>{starts++;return{close:async()=>{}};}});
 for(const binding of[f.binding,{...f.binding,identity:{...f.binding.identity,key:'other'}},{...f.binding,identity:{...f.binding.identity,code:'changed',layout:'changed'}},{...f.binding,env:{RAYON_NUM_THREADS:'4'}}]){const lease=await scope.acquire(binding,f.binary,f.policy,f.config,{env:binding.env});await lease.close();}
 assert.equal(starts,4);await assert.rejects(scope.acquire({...f.binding,dependencies:['new']},f.binary,f.policy,f.config,{env:f.binding.env}));await scope.close();
}));
test('changed original path and failed child cannot silently restart or reuse old resources',()=>fixture(async f=>{
 let starts=0,stops=0;const scope=residentScope({create:()=>{starts++;return{prove:async()=>{throw Error('preflight failed');},close:async()=>{stops++;}};}});
 const a=await scope.acquire(f.binding,f.binary,f.policy,f.config,{env:f.binding.env});await assert.rejects(a.prove(['preflight',f.policy,f.config,'c','g','o']));await assert.rejects(scope.acquire(f.binding,f.binary,f.copy,f.config,{env:f.binding.env}));assert.equal(starts,1);await a.close();assert.equal(stops,1);
 const b=await scope.acquire(f.binding,f.binary,f.copy,f.config,{env:f.binding.env});assert.equal(starts,2);await b.close();await writeFile(f.copy,'tampered');const c=await scope.acquire(f.binding,f.binary,f.policy,f.config,{env:f.binding.env});await assert.rejects(c.prove(['preflight',f.policy,f.config,'new','new','new']));await c.close();await scope.close();
}));
test('unconfirmed process exit stays an error across repeated scope closes',()=>fixture(async f=>{
 let exits=0;const scope=residentScope({create:()=>({close:async()=>{exits++;throw Error('exit unconfirmed');}})}),lease=await scope.acquire(f.binding,f.binary,f.policy,f.config,{env:f.binding.env});await lease.close();await assert.rejects(scope.close(),/exit unconfirmed/);await assert.rejects(scope.close(),/exit unconfirmed/);assert.equal(exits,1);await assert.rejects(scope.acquire(f.binding,f.binary,f.policy,f.config,{env:f.binding.env}));
}));
