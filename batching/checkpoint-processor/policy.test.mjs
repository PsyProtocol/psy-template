import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {processorCalls} from './policy.mjs';
import {checkpointProcessorPlan,authorizeCheckpointProcessor} from '../../executor/checkpointProcessor.mjs';

const root=process.env.PROCESSOR_FIXTURES;
assert.ok(root,'fresh compiled processor fixtures are required');
for(const market of ['amm','bondingcurve']){
 const spec=JSON.parse(readFileSync(join(root,market,'policy.json')));
 const operation=spec.operations.find(o=>o.name===(market==='amm'?'swap_0':'settle_limit_buy_change'));
 const fields=count=>{
  const f=Array(80).fill(0n);f[0]=2n;f[1]=1n;f[2]=BigInt(count);f[3]=101n;
  f.splice(17,4,0n,1n,2n,3n);f[73]=1000000000n;f[79]=BigInt(count)*1000100000n-f[73];
  const used=new Set([0,...operation.calls.flatMap(c=>c.inputs.filter(a=>a.witness!==undefined).map(a=>a.witness))]);
  for(let row=0;row<count;row++)for(const column of used)f[21+13*row+column]=column===0?BigInt(operation.branch):column===1?BigInt(200+row):1n;
  return f;
 };
 test(`${market}: every funded input claim precedes every ranked settlement`,()=>{
  for(const count of [2,3,4]){
   const f=fields(count),calls=processorCalls(spec,f),first=calls.findIndex(c=>c.method_name===operation.calls[0].method_name);
   assert.ok(first>=13);assert.equal(calls.length,40);assert.equal(calls.slice(0,first).filter(c=>c.method_name==='claim_batch_member').length,count);
   const claims=calls.slice(0,13).filter(c=>c.method_name==='claim');assert.equal(claims.length,count);
   assert.ok(claims.every(c=>c.contract_id===BigInt(market==='amm'?spec.config.assetA:spec.config.assetB)));
   assert.deepEqual(calls.filter(c=>c.method_name==='claim_batch_member').map(c=>c.inputs[0]),Array.from({length:count},(_,i)=>BigInt(200+i)));
   assert.equal(calls[29].method_name,'finish_checkpoint_batch');assert.equal(calls[30].inputs[0],600n);assert.equal(calls[39].inputs[0],f[73]);
   const p=checkpointProcessorPlan(spec,f);assert.equal(p.canSign,false);assert.equal(p.canBroadcast,false);assert.equal(p.sourceQualified,false);
  }
 });
 test(`${market}: canonical membership, permutation and fee mutations reject`,()=>{
  const f=fields(4);for(const mutate of [x=>x[2]=1n,x=>x[18]=x[17],x=>x[35]=x[22],x=>x[79]++,x=>x[78]=1n,x=>x[74]=18446744069414584321n,x=>x[4]=1n]){const bad=[...f];mutate(bad);assert.throws(()=>processorCalls(spec,bad));}
  assert.throws(()=>processorCalls(spec,[...f,0n]));assert.throws(()=>authorizeCheckpointProcessor());
 });
}
