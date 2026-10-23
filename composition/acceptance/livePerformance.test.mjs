import test from 'node:test';
import assert from 'node:assert/strict';
import {observedConfirmation, matchVerifiedReceipt, summarizePublicReads} from './livePerformance.mjs';

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
