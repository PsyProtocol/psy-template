import test from'node:test';import assert from'node:assert/strict';import{readSegments}from'./readSegments.mjs';
const read=(at,duration)=>({queuedAt:new Date(at).toISOString(),queueMilliseconds:0,rpcAndParseMilliseconds:duration,failed:false});
test('read spans preserve overlap and separate VM gaps from observed RPC cost',()=>{
 const r=readSegments({residentJobs:[{startedAt:new Date(500).toISOString(),wallMilliseconds:1000}],reads:[read(0,100),read(0,100),read(1600,50)]});assert.equal(r.beforeResident.attempts,2);assert.equal(r.beforeResident.readSpanMilliseconds,100);assert.equal(r.beforeResident.rpcAndParseSumMilliseconds,200);assert.equal(r.afterResident.readSpanMilliseconds,50);assert.equal(r.betweenResidentJobs.readSpanMilliseconds,null);
 assert.equal(readSegments({reads:[read(0,100),read(100,100)]}).withoutResident.readSpanMilliseconds,200);assert.throws(()=>readSegments({reads:[read(0,-1)]}));assert.throws(()=>readSegments({reads:[{...read(0,1),queuedAt:'invalid'}]}));
});
