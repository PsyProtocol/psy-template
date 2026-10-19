import assert from 'node:assert/strict';
import {driverRecords,submissionLeaf} from './driverProcess.mjs';
import {FEE_ESCROW} from '../amm/u124/client.mjs';
export function inspectU124Submission(output,{vaultId,contractId,fingerprint,requireGuard=false,callsSha256,guardSha256}){
 const records=driverRecords(output),hash=submissionLeaf(output);
 const verified=records.filter(r=>Object.hasOwn(r,'fullUpsVerified'));
 for(const [name,value]of Object.entries({callsSha256,guardSha256}))if(value!==undefined)assert.match(value,/^[0-9a-f]{64}$/,`expected ${name} encoding`);
 for(const r of verified){
  for(const [name,value]of Object.entries({callsSha256,guardSha256}))if(value!==undefined)assert.equal(r[name],value,`submission ${name} binding`);
  if(requireGuard)assert.equal(r.submissionGuardVerified,true,'submission guard verification missing');
  assert.equal(r.fullUpsVerified,true,'submission UPS verification');assert.equal(r.submitted,false,'verification must precede broadcast');assert.equal(r.marketId,contractId,'submission market binding');assert.equal(r.fingerprint,fingerprint,'submission fingerprint binding');
  assert.ok(Number.isSafeInteger(r.fee)&&r.fee>=1000000000&&BigInt(r.fee)<=FEE_ESCROW&&r.fee%1000===0,'submission fee binding');
 }
 for(const r of records.filter(r=>['broadcast_intent','submission_unknown','rejected_before_submission'].includes(r.status))){
  if(r.userId!==null&&r.userId!==undefined)assert.equal(r.userId,vaultId,'submission vault binding');
  if(['broadcast_intent','submission_unknown'].includes(r.status))assert.equal(r.userId,vaultId,'broadcast user binding');
 }
 if(hash){assert.ok(verified.length,'broadcast missing independently verified UPS identity');for(const r of verified)assert.equal(r.endUserLeafHash,hash,'verified/broadcast leaf binding');}
 const last=records.at(-1),rejected=!hash&&last?.ok===false&&last.status==='rejected_before_submission'&&last.submitted===false&&last.broadcastAttempted===false&&!records.some(r=>['broadcast_intent','submission_unknown'].includes(r.status));
 return {endUserLeafHash:hash,rejected,reason:rejected?(last.reason??last.error??'explicit rejection before transmission'):undefined,phase:hash?'broadcast':rejected?'rejected-before-submission':verified.length?'verified-before-broadcast':'proving-or-interrupted'};
}
