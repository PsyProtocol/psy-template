import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicState} from './publicState.mjs';
import {READ_RPC_LIMIT} from './readConcurrency.mjs';
const leaf=(a,b,c,d)=>[d,c,b,a].map(x=>BigInt(x).toString(16).padStart(16,'0')).join('');
async function fixture(fn){
 const directory=await mkdtemp(join(tmpdir(),'psy-public-state-')),config=join(directory,'rpc.json'),original=globalThis.fetch;
 await writeFile(config,JSON.stringify({defaultNetwork:'test',networks:{test:{users_per_realm:1000,realm_configs:[{id:0,rpc_url:['https://r0.test']},{id:1,rpc_url:['https://r1.test']}],coordinator_configs:[{rpc_url:['https://c.test']}]}}}));
 try{await fn(config);}finally{globalThis.fetch=original;await rm(directory,{recursive:true,force:true});}
}
test('concurrent vault snapshots share one RPC bound; coalesced leaves decode all four slots at their checkpoint',()=>fixture(async config=>{
 let active=0,peak=0;const reads=[];
 globalThis.fetch=async(url,options)=>{
  const request=JSON.parse(options.body);active++;peak=Math.max(peak,active);
  await new Promise(r=>setTimeout(r,2));active--;reads.push(request);
  return {ok:true,text:async()=>JSON.stringify({result:request.method==='psy_get_latest_l2_block_state'?{checkpoint_id:url.includes('r0')?90:100}:leaf(11,22,33,44)})};
 };
 const snapshots=await Promise.all([publicState(config),publicState(config),publicState(config)]);
 const outputs=await Promise.all(snapshots.map(s=>Promise.all(Array.from({length:20},(_,i)=>Promise.all([0,1,2,3].map(slot=>s.slot(10+i,64,slot)))))));
 assert.equal(peak,READ_RPC_LIMIT);assert.equal(active,0);
 for(const snapshot of outputs)for(const row of snapshot)assert.deepEqual(row,[11n,22n,33n,44n]);
 const leaves=reads.filter(x=>x.method==='psy_get_user_contract_state_tree_leaf_hash');
 assert.equal(leaves.length,20);assert.ok(leaves.every(x=>x.params.checkpoint_id===90));
 await assert.rejects(snapshots[0].rpc('https://r0.test','psy_submit_transaction',{}),/read RPC/);
}));
test('leaf cache isolates contract, user and fresh snapshots; failed reads release capacity and do not leak partial fields',()=>fixture(async config=>{
 let head=100,calls=0,fail=true;
 globalThis.fetch=async(_url,options)=>{
  const request=JSON.parse(options.body);
  if(request.method==='psy_get_latest_l2_block_state')return {ok:true,text:async()=>JSON.stringify({result:{checkpoint_id:head}})};
  calls++;if(fail)throw Error('invalid leaf');
  return {ok:true,text:async()=>JSON.stringify({result:leaf(request.params.checkpoint_id,request.params.user_id,request.params.contract_id,4)})};
 };
 const s=await publicState(config);
 await assert.rejects(s.slot(10,64,0),/invalid leaf/);fail=false;
 // Failed snapshots remain unusable for that leaf; a new scan gets fresh data.
 await assert.rejects(s.slot(10,64,0),/invalid leaf/);assert.equal(calls,1);
 head=101;const fresh=await publicState(config);
 assert.equal(await fresh.slot(10,64,0),101n);assert.equal(await fresh.slot(11,64,1),11n);assert.equal(await fresh.slot(10,65,2),65n);
 const abi={contract:{state:[{name:'c',offset:2},{name:'a',offset:0},{name:'b',offset:1}]}};
 const f=await fresh.fields(10,64,abi,['c','a','b']);assert.deepEqual(Object.keys(f),['c','a','b']);assert.deepEqual(f,{c:64n,a:101n,b:10n});
 const before=calls;await assert.rejects(fresh.fields(10,64,abi,['a','missing']),/ABI field/);assert.equal(calls,before);
}));
test('a field read failure drains sibling RPCs before the scan can be retried',()=>fixture(async config=>{
 let active=0,finished=0;
 globalThis.fetch=async(_url,options)=>{
  const request=JSON.parse(options.body);
  if(request.method==='psy_get_latest_l2_block_state')return {ok:true,text:async()=>JSON.stringify({result:{checkpoint_id:100}})};
  active++;
  try{await new Promise(r=>setTimeout(r,request.params.leaf_id===0?1:10));if(request.params.leaf_id===0)throw Error('bad leaf');return {ok:true,text:async()=>JSON.stringify({result:leaf(1,2,3,4)})};}
  finally{active--;finished++;}
 };
 const s=await publicState(config),abi={contract:{state:[0,4,8,12].map((offset,i)=>({name:'f'+i,offset}))}};
 await assert.rejects(s.fields(10,64,abi,['f0','f1','f2','f3']),/bad leaf/);assert.equal(active,0);assert.equal(finished,4);
}));
test('malformed realm heads are rejected even if another valid head would hide them in the minimum',()=>fixture(async config=>{
 for(const bad of [100.5,Number.MAX_SAFE_INTEGER+1,0,null]){
  globalThis.fetch=async url=>({ok:true,text:async()=>JSON.stringify({result:{checkpoint_id:url.includes('r0')?90:bad}})});
  await assert.rejects(publicState(config),/realm checkpoint/);
 }
}));
test('invalid identifiers, slot indices and key hashes fail before issuing additional RPCs',()=>fixture(async config=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,text:async()=>JSON.stringify({result:{checkpoint_id:100}})};};
 const s=await publicState(config),before=calls;
 for(const [u,c,o]of [[0,64,0],[-1,64,0],[10,-1,0],[10,64,-1],[10,64,0.5],[10,64,4294967296],[10,Number.MAX_SAFE_INTEGER+1,0]])await assert.rejects(s.slot(u,c,o),/invalid/);
 await assert.rejects(s.contractLeaf(-1),/contract ID/);await assert.rejects(s.userIds('not-a-key'),/public key hash/);
 await assert.rejects(s.fields(10,64,{contract:{state:[{name:'same',offset:0},{name:'same',offset:4}]}},['same']),/duplicate ABI/);
 assert.equal(calls,before);
}));

