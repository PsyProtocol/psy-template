import assert from 'node:assert/strict';
import test from 'node:test';
import {cancelRemoveCalls, withPoolSignInputs} from './operationCalls.mjs';
import {authorizePoolTransaction} from './sdKeyPolicyReference.mjs';

test('funded LP removal cancellation cannot include a payout', () => {
  const ids = {poolContractId: 1504, poolUserId: 100, payerId: 200};
  const data = cancelRemoveCalls({...ids, nonce: 3});
  assert.deepEqual(withPoolSignInputs(data).software_defined_call.inputs,
    [10, 200, 0, 0, 0, 3, 0]);
  const calls = [...data.contract_calls,
    {contract_id: 0, method_name: 'simple_burn', inputs: [1_000_010_000]}];
  assert.equal(authorizePoolTransaction({...ids, contractCalls: calls}).action,
    'cancel_remove');
  const redirected = structuredClone(calls);
  redirected[2] = {contract_id: 4, method_name: 'simple_transfer', inputs: [300, 1]};
  assert.throws(() => authorizePoolTransaction({...ids, contractCalls: redirected}),
    /differs from the guarded operation/);
  assert.throws(() => cancelRemoveCalls({...ids, nonce: 0}), /nonce/);
});
