// Conditional planning, never an authorization. The replacement key separately
// enforces an ordinary owner's nondecreasing lifetime cap on every actual burn.
import assert from 'node:assert/strict';
import {sha256} from '../../executor/requestBinding.mjs';
const integer=(n,label)=>{assert.ok(Number.isSafeInteger(n)&&n>=0,label);return n;};
const amount=(n,label)=>{assert.equal(typeof n,'string',label);assert.match(n,/^(0|[1-9]\d*)$/);return BigInt(n);};
export function planMinimumBudget(plan,cost){
 assert.equal(plan.profile,'source-covered-producer-minimum-stream-v1');
 assert.equal(plan.authenticatedSeedRelativeToHistory,true);
 assert.deepEqual(Object.keys(cost).sort(),['availableFeeBudgetBaseUnits','maxFeePerUpsBaseUnits','recoveryUpsReserve','secondsPerUpsBound','checkpointSecondsLowerBound','checkpointReserve'].sort());
 const accounts=integer(Number(plan.accounts),'accounts'),members=integer(Number(plan.members),'members'),recovery=integer(Number(plan.recoveryMembers),'recovery');
 assert.ok(accounts>0&&accounts<2**24&&members>0&&members<=accounts);
 const source=integer(Number(plan.sourceCheckpoint),'source'),draw=integer(Number(plan.drawCheckpoint),'draw'),expiry=integer(Number(plan.expiry),'expiry');
 assert.equal(draw,source+1);assert.equal(expiry,source+8192);
 const coverage=Math.ceil(accounts/4),pages=Math.ceil(members/4),normal=2+coverage+3*pages,unseeded=3+coverage+pages;
 const ownerPreparation=2,excludedRecovery=2*recovery,claims=3*(members+recovery),reserve=integer(cost.recoveryUpsReserve,'recovery reserve');
 assert.ok(reserve>=2,'reserve a fresh ordinary grant and its vault application');
 const total=Math.max(normal,unseeded)+ownerPreparation+excludedRecovery+claims+reserve;
 const fee=amount(cost.maxFeePerUpsBaseUnits,'fee'),available=amount(cost.availableFeeBudgetBaseUnits,'available budget');assert.ok(fee>=1000100000n);
 assert.ok(Number.isFinite(cost.secondsPerUpsBound)&&cost.secondsPerUpsBound>0);
 assert.ok(Number.isFinite(cost.checkpointSecondsLowerBound)&&cost.checkpointSecondsLowerBound>0);
 const earliest=plan.earliestEligibleDeadline===null?expiry:integer(Number(plan.earliestEligibleDeadline),'eligible deadline');
 const checkpointReserve=integer(cost.checkpointReserve,'checkpoint reserve');
 const requiredCheckpoints=Math.ceil((Math.max(normal,unseeded)+excludedRecovery+reserve)*cost.secondsPerUpsBound/cost.checkpointSecondsLowerBound)+checkpointReserve;
 const remaining=Math.min(expiry,earliest)-source,required=fee*BigInt(total);
 return {profile:plan.profile,accounts,members,recoveryMembers:recovery,coverageUps:coverage,minimumBuildUps:pages,minimumExtractionUps:pages,settlementUps:pages,normalVaultUps:normal,unseededVaultUps:unseeded,ownerPreparationUps:ownerPreparation,excludedRecoveryUps:excludedRecovery,ordinaryClaimUpsReserve:claims,recoveryUpsReserve:reserve,totalUpsReserve:total,
  requiredFeeBudgetBaseUnits:required.toString(),availableFeeBudgetBaseUnits:available.toString(),feeBoundBaseUnits:fee.toString(),requiredCheckpoints,availableCheckpoints:remaining,planningConditionsFit:required<=available&&requiredCheckpoints<remaining,
  assumptions:{runtimeBoundEnforced:false,futureCadenceVerified:false,deadlineGuarantee:false,ownerAvailableForFreshGrant:false,ordinaryGrantsAndFundingConfirmed:false,actualVaultBalanceChecked:false,lifetimeCapRemainingChecked:false},
  scope:'conditional total-work model including two ordinary owner preparation UPSs; deployment, registration, market setup and input funding are separate; no reset or repeated ordering prefix',canSign:false,canBroadcast:false,
  inputSha256:sha256(JSON.stringify({plan,cost},(_k,v)=>typeof v==='bigint'?v.toString():v))};
}
