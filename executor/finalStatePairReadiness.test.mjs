// Real frozen native source verifier and durable Executor route. Synthetic
// history with the complete captured native identity; no RPC/signing/broadcast.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {prepareFinalStateStream} from './finalStateStream.mjs';
import {sha256} from './requestBinding.mjs';
const root=process.env.PAIR_READINESS_CASE,input=process.env.PAIR_READINESS_INPUT,driver=process.env.FINAL_STATE_DRIVER;
assert.ok(root&&input&&driver,'fresh runtime, actual public source fixture and frozen native verifier required');
const costs={maxFeePerUpsBaseUnits:'1000100000',claimFeeReserveBaseUnits:'3000000000',availableFeeBudgetBaseUnits:'80000000000',coldBuildSeconds:110,secondsPerUpsBound:180,checkpointSecondsLowerBound:2,checkpointReserve:2};
test('paired Executor uses verified source/deadline, persists and resumes without legacy permutation',async()=>{
 await mkdir(root);
 const pin=sha256(await readFile(driver)),review=join(input,'review.json'),history=JSON.parse(await readFile(join(input,'history.json'),'utf8'));
 const options={review,reviewSha256:sha256(await readFile(review)),snapshot:join(input,'snapshot.json'),historyRoot:history.root,runtimeDirectory:root,sourceWallet:driver,sourceWalletSha256:pin,streamWallet:driver,streamWalletSha256:pin};
 const job=await prepareFinalStateStream(options),state=await job.status();
 assert.equal(state.accounts,9n);assert.equal(state.eligible,5n);assert.equal(state.ordering,null);assert.equal(state.canBroadcast,false);
 const plan=await job.planPairBudget({...costs,eligibleMembers:1,occupiedAccounts:1,sourceCheckpoint:1,earliestOrderDeadline:999999});
 assert.equal(plan.occupiedAccounts,'9');assert.equal(plan.eligibleMembers,'5');assert.equal(plan.sourceCheckpoint,'100');assert.equal(plan.usableCheckpoints,'12');assert.equal(plan.liveAuthorization,false);assert.ok(plan.reasons.includes('SOURCE_OR_ORDER_DEADLINE_TOO_SHORT'));
 assert.throws(()=>job.authorizeSettlement(),/no installed, reviewed/);
 const again=await prepareFinalStateStream(options),replayed=await again.planPairBudget(costs);
 assert.deepEqual(replayed,plan);
 const file=join(job.sourceDirectory,'source.json'),raw=await readFile(file);await writeFile(file,Buffer.concat([raw,Buffer.from('\n')]));
 await assert.rejects(()=>again.planPairBudget(costs),/verified source changed/);await writeFile(file,raw);
 await writeFile(join(root,'PUBLIC-SUMMARY.json'),JSON.stringify({scope:'actual native source verification and durable paired Executor budget preparation; synthetic history, not live acceptance',driverSha256:pin,plan,canBroadcast:false,financialOperations:0},null,2)+'\n',{flag:'wx'});
});
