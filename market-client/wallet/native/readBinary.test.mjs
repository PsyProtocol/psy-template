import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedBinary} from './readBinary.mjs';
test('bounded binary reader concatenates exact streamed bytes without an arrayBuffer fallback',async()=>{
 const chunks=[new Uint8Array([0,97,115,109]),new Uint8Array([1,0,0,0])];
 const response=new Response(new ReadableStream({pull(c){chunks.length?c.enqueue(chunks.shift()):c.close();}}),{headers:{'content-length':'8'}});
 response.arrayBuffer=()=>{throw Error('unbounded fallback forbidden');};
 assert.deepEqual(await readBoundedBinary(response,8),new Uint8Array([0,97,115,109,1,0,0,0]));
});
for(const mode of ['declared-large','negative','rounded','actual-large','bad-chunk','truncated','short','no-stream'])test('binary read refuses '+mode+' and cancels unfinished input',async()=>{
 let cancelled=0,read=0;const chunks=mode==='bad-chunk'?['not bytes']:mode==='actual-large'?[new Uint8Array(8),new Uint8Array(1)]:[new Uint8Array(mode==='short'?1:8)];
 const response={headers:{get:()=>({'declared-large':'9',negative:'-1',rounded:'9007199254740993',truncated:'7'}[mode]??null)},body:{getReader:()=>({read:async()=>{read++;return chunks.length?{done:false,value:chunks.shift()}:{done:true};},cancel:async()=>{cancelled++;},releaseLock(){}})}};
 if(mode==='no-stream')response.body=null;
 await assert.rejects(readBoundedBinary(response,8));
 if(['declared-large','negative','rounded'].includes(mode)){assert.equal(read,0);assert.equal(cancelled,1);}
 if(['actual-large','bad-chunk'].includes(mode))assert.equal(cancelled,1);
});
