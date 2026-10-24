// Propose a NEW epoch only. This is a bounded timing hint, not authorization,
// authenticated order inclusion or permission to alter an accepted/frozen set.
import assert from'node:assert/strict';import{validateAdmissionPlan}from'./admissionReader.mjs';
export function proposeIntakeWindow({checkpoint,queueEpoch,queuePhase,batchPhase,batchReady,members,observedCycleCheckpoints,observedMembers,setupBudgetCheckpoints=16,slackCheckpoints=24,intentExpiry}){
 for(const n of[checkpoint,queueEpoch,queuePhase,batchPhase,batchReady,observedCycleCheckpoints,setupBudgetCheckpoints,slackCheckpoints])assert.ok(Number.isSafeInteger(n)&&n>=0);
 assert.ok(checkpoint>0&&checkpoint<2**32&&queueEpoch<2**32-1);assert.ok([0,3].includes(queuePhase),'an opened/sealed epoch is immutable');assert.ok([0,3,4].includes(batchPhase)&&batchReady===1,'previous batch must be terminal/available');
 assert.ok(Array.isArray(members)&&members.length>0&&members.length<=4,'verified member capacity remains four');assert.equal(observedMembers,members.length,'timing evidence must cover this exact member count');assert.ok(observedCycleCheckpoints>0&&slackCheckpoints>=16);
 const lead=Math.max(64,Math.ceil((observedCycleCheckpoints+setupBudgetCheckpoints+slackCheckpoints)/32)*32);
 assert.ok(lead<=128,'observed budget exceeds the contract window; do not expand limits or silently truncate');assert.ok(checkpoint+lead<2**32);assert.ok(typeof intentExpiry==='bigint'&&BigInt(checkpoint+lead)<=intentExpiry,'window exceeds user intent');
 const plan=validateAdmissionPlan({version:1,epoch:queueEpoch+1,cutoff:checkpoint+lead,members:members.map(m=>({...m})).sort((a,b)=>a.owner-b.owner)});
 return{plan,lead,observedCycleCheckpoints,observedMembers,setupBudgetCheckpoints,slackCheckpoints,memberCapacity:4,scope:'new epoch timing only; membership hints require later authenticated admission, no global fairness or existing epoch modification'};
}
