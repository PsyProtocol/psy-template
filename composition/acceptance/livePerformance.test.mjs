import test from 'node:test';
import assert from 'node:assert/strict';
import {observedConfirmation, matchVerifiedReceipt} from './livePerformance.mjs';

test('missing acknowledgement is unknown, not zero; reversed or invalid observation time rejects', () => {
  const included = {checkedAt:'2026-10-24T01:01:00Z'};
  assert.equal(observedConfirmation(null, included), null);
  assert.equal(observedConfirmation({finishedAt:'2026-10-24T01:00:00Z'}, included), 60000);
  assert.throws(() => observedConfirmation({finishedAt:'2026-10-24T01:02:00Z'}, included));
  assert.throws(() => observedConfirmation({finishedAt:'not-a-date'}, included));
});

test('performance cannot attribute a proof from another receipt, payer or exact fee', () => {
  const row = {contentHash:'a', userId:1445056n, fee:1000017000n};
  matchVerifiedReceipt(row, {...row});
  for (const patch of [{contentHash:'b'}, {userId:134336n}, {fee:row.fee+1n}]) {
    assert.throws(() => matchVerifiedReceipt(row, {...row, ...patch}));
  }
});
