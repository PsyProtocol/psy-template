// Conservative finite-source planning. Counts come from the owned native plan;
// feasibility is not admission, funding authorization or network acceptance.
import assert from 'node:assert/strict';import{sha256}from'../../executor/requestBinding.mjs';
const whole=(v,name)=>{assert.ok(Number.isSafeInteger(v)&&v>=0,name);return v;};
const amount=(v,name)=>{assert.equal(typeof v,'string');assert.match(v,/^(0|[1-9]\d*)$/);return BigInt(v);};
export function planRandomBudget(plan,cost){
 const names=['availableFeeBudgetBaseUnits','maxFeePerUpsBaseUnits','recoveryUpsReserve','secondsPerUpsBound','checkpointSecondsLowerBound','checkpointReserve'];
 assert.deepEqual(Object.keys(cost).sort(),names.sort(),'counts, source and deadlines cannot be overridden');
 assert.equal(plan.profile,'source-covered-producer-random-stream-v1');assert.equal(plan.authenticatedSeedRelativeToHistory,true);
 const accounts=whole(Number(plan.accounts),'accounts'),members=whole(Number(plan.members),'members'),recovery=whole(Number(plan.recoveryMembers),'recovery members');
 const coverage=Math.ceil(accounts/4),ordering=Math.ceil(members/4),settlement=Math.ceil(members/4);
 const normal=1+coverage+ordering+settlement;
 const unseeded=1+coverage+(members?1:0)+settlement;
 // Recovery candidates were classified outside the accepted trading set. Their
 // existing enrollment/sponsorship + return path reserves two UPSs each.
 // Reserve separate ordinary claims for native refunds and both FT assets.
 const excludedRecovery=2*recovery,claims=3*(members+recovery);
 const reserve=whole(cost.recoveryUpsReserve,'recovery reserve');
 // One expired-prefix repair adds a restart and up to ordering-1 repeated pages.
 // Repeated adversarial repairs are not bounded by this model; stop at budget.
 assert.ok(reserve>=Math.max(1,ordering),'one complete same-seed ordering repair reserve');const total=Math.max(normal,unseeded)+excludedRecovery+claims+reserve;
 const fee=amount(cost.maxFeePerUpsBaseUnits,'fee bound'),available=amount(cost.availableFeeBudgetBaseUnits,'available fee budget');assert.ok(fee>=1000100000n,'frozen native maximum fee bound');
 assert.ok(Number.isFinite(cost.secondsPerUpsBound)&&cost.secondsPerUpsBound>0);assert.ok(Number.isFinite(cost.checkpointSecondsLowerBound)&&cost.checkpointSecondsLowerBound>0);
 const cp=whole(Number(plan.sourceCheckpoint),'source checkpoint'),expiry=whole(Number(plan.expiry),'expiry');assert.ok(expiry>cp);
 const earliest=plan.earliestEligibleDeadline===null?expiry:whole(Number(plan.earliestEligibleDeadline),'authenticated deadline');
 const neededCheckpoints=Math.ceil((Math.max(normal,unseeded)+excludedRecovery+reserve)*cost.secondsPerUpsBound/cost.checkpointSecondsLowerBound)+whole(cost.checkpointReserve,'checkpoint reserve');
 const required=BigInt(total)*fee,remaining=Math.min(expiry,earliest)-cp;
 const result={profile:plan.profile,accounts,members,recoveryMembers:recovery,coverageUps:coverage,orderingUps:ordering,settlementUps:settlement,normalUps:normal,unseededRefundUps:unseeded,excludedRecoveryUps:excludedRecovery,ordinaryClaimUpsReserve:claims,recoveryUpsReserve:reserve,totalUpsReserve:total,
  feeBoundBaseUnits:fee.toString(),requiredFeeBudgetBaseUnits:required.toString(),availableFeeBudgetBaseUnits:available.toString(),requiredCheckpoints:neededCheckpoints,availableCheckpoints:remaining,
  planningConditionsFit:required<=available&&neededCheckpoints<remaining,
  assumptions:{secondsPerUpsBound:cost.secondsPerUpsBound,checkpointSecondsLowerBound:cost.checkpointSecondsLowerBound,runtimeBoundEnforced:false,futureCadenceVerified:false,deadlineGuarantee:false},
  scope:'conditional conservative model; current deployment/setup, initial asset funding and RPC/finality/upgrade checks are separate',canSign:false,canBroadcast:false};
 return {...result,inputSha256:sha256(JSON.stringify({sourcePlan:plan,cost},(_k,v)=>typeof v==='bigint'?v.toString():v))};
}
