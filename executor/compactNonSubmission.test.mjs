import test from 'node:test';
import assert from 'node:assert/strict';
import {assertConnectStageFailure} from './acceptance/compactNonSubmission.mjs';

const base = {ok: false, phase: 'broadcast-compact-ups', broadcastMayHaveBeenAttempted: true, automaticRetry: false};
test('only a never-established connection during compact broadcast can be resolved as not submitted', () => {
 assertConnectStageFailure({...base, reason: 'error sending request for url (https://realm0-stg.psy-protocol.xyz/): client error (Connect): tcp connect error: Operation timed out (os error 60)'});
 for (const reason of ['error sending request for url (https://realm0-stg.psy-protocol.xyz/): operation timed out', 'HTTP 500', 'error decoding response body', 'connection closed before message completed'])
  assert.throws(() => assertConnectStageFailure({...base, reason}));
 assert.throws(() => assertConnectStageFailure({...base, phase: 'prove-compact-endcap', reason: 'client error (Connect): tcp connect error'}));
});
