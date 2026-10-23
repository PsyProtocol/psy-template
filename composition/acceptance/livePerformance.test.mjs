import test from 'node:test';
import assert from 'node:assert/strict';
import {observedConfirmation, matchVerifiedReceipt, summarizePublicReads, observedWarmTransition} from './livePerformance.mjs';

test('missing acknowledgement is unknown, not zero; reversed or invalid observation time rejects', () => {
  const included = {checkedAt:'2026-10-24T01:01:00Z'};
  assert.equal(observedConfirmation(null, included), null);
  assert.equal(observedConfirmation({finishedAt:'2026-10-24T01:00:00Z'}, included), 60000);
  assert.throws(() => observedConfirmation({finishedAt:'2026-10-24T01:02:00Z'}, included));
  assert.throws(() => observedConfirmation({finishedAt:'not-a-date'}, included));
});

test('public read measurements retain failures, fractional timing and missing observations', () => {
  const row = {schema:1,phase:'public-rpc-read',method:'psy_get_user_leaf_data',endpointHost:'realm.example',
    failed:false,queueMilliseconds:0.25,rpcAndParseMilliseconds:10.5};
  const result = summarizePublicReads([row,{...row,failed:true,queueMilliseconds:null,rpcAndParseMilliseconds:null}]);
  const group = Object.values(result.methods)[0];
  assert.equal(result.observedAttempts, 2);
  assert.equal(group.failed, 1);
  assert.equal(group.missingQueueTimings, 1);
  assert.equal(group.missingRpcTimings, 1);
  assert.equal(group.rpcOperationSumMilliseconds, 10.5);
  assert.equal(group.maximumRpcMilliseconds, 10.5);
  for (const value of [NaN, Infinity, -1]) {
    assert.throws(() => summarizePublicReads([{...row,rpcAndParseMilliseconds:value}]));
  }
});

test('performance cannot attribute a proof from another receipt, payer or exact fee', () => {
  const row = {contentHash:'a', userId:1445056n, fee:1000017000n};
  matchVerifiedReceipt(row, {...row});
  for (const patch of [{contentHash:'b'}, {userId:134336n}, {fee:row.fee+1n}]) {
    assert.throws(() => matchVerifiedReceipt(row, {...row, ...patch}));
  }
});

test('warm resource observation must join exact included intent, operation and original process',()=>{
 const fund={taskId:'a',task:{intentId:'i',operation:'fund'},result:{status:'included'},
   adapterInstanceId:'455540b4-1175-45af-9019-e051467d44a5',parentPid:1358n};
 const open={...fund,taskId:'b',task:{intentId:'i',operation:'open-1'}};
 assert.equal(observedWarmTransition(fund,open,'i').warmTransitionVerified,true);
 for(const patch of [{parentPid:8098n},{adapterInstanceId:'a5fc61cf-296e-4e03-b1f4-f910bb0f8354'},{parentPid:undefined}])
   assert.equal(observedWarmTransition(fund,{...open,...patch},'i').warmTransitionVerified,false);
 assert.throws(()=>observedWarmTransition(fund,open,'another-intent'));
 assert.throws(()=>observedWarmTransition(fund,{...open,result:{status:'unresolved'}},'i'));
});
