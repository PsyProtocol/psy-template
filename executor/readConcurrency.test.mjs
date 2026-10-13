import test from 'node:test';
import assert from 'node:assert/strict';
import {mapReads} from './readConcurrency.mjs';

test('user reads stay bounded and preserve planner priority despite out-of-order completion',async()=>{
 let active=0,peak=0;
 const values=Array.from({length:100},(_,i)=>i);
 const result=await mapReads(values,async value=>{
  active++;peak=Math.max(peak,active);
  await new Promise(r=>setTimeout(r,value%4===0?8:1));active--;return value*2;
 });
 assert.equal(peak,4);assert.equal(active,0);assert.deepEqual(result,values.map(x=>x*2));
});
test('failed scans drain active readers and never continue scheduling the remaining users',async()=>{
 let active=0;const started=[];
 await assert.rejects(mapReads(Array.from({length:10000},(_,i)=>i),async value=>{
  started.push(value);active++;
  try{await new Promise(r=>setTimeout(r,value===0?1:10));if(value===0)throw Error('leaf unavailable');return value;}
  finally{active--;}
 }),/leaf unavailable/);
 assert.equal(active,0);assert.deepEqual(started,[0,1,2,3]);
 assert.deepEqual(await mapReads([],()=>assert.fail('empty')),[]);
});
