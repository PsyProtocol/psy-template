// Read-only derivation after both original real-fill rounds have closed.
import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{join}from'node:path';
import{resourceWindow}from'./resourceWindows.mjs';import{saveObservation}from'../observations.mjs';import{sha256}from'../requestBinding.mjs';
const[base,out]=process.argv.slice(2);assert.ok(out);const read=p=>JSON.parse(readFileSync(p,'utf8'));
const pf=join(base,'public/PERFORMANCE-v1.json'),tf=join(base,'public/PROCESS-TREE-PERFORMANCE-v1.json'),treeFile=join(base,'tree-resources-v1.log'),p=read(pf),tree=read(tf);
assert.equal(tree.completeParentAndNativeTimeline,true);assert.equal(tree.actualUps,34);assert.equal(tree.actualFills,2);assert.equal(tree.treeLogSha256,sha256(readFileSync(treeFile)));
const samples=readFileSync(treeFile,'utf8').trim().split('\n').map(JSON.parse);
const rows=p.variants.map(v=>{
 const round=join(base,v.round),cold=[],ordinary=[];
 for(const j of v.ordinary){
  const f=join(round,j.label+'.log.lifecycle.jsonl'),trace=readFileSync(f,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(trace.at(-1).ok,true);
  if(j.coldStart){const spawn=trace.find(r=>r.event==='spawn-requested'),ready=trace.find(r=>r.event==='ready');assert.ok(spawn&&ready);cold.push({label:j.label,kind:'ordinary-construction',resources:resourceWindow(samples,spawn.at,ready.at)});}
  ordinary.push({label:j.label,cold:j.coldStart,fullJobIncludingConfirmation:resourceWindow(samples,j.startedAt,j.finishedAt),nativeJobThroughHttpResult:resourceWindow(samples,trace[0].at,trace.at(-1).at),lifecycleSha256:sha256(readFileSync(f))});
 }
 assert.equal(cold.length,3);const prewarm=read(join(round,'public/PREWARM.json'));cold.push({label:'market-prewarm',kind:'market-resource-startup',resources:resourceWindow(samples,prewarm.startedAt,prewarm.finishedAt)});
 const warmLabels=['admit-0-fund','admit-1-fund','seal-fund','commit-fund'],warm=ordinary.filter(r=>warmLabels.includes(r.label));assert.equal(warm.length,4);assert.ok(warm.every(r=>!r.cold));
 const peak=xs=>Math.max(...xs.map(x=>x.sampledTreeRssMaxBytes));
 return{selection:v.selection,coldConstructions:cold,ordinary,warmFundingLabels:warmLabels,
  sampledColdConstructionTreeRssMaxBytes:peak(cold.map(r=>r.resources)),sampledWarmFundingTreeRssMaxBytes:peak(warm.map(r=>r.nativeJobThroughHttpResult)),
  sampledPayoutTreeRssMaxBytes:peak(ordinary.filter(r=>r.label.endsWith('-payout')).map(r=>r.fullJobIncludingConfirmation))};
});
saveObservation(out,{schema:1,rows,actualUps:34,actualFills:2,sourceFiles:[pf,tf,treeFile].map(file=>({file,sha256:sha256(readFileSync(file))})),scope:'observational phase windows over the complete owned application tree, including concurrent tasks and idle residents; no task-specific allocation attribution. One-second sampled RSS sums may double-count shared pages; not true peak, allocator usage, physical footprint or a causal cache-memory estimate. Component maxima and overlapping windows must not be added. Single sequential real-fill pair with unchanged disk caches and varying network state.',productionGradeClaim:false});
