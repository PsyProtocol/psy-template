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
  return {ok:true,json:async()=>({result:request.method==='psy_get_latest_l2_block_state'?{checkpoint_id:url.includes('r0')?90:100}:leaf(11,22,33,44)})};
 };
 const snapshots=await Promise.all([publicState(config),publicState(config),publicState(config)]);
 const outputs=await Promise.all(snapshots.map(s=>Promise.all(Array.from({length:20},(_,i)=>Promise.all([0,1,2,3].map(slot=>s.slot(10+i,64,slot)))))));
 assert.equal(peak,READ_RPC_LIMIT);assert.equal(active,0);
 for(const snapshot of outputs)for(const row of snapshot)assert.deepEqual(row,[11n,22n,33n,44n]);
 const leaves=reads.filter(x=>x.method==='psy_get_user_contract_state_tree_leaf_hash');
 assert.equal(leaves.length,60);assert.ok(leaves.every(x=>x.params.checkpoint_id===90));
 await assert.rejects(snapshots[0].rpc('https://r0.test','psy_submit_transaction',{}),/read RPC/);
}));
test('leaf cache isolates contract, user and fresh snapshots; failed reads release capacity and do not leak partial fields',()=>fixture(async config=>{
 let head=100,calls=0,fail=true;
 globalThis.fetch=async(_url,options)=>{
  const request=JSON.parse(options.body);
  if(request.method==='psy_get_latest_l2_block_state')return {ok:true,json:async()=>({result:{checkpoint_id:head}})};
  calls++;if(fail)throw Error('invalid leaf');
  return {ok:true,json:async()=>({result:leaf(request.params.checkpoint_id,request.params.user_id,request.params.contract_id,4)})};
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
  if(request.method==='psy_get_latest_l2_block_state')return {ok:true,json:async()=>({result:{checkpoint_id:100}})};
  active++;
  try{await new Promise(r=>setTimeout(r,request.params.leaf_id===0?1:10));if(request.params.leaf_id===0)throw Error('bad leaf');return {ok:true,json:async()=>({result:leaf(1,2,3,4)})};}
  finally{active--;finished++;}
 };
 const s=await publicState(config),abi={contract:{state:[0,4,8,12].map((offset,i)=>({name:'f'+i,offset}))}};
 await assert.rejects(s.fields(10,64,abi,['f0','f1','f2','f3']),/bad leaf/);assert.equal(active,0);assert.equal(finished,4);
}));
