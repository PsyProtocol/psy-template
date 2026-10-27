import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketChainGuard} from './chainGuard.mjs';
const root='a'.repeat(64),bundle={registry:{network:{chainRootAt1:root}},networkConfig:{coordinator_configs:[{rpc_url:['https://coordinator.invalid']}]} };
const response=(value,ok=true)=>({ok,text:async()=>JSON.stringify(value)});
const observed=(value=root)=>({jsonrpc:'2.0',id:1,result:{global_chain_root:value}});
test('fresh anchor checks coalesce only in-flight reads and stop after a reset',async()=>{
 let calls=0,release;let value=root;
 const guard=createMarketChainGuard({bundle,fetcher:async(url,options)=>{
  calls++;assert.equal(url,'https://coordinator.invalid');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
  assert.deepEqual(JSON.parse(options.body),{jsonrpc:'2.0',id:1,method:'psy_get_checkpoint_leaf_data',params:{checkpoint_id:1}});
  if(calls===1)await new Promise(resolve=>{release=resolve;});
  return response(observed(value));
 }});
 const a=guard(),b=guard();assert.equal(calls,1);release();await Promise.all([a,b]);
 await guard();assert.equal(calls,2);
 value='b'.repeat(64);await assert.rejects(guard(),/chain instance changed/);assert.equal(calls,3);
 value=root;await guard();assert.equal(calls,4);
});
test('malformed, unavailable, oversized and failed reads never authorize preparation',async()=>{
 for(const reply of [response(observed(),false),response({...observed(),id:2}),response({...observed(),error:{code:-1}}),response({result:observed().result}),response(observed('BAD')), {ok:true,text:async()=>' '.repeat(65537)}]){
  await assert.rejects(createMarketChainGuard({bundle,fetcher:async()=>reply})());
 }
 const guard=createMarketChainGuard({bundle,fetcher:async()=>{throw Error('offline');}});await assert.rejects(guard());await assert.rejects(guard());
 assert.throws(()=>createMarketChainGuard({bundle:{...bundle,registry:{network:{}}}}));
});
test('a changed chain stops reviewed AMM preparation before any proof or durable task',async()=>{
 const {fixtureRegistry,observed,swapRequest,NOW}=await import('../../executor/gateway/fixtures.mjs');
 const {buildAmmPlan}=await import('../ammPlan.mjs');
 const {digest}=await import('../protocol.mjs');
 const {createPrepareOnlyMarketService}=await import('./prepareService.mjs');
 const registry=await fixtureRegistry();registry.network.chainRootAt1=root;
 const registryHash=await digest(registry),snapshot=observed(registry,registryHash),request=swapRequest();
 // Preserve the fixture's validity while the clock advances in this test.
 const oldNow=Date.now;Date.now=()=>NOW;
 let proofs=0,writes=0;
 try{
  const plan=buildAmmPlan(snapshot,request,registry,{now:NOW,registryHash}),base={schema:1,request,snapshot,plan};
  const record={...base,registryHash,recordId:await digest(base)};
  const service=createPrepareOnlyMarketService({bundle:{registry,registryHash,networkConfig:bundle.networkConfig},store:{get:async()=>undefined,set:async()=>{writes++;}},provider:{},prepareTrace:async()=>{proofs++;throw Error('must not prove');},parse:JSON.parse,stringify:JSON.stringify,fetcher:async()=>response(observedAnchor())});
  function observedAnchor(){return {jsonrpc:'2.0',id:1,result:{global_chain_root:'b'.repeat(64)}};}
  const context={origin:'http://127.0.0.1:5273',account:snapshot.user.publicKeyHash,userId:request.userId,networkHash:await digest(registry.network),fingerprint:'d'.repeat(64),chainKey:'c'.repeat(64)};
  await assert.rejects(service.prepare(context,record),/chain instance changed/);
  assert.equal(proofs,0);assert.equal(writes,0);
 }finally{Date.now=oldNow;}
});
