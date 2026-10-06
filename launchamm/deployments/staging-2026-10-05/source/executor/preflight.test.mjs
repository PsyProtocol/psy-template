import assert from 'node:assert/strict';
import test from 'node:test';
import {retryProofOnlyPreflight} from './preflight.mjs';
import {ReadUnavailable} from './readRetry.mjs';
const options={attempts:3,delayMs:0};
test('proof-only driver recovers explicit transport failures',async()=>{
 let proofCalls=0;
 const result=await retryProofOnlyPreflight(async()=>{
  if(++proofCalls<3)throw Object.assign(Error('read timeout'),{stderr:'Connection error to https://realm.test: error sending request for url (https://realm.test/)'});
  return {proofOnly:true};
 },options);
 assert.equal(proofCalls,3);assert.deepEqual(result,{proofOnly:true});
});
test('proof-only transport retry is bounded; contract assertion is not retried',async()=>{
 let calls=0;
 await assert.rejects(retryProofOnlyPreflight(async()=>{calls++;throw Object.assign(Error('timeout'),{stderr:'error sending request for url (https://realm.test/)'});},options),ReadUnavailable);
 assert.equal(calls,3);calls=0;
 await assert.rejects(retryProofOnlyPreflight(async()=>{calls++;throw Error('fee escrow mismatch');},options),/fee escrow mismatch/);
 assert.equal(calls,1);
});