test('asset initialization reads coalesce authenticated-root candidates at the fixed checkpoint and reject malformed hashes',()=>fixture(async config=>{
 const reads=[];globalThis.fetch=async(url,options)=>{const q=JSON.parse(options.body);reads.push({url,...q});return {ok:true,text:async()=>JSON.stringify({result:q.method==='psy_get_latest_l2_block_state'?{checkpoint_id:100}:q.params.contract_id===43?'invalid':'AB'.repeat(32)})};};
 const s=await publicState(config);const values=await Promise.all([s.contractStateRoot(1010,42),s.contractStateRoot(1010,42)]);assert.deepEqual(values,['ab'.repeat(32),'ab'.repeat(32)]);
 const rootReads=reads.filter(q=>q.method==='psy_get_user_contract_tree_leaf_hash');assert.equal(rootReads.length,1);assert.equal(rootReads[0].url,'https://r1.test');assert.deepEqual(rootReads[0].params,{checkpoint_id:100,user_id:1010,contract_id:42});
 await assert.rejects(s.contractStateRoot(1010,43),/invalid user contract root/);const before=reads.length;await assert.rejects(s.contractStateRoot(0,42),/user ID/);assert.equal(reads.length,before);
}));

test('explicit exact-integer RPC mode preserves a large nonce without changing legacy control reads',()=>fixture(async config=>{
 globalThis.fetch=async(_url,options)=>{const q=JSON.parse(options.body);if(q.method==='psy_get_latest_l2_block_state')return{ok:true,text:async()=>JSON.stringify({result:{checkpoint_id:100}})};return{ok:true,text:async()=>'{"jsonrpc":"2.0","id":1,"result":{"nonce":9007199254740993,"user_id":10}}',json:async()=>assert.fail('unsafe JSON integer conversion')};};
 const s=await publicState(config),leaf=await s.rpc('https://r0.test','psy_get_user_leaf_data',{checkpoint_id:100,user_id:10},{exactIntegers:true});assert.equal(leaf.nonce,9007199254740993n);assert.equal(leaf.user_id,10n);assert.equal(s.checkpoint,100);
}));

