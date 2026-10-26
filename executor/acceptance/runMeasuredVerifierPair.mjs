// Start both samplers before the first measured child, stop after its cleanup.
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {existsSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../../batching/admission/liveSupport.mjs';import {saveObservation} from '../observations.mjs';import {freezeAppModules} from './sourceClosure.mjs';
const[base,original]=process.argv.slice(2);assert.ok(original);freezeAppModules(fileURLToPath(import.meta.url),base,'measurement-controller-v1');
const root=join(base,'public/MEASUREMENT-ROOT-v1.json'),exclude=join(base,'public/MEASUREMENT-EXCLUDE-v1.json');saveObservation(root,{pid:process.pid,startedAt:new Date().toISOString(),entry:'runMeasuredVerifierPair.mjs',scope:'owns both round processes and all financial/prover children'});
const observers=[],start=(script,args)=>{const p=spawn(process.execPath,[script,...args],{stdio:['ignore','ignore','inherit']});const exited=new Promise(resolve=>{p.once('error',error=>resolve({error:String(error)}));p.once('exit',(code,signal)=>resolve({code,signal}));});observers.push({p,exited});return p;};
const n=start('executor/acceptance/proverResourceObserver.mjs',[base,'resources-v1',join(base,'public/RELEASE.json')]);saveObservation(exclude,{pids:[n.pid]});
start('executor/acceptance/processTreeObserver.mjs',[base,root,exclude,'tree-resources-v1']);let ok=false;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(let i=0;i<150&&(!existsSync(join(base,'tree-resources-v1-READY.json'))||!existsSync(join(base,'resources-v1-IDENTITY.json')));i++){assert.ok(observers.every(x=>x.p.exitCode===null));await pause(100);}
 assert.ok(existsSync(join(base,'tree-resources-v1-READY.json')));assert.ok(existsSync(join(base,'resources-v1-IDENTITY.json')));
 await run(process.execPath,['executor/acceptance/runFixedVerifierComparison.mjs',base,original],join(base,'comparison-parent-v1.log'),{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2',PSY_MEASURED_GUARD_READ_RETRY:'1',PSY_REQUIRE_RESOURCE_HEARTBEAT:'1'});ok=true;
}finally{
 const outcomes=[];for(const x of observers){x.p.kill('SIGTERM');const result=await Promise.race([x.exited,pause(10000).then(()=>({timeout:true}))]);outcomes.push(result);if(result.timeout)x.p.kill('SIGKILL');}
 saveObservation(join(base,'public/MEASUREMENT-CONTROLLER-COMPLETE-v1.json'),{at:new Date().toISOString(),ok,observerOutcomes:outcomes,scope:'financial failure never automatically resumed; observer failure makes complete memory acceptance fail'});
 assert.ok(outcomes.every(x=>x.code===0),'sampler failure: no complete memory comparison');
}
