import test from 'node:test';import assert from 'node:assert/strict';import{resourceWindow}from'./resourceWindows.mjs';
const at=n=>new Date(n).toISOString(),row=(n,a,b)=>({at:at(n),rootAlive:true,processes:[{executable:'node',rssBytes:a},{executable:'wallet',rssBytes:b}],sumRssBytes:a+b});
const rows=[row(0,10,100),row(1000,30,90),row(2000,20,110),row(3000,10,80)];
test('phase window keeps concurrent owned RSS and independent component maxima',()=>{const x=resourceWindow(rows,at(500),at(2500));assert.equal(x.sampledTreeRssMaxBytes,130);assert.equal(x.sampledNodeRssMaxBytes,30);assert.equal(x.sampledOtherChildrenRssMaxBytes,110);assert.notEqual(x.sampledTreeRssMaxBytes,x.sampledNodeRssMaxBytes+x.sampledOtherChildrenRssMaxBytes);assert.equal(x.samples,2);});
test('missing cold-start coverage cannot be replaced by later samples',()=>assert.throws(()=>resourceWindow(rows.slice(1),at(500),at(2500)),/not fully observed/));
test('missing cleanup coverage fails',()=>assert.throws(()=>resourceWindow(rows.slice(0,3),at(500),at(2500)),/not fully observed/));
test('long sampler interruption cannot claim complete phase coverage',()=>assert.throws(()=>resourceWindow([row(0,1,1),row(6000,1,1),row(7000,1,1)],at(0),at(7000)),/sample gap/));
test('missing root, invalid RSS, unordered timestamps and forged totals fail',()=>{for(const mutate of [x=>x[1].rootAlive=false,x=>x[1].processes[0].rssBytes=-1,x=>x[1].at=at(0),x=>x[1].sumRssBytes++]){const x=structuredClone(rows);mutate(x);assert.throws(()=>resourceWindow(x,at(500),at(2500)));}});
test('invalid or undersampled windows fail',()=>{assert.throws(()=>resourceWindow(rows,'invalid',at(2000)));assert.throws(()=>resourceWindow(rows,at(2000),at(1000)));assert.throws(()=>resourceWindow(rows,at(1200),at(1800)),/insufficient/);});