test('read observations label logical attempts and physical owners without recording parameters',()=>fixture(async config=>{
 const rows=[];let attempts=0;
 globalThis.fetch=async(_url,options)=>{const q=JSON.parse(options.body);
  if(q.method==='psy_get_latest_l2_block_state')return{ok:true,text:async()=>JSON.stringify({result:{checkpoint_id:100}})};
  if(++attempts===1)return{ok:false,status:503};
  return{ok:true,text:async()=>JSON.stringify({result:leaf(1,2,3,4)})};
 };
 const s=await publicState(config,{observeRead:r=>rows.push(r)});
 assert.deepEqual(await Promise.all([s.slot(10,64,0),s.slot(10,64,1)]),[1n,2n]);
 assert.equal(attempts,2);assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.failed),[false,false,true,false]);
 for(const r of rows){assert.ok(r.queueMilliseconds>=0);assert.ok(r.rpcAndParseMilliseconds>=0);assert.match(r.endpointHost,/^r[01]\.test$/);assert.equal('params'in r,false);assert.equal('result'in r,false);assert.equal('url'in r,false);}
 assert.equal(s.readMetricFailures,0);
 await assert.rejects(s.rpc('https://r0.test','psy_submit_transaction',{}),/read RPC/);assert.equal(rows.length,4);
}));
test('failed read telemetry neither changes exact result nor retries a successful read',()=>fixture(async config=>{
 let requests=0;globalThis.fetch=async(_url,options)=>{requests++;const q=JSON.parse(options.body);return{ok:true,text:async()=>JSON.stringify({result:q.method==='psy_get_latest_l2_block_state'?{checkpoint_id:100}:leaf(7,8,9,10)})};};
 const s=await publicState(config,{observeRead:()=>{throw Error('telemetry disk full');}});
 assert.equal(await s.slot(10,64,0),7n);assert.equal(requests,3);assert.equal(s.readMetricFailures,3);
 await assert.rejects(publicState(config,{observeRead:true}),/invalid read observer/);assert.equal(requests,3);
}));

test('in-flight snapshots share raw bytes but parse independent exact results and re-read completed heads',()=>fixture(async config=>{
 const rows=[];let calls=0;globalThis.fetch=async(_url,options)=>{calls++;const q=JSON.parse(options.body);await new Promise(r=>setTimeout(r,5));return new Response(q.method==='psy_get_latest_l2_block_state'?JSON.stringify({result:{checkpoint_id:100}}):'{"result":{"nonce":9007199254740993}}');};
 const [a,b]=await Promise.all([publicState(config,{observeRead:r=>rows.push(r)}),publicState(config,{observeRead:r=>rows.push(r)})]);assert.equal(calls,2);
 const [x,y]=await Promise.all([a.rpc('https://r0.test','psy_get_user_leaf_data',{checkpoint_id:100,user_id:10},{exactIntegers:true}),b.rpc('https://r0.test','psy_get_user_leaf_data',{checkpoint_id:100,user_id:10},{exactIntegers:true})]);assert.equal(calls,3);assert.equal(x.nonce,9007199254740993n);x.nonce=0n;assert.equal(y.nonce,9007199254740993n);assert.equal(rows.filter(r=>r.coalesced).length,3);assert.equal(rows.filter(r=>r.physicalReadOwner).length,3);
 await publicState(config);assert.equal(calls,5);await assert.rejects(publicState(config,{coalesceRead:'yes'}),/coalescing/);
}));

test('new contract metadata propagation retries only the same fixed-checkpoint read and returns observed words',()=>fixture(async config=>{
 const requests=[],observations=[];let attempts=0;
 globalThis.fetch=async(_url,options)=>{const q=JSON.parse(options.body);if(q.method==='psy_get_latest_l2_block_state')return new Response(JSON.stringify({result:{checkpoint_id:25379}}));requests.push(q);return new Response(JSON.stringify(++attempts===1?{error:{code:-32001,message:'contract 8 state tree height metadata is not available in Realm DB yet'}}:{result:leaf(9007199254740993n,22,33,44)}));};
 const s=await publicState(config,{observeRead:r=>observations.push(r)});
 assert.equal(await s.slot(10,8,0),9007199254740993n);assert.equal(await s.slot(10,8,1),22n);
 assert.equal(requests.length,2);assert.deepEqual(requests[1],requests[0]);assert.equal(requests[0].params.checkpoint_id,25379);
 assert.deepEqual(observations.map(r=>r.failed),[false,false,true,false]);
 await assert.rejects(s.rpc('https://r0.test','psy_submit_user_end_cap',{}),/read RPC/);assert.equal(requests.length,2);
}));
