// Public artifact graph/fee audit only. Every request additionally requires
// independent fixed-resource cryptographic verification; report flags are not
// network receipts, ordinary approvals or proof of consensus finality.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
const HASH=/^[0-9a-f]{64}$/;

export function auditReachableBookRows(report,rows){
 for(const field of ['fullUpsVerified','emptyVaultAtStart','noPostGenesisVmActorMutation',
  'ordinaryOrdersFundingAndClaims','fundingClaimedBeforeSpend','globalPriceTimePriority',
  'originalSetAndExpiryPreserved','feeExhaustionRejected','explicitFeeRecovery',
  'cancelAfterSeal','duplicateFillAndRefundRejected','bothAmountLimbsNonzero',
  'assetConservation','nativeConservationIncludingAllFees'])assert.equal(report[field],true,field);
 assert.equal(report.broadcast,false);assert.equal(report.financialOperations,0);
 assert.equal(report.randomMode,false);assert.equal(report.wholeOrderFills,1);
 assert.equal(report.timeoutRefunds,1);assert.equal(report.ordinaryFinalClaims,2);
 assert.equal(report.ordinaryRefundClaims,1);assert.ok(report.sourcePages>=2);
 assert.equal(rows.length,report.completeUps);assert.ok(rows.length>12&&rows.length<=40);
 const names=new Set(),identities=new Set(),actors=new Map();let ordinary=0,vault=0,ordinaryFee=0n,vaultFee=0n,registered;
 const ordered=[...rows].sort((a,b)=>a.core.checkpoint_id<b.core.checkpoint_id?-1:1);
 for(const [i,row]of ordered.entries()){
  const {core:c,verification:v}=row,user=c.new_user_leaf.user_id,nonce=c.new_user_leaf.nonce;
  assert.ok(!names.has(row.stage),'duplicate stage');names.add(row.stage);
  assert.match(row.requestSha256,HASH);assert.ok(!identities.has(row.requestSha256),'duplicate exact request identity');identities.add(row.requestSha256);assert.equal(v.fullUpsVerified,true);
  assert.equal(v.broadcast,false);assert.equal(c.new_user_leaf.last_checkpoint_id,c.checkpoint_id);
  const before=actors.get(user.toString());
  assert.equal(nonce,before?before.nonce+1n:1n,'per-account exact nonce chain');
  if(before){assert.equal(c.state_transition.start_user_leaf_hash,before.end,'linked starting state');assert.equal(c.new_user_leaf.public_key,before.key);}
  if(i>0)assert.ok(c.checkpoint_id>ordered[i-1].core.checkpoint_id,'unique increasing accepted checkpoints');
  const fee=c.stats.guta_fees_collected+c.stats.da_fees_collected;
  assert.equal(c.stats.guta_fees_collected,1_000_000_000n);
  assert.equal(c.stats.da_fees_collected,c.stats.slots_modified*1000n);
  assert.ok(fee<=1_000_100_000n);assert.equal(fee,BigInt(v.fee));
  if(user===100n){
   vault++;vaultFee+=fee;assert.equal(v.fixedVerifier,true);
   assert.equal(c.state_transition.start_user_leaf_hash,v.storedStartLeaf);
   assert.ok(row.plan&&row.source,'vault stage must carry its original source/plan');
   assert.equal(row.plan.registered_key.length,4);
   if(registered)assert.deepEqual(row.plan.registered_key,registered,'one exact registered vault key across stages');
   else registered=row.plan.registered_key;
  }else{
   ordinary++;ordinaryFee+=fee;assert.ok([5n,600n,200n,201n].includes(user));
   assert.equal(v.ordinarySignatureVerified,true);assert.equal(v.actualApprovedStackVerified,true);
   const burn=v.calls.at(-1);assert.equal(burn.contract_id,0);assert.equal(burn.method_name,'burn');
   assert.equal(BigInt(burn.inputs[0]),fee);
  }
  actors.set(user.toString(),{nonce,end:c.state_transition.end_user_leaf_hash,key:c.new_user_leaf.public_key});
 }
 assert.equal(ordinary,report.ordinaryUps);assert.equal(vault,report.sdKeyUps);
 assert.equal(ordinaryFee.toString(),report.ordinaryFee);assert.equal(vaultFee,BigInt(report.sdKeyFee));
 for(const stage of ['owner-initial-authorization','issuer-exact-activation-seeds',
  'issuer-funds-counterparty-outbox','counterparty-ordinary-funding-claim',
  'maker-ordinary-receive-state-claim','maker-approved-order','taker-approved-order','owner-explicit-recovery-grant',
  'maker-ordinary-final-claim','taker-ordinary-final-claim',
  'maker-unmatched-order','maker-cancels-after-seal','maker-ordinary-refund-claim'])assert.ok(names.has(stage),stage);
 assert.equal(actors.size,5);
 return {scope:'Saved public account/nonce/fee graph; independent fixed-resource verification and live receipts remain separate',
  completeUps:rows.length,ordinaryUps:ordinary,sdKeyUps:vault,actors:actors.size,
  ordinaryFee:ordinaryFee.toString(),sdKeyFee:vaultFee.toString(),financialOperations:0};
}

export async function auditReachableBook(root){
 const report=JSON.parse(await readFile(join(root,'REPORT.json'),'utf8')),rows=[];
 for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isDirectory()){
  const dir=join(root,entry.name),bytes=await readFile(join(dir,'request.json'));
  const request=parseLosslessJson(bytes.toString());assert.ok(Array.isArray(request.proof)&&request.proof.length>0);
  const verification=JSON.parse(await readFile(join(dir,'verification.json'),'utf8'));
  const row={stage:entry.name,requestSha256:sha256(bytes),core:request.user_ec_input.core,verification};
  if(row.core.new_user_leaf.user_id===100n){
   row.plan=parseLosslessJson(await readFile(join(dir,'plan.json'),'utf8'));
   row.source=parseLosslessJson(await readFile(join(dir,'source.json'),'utf8'));
  }
  rows.push(row);
 }
 rows.sort((a,b)=>a.core.checkpoint_id<b.core.checkpoint_id?-1:1);
 return {...auditReachableBookRows(report,rows),requests:rows.map(r=>({stage:r.stage,requestSha256:r.requestSha256,checkpoint:r.core.checkpoint_id.toString()}))};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await auditReachableBook(process.argv[2]),null,2));
