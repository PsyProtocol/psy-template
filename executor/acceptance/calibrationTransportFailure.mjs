// A missing performance sample never weakens financial verification.
import assert from'node:assert/strict';
export function calibrationTransportFailure(f){
 assert.equal(f.ok,false);assert.equal(f.automaticRetry,false);assert.equal(f.broadcastMayHaveBeenAttempted,false);assert.equal(f.phase,'check-prepared-live-state');assert.match(f.reason,/Connection error to https:\/\/[^ ]+: error sending request|operation timed out|connection reset|Failed to parse JSON response: EOF while parsing a value at line 1 column 0/);return f;
}
