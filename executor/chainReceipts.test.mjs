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
