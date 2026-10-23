// Measurement-only preflight. A transport failure may remove a sample, never
// weaken the independently verified warm proof or authorize any transmission.
import assert from'node:assert/strict';
const phases=new Set(['initialize-staging-session','verify-live-identity-and-dependencies','start-compact-session','prove-compact-calls','prove-compact-session-signature','prove-compact-endcap']);
export function assertReadOnlyCalibrationFailure(f){
 assert.equal(f.ok,false);assert.equal(f.automaticRetry,false);assert.equal(f.broadcastMayHaveBeenAttempted,false);assert.ok(phases.has(f.phase),'unexpected calibration failure phase');
 assert.match(f.reason,/Connection error to https:\/\/[^ ]+: error sending request|client error \(Connect\): tcp connect error|connection reset|operation timed out/i,'not a reviewed transport failure');return f;
}
export async function optionalCalibration({existingFailure,run,readFailure,onUnavailable}){
 if(existingFailure){await onUnavailable(assertReadOnlyCalibrationFailure(existingFailure));return null;}
 try{return await run();}catch(error){const f=await readFailure();if(!f)throw error;assertReadOnlyCalibrationFailure(f);await onUnavailable(f);return null;}
}
