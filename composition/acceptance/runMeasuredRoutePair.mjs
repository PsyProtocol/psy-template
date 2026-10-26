// Finite, exclusive owner of the two measured routes and their samplers.
// Setup/deployment/funding preparation must be independently closed beforehand.
import assert from'node:assert/strict';import{mkdirSync,readFileSync,existsSync,rmSync}from'node:fs';import{join,resolve}from'node:path';import{spawn}from'node:child_process';import{fileURLToPath}from'node:url';
import{run}from'../../batching/admission/liveSupport.mjs';import{saveObservation}from'../../executor/observations.mjs';import{freezeAppModules}from'../../executor/acceptance/sourceClosure.mjs';import{sha256}from'../../executor/requestBinding.mjs';import{routeResourcePlan}from'./routeResourcePlan.mjs';
import{assertPreparedRoutePair}from'./routePairBindings.mjs';
const[base,release,tools,verifier]=process.argv.slice(2);assert.ok(verifier);const read=p=>JSON.parse(readFileSync(p,'utf8')),plan=read(join(base,'public/PAIR-PLAN-v1.json'));assert.deepEqual(plan.rounds,['baseline','candidate']);assert.ok(existsSync(join(base,'public/PREPARED-READY-v1.json')),'setup/funds readiness must close first');assert.ok(!existsSync(join(base,'public/PAIR-CLOSED-v1.json')));
assertPreparedRoutePair(base,release,tools);
assert.equal(sha256(readFileSync(verifier)),'95344886059c5fe78617a6e1f7b9988cfd4ce8e9805da05086a79f7f5a6599cf','independent verifier changed before financial measurement');
const lock=join(base,'financial-run.lock');mkdirSync(lock);saveObservation(join(lock,'owner.json'),{pid:process.pid,startedAt:new Date().toISOString(),planSha256:sha256(readFileSync(join(base,'public/PAIR-PLAN-v1.json')))});
freezeAppModules(fileURLToPath(import.meta.url),base,'measured-controller-v1');saveObservation(join(base,'public/MEASUREMENT-ROOT-v1.json'),{pid:process.pid,startedAt:new Date().toISOString(),scope:'two new sequential financial routes and all owned children'});
const entries=['runRouteResourceRound','routeSetup','preparationAccounting','executeRouteWorker','verifyPreparationRun'];
const sourcesCurrent=()=>entries.forEach(name=>freezeAppModules(resolve('composition/acceptance/'+name+'.mjs'),base,'measured-'+name.toLowerCase()+'-v1'));sourcesCurrent();
const observers=[],pause=ms=>new Promise(r=>setTimeout(r,ms)),start=(file,args)=>{const p=spawn(process.execPath,[file,...args],{stdio:['ignore','ignore','inherit']}),exited=new Promise(resolve=>{p.once('error',error=>resolve({error:String(error)}));p.once('exit',(code,signal)=>resolve({code,signal}));});observers.push({p,exited});return p;};
let ok=false;
try{
 const native=start('executor/acceptance/proverResourceObserver.mjs',[base,'resources-v1',join(base,'public/MEASURED-RELEASE-v1.json')]);saveObservation(join(base,'public/MEASUREMENT-EXCLUDE-v1.json'),{pids:[native.pid]});
 start('executor/acceptance/processTreeObserver.mjs',[base,join(base,'public/MEASUREMENT-ROOT-v1.json'),join(base,'public/MEASUREMENT-EXCLUDE-v1.json'),'tree-resources-v1']);
 for(let i=0;i<150&&(!existsSync(join(base,'tree-resources-v1-READY.json'))||!existsSync(join(base,'resources-v1-IDENTITY.json')));i++){assert.ok(observers.every(x=>x.p.exitCode===null));await pause(100);}
 assert.ok(existsSync(join(base,'tree-resources-v1-READY.json')));assert.ok(existsSync(join(base,'resources-v1-IDENTITY.json')));
 for(const variant of plan.rounds){
  assertPreparedRoutePair(base,release,tools);
  sourcesCurrent();
  const round=join(base,variant),settings=routeResourcePlan(round);assert.equal(settings.variant,variant);assert.ok(!existsSync(join(round,'public/ROUTE-RESOURCE-RUN-v1.json')),'original run exists: reconcile it, never silently start another measurement');
  const log=join(base,variant+'-parent-v1.log');const timing=await run(process.execPath,['composition/acceptance/runRouteResourceRound.mjs',round,release,tools],log,{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'});saveObservation(join(base,'public',variant+'-parent-timing-v1.json'),timing);
  await run(process.execPath,['composition/acceptance/verifyPreparationRun.mjs',round,verifier,join(round,'independent-verification-v1')],join(base,variant+'-proof-audit-v1.log'),{});
  const a=read(join(round,'independent-verification-v1/SUMMARY.json'));assert.equal(a.actualReceipts.length,28);assert.equal(a.distinctRequests,28);assert.equal(a.mutatedActualFeeRejected,true);assert.equal(read(join(round,'public/PREPARATION-CONSERVATION-COMPLETE-v1.json')).ordinaryOwnerClaimIncluded,true);
 }
 ok=true;saveObservation(join(base,'public/PAIR-CLOSED-v1.json'),{at:new Date().toISOString(),actualUps:56,actualFills:4,ordinaryFinalClaims:2,fullProofsAndFeesAudited:true,performanceReportingPending:true,scope:'two actual sequential routes, no cross-vault atomicity or general acceleration claim'});
}finally{
 const observerOutcomes=[];for(const x of observers){x.p.kill('SIGTERM');const r=await Promise.race([x.exited,pause(10000).then(()=>({timeout:true}))]);observerOutcomes.push(r);if(r.timeout)x.p.kill('SIGKILL');}
 saveObservation(join(base,'public/MEASUREMENT-CONTROLLER-COMPLETE-v1.json'),{at:new Date().toISOString(),ok,observerOutcomes,scope:'original financial failure is a stop, never a retry; interrupted measurement remains interrupted'});rmSync(lock,{recursive:true});assert.ok(observerOutcomes.every(x=>x.code===0),'memory observer did not close completely');
}
