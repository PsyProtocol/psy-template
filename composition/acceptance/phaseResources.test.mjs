import test from'node:test';import assert from'node:assert/strict';import{sampledPhaseResources}from'./phaseResources.mjs';
const t=n=>new Date(n).toISOString();
test('phase memory excludes outside spikes, reports missing samples and never adds parent and child peaks',()=>{
 const phase={startedAt:t(2000),finishedAt:t(6000),parentRssBeforeBytes:20,parentRssAfterBytes:30},samples=[{at:t(0),sumRssBytes:1000},{at:t(2000),sumRssBytes:80},{at:t(4000),sumRssBytes:90},{at:t(8000),sumRssBytes:2000}];
 const r=sampledPhaseResources(phase,samples);assert.equal(r.sampledWalletSumRssMaxBytes,90);assert.equal(r.samples,2);assert.equal(r.parentRssAfterBytes,30);assert.equal(sampledPhaseResources(phase,[]).sampledWalletSumRssMaxBytes,null);assert.throws(()=>sampledPhaseResources({...phase,finishedAt:t(1000)},samples));assert.throws(()=>sampledPhaseResources(phase,[{at:'bad',sumRssBytes:5}]));
});
