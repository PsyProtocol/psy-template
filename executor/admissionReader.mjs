import {assertDeterministicOrdering} from '../batching/random-order/sourceGate.mjs';
// Unaccepted intents are hints, never a claim of market-wide completeness.
import assert from 'node:assert/strict';
import {scanBatch} from '../batching/v2/reader.mjs';
import {compactRequest,scanAdmission,queueMaintenance} from '../batching/admission/reader.mjs';
import {losslessJson,parseLosslessJson,FEE_ESCROW as F} from '../amm/u124/client.mjs';
import{BULK_ADMISSION,bulkAdmissionRequest}from'../batching/admission/bulk.mjs';
import {publicState} from './publicState.mjs';
export function validateAdmissionPlan(p){
 assertDeterministicOrdering(p);
 assert.ok(p&&typeof p==='object'&&!Array.isArray(p));
 assert.ok(Object.keys(p).every(k=>['version','epoch','cutoff','members'].includes(k)));
 assert.equal(p.version,1);assert.ok(Number.isSafeInteger(p.epoch)&&p.epoch>0&&p.epoch<2**32);
 assert.ok(Number.isSafeInteger(p.cutoff)&&p.cutoff>0&&p.cutoff<2**32);
 assert.ok(Array.isArray(p.members)&&p.members.length<=4);
 let previous=0;for(const m of p.members){assert.deepEqual(Object.keys(m).sort(),['nonce','owner']);assert.ok(Number.isSafeInteger(m.owner)&&m.owner>previous&&m.owner<16777216);assert.ok(typeof m.nonce==='string'&&/^[1-9]\d*$/.test(m.nonce)&&BigInt(m.nonce)<2n**62n);previous=m.owner;}
 return p;
}
export async function scanExecutorAdmission(o,readState=publicState,files){
 const s=await readState(o.rpcConfig),base=await scanAdmission(o,async()=>s,files);
 if(!base.action&&base.reason==='sponsor-funding-required')return {...base,fundingRequest:{payer:o.batchSponsorId,vault:o.vaultId,purpose:1,amount:(2n*F).toString(),operation:'commit_batch',manualReviewIfPendingDeltaDiffers:true}};
 if(base.action||!['epoch-not-started','epoch-complete','awaiting-consented-admissions-and-seal'].includes(base.reason))return base;
 const plan=validateAdmissionPlan(files.admissionPlan),V=o.vaultId,C=o.contractId;
 const offsets=new Map(files.abi.contract.state.map(f=>[f.name,f.offset]));
 const at=(u,n,i=0)=>{assert.ok(offsets.has(n),'admission field '+n);return s.slot(u,C,offsets.get(n)+i);};
 const [phase,epoch,count,cutoff]=await Promise.all(['queue_phase','queue_epoch','queue_count','queue_cutoff'].map(n=>at(V,n)));
 // Recovery discovery is an explicit hint list, independent of admission.
 // Never let scanBatch select an active order outside the accepted universe.
 const recoverable=[];
 for(const owner of [...new Set([...(o.users??[]),...plan.members.map(m=>m.owner)])].sort((a,b)=>a-b)){
  if(owner===V)continue;
  const [enrolled,kind,pool,nonce,used]=await Promise.all([at(owner,'recovery_pool'),at(owner,'kind'),at(owner,'pool'),at(owner,'nonce'),at(V,'consumed',owner)]);
  if(enrolled===BigInt(V)&&(kind===0n||pool!==BigInt(V)||nonce<=used))recoverable.push(owner);
 }
 if(recoverable.length){
  const recovery=await scanBatch({...o,users:recoverable,automaticGraduation:false},async()=>s,files);
  if(recovery.action){assert.equal(recovery.action.kind,'batch_maintenance');const f=parseLosslessJson(recovery.action.submission).software_defined_call.inputs;return {...recovery,recoveryScope:'explicit sender recovery enrollment; no global discovery',action:{...recovery.action,profile:'compact-v1',validUntilCheckpoint:String(s.checkpoint+64),submission:losslessJson(compactRequest(files.policy,f))}};}
  if(recovery.reason==='asset-account-initialization-required')return {...recovery,recoveryScope:'explicit sender recovery enrollment; authenticated asset account required'};
  if(recovery.reason==='recovery-gas-sponsorship-required'){const pending=BigInt(recovery.sponsorPending),required=2n*F;assert.equal(recovery.requiredTotal,required.toString());return {...base,reason:recovery.reason,fundingRequest:{payer:o.batchSponsorId,vault:V,purpose:2,amount:required.toString(),requiredTotal:required.toString(),pending:pending.toString(),additionalAmount:pending<=required?(required-pending).toString():null,manualReviewIfPendingDeltaDiffers:true,operation:'fund-gas-then-recovery'}};}
 }
 let name,a,b=0n,bulkMembers;
 if([0n,3n].includes(phase)){
  if(BigInt(plan.epoch)!==epoch+1n)return {...base,reason:'admission-plan-not-next-epoch'};
  if(plan.cutoff<=s.checkpoint||plan.cutoff>s.checkpoint+128)return {...base,reason:'admission-plan-cutoff-unavailable'};
  name='start_epoch';a=BigInt(plan.epoch);b=BigInt(plan.cutoff);
 }else{
  assert.equal(phase,1n);
  if(BigInt(s.checkpoint)>cutoff){name=count===0n?'abort_empty_epoch':'seal_epoch';a=epoch;}
  else{
   if(BigInt(plan.epoch)!==epoch||BigInt(plan.cutoff)!==cutoff)return {...base,reason:'admission-plan-epoch-mismatch'};
   const accepted=await Promise.all([0,1,2,3].map(i=>at(V,'queue_owner',i)));if(count===4n)return {...base,reason:'queue-full-awaiting-cutoff'};
   if(o.admissionMode==='all-four-v1'&&plan.members.length===4&&count===0n){
    const checks=await Promise.all(plan.members.map(async m=>{if(m.owner===V||m.owner===o.batchSponsorId)return false;const[e,c,n,orderNonce,pool,kind,used]=await Promise.all([at(m.owner,'admission_epoch'),at(m.owner,'admission_cutoff'),at(m.owner,'admission_nonce'),at(m.owner,'nonce'),at(m.owner,'pool'),at(m.owner,'kind'),at(V,'consumed',m.owner)]);return e===epoch&&c===cutoff&&n===BigInt(m.nonce)&&orderNonce===n&&pool===BigInt(V)&&kind!==0n&&n>used;}));
    if(checks.every(Boolean)){name=BULK_ADMISSION;bulkMembers=plan.members;}
    else {
     // Opt-in pre-admission liveness policy. Existing keys already authorize
     // single entries; never change or drop an accepted/frozen member.
     const remaining=cutoff-BigInt(s.checkpoint),fallback=o.bulkFallbackRemainingCheckpoints;
     if(fallback===undefined||remaining>BigInt(fallback)||!checks.some(Boolean))return {...base,reason:'awaiting-all-four-authenticated-consents',eligibleHintCount:checks.filter(Boolean).length,proofVerified:false};
     const member=plan.members[checks.indexOf(true)];name='admit_entry';a=BigInt(member.owner);b=BigInt(member.nonce);
    }
   }else{
   for(const m of plan.members){if(m.owner===V||accepted.includes(BigInt(m.owner)))continue;
    const [e,c,n,orderNonce,pool,kind,used]=await Promise.all([at(m.owner,'admission_epoch'),at(m.owner,'admission_cutoff'),at(m.owner,'admission_nonce'),at(m.owner,'nonce'),at(m.owner,'pool'),at(m.owner,'kind'),at(V,'consumed',m.owner)]);
    if(e===epoch&&c===cutoff&&n===BigInt(m.nonce)&&orderNonce===n&&pool===BigInt(V)&&kind!==0n&&n>used){name='admit_entry';a=BigInt(m.owner);b=n;break;}
   }
   if(!name)return {...base,reason:'no-eligible-consented-plan-members',unacceptedScope:'plan hints only; no global inclusion guarantee'};
   }
  }
 }
 const payer=o.batchSponsorId;
 const [sent,claimed,baseFee,pool,amount,nonce,used,purpose]=await Promise.all([s.slot(payer,0,3+2*V),s.slot(V,0,4+2*payer),at(V,'settled_fee',payer),at(payer,'sponsor_pool'),at(payer,'sponsor_amount'),at(payer,'sponsor_nonce'),at(V,'used_sponsorship',payer),at(payer,'sponsor_purpose')]);
 if(claimed!==baseFee||sent-baseFee!==F||pool!==BigInt(V)||amount!==F||nonce<=used||purpose!==2n)return {...base,action:null,reason:'admission-gas-sponsorship-required',fundingRequest:{payer,vault:V,purpose:2,amount:F.toString(),nextSponsorshipNonce:(nonce+1n).toString(),operation:name}};
 const {reason:_priorReason,...proposal}=base;
 return {...proposal,action:{kind:'batch_maintenance',maintenanceOperation:name,gasAuthorizationNonce:nonce.toString(),profile:'compact-v1',validUntilCheckpoint:String((name==='admit_entry'||name===BULK_ADMISSION)?Math.min(Number(cutoff),s.checkpoint+64):s.checkpoint+64),submission:losslessJson(name===BULK_ADMISSION?bulkAdmissionRequest(files.policy,{payer:BigInt(payer),members:bulkMembers}):queueMaintenance(files.policy,{name,payer:BigInt(payer),a,b}))}};
}
