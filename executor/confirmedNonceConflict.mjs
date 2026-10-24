// A confirmed mutually exclusive TIMEOUT ABORT can prove an older ambiguous
// admission can never execute. Missing receipts / expiry alone never suffice.
import assert from'node:assert/strict';
const hash=x=>assert.match(x,/^[0-9a-f]{64}$/),nonce=x=>{assert.match(x,/^[1-9][0-9]*$/);const n=BigInt(x);assert.ok(n<18446744069414584321n);return n;};
export function validateConfirmedNonceConflict(e,{vaultId,fingerprint,manifestSha256}={}){
 assert.equal(e.schema,1);assert.equal(e.kind,'expired-empty-epoch-abort');assert.equal(e.fullOriginalProofVerified,true);assert.equal(e.fullResolutionProofVerified,true);assert.equal(e.nativeResolutionStackAndSessionVerified,true);assert.equal(e.originalOperation,'admit_entry');assert.equal(e.resolutionOperation,'abort_empty_epoch');assert.equal(e.userId,vaultId);assert.equal(e.fingerprint,fingerprint);assert.equal(e.originalPreparedManifestSha256,manifestSha256);
 for(const x of[e.fingerprint,e.publicKeyHash,e.originalStartLeaf,e.resolutionStartLeaf,e.originalEndLeaf,e.resolutionEndLeaf,e.originalRequestSha256,e.resolutionRequestSha256,e.originalPreparedManifestSha256,e.resolutionPreparedManifestSha256,e.verifierSha256])hash(x);
 assert.ok(nonce(e.originalNonce)>=2n);assert.equal(e.originalNonce,e.resolutionNonce);assert.equal(e.originalStartLeaf,e.resolutionStartLeaf);assert.notEqual(e.originalEndLeaf,e.resolutionEndLeaf);assert.notEqual(e.originalRequestSha256,e.resolutionRequestSha256);
 for(const x of[e.originalSourceCheckpoint,e.resolutionSourceCheckpoint,e.queueCutoff])assert.ok(Number.isSafeInteger(x)&&x>0&&x<2**32);assert.ok(e.originalSourceCheckpoint<=e.queueCutoff&&e.resolutionSourceCheckpoint>e.queueCutoff);
 const r=e.resolutionReceipt;assert.equal(r.status,'included');assert.equal(r.userId,vaultId);assert.equal(r.endUserLeafHash,e.resolutionEndLeaf);hash(r.contentHash);assert.ok(Number.isSafeInteger(r.checkpoint)&&r.checkpoint>=e.resolutionSourceCheckpoint);assert.ok(Number.isSafeInteger(r.commonCheckpoint)&&r.commonCheckpoint>=r.checkpoint);return e;
}
