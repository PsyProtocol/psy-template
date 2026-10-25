// Explicit reviewed delivery of one immutable signed operation. This does not
// grant permission, sign, infer rejection, clear a gate or submit anything.
import assert from 'node:assert/strict';import{sha256}from'./requestBinding.mjs';
import{parseLosslessJson,losslessJson}from'../amm/u124/client.mjs';
export function validateOrdinaryExactRecovery({inputBytes,requestBytes,input,request,preflight,intent,verification,expectedUserId,expectedPublicKeyHash,expectedNonce}){
 assert.deepEqual(parseLosslessJson(losslessJson(input)),parseLosslessJson(inputBytes.toString()));assert.deepEqual(parseLosslessJson(losslessJson(request)),parseLosslessJson(requestBytes.toString()));
 const c=request.user_ec_input.core;assert.deepEqual(c,preflight.core);assert.equal(preflight.fullUpsVerified,true);assert.equal(preflight.inputSha256,sha256(inputBytes));assert.equal(preflight.endUserLeafHash,c.state_transition.end_user_leaf_hash);
 assert.equal(c.new_user_leaf.user_id,BigInt(expectedUserId));assert.equal(c.new_user_leaf.public_key,expectedPublicKeyHash);assert.equal(c.new_user_leaf.nonce,BigInt(expectedNonce));assert.equal(intent.userId,c.new_user_leaf.user_id);assert.equal(intent.nonce,c.new_user_leaf.nonce);assert.equal(intent.endUserLeafHash,preflight.endUserLeafHash);assert.equal(intent.retryAllowed,false);
 assert.equal(verification.requestSha256,sha256(requestBytes));assert.equal(verification.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(verification.metadataEndpointsAndFeesVerified,true);assert.equal(BigInt(verification.userId),c.new_user_leaf.user_id);assert.equal(BigInt(verification.nonce),c.new_user_leaf.nonce);assert.equal(verification.publicKeyHash,expectedPublicKeyHash);assert.equal(verification.startUserLeafHash,c.state_transition.start_user_leaf_hash);assert.equal(verification.endUserLeafHash,preflight.endUserLeafHash);
 assert.ok(input.validUntilCheckpoint>=c.checkpoint_id);assert.equal(input.calls.software_defined_call.inputs.length,0);
 return {userId:c.new_user_leaf.user_id,nonce:c.new_user_leaf.nonce,start:c.state_transition.start_user_leaf_hash,end:preflight.endUserLeafHash,sourceCheckpoint:c.checkpoint_id,validUntilCheckpoint:input.validUntilCheckpoint,requestSha256:sha256(requestBytes)};
}
