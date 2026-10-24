// Reporting gate only. It never authorizes submission or treats an expired
// proof as reusable. Both old and actual requests are independently verified.
import assert from'node:assert/strict';
export function abandonedCalibration({marker,failure,manifestDigest,requestDigest,old,guard,records,actual}){
 assert.equal(marker.oldWhollyUnbroadcast,true);assert.equal(marker.startLeafUnchanged,true);assert.equal(manifestDigest,marker.proof.manifestSha256);
 assert.deepEqual(failure,{automaticRetry:false,broadcastMayHaveBeenAttempted:false,ok:false,phase:'check-prepared-live-state',reason:'prepared broadcast window expired'});
 assert.ok(BigInt(marker.checkpoint)>BigInt(guard.validUntilCheckpoint));assert.ok(records.some(r=>r.taskId===marker.oldTaskId&&r.status==='proved'&&r.proof.manifestSha256===manifestDigest));assert.ok(!records.some(r=>r.taskId===marker.oldTaskId&&r.status==='broadcast-intent'),'abandoned calibration must never have reached a financial intent');
 const found=actual.filter(r=>String(r.userId)===String(old.new_user_leaf.user_id)&&String(r.nonce)===String(old.new_user_leaf.nonce));assert.equal(found.length,1);const consumed=found[0];assert.equal(consumed.startUserLeafHash,old.state_transition.start_user_leaf_hash);assert.notEqual(consumed.requestSha256,requestDigest);
 return{comparisonAvailable:false,reason:'unsigned calibration exhausted original submission window; actual fresh proof fully verified separately',oldTaskId:marker.oldTaskId,oldRequestSha256:requestDigest,actualRequestSha256:consumed.requestSha256,confirmedNonceReceipt:consumed.contentHash,broadcast:false};
}
