// Public shape guard for an explicitly reviewed fee-only nonce retirement.
// This is NOT a substitute for complete cryptographic proof verification or
// fresh identity/network/anchor/dependency/expiry checks. It never transmits.
import assert from'node:assert/strict';
import{decodeFeltSlot}from'../orderbook/matcherCore.mjs';
import{sha256}from'./requestBinding.mjs';
// This validates the prior transport evidence, never grants permission for an
// additional send. The calling acceptance entry still requires separate human
// authorization and preserves both immutable per-nonce transmission fences.
export function validatePriorOversizedRetirement({priorFence,priorRequestBytes,priorResponseMeta,priorResponseBody,userId,nonce}){
 assert.equal(BigInt(priorFence.userId),BigInt(userId));assert.equal(BigInt(priorFence.nonce),BigInt(nonce));
 assert.equal(sha256(priorRequestBytes),priorFence.requestSha256);
 assert.equal(BigInt(priorResponseMeta.httpStatus),413n);assert.equal(priorResponseMeta.automaticRetry,false);
 assert.ok(['invalid or oversized body','invalid or oversized body\n'].includes(priorResponseBody.toString()),'unexpected prior rejection body');
 return {priorRequestSha256:priorFence.requestSha256,priorHttpStatus:413n,priorOutcomeRetired:false};
}
export function validateNonceRetirement({input,preflight,request,review}){
 const e=request.user_ec_input,c=e.core,fee=1_000_001_000n;
 assert.deepEqual(c,preflight.core);assert.equal(preflight.fullUpsVerified,true);
 assert.equal(c.new_user_leaf.user_id,BigInt(review.userId));assert.equal(c.new_user_leaf.public_key,review.publicKeyHash);
 assert.equal(c.new_user_leaf.nonce,BigInt(review.originalNonce));assert.equal(c.state_transition.start_user_leaf_hash,review.start);
 assert.equal(preflight.endUserLeafHash,review.candidateEnd);assert.notEqual(review.candidateEnd,review.originalEnd);
 const expectedStats={guta_fees_collected:1_000_000_000n,da_fees_collected:1000n,user_ops_processed:1n,total_transactions:2n,slots_modified:1n};
 assert.deepEqual(Object.keys(c.stats).sort(),Object.keys(expectedStats).sort());for(const[k,v]of Object.entries(expectedStats))assert.equal(c.stats[k],v);
 assert.deepEqual(input.calls.software_defined_call.inputs,[]);assert.equal(input.calls.contract_calls.length,1);
 const call=input.calls.contract_calls[0];assert.equal(call.method_name,'noop');assert.equal(call.contract_id,2497n);assert.deepEqual(call.inputs,[]);
 assert.deepEqual(e.events,[]);assert.equal(e.contract_state_updates.length,1);
 const u=e.contract_state_updates[0];assert.equal(u.user_contract_tree_update_proof.index,0n,'only native contract state may change');assert.equal(u.updates.length,1);
 assert.deepEqual(Object.keys(u.updates[0]),['Positional']);const delta=u.updates[0].Positional.delta_proof;assert.equal(delta.index,0n,'only the native balance leaf may change');
 for(const h of[delta.old_value,delta.new_value])assert.match(h,/^[0-9a-f]{64}$/);
 for(let i=1;i<4;i++)assert.equal(decodeFeltSlot(delta.old_value,i),decodeFeltSlot(delta.new_value,i),'no outbox, asset or order mutation');
 const before=decodeFeltSlot(delta.old_value,0),after=decodeFeltSlot(delta.new_value,0);assert.ok(before>=fee);assert.equal(before-after,fee,'exact fee only');
 return{userId:c.new_user_leaf.user_id,nonce:c.new_user_leaf.nonce,start:review.start,end:review.candidateEnd,fee,sourceCheckpoint:c.checkpoint_id};
}
