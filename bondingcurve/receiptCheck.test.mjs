import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileSubmission, submissionLeaf } from './receiptCheck.mjs';

const userId = 1882112;
const leaf = 'a'.repeat(64);
const contentHash = 'b'.repeat(64);
const event = { tx_type: 'user_endcap', owner_user_id: userId, included_checkpoint_id: 42, content_hash: contentHash };
const receipt = { success: true, data: { status: 'included', owner_user_id: userId,
  included_checkpoint_id: 42, content_hash: contentHash } };
const request = { userId, endUserLeafHash: leaf, events: [event],
  readUserLeafHash: async () => leaf, readReceipt: async () => receipt };

test('a lost broadcast response can still be confirmed on chain', async () => {
  const candidate = submissionLeaf({ isError: true, data: {
    error: 'end cap submission rejected after proving deterministic leaf ' + leaf + ': connection closed',
  } });
  assert.equal(candidate.responseUncertain, true);
  assert.equal((await reconcileSubmission({ ...request, ...candidate })).status, 'included');
});

test('a submitted response without an indexed receipt remains unresolved', async () => {
  assert.deepEqual(submissionLeaf({ data: { submitted: true, endUserLeafHash: leaf } }),
    { endUserLeafHash: leaf, responseUncertain: false });
  assert.equal((await reconcileSubmission({ ...request, events: [] })).status, 'unresolved');
});

test('the historical leaf must match the expected state transition', async () => {
  assert.equal((await reconcileSubmission({ ...request, readUserLeafHash: async () => 'c'.repeat(64) })).status, 'unresolved');
});

test('another user or an inconsistent receipt cannot confirm this submission', async () => {
  const wrongUser = { ...event, owner_user_id: userId + 1 };
  assert.equal((await reconcileSubmission({ ...request, events: [wrongUser],
    readUserLeafHash: async () => { throw new Error('must not query another user'); } })).status, 'unresolved');
  const wrongReceipt = { success: true, data: { ...receipt.data, included_checkpoint_id: 43 } };
  assert.equal((await reconcileSubmission({ ...request, readReceipt: async () => wrongReceipt })).status, 'unresolved');
});

test('a read failure never becomes permission to retry a payment', async () => {
  const result = await reconcileSubmission({ ...request, readUserLeafHash: async () => { throw new Error('offline'); } });
  assert.equal(result.status, 'unresolved');
  assert.ok(result.errors.length);
  assert.equal(submissionLeaf({ data: { error: 'proving failed before broadcasting' } }), null);
});
