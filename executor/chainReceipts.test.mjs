import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {receiptReader} from './chainReceipts.mjs';

const userId=123,leaf='f'.repeat(64);
const event=checkpoint=>({tx_type:'user_endcap',owner_user_id:userId,included_checkpoint_id:checkpoint,content_hash:checkpoint.toString(16).padStart(64,'0')});
async function fixture(fn){
 const directory=await mkdtemp(join(tmpdir(),'psy-receipts-')),config=join(directory,'rpc.json');
 await writeFile(config,JSON.stringify({defaultNetwork:'test',networks:{test:{api_services_url:['https://services.test'],users_per_realm:1000,realm_configs:[{id:0,rpc_url:['https://realm.test']}]}}}));
 try{await fn(config);}finally{await rm(directory,{recursive:true,force:true});}
}
const response=data=>({ok:true,json:async()=>data});
test('explicit expected network rejects a different config default before any receipt read',()=>fixture(async config=>{
 let calls=0;const fetchImpl=async()=>{calls++;assert.fail('wrong network must not issue a request');};
 await assert.rejects(receiptReader(config,{fetchImpl,expectedNetwork:'testnet'}),/unexpected network/);
 await assert.rejects(receiptReader(config,{fetchImpl,expectedNetwork:''}),/unexpected network/);
 assert.equal(calls,0);
}));
test('matching explicit network preserves exact receipt reconciliation',()=>fixture(async config=>{
 const io=fetcher({pages:()=>({items:[event(101)],has_next:false})});
 const result=await(await receiptReader(config,{...io,expectedNetwork:'test'}))({userId,endUserLeafHash:leaf,minCheckpoint:101});
 assert.equal(result.status,'included');assert.equal(result.endUserLeafHash,leaf);assert.equal(result.contentHash,event(101).content_hash);
}));
test('bounded services outage stays unresolved; next poll recovers the original exact identity',()=>fixture(async config=>{
 let failing=true,requests=0;const io=fetcher({pages:()=>({items:[event(101)],has_next:false})});
 const read=await receiptReader(config,{fetchImpl:async(...args)=>{requests++;return failing?{ok:false,status:500}:io.fetchImpl(...args);}});
 const pending=await read({userId,endUserLeafHash:leaf,minCheckpoint:101});
 assert.equal(pending.status,'unresolved');assert.equal(pending.readUnavailable,true);assert.equal(pending.endUserLeafHash,leaf);assert.equal(requests,3,'one bounded read burst, no other request or mutation');
 failing=false;const included=await read({userId,endUserLeafHash:leaf,minCheckpoint:101});assert.equal(included.status,'included');assert.equal(included.endUserLeafHash,leaf);assert.equal(included.contentHash,event(101).content_hash);
 const unauthorized=await receiptReader(config,{fetchImpl:async()=>({ok:false,status:401})});await assert.rejects(unauthorized({userId,endUserLeafHash:leaf}),/HTTP 401/);
}));
function fetcher({pages,target=101,receiptPatch={}}){
 const offsets=[],reads=[];
 return {offsets,reads,fetchImpl:async(url,options)=>{
  if(url.includes('/get/user/transactions')){
   const offset=Number(new URL(url).searchParams.get('offset'));offsets.push(offset);
   return response({success:true,data:pages(offset)});
  }
  if(options?.method==='POST'){
   const request=JSON.parse(options.body);assert.equal(request.method,'psy_get_user_tree_leaf_hash');
   const checkpoint=request.params.checkpoint_id;reads.push(checkpoint);
   return response({result:checkpoint===target?leaf:'0'.repeat(64)});
  }
  return response({success:true,data:{status:'included',owner_user_id:userId,included_checkpoint_id:target,content_hash:event(target).content_hash,...receiptPatch}});
 }};
}
test('receipt older than the latest 100 events is recovered with exact historical leaf and receipt',()=>fixture(async config=>{
 const io=fetcher({pages:offset=>offset===0?{items:Array.from({length:100},(_,i)=>event(i+1)),has_next:true}:{items:[event(101)],has_next:false}});
 const read=await receiptReader(config,io),result=await read({userId,endUserLeafHash:leaf});
 assert.equal(result.status,'included');assert.equal(result.checkpoint,101);assert.deepEqual(io.offsets,[0,100]);
}));
test('verified source bound skips older leaf RPCs without dropping pages or receipt validation',()=>fixture(async config=>{
 const pages=offset=>offset===0?{items:Array.from({length:100},(_,i)=>event(i+1)),has_next:true}:{items:[event(101)],has_next:false};
 const io=fetcher({pages});const result=await(await receiptReader(config,io))({userId,endUserLeafHash:leaf,minCheckpoint:101});
 assert.equal(result.status,'included');assert.deepEqual(io.offsets,[0,100]);assert.deepEqual(io.reads,[101]);
 const bad=fetcher({pages,receiptPatch:{owner_user_id:124}});assert.equal((await(await receiptReader(config,bad))({userId,endUserLeafHash:leaf,minCheckpoint:101})).status,'unresolved');
 const reader=await receiptReader(config,{fetchImpl:async()=>assert.fail('invalid bound cannot issue RPC')});await assert.rejects(reader({userId,endUserLeafHash:leaf,minCheckpoint:-1}),/source checkpoint/);
}));
test('pagination stops at advertised final page and does not confuse a matching leaf with a mismatched receipt',()=>fixture(async config=>{
 const io=fetcher({pages:()=>({items:[event(101)],has_next:false}),receiptPatch:{owner_user_id:124}});
 const result=await (await receiptReader(config,io))({userId,endUserLeafHash:leaf});
 assert.equal(result.status,'unresolved');assert.match(result.errors[0],/does not confirm/);assert.deepEqual(io.offsets,[0]);
}));
test('an exhausted history window stays unresolved and never requests an unbounded next page',()=>fixture(async config=>{
 const io=fetcher({pages:offset=>({items:Array.from({length:100},(_,i)=>event(offset+i+1)),has_next:true}),target:1000});
 const result=await (await receiptReader(config,{...io,maxPages:2}))({userId,endUserLeafHash:leaf});
 assert.equal(result.status,'unresolved');assert.match(result.reason,/page limit/);assert.deepEqual(io.offsets,[0,100]);
}));
test('overlapping pages deduplicate events and historical reads; a stuck pagination response stays unresolved',()=>fixture(async config=>{
 const first=Array.from({length:100},(_,i)=>event(i+1));
 const io=fetcher({pages:offset=>({items:offset===0?first:[event(100),event(101)],has_next:offset===0})});
 const result=await (await receiptReader(config,io))({userId,endUserLeafHash:leaf});
 assert.equal(result.status,'included');assert.equal(io.reads.filter(x=>x===100).length,1);
 const stuck=fetcher({pages:()=>({items:first,has_next:true}),target:1000});
 const pending=await (await receiptReader(config,stuck))({userId,endUserLeafHash:leaf});
 assert.equal(pending.status,'unresolved');assert.match(pending.reason,/did not advance/);assert.equal(stuck.reads.length,100);
}));
test('missing leaves make no requests; invalid identities or malformed listings cannot clear a broadcast',()=>fixture(async config=>{
 const read=await receiptReader(config,{fetchImpl:async()=>assert.fail('no network call')});
 assert.equal((await read({userId})).status,'unresolved');
 await assert.rejects(read({userId:0,endUserLeafHash:leaf}),/identity/);
 await assert.rejects(receiptReader(config,{maxPages:101}),/maxPages/);
 const malformed=await receiptReader(config,{fetchImpl:async()=>response({success:true,data:{items:[],user_id:124}})});
 await assert.rejects(malformed({userId,endUserLeafHash:leaf}),/listing/);
}));
test('historical reads overlap in bounded chunks and retain deterministic receipt selection',()=>fixture(async config=>{
 for(const concurrency of [1,4]){
  let active=0,peak=0,finished=0;const checks=[];
  const io=fetcher({pages:()=>({items:[1,2,3,4,5,6].map(event),has_next:false}),target:3});
  const fetchImpl=async(url,options)=>{
   if(options?.method==='POST'){
    active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));
    const result=await io.fetchImpl(url,options);active--;finished++;return result;
   }
   if(url.includes('/transaction/hash/'))checks.push({active,finished});
   return io.fetchImpl(url,options);
  };
  const result=await(await receiptReader(config,{fetchImpl,historyConcurrency:concurrency}))({userId,endUserLeafHash:leaf});
  assert.equal(result.status,'included');assert.equal(result.checkpoint,3);assert.equal(peak,concurrency);assert.equal(active,0);
  assert.deepEqual(checks,[{active:0,finished:concurrency===1?3:4}]);
 }
 await assert.rejects(receiptReader(config,{historyConcurrency:8}),/concurrency/);
}));
test('one failed historical candidate does not authorize a retry or hide a later exact included receipt',()=>fixture(async config=>{
 const io=fetcher({pages:()=>({items:[1,2,3,4].map(event),has_next:false}),target:3});
 const result=await(await receiptReader(config,{fetchImpl:async(url,options)=>{
  if(options?.method==='POST'&&JSON.parse(options.body).params.checkpoint_id===2)throw Error('read unavailable');
  return io.fetchImpl(url,options);
 }}))({userId,endUserLeafHash:leaf});
 assert.equal(result.status,'included');assert.equal(result.checkpoint,3);
 const bad=fetcher({pages:()=>({items:[1,2,3,4].map(event),has_next:false}),receiptPatch:{status:'pending'},target:3});
 assert.equal((await(await receiptReader(config,bad))({userId,endUserLeafHash:leaf})).status,'unresolved');
}));
test('single source-bounded candidate overlaps receipt and leaf, but both endpoints remain mandatory',()=>fixture(async config=>{
 for(const mutation of ['none','leaf','receipt']){
  const calls=[];let active=0,peak=0;
  const io=fetcher({pages:()=>({items:[event(101)],has_next:false}),...(mutation==='leaf'?{target:102}:{}),...(mutation==='receipt'?{receiptPatch:{owner_user_id:124}}:{})});
  const fetchImpl=async(url,options)=>{
   const endpoint=options?.method==='POST'?'leaf':url.includes('/transaction/hash/')?'receipt':'list';calls.push(endpoint);
   if(endpoint!=='list'){active++;peak=Math.max(active,peak);await new Promise(r=>setTimeout(r,5));}
   const result=await io.fetchImpl(url,options);if(endpoint!=='list')active--;return result;
  };
  const r=await(await receiptReader(config,{fetchImpl}))({userId,endUserLeafHash:leaf,minCheckpoint:101});
  assert.equal(r.status,mutation==='none'?'included':'unresolved');assert.equal(peak,2);assert.equal(active,0);assert.deepEqual(calls.sort(),['leaf','list','receipt']);
 }
}));
