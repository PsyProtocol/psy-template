// Non-authorizing admission cost guard for the unchanged v9, C+32 profile.
// Bounds reserve one disposition per member and a rescan after every removal.
// RPC observations and wall-time assumptions do not establish finality/liveness.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const integer=(n,name)=>{assert.ok(Number.isSafeInteger(n)&&n>=0,name);return BigInt(n);};
const amount=(s,name)=>{assert.ok(typeof s==='string'&&/^(0|[1-9][0-9]*)$/.test(s),name);return BigInt(s);};
const ceil=(n,d)=>(n+d-1n)/d;
export function planReadiness(p){
 assert.equal(p.profile,'source-covered-pair-triangular-recovery-v1');
 assert.ok(['orderbook','nftmarket'].includes(p.market));
 const accounts=integer(p.occupiedAccounts,'occupied accounts'),members=integer(p.eligibleMembers,'eligible members');
 assert.ok(members<=accounts&&accounts<2n**32n,'complete source counts');
 const recovery=integer(p.recoveryMembers,'recovery members');assert.ok(recovery<=accounts-members);
 const source=integer(p.sourceCheckpoint,'source checkpoint');assert.ok(source>0n&&source+32n<2n**32n);
 // Account count comes from native verified inventory; eligibility/recovery
 // counts must additionally come from source-state coverage, never a shortlist.
 const cover=ceil(accounts,4n);
 // At most one extra partial scan page per population. Compute in O(1),
 // bounded by rounding each triangular scan up independently.
 const comparisons=members*(members+1n)*(members-1n)/6n;
 const scanUpper=ceil(comparisons,4n)+(members>1n?members-2n:0n);
 const settle=members, recover=recovery;
 const ups=1n+cover+scanUpper+settle+recover+1n; // open + no-match/terminal reserve
 const fee=amount(p.maxFeePerUpsBaseUnits,'fee cap');assert.ok(fee>0n);
 const fees=ups*fee+amount(p.claimFeeReserveBaseUnits,'ordinary claim reserve');
 const available=amount(p.availableFeeBudgetBaseUnits,'available fee budget');
 const cold=integer(p.coldBuildSeconds,'cold build seconds');
 const perUps=integer(p.secondsPerUpsBound,'per-UPS time assumption');assert.ok(perUps>0n);
 const cpSeconds=integer(p.checkpointSecondsLowerBound,'checkpoint interval assumption');assert.ok(cpSeconds>0n);
 const margin=integer(p.checkpointReserve,'checkpoint reserve');assert.ok(margin>0n);
 const required=ceil(cold+ups*perUps,cpSeconds)+margin;
 const deadline=integer(p.earliestOrderDeadline,'earliest order deadline');
 const expiry=source+32n;const usable=(deadline<expiry?deadline:expiry)-source;
 const reasons=[];
 if(fee<1_000_100_000n)reasons.push('FEE_CAP_BELOW_PROFILE_BOUND');
 if(required>usable)reasons.push('SOURCE_OR_ORDER_DEADLINE_TOO_SHORT');
 if(fees>available)reasons.push('FEE_BUDGET_INSUFFICIENT');
 if(p.sourceInventoryVerified!==true||p.eligibilityCoverageVerified!==true)reasons.push('SOURCE_EVIDENCE_INCOMPLETE');
 if(p.actualDependenciesVerified!==true)reasons.push('ACTUAL_DEPENDENCIES_INCOMPLETE');
 // These flags cannot authorize signing. The native driver independently
 // checks proofs/identities; this module only prevents an obviously unfit plan.
 return {schema:1,profile:p.profile,market:p.market,sourceCheckpoint:String(source),expiryCheckpoint:String(expiry),
  occupiedAccounts:String(accounts),eligibleMembers:String(members),coverageUps:String(cover),
  worstCaseScanComparisons:String(comparisons),scanUpsConservativeUpperBound:String(scanUpper),
  totalUpsConservativeUpperBound:String(ups),reservedFeesBaseUnits:String(fees),requiredCheckpointsEstimate:String(required),
  usableCheckpoints:String(usable),planningConditionsFit:reasons.length===0,reasons,
  assumptions:'Per-UPS and checkpoint intervals are planning inputs, not protocol-enforced service guarantees. Deployment/setup/sponsor grants and unrelated future requests are excluded.',
  inputSha256:createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(p).sort().map(k=>[k,p[k]])))).digest('hex'),liveAuthorization:false};
}
