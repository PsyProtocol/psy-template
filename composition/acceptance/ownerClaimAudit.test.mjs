import test from 'node:test';
import assert from 'node:assert/strict';
import {checkClaimAmounts, auditOwnerClaims} from './ownerClaimAudit.mjs';
import {MAX_AMOUNT} from '../../token/wide/arithmetic.mjs';

test('historical claim audit uses both U124 limbs and exact cumulative cursors', () => {
  const amount = (1n<<62n)+17n;
  const row = {before:amount, after:amount*2n, sent:amount+1n, claimed:1n, newClaimed:amount+1n};
  assert.equal(checkClaimAmounts(row), amount);
  for (const patch of [{after:row.after-1n}, {newClaimed:row.newClaimed-1n},
    {sent:0n}, {after:MAX_AMOUNT+1n}, {before:Number(amount)}]) {
    assert.throws(() => checkClaimAmounts({...row, ...patch}));
  }
});

test('native claim must reconcile actual receipt fee; pending zero is legitimate', () => {
  const row = {before:100n, after:147n, sent:70n, claimed:20n, newClaimed:70n, fee:3n, wide:false};
  assert.equal(checkClaimAmounts(row), 50n);
  assert.throws(() => checkClaimAmounts({...row, fee:4n}));
  assert.equal(checkClaimAmounts({before:10n, after:10n, sent:5n, claimed:5n, newClaimed:5n}), 0n);
});

test('partial audit rejects unknown, repeated or empty scenarios before any file or RPC read', async () => {
  for (const scenarios of [[], ['success','success'], ['../.secrets']]) {
    await assert.rejects(auditOwnerClaims('/not-read', '/not-read', scenarios),
      error => error.code === 'ERR_ASSERTION');
  }
});
