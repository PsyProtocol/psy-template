// Two independently timed observations can describe ONE exact included UPS.
// Observation timestamps/common heads may differ; signed bytes, indexed result
// and the historical endpoint cannot. This never counts a second payment.
import assert from'node:assert/strict';import{sha256}from'./requestBinding.mjs';
export function validateReceiptAlias(a,b,requestA,requestB){
 assert.equal(sha256(requestA),sha256(requestB),'receipt aliases must bind identical signed bytes');
 for(const r of[a,b]){assert.equal(r.status,'included');assert.equal(r.receipt.success,true);assert.equal(r.receipt.data.status,'included');assert.equal(r.receipt.data.content_hash,r.contentHash);assert.equal(BigInt(r.receipt.data.owner_user_id),BigInt(r.userId));assert.equal(BigInt(r.receipt.data.included_checkpoint_id),BigInt(r.checkpoint));assert.ok(BigInt(r.commonCheckpoint)>=BigInt(r.checkpoint));}
 for(const key of['contentHash','endUserLeafHash'])assert.equal(a[key],b[key]);for(const key of['userId','checkpoint'])assert.equal(BigInt(a[key]),BigInt(b[key]));
 assert.deepEqual(a.receipt.data.result,b.receipt.data.result);assert.deepEqual(a.receipt.data.slot_updates,b.receipt.data.slot_updates);return true;
}
