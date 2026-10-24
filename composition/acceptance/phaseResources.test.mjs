import test from'node:test';import assert from'node:assert/strict';import{sampledPhaseResources}from'./phaseResources.mjs';
const t=n=>new Date(n).toISOString();
test('phase memory excludes outside spikes, reports missing samples and never adds parent and child peaks',()=>{
 const phase={startedAt:t(2000),finishedAt:t(6000),parentRssBeforeBytes:20,parentRssAfterBytes:30},samples=[{at:t(0),sumRssBytes:1000},{at:t(2000),sumRssBytes:80},{at:t(4000),sumRssBytes:90},{at:t(8000),sumRssBytes:2000}];
 const r=sampledPhaseResources(phase,samples);assert.equal(r.sampledWalletSumRssMaxBytes,90);assert.equal(r.samples,2);assert.equal(r.parentRssAfterBytes,30);assert.equal(sampledPhaseResources(phase,[]).sampledWalletSumRssMaxBytes,null);assert.throws(()=>sampledPhaseResources({...phase,finishedAt:t(1000)},samples));assert.throws(()=>sampledPhaseResources(phase,[{at:'bad',sumRssBytes:5}]));
});
test('actual case attribution excludes unrelated clients using the same binary',()=>{
 const phase={startedAt:t(0),finishedAt:t(4000),parentRssBeforeBytes:20,parentRssAfterBytes:30},samples=[{at:t(2000),sumRssBytes:9000,processes:[{parentPid:10,rssBytes:100},{parentPid:20,rssBytes:8900}]}];
 assert.equal(sampledPhaseResources(phase,samples,{parentPid:10}).sampledWalletSumRssMaxBytes,100);assert.equal(sampledPhaseResources(phase,samples,{parentPid:20}).sampledWalletSumRssMaxBytes,8900);assert.throws(()=>sampledPhaseResources(phase,[{at:t(2000),sumRssBytes:10}],{parentPid:10}));
});

test('missing ordinary-process parent endpoints are unknown, not zero or unserializable undefined',()=>{const r=sampledPhaseResources({startedAt:t(0),finishedAt:t(4000)},[]);assert.equal(r.parentRssBeforeBytes,null);assert.equal(r.parentRssAfterBytes,null);});
