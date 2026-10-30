// Structural checks supplement owned native Merkle verification and the SD-key.
// History index order is not evidence of seed secrecy or canonical finality.
import assert from 'node:assert/strict';
import {sha256} from './requestBinding.mjs';
import {validateMinimumStreamPlan} from './minimumSourcePlan.mjs';
import {planMinimumBudget} from '../batching/checkpoint-stream/minimum-budget.mjs';
export const SEALED_MINIMUM_PROFILE='source-covered-producer-sealed-minimum-v1';
export function validateSealedMinimumStreamPlan(plan,source,pages,queue){
 assert.equal(plan.profile,SEALED_MINIMUM_PROFILE);assert.equal(plan.sealedHistoryOrderVerified,true);assert.equal(plan.seedSecrecyAuthenticated,false);
 assert.match(plan.acceptedSealSha256,/^[a-f0-9]{64}$/);
 const s=BigInt(plan.sourceCheckpoint),c=BigInt(plan.acceptedSealCheckpoint),d=BigInt(plan.drawCheckpoint);
 assert.ok(s<c&&c<d&&d===s+32n&&d<2n**32n,'one accepted seal strictly before fixed delayed draw');
 // Only reuse the unchanged rank-v1/permutation structure. This projection does
 // not change the real draw, which the new native key and bytecode verify.
 const structural={...plan,profile:'source-covered-producer-minimum-stream-v1',drawCheckpoint:(s+1n).toString()};
 const checked=validateMinimumStreamPlan(structural,source,pages,queue);
 return {...checked,profile:SEALED_MINIMUM_PROFILE,sealedHistoryOrderVerified:true,acceptedSealCheckpoint:c.toString(),drawCheckpoint:d.toString(),seedSecrecyAuthenticated:false,causalSealBeforeReleaseAuthenticated:false,finalityVerified:false,canSign:false,canBroadcast:false};
}
export function planSealedMinimumBudget(plan,cost){
 assert.equal(plan.profile,SEALED_MINIMUM_PROFILE);assert.equal(BigInt(plan.drawCheckpoint),BigInt(plan.sourceCheckpoint)+32n);
 const base=planMinimumBudget({...plan,profile:'source-covered-producer-minimum-stream-v1',drawCheckpoint:(BigInt(plan.sourceCheckpoint)+1n).toString()},cost);
 const requiredCheckpoints=base.requiredCheckpoints+33;
 return {...base,profile:SEALED_MINIMUM_PROFILE,requiredCheckpoints,planningConditionsFit:BigInt(base.requiredFeeBudgetBaseUnits)<=BigInt(base.availableFeeBudgetBaseUnits)&&requiredCheckpoints<base.availableCheckpoints,drawWaitCheckpointsReserve:33,inputSha256:sha256(JSON.stringify({plan,cost},(_k,v)=>typeof v==='bigint'?v.toString():v)),scope:base.scope+'; additionally reserves the fixed draw delay and one subsequent historical opening',canSign:false,canBroadcast:false};
}
