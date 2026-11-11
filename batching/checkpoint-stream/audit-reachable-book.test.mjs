// Public graph refusal tests only. These fixtures are not cryptographic proofs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {auditReachableBookRows} from './audit-reachable-book.mjs';
const h=n=>n.toString(16).padStart(64,'0');
function fixture(){
 const names=[['owner-initial-authorization',600],['issuer-exact-activation-seeds',5],
  ['book-bootstrap',100],['issuer-funds-counterparty-outbox',5],
  ['counterparty-ordinary-funding-claim',201],['maker-ordinary-receive-state-claim',200],['maker-approved-order',200],
  ['taker-approved-order',201],['book-open',100],['owner-explicit-recovery-grant',600],
  ['book-recovery',100],['book-cover0',100],['book-cover1',100],['book-scan',100],
  ['book-fill',100],['maker-ordinary-final-claim',200],['taker-ordinary-final-claim',201],
  ['maker-unmatched-order',200],['book-refund-open',100],['maker-cancels-after-seal',200],
  ['book-refund-cover0',100],['book-refund-cover1',100],['book-refund',100],
  ['maker-ordinary-refund-claim',200]];
 const before=new Map();const rows=names.map(([stage,u],i)=>{
  const prior=before.get(u),fee=1000001000n,end=h(1000+i),key=h(u),nonce=prior?prior.nonce+1n:1n;
  const core={checkpoint_id:BigInt(100+i),new_user_leaf:{user_id:BigInt(u),nonce,public_key:key,last_checkpoint_id:BigInt(100+i)},
   state_transition:{start_user_leaf_hash:prior?.end??h(0),end_user_leaf_hash:end},
   stats:{guta_fees_collected:1000000000n,da_fees_collected:1000n,slots_modified:1n}};
  const verification={fullUpsVerified:true,broadcast:false,fee:Number(fee),fixedVerifier:u===100,
   storedStartLeaf:core.state_transition.start_user_leaf_hash,ordinarySignatureVerified:u!==100,
   actualApprovedStackVerified:u!==100,calls:[{contract_id:0,method_name:'burn',inputs:[Number(fee)]}]};
  before.set(u,{nonce,end});return{stage,requestSha256:h(i+1),core,verification,...(u===100?{plan:{registered_key:[1n,2n,3n,4n]},source:{fields:[]}}:{})};
 });
 const report={};for(const field of ['fullUpsVerified','emptyVaultAtStart','noPostGenesisVmActorMutation','ordinaryOrdersFundingAndClaims','fundingClaimedBeforeSpend','globalPriceTimePriority','originalSetAndExpiryPreserved','feeExhaustionRejected','explicitFeeRecovery','cancelAfterSeal','duplicateFillAndRefundRejected','bothAmountLimbsNonzero','assetConservation','nativeConservationIncludingAllFees'])report[field]=true;
 Object.assign(report,{broadcast:false,financialOperations:0,randomMode:false,wholeOrderFills:1,timeoutRefunds:1,ordinaryFinalClaims:2,ordinaryRefundClaims:1,sourcePages:2,completeUps:24,ordinaryUps:13,sdKeyUps:11,ordinaryFee:String(13n*1000001000n),sdKeyFee:Number(11n*1000001000n)});
 return{report,rows};
}
test('complete five-account public nonce/fee graph is audited without claiming proof or network acceptance',()=>{
 const {report,rows}=fixture(),result=auditReachableBookRows(report,rows);
 assert.equal(result.completeUps,24);assert.equal(result.ordinaryUps,13);assert.equal(result.actors,5);
 assert.match(result.scope,/independent fixed-resource/);
 assert.deepEqual(auditReachableBookRows(report,[...rows].reverse()),result);
});
for(const change of ['missing','duplicate','duplicate-request','registered-key','nonce','start','key','checkpoint','fee','burn','unsigned','vm-only','report-total','wrong-actor','no-source'])test('reachable book graph rejects '+change,()=>{
 const {report,rows}=fixture();
 if(change==='missing')rows.pop();
 if(change==='duplicate')rows[1].stage=rows[0].stage;
 if(change==='duplicate-request')rows[1].requestSha256=rows[0].requestSha256;
 if(change==='registered-key')rows.find(r=>r.stage==='book-fill').plan.registered_key[0]++;
 if(change==='nonce')rows.at(-1).core.new_user_leaf.nonce++;
 if(change==='start')rows.at(-1).core.state_transition.start_user_leaf_hash=h(999);
 if(change==='key')rows.at(-1).core.new_user_leaf.public_key=h(999);
 if(change==='checkpoint')rows.at(-1).core.checkpoint_id=rows.at(-2).core.checkpoint_id;
 if(change==='fee')rows.at(-1).core.stats.da_fees_collected++;
 if(change==='burn')rows.at(-1).verification.calls[0].inputs[0]++;
 if(change==='unsigned')rows.at(-1).verification.ordinarySignatureVerified=false;
 if(change==='vm-only')report.noPostGenesisVmActorMutation=false;
 if(change==='report-total')report.ordinaryFee='0';
 if(change==='wrong-actor')rows.at(-1).core.new_user_leaf.user_id=999n;
 if(change==='no-source')delete rows[2].source;
 assert.throws(()=>auditReachableBookRows(report,rows));
});
