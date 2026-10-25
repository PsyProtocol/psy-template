// Closed actual-fill comparison, observational numbers kept separate from
// exact receipt/proof accounting. Missing new cold metrics are a hard error.
import assert from 'node:assert/strict';import{readFileSync,readdirSync}from'node:fs';import{join}from'node:path';
import{saveObservation}from'../observations.mjs';import{sha256}from'../requestBinding.mjs';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
const[base,out]=process.argv.slice(2);assert.ok(out);const read=p=>JSON.parse(readFileSync(p,'utf8'));
const performanceReport=read(join(base,'public/PERFORMANCE-v1.json'));assert.equal(performanceReport.resourceSelection.completeDeclaredProvers,true);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name==='drivers'||e.name==='.secrets'?[]:e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);
const rows=[];
for(const v of performanceReport.variants){
 const round=join(base,v.round),events=[],constructions=[];
 for(const p of walk(round).filter(p=>p.endsWith('.log'))){for(const line of readFileSync(p,'utf8').split('\n')){
  if(line.startsWith('PSY_PROVER_RESOURCES '))events.push({...JSON.parse(line.slice(21)),log:p});
  if(line.startsWith('PSY_PROVER_LIFECYCLE '))constructions.push({...JSON.parse(line.slice(21)),log:p});
 }}
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
  const pid=trace.at(-1).pid,from=Date.parse(trace[0].at),to=Date.parse(trace.at(-1).at);
  // stdout/stderr delivery can cross job boundaries. Associate native samples
  // by native event time and PID, not whichever log received their pipe bytes.
  ordinary.push({label:job.label,cold:job.coldStart,spawnToReadyMilliseconds:ready?ready.elapsedMilliseconds-trace.find(e=>e.event==='spawn-requested').elapsedMilliseconds:null,commonCircuitConstructionMilliseconds:job.sessionConstructionMillisecondsCharged,jobMilliseconds:job.processOrResidentJobMilliseconds,confirmationMilliseconds:job.confirmationMilliseconds,endToEndMilliseconds:job.endToEndMilliseconds,pid,lifecycleSha256:sha256(readFileSync(tracePath)),nativeResources:events.filter(e=>e.pid===pid&&e.unixMilliseconds>=from&&e.unixMilliseconds<=to)});
 }
 assert.equal(ordinary.filter(j=>j.cold).length,3,'one constructor per pinned ordinary signer, no hidden restart');
 assert.equal(constructions.length,4,'all three ordinary constructors and the market constructor must be timed');assert.equal(new Set(constructions.map(c=>c.pid)).size,4);
 assert.ok(constructions.every(c=>c.memoryMode===mode&&c.sessionConstructionMilliseconds>0));assert.equal(constructions.filter(c=>c.keyConstructionMilliseconds!==undefined).length,1);
 const stages=v.stages.filter(s=>['commit','settle'].includes(s.label));assert.equal(stages.length,2);
 rows.push({selection:v.selection,memoryMode:mode,environment:v.environment,ordinary,coldNativeProcessConstructions:constructions,fullProofStages:stages,commitAndSettlementCryptoMilliseconds:stages.reduce((n,s)=>n+s.timingsMilliseconds.cryptographicPreparationTotal,0),sampledAllProverRssMaxBytes:v.roundResources.sampledWalletSumRssMaxBytes,allNativeAllocationCheckpoints:events,feeNativeAtoms:v.totalFeesNativeAtoms,observedRoundWallMilliseconds:v.observedRoundWallMilliseconds,parentInvocation:read(join(base,'public',v.selection+'-parent-timing-v1.json')),bootstrap:read(join(base,'public',v.selection+'-run-v1-BOOTSTRAP-TIMING.json')),cutoffWait:v.cutoffWait,scope:'one actual fill with 17 UPSs and real ordinary wallet claims; component timings include fresh SDK RPC, no CPU-only or chain TPS claim'});
}
assert.equal(rows[0].environment.ordinaryBinary,rows[1].environment.ordinaryBinary);assert.equal(rows[0].environment.compactBinary,rows[1].environment.compactBinary);assert.equal(rows[0].environment.sdkSha256,rows[1].environment.sdkSha256);
const [before,after]=rows;
assert.deepEqual(read(join(base,'public/baseline-run-v1-SOURCE.json')).files,read(join(base,'public/candidate-run-v1-SOURCE.json')).files,'same application source closure in both modes');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),end=exact(join(base,before.selection,'public/assets-after.json')),start=exact(join(base,after.selection,'public/assets-before.json'));
for(const field of ['accounts','pending','nfts','nftPending','totals','nativeTotal'])assert.deepEqual(end[field],start[field],'no intervening funds or asset changes between measured rounds: '+field);
const audits=rows.map(v=>exact(join(base,v.selection+'-audit-v1/SUMMARY.json')));
for(const user of new Set(audits[0].actual.map(a=>a.userId))){const sorted=a=>a.actual.filter(r=>r.userId===user).sort((x,y)=>x.nonce<y.nonce?-1:1);const last=sorted(audits[0]).at(-1),first=sorted(audits[1])[0];assert.ok(first);assert.equal(first.nonce,last.nonce+1n);assert.equal(first.start,last.end);}
saveObservation(out,{at:new Date().toISOString(),rows,allNewOrdinaryColdAndWarmTimingsPresent:true,sameBinariesAndSdk:true,crossRoundAssetNonceAndStateContinuity:true,actualFills:2,actualUps:34,allActualFullProofsAudited:true,rssDeltaBytes:after.sampledAllProverRssMaxBytes-before.sampledAllProverRssMaxBytes,cryptoPreparationDeltaMilliseconds:after.commitAndSettlementCryptoMilliseconds-before.commitAndSettlementCryptoMilliseconds,scope:'single sequential real-fill pair at equal workload on the same machine. RSS sum is sampled, may double-count shared pages and includes idle residents. Native allocator-reported released bytes are advisory; before/after RSS observations are saved separately. Cold means new process/new circuit construction with ordinary OS/SDK disk caches unchanged, not a fresh machine or removed SDK cache. Different balances/nonces/checkpoints, network confirmation and cutoff waits remain explicit. No unmeasured throughput, general speedup or production-grade assertion.',sourceReportSha256:sha256(readFileSync(join(base,'public/PERFORMANCE-v1.json'))),chainTps:null,productionGradeClaim:false});
