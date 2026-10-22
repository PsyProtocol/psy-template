// Explicit, inspected pre-proof replacement evidence. Never creates/signs a
// transaction and never treats a missing receipt as permission to retry.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync}from'node:fs';
import {join}from'node:path';import{createHash}from'node:crypto';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
const exact=path=>parseLosslessJson(readFileSync(path,'utf8'));
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
// Reviewed diagnostic format: this binary writes this phase before any proof
// or broadcast. A claimed no-send field from an arbitrary binary is not enough.
export const PRESESSION_DIAGNOSTIC_DRIVER_SHA256='65d16ecf29db6d7d8c0a8204df9219a52976b488efaafa0511a8100d68e2f22a';
// The reviewed driver reaches these phases before adding the key, starting a
// session, proving or broadcasting.
export const PRESESSION_PHASES=['verify-ordinary-input-and-dependencies','start-ordinary-session'];
export function assertPreSessionFailure(path){
 const f=exact(path);assert.deepEqual(Object.keys(f).sort(),['automaticRetry','broadcastMayHaveBeenAttempted','ok','phase','privateDataSuppressed','reasonCode','suppressedErrorSha256'].sort());
 assert.equal(f.automaticRetry,false);assert.equal(f.ok,false);assert.equal(f.broadcastMayHaveBeenAttempted,false,'ambiguous original transmission');assert.equal(f.privateDataSuppressed,true);assert.ok(PRESESSION_PHASES.includes(f.phase),'original progressed beyond reviewed pre-proof phase');assert.equal(f.reasonCode,'RPC_CONNECTION');assert.match(f.suppressedErrorSha256,/^[0-9a-f]{64}$/);
 return f;
}
export function ordinaryEvidenceDirectory(base,label,expectedUserId){
 assert.match(label,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
 const original=join(base,'attempts',label),file=join(base,'public/ordinary-recoveries',label+'.json');
 if(!existsSync(file))return original;
 const r=JSON.parse(readFileSync(file,'utf8'));assert.ok([1,2].includes(r.version));assert.equal(r.originalLabel,label);
 assert.match(r.replacementLabel,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.notEqual(r.replacementLabel,label);
 assert.ok(Number.isSafeInteger(r.userId)&&r.userId>0&&r.userId<16777216);
 if(expectedUserId!==undefined)assert.equal(r.userId,expectedUserId,'recovery belongs to another actor');
 if(r.version===1)assert.equal(readdirSync(original).length,0,'original has proof/intent evidence; manual reconciliation required');
 else{
  assert.deepEqual(readdirSync(original),['failure.json'],'original has proof/intent evidence; manual reconciliation required');
  assert.equal(r.originalDriverSha256,PRESESSION_DIAGNOSTIC_DRIVER_SHA256,'unreviewed diagnostic driver');
  assert.equal(sha(join(original,'failure.json')),r.originalFailureSha256,'original failure evidence changed');
  assertPreSessionFailure(join(original,'failure.json'));
 }
 const replacement=join(base,'attempts',r.replacementLabel),oldInput=join(base,'public',label+'.json'),newInput=join(base,'public',r.replacementLabel+'.json'),receipt=join(replacement,'included.json');
 for(const [path,digest]of [[oldInput,r.originalInputSha256],[newInput,r.replacementInputSha256],[receipt,r.receiptSha256],[join(replacement,'request.json'),r.requestSha256]])assert.equal(sha(path),digest,'recovery evidence changed');
 const a=exact(oldInput),b=exact(newInput);assert.deepEqual(b.calls,a.calls,'recovery business calls differ');assert.deepEqual(b.contracts,a.contracts,'recovery dependencies differ');
 const included=exact(receipt),pre=included.preflight,request=exact(join(replacement,'request.json')),intent=exact(join(replacement,'intent.json'));
 assert.equal(included.userId,BigInt(r.userId));assert.equal(included.receipt.success,true);assert.equal(included.receipt.data.owner_user_id,BigInt(r.userId));assert.equal(included.receipt.data.status,'included');assert.equal(included.receipt.data.content_hash,included.contentHash);assert.equal(included.receipt.data.included_checkpoint_id,included.checkpoint);assert.ok(included.commonCheckpoint>=included.checkpoint);assert.equal(included.endUserLeafHash,pre.endUserLeafHash);
 assert.equal(pre.fullUpsVerified,true);assert.equal(pre.broadcast,false);assert.equal(pre.userId,BigInt(r.userId));assert.equal(pre.inputSha256,r.replacementInputSha256);assert.equal(intent.userId,BigInt(r.userId));assert.equal(intent.nonce,pre.nonce);assert.equal(pre.core.new_user_leaf.user_id,BigInt(r.userId));assert.equal(pre.core.new_user_leaf.nonce,pre.nonce);assert.equal(pre.core.state_transition.user_id,BigInt(r.userId));assert.equal(intent.endUserLeafHash,pre.endUserLeafHash);assert.equal(request.user_ec_input.core.state_transition.end_user_leaf_hash,pre.endUserLeafHash);assert.deepEqual(request.user_ec_input.core,pre.core);
 return replacement;
}
