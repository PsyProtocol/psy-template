import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectU124Submission} from './u124Submission.mjs';
const binding={vaultId:100,contractId:1000,fingerprint:'b'.repeat(64)},leaf='e'.repeat(64);
const verified={fullUpsVerified:true,submitted:false,marketId:1000,fingerprint:binding.fingerprint,fee:1000004000,endUserLeafHash:leaf};
const broadcast={status:'broadcast_intent',userId:100,nonce:3,endUserLeafHash:leaf};
const rejected={ok:false,status:'rejected_before_submission',submitted:false,broadcastAttempted:false,userId:null,endUserLeafHash:null,error:'request_failed',reason:'assertion failed: no tokens to claim'};
const log=(...records)=>records.map(r=>JSON.stringify(r)).join('\n')+'\n';
test('recovery validates the exact UPS identity and vault even when the parent wrote no outcome',()=>{
 assert.equal(inspectU124Submission(log(verified,broadcast),binding).endUserLeafHash,leaf);
 for(const patch of [{marketId:1001},{fingerprint:'c'.repeat(64)},{fee:999999000},{fee:1000000001},{submitted:true},{fullUpsVerified:false},{endUserLeafHash:'f'.repeat(64)}])assert.throws(()=>inspectU124Submission(log({...verified,...patch},broadcast),binding));
 assert.throws(()=>inspectU124Submission(log(verified,{...broadcast,userId:101}),binding),/user binding|vault binding/);
 assert.throws(()=>inspectU124Submission(log(broadcast),binding),/missing independently verified/);
 assert.throws(()=>inspectU124Submission(log(verified,broadcast,{...broadcast,endUserLeafHash:'f'.repeat(64)}),binding),/conflicting/);
});
test('only a terminal, explicit prebroadcast rejection releases a task and retains its actual reason',()=>{
 const inspected=inspectU124Submission(log(rejected),binding);assert.equal(inspected.rejected,true);assert.equal(inspected.reason,rejected.reason);
 for(const patch of [{ok:true},{submitted:true},{broadcastAttempted:true},{status:'submission_unknown',userId:100,endUserLeafHash:leaf}])assert.equal(inspectU124Submission(log(verified,{...rejected,...patch}),binding).rejected,false);
 assert.equal(inspectU124Submission(log(verified,broadcast,rejected),binding).rejected,false);
 assert.equal(inspectU124Submission(log(rejected)+'proof still running\n',binding).rejected,true);
 assert.equal(inspectU124Submission(log(rejected,{status:'working'}),binding).rejected,false);
});
test('partial logs and verified proofs without a broadcast remain ambiguous',()=>{
 for(const output of ['', 'compress proof\n', log(verified),log(verified)+'{"status":"broadcast_intent"']){
  const inspected=inspectU124Submission(output,binding);assert.equal(inspected.rejected,false);assert.equal(inspected.endUserLeafHash,undefined);
 }
});
