import test from 'node:test';import assert from 'node:assert/strict';
import {isMissingCheckpointSpine,assertMaterializedActorObservation,checkOrdinaryCheckpointReadiness} from './ordinaryCheckpointReadiness.mjs';
const h=c=>c.repeat(64),actorId=1136000,failed=149690,current=149700;
const approvedActor={userId:actorId,publicKeyHash:h('1'),startUserLeafHash:h('2'),nextNonce:'3'};
const leaf={user_id:BigInt(actorId),public_key:h('1'),nonce:2n};
const input=()=>({rpcConfig:'/public/config.json',actorId,failedCheckpoint:failed,approvedActor:structuredClone(approvedActor),validUntilCheckpoint:149816});
const missing=cp=>Object.assign(new Error(JSON.stringify({code:-32001,message:`User tree proof not found for checkpoint_id ${cp}`})),{});
function state({missingAt=[],mutateLeaf=x=>x,raw=h('2'),failMethod,mutateProof=x=>x,coordinator=current,head=current}={}){
 const calls=[],top={index:1n,value:h('c'),root:h('a'),siblings:Array(12).fill(h('d'))};
 return {calls,networkName:'testnet',network:{global_user_tree_height:32,realm_user_tree_height:20,users_per_realm:2**20,realm_configs:[{id:0,rpc_url:['https://realm0.invalid']},{id:1,rpc_url:['https://realm1.invalid']}]},heads:[{checkpoint_id:head},{checkpoint_id:head}],coordinator:'https://coordinator.invalid',
  rpc:async(url,method,params)=>{calls.push({url,method,params});assert.ok(method.startsWith('psy_get_'),'read methods only');if(method===failMethod)throw Error('unknown public RPC failure');
   if(method==='psy_get_latest_l2_block_state')return {checkpoint_id:coordinator};
   if(missingAt.includes(params.checkpoint_id)&&method==='psy_get_user_tree_root')throw missing(params.checkpoint_id);
   if(method==='psy_get_user_tree_root')return h('a');
   if(method==='psy_get_user_tree_merkle_proof')return mutateProof({index:BigInt(actorId),value:raw,root:h('a'),siblings:[...Array(20).fill(h('e')),...top.siblings]});
   if(method==='psy_get_user_sub_tree_merkle_proof'){assert.equal(params.leaf_level,12);assert.equal(params.leaf_index,1);return top;}
   if(method==='psy_get_user_leaf_data')return mutateLeaf(structuredClone(leaf));
   if(method==='psy_get_user_tree_leaf_hash')return raw;
   throw Error('unexpected method '+method);
  }};
}
test('only the exact named missing-spine RPC shape is classified',()=>{
 assert.equal(isMissingCheckpointSpine(missing(failed),failed),true);
 assert.equal(isMissingCheckpointSpine({code:-32001,message:`User tree proof not found for checkpoint_id ${failed}`},failed),true);
 for(const error of [missing(failed+1),Error('User tree proof not found for checkpoint_id '+failed),{code:-32002,message:`User tree proof not found for checkpoint_id ${failed}`},
  {code:-32001,message:`User tree proof not found for checkpoint_id ${failed}`,data:{resource:'mismatch'}},
  {code:-32001,message:`User tree proof not found for checkpoint_id 0${failed}`},Error('verifier resource mismatch'),Error('HTTP 503')])assert.equal(isMissingCheckpointSpine(error,failed),false);
});
test('materialized observation requires exact raw anchor, identity, key, nonce and original expiry',()=>{
 const observation={actorId,approvedActor,checkpointId:current,validUntilCheckpoint:149816,leaf,rawHash:h('2')};
 assert.equal(assertMaterializedActorObservation(observation).observedNonce,'2');
 for(const change of [{rawHash:h('3')},{rawHash:'0'.repeat(64)},{leaf:{...leaf,nonce:3n}},{leaf:{...leaf,nonce:2}},{leaf:{...leaf,public_key:h('4')}},
  {leaf:{...leaf,user_id:1136001n}},{validUntilCheckpoint:current-1},{approvedActor:{...approvedActor,nextNonce:'03'}}])assert.throws(()=>assertMaterializedActorObservation({...observation,...change}));
});
test('old missing proof and ready common head are observations without source reselection or financial authority',async()=>{
 const s=state({missingAt:[failed]}),before=input(),report=await checkOrdinaryCheckpointReadiness(before,{readState:async()=>s});
 assert.equal(report.startupReadsObservedReady,true);assert.equal(report.observations[0].status,'missing-checkpoint-spine');assert.equal(report.observations[1].status,'available-observation');
 assert.equal(report.cryptographicVerification,false);assert.equal(report.sourceCheckpointSelected,false);assert.equal(report.signingFieldsAdded,false);assert.equal(report.financialOperations,0);assert.equal(report.broadcast,false);
 assert.deepEqual(before,input());assert.ok(s.calls.length<=9,'bounded logical read count');
 assert.ok(s.calls.every(c=>c.url!=='https://realm0.invalid'),'actor realm selected from configured partition');
 assert.equal(s.calls.filter(c=>c.method==='psy_get_user_sub_tree_merkle_proof').length,1,'SDK top-spine dependency checked even for full realm proof');
});
test('ready historical proof never substitutes for missing current head or realm ahead of coordinator',async()=>{
 const s=state({missingAt:[current]}),r=await checkOrdinaryCheckpointReadiness(input(),{readState:async()=>s});
 assert.equal(r.startupReadsObservedReady,false);assert.equal(r.observations[0].status,'available-observation');assert.equal(r.observations[1].status,'missing-checkpoint-spine');assert.equal(r.sourceCheckpointSelected,false);
 const s2=state({coordinator:current-1}),r2=await checkOrdinaryCheckpointReadiness(input(),{readState:async()=>s2});assert.equal(r2.startupReadsObservedReady,false);
});
test('unknown read failures, malformed proofs and changed actor evidence reject instead of retrying a transaction',async()=>{
 for(const options of [{failMethod:'psy_get_user_tree_root'},{mutateProof:p=>({...p,siblings:[]})},{mutateProof:p=>({...p,index:1n})},
  {mutateProof:p=>({...p,root:h('f')})},{mutateLeaf:l=>({...l,nonce:3n})},{mutateLeaf:l=>({...l,public_key:h('3')})},{raw:h('4')}]){
  const s=state(options);await assert.rejects(checkOrdinaryCheckpointReadiness(input(),{readState:async()=>s}));assert.ok(s.calls.every(c=>c.method.startsWith('psy_get_')));
 }
 const s=state();await assert.rejects(checkOrdinaryCheckpointReadiness({...input(),validUntilCheckpoint:current-1},{readState:async()=>s}),/expired/);
});

test('actual frozen SDK accepts observed full32 or bottom20 shape and rejects wrong24',async()=>{
 const full=state(),r=await checkOrdinaryCheckpointReadiness(input(),{readState:async()=>full});
 assert.equal(r.observations[1].realmProofHeight,32);assert.equal(r.observations[1].coordinatorProofHeight,12);assert.equal(r.observations[1].sdkStitchedProofHeight,32);
 const partial=state({mutateProof:p=>({...p,root:h('c'),siblings:p.siblings.slice(0,20)})});
 assert.equal((await checkOrdinaryCheckpointReadiness(input(),{readState:async()=>partial})).startupReadsObservedReady,true);
 const wrong=state({mutateProof:p=>({...p,siblings:p.siblings.slice(0,24)})});await assert.rejects(checkOrdinaryCheckpointReadiness(input(),{readState:async()=>wrong}),/realm proof height/);
 const changed=state();changed.network.global_user_tree_height=24;await assert.rejects(checkOrdinaryCheckpointReadiness(input(),{readState:async()=>changed}),/frozen global/);
});
