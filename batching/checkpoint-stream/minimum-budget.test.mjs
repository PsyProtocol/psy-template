import test from 'node:test';import assert from 'node:assert/strict';
import {planMinimumBudget} from './minimum-budget.mjs';
const plan={profile:'source-covered-producer-minimum-stream-v1',authenticatedSeedRelativeToHistory:true,accounts:9,members:5,recoveryMembers:0,sourceCheckpoint:101,drawCheckpoint:102,expiry:8293,earliestEligibleDeadline:200};
const cost={availableFeeBudgetBaseUnits:'100000000000',maxFeePerUpsBaseUnits:'1000100000',recoveryUpsReserve:2,secondsPerUpsBound:1,checkpointSecondsLowerBound:10,checkpointReserve:3};
test('both minimum phases, funding and claims are budgeted without resetting progress',()=>{
 const p=planMinimumBudget(plan,cost);assert.equal(p.coverageUps,3);assert.equal(p.minimumBuildUps,2);assert.equal(p.minimumExtractionUps,2);assert.equal(p.settlementUps,2);assert.equal(p.normalVaultUps,11);assert.equal(p.unseededVaultUps,8);assert.equal(p.totalUpsReserve,30);assert.equal(p.planningConditionsFit,true);assert.equal(p.canBroadcast,false);assert.equal(p.assumptions.actualVaultBalanceChecked,false);
 assert.equal(planMinimumBudget(plan,{...cost,secondsPerUpsBound:120,checkpointSecondsLowerBound:1}).planningConditionsFit,false);
 assert.equal(planMinimumBudget(plan,{...cost,availableFeeBudgetBaseUnits:'1000000000'}).planningConditionsFit,false);
 assert.equal(planMinimumBudget({...plan,accounts:312},cost).coverageUps,78);
});
test('source, seed round, capacity and fee inputs cannot be replaced by budget overrides',()=>{
 for(const p of [{...plan,profile:'source-covered-producer-random-stream-v1'},{...plan,drawCheckpoint:103},{...plan,expiry:356},{...plan,members:0},{...plan,members:10}])assert.throws(()=>planMinimumBudget(p,cost));
 for(const c of [{...cost,seed:'chosen'},{...cost,recoveryUpsReserve:1},{...cost,maxFeePerUpsBaseUnits:'1000'},{...cost,secondsPerUpsBound:0}])assert.throws(()=>planMinimumBudget(plan,c));
});
