// Observation only: use actual sampled timestamps, never sum unrelated peaks.
import assert from 'node:assert/strict';
export function sampledPhaseResources(phase,samples,{parentPid}={}){
 const start=Date.parse(phase.startedAt),end=Date.parse(phase.finishedAt);assert.ok(Number.isFinite(start)&&end>=start);
 const selected=samples.filter(s=>{const at=Date.parse(s.at);assert.ok(Number.isFinite(at));return at>=start&&at<=end;});
 for(const s of selected)assert.ok(Number.isSafeInteger(s.sumRssBytes)&&s.sumRssBytes>=0);if(parentPid!==undefined)assert.ok(Number.isSafeInteger(parentPid)&&parentPid>0);const sums=selected.map(s=>{if(parentPid===undefined)return s.sumRssBytes;assert.ok(Array.isArray(s.processes),'case attribution requires raw process samples');return s.processes.filter(p=>p.parentPid===parentPid).reduce((n,p)=>{assert.ok(Number.isSafeInteger(p.rssBytes)&&p.rssBytes>=0);return n+p.rssBytes;},0);});
 return{samples:selected.length,processScope:parentPid===undefined?'all selected wallet processes':`selected direct proof children of recorded Executor PID ${parentPid}`,sampledWalletSumRssMaxBytes:selected.length?Math.max(...sums):null,parentRssBeforeBytes:phase.parentRssBeforeBytes??null,parentRssAfterBytes:phase.parentRssAfterBytes??null,scope:'2-second selected wallet RSS sum within this phase; not a true peak or total host memory; shared pinned resident, ABBA order, cache residency may differ; parent endpoints reported separately, not added to nonconcurrent child peaks'};
}
