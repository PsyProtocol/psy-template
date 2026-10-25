// Closed actual-fill comparison, observational numbers kept separate from
// exact receipt/proof accounting. Missing new cold metrics are a hard error.
import assert from 'node:assert/strict';import{readFileSync,readdirSync}from'node:fs';import{join}from'node:path';
import{saveObservation}from'../observations.mjs';import{sha256}from'../requestBinding.mjs';
const[base,out]=process.argv.slice(2);assert.ok(out);const read=p=>JSON.parse(readFileSync(p,'utf8'));
const performanceReport=read(join(base,'public/PERFORMANCE-v1.json'));assert.equal(performanceReport.resourceSelection.completeDeclaredProvers,true);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name==='drivers'||e.name==='.secrets'?[]:e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);
const rows=[];
for(const v of performanceReport.variants){
 const round=join(base,v.round),events=[];
 for(const p of walk(round).filter(p=>p.endsWith('.log'))){for(const line of readFileSync(p,'utf8').split('\n'))if(line.startsWith('PSY_PROVER_RESOURCES '))events.push({...JSON.parse(line.slice(21)),log:p});}
 assert.ok(events.length>0,'native allocation observations required');
 const mode=v.selection==='baseline'?'retain-v1':'release-unused-v1';assert.ok(events.every(e=>e.memoryMode===mode));
 const ordinary=[];
 for(const job of v.ordinary){
  assert.equal(job.missingTiming,null);assert.ok(Number.isFinite(job.processOrResidentJobMilliseconds)&&job.processOrResidentJobMilliseconds>0);assert.ok(Number.isFinite(job.endToEndMilliseconds)&&job.endToEndMilliseconds>0);
  const tracePath=join(round,job.label+'.log.lifecycle.jsonl'),trace=readFileSync(tracePath,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(trace[0].event,'started');assert.equal(trace.at(-1).event,'finished');assert.equal(trace.at(-1).ok,true);assert.equal(trace.find(e=>e.event==='native-response').ok,true);assert.ok(trace.find(e=>e.event==='exact-identity-checked'));
  for(let i=1;i<trace.length;i++)assert.ok(trace[i].elapsedMilliseconds>=trace[i-1].elapsedMilliseconds);
  assert.equal(Boolean(trace.find(e=>e.event==='ready')),job.coldStart);const ready=trace.find(e=>e.event==='ready');if(ready)assert.equal(ready.sessionConstructionMilliseconds,job.sessionConstructionMillisecondsCharged);
  const input=trace.find(e=>e.event==='input-bound');assert.equal(input.inputSha256,sha256(readFileSync(join(round,'public',job.label+'.json'))));
  ordinary.push({label:job.label,cold:job.coldStart,spawnToReadyMilliseconds:ready?ready.elapsedMilliseconds-trace.find(e=>e.event==='spawn-requested').elapsedMilliseconds:null,commonCircuitConstructionMilliseconds:job.sessionConstructionMillisecondsCharged,jobMilliseconds:job.processOrResidentJobMilliseconds,confirmationMilliseconds:job.confirmationMilliseconds,endToEndMilliseconds:job.endToEndMilliseconds,pid:trace.at(-1).pid,lifecycleSha256:sha256(readFileSync(tracePath)),nativeResources:events.filter(e=>e.log===join(round,job.label+'.log'))});
 }
 assert.equal(ordinary.filter(j=>j.cold).length,3,'one constructor per pinned ordinary signer, no hidden restart');
 const stages=v.stages.filter(s=>['commit','settle'].includes(s.label));assert.equal(stages.length,2);
 rows.push({selection:v.selection,memoryMode:mode,environment:v.environment,ordinary,fullProofStages:stages,commitAndSettlementCryptoMilliseconds:stages.reduce((n,s)=>n+s.timingsMilliseconds.cryptographicPreparationTotal,0),sampledAllProverRssMaxBytes:v.roundResources.sampledWalletSumRssMaxBytes,allNativeAllocationCheckpoints:events,feeNativeAtoms:v.totalFeesNativeAtoms,observedRoundWallMilliseconds:v.observedRoundWallMilliseconds,parentInvocation:read(join(base,'public',v.selection+'-parent-timing-v1.json')),bootstrap:read(join(base,'public',v.selection+'-run-v1-BOOTSTRAP-TIMING.json')),cutoffWait:v.cutoffWait,scope:'one actual fill with 17 UPSs and real ordinary wallet claims; component timings include fresh SDK RPC, no CPU-only or chain TPS claim'});
}
assert.equal(rows[0].environment.ordinaryBinary,rows[1].environment.ordinaryBinary);assert.equal(rows[0].environment.compactBinary,rows[1].environment.compactBinary);assert.equal(rows[0].environment.sdkSha256,rows[1].environment.sdkSha256);
const [before,after]=rows;saveObservation(out,{at:new Date().toISOString(),rows,allNewOrdinaryColdAndWarmTimingsPresent:true,sameBinariesAndSdk:true,actualFills:2,actualUps:34,allActualFullProofsAudited:true,rssDeltaBytes:after.sampledAllProverRssMaxBytes-before.sampledAllProverRssMaxBytes,cryptoPreparationDeltaMilliseconds:after.commitAndSettlementCryptoMilliseconds-before.commitAndSettlementCryptoMilliseconds,scope:'single sequential real-fill pair at equal workload on the same machine. RSS sum is sampled, may double-count shared pages and includes idle residents. Native allocator-reported released bytes are advisory; before/after RSS observations are saved separately. Cold means new process/new circuit construction with ordinary OS/SDK disk caches unchanged, not a fresh machine or removed SDK cache. Different balances/nonces/checkpoints, network confirmation and cutoff waits remain explicit. No unmeasured throughput, general speedup or production-grade assertion.',sourceReportSha256:sha256(readFileSync(join(base,'public/PERFORMANCE-v1.json'))),chainTps:null,productionGradeClaim:false});
