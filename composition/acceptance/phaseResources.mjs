// Observation only: use actual sampled timestamps, never sum unrelated peaks.
import assert from 'node:assert/strict';
export function sampledPhaseResources(phase,samples){
 const start=Date.parse(phase.startedAt),end=Date.parse(phase.finishedAt);assert.ok(Number.isFinite(start)&&end>=start);
 const selected=samples.filter(s=>{const at=Date.parse(s.at);assert.ok(Number.isFinite(at));return at>=start&&at<=end;});
 for(const s of selected)assert.ok(Number.isSafeInteger(s.sumRssBytes)&&s.sumRssBytes>=0);
 return{samples:selected.length,sampledWalletSumRssMaxBytes:selected.length?Math.max(...selected.map(s=>s.sumRssBytes)):null,parentRssBeforeBytes:phase.parentRssBeforeBytes,parentRssAfterBytes:phase.parentRssAfterBytes,scope:'2-second selected wallet RSS sum within this phase; not a true peak or total host memory; shared pinned resident, ABBA order, cache residency may differ; parent endpoints reported separately, not added to nonconcurrent child peaks'};
}
