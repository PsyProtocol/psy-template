// Independent client recovery state, NOT delegated authority or a substitute
// for controller/SD-key proofs. No financial side effects exist in this module.
import assert from'node:assert/strict';
import{createIntent,commitment,validatePlan}from'./intent.mjs';import{integer,user}from'../amm/u124/client.mjs';
const steps=['fund-first','settle-first','claim-intermediate','fund-second','settle-second','claim-output','deliver-output','claim-final'];
const h=v=>{assert.match(v,/^[0-9a-f]{64}$/);return v;};
export function startWorkflow(intent,plan){
 const i=createIntent(intent.terms);assert.equal(i.id,intent.id);validatePlan(i,plan);
 return{schema:1,intent:i,plan:structuredClone(plan),planHash:commitment('psy-composition-plan-v1',plan),revision:0,stepIndex:0,pending:null,receipts:[],fees:0n,status:'awaiting-verification',clientObservationOnly:true};
}
function check(s){assert.equal(s.schema,1);assert.equal(createIntent(s.intent.terms).id,s.intent.id);validatePlan(s.intent,s.plan);assert.equal(commitment('psy-composition-plan-v1',s.plan),s.planHash);assert.ok(Number.isSafeInteger(s.revision)&&s.revision>=0);integer(s.fees);}
function actor(s,stage){return stage==='settle-first'?s.plan.steps[0].vaultId:stage==='settle-second'?s.plan.steps[1].vaultId:stage==='claim-final'?s.intent.terms.receiver:s.intent.terms.execution.vaultId;}
export function prepareStage(state,{expectedRevision,stage,requestHash,proofHash,startLeaf,endLeaf,caller,nonce,sourceCheckpoint,validUntilCheckpoint,maximumFee}){
 check(state);assert.equal(expectedRevision,state.revision,'workflow changed; rescan before preparing');assert.ok(!state.pending,'unknown broadcast must reconcile by original identity');assert.ok(!['completed','review-required','recovering'].includes(state.status));assert.equal(stage,steps[state.stepIndex],'cannot skip a stage or spend an unclaimed Outbox');
 for(const x of [requestHash,proofHash,startLeaf,endLeaf])h(x);assert.ok(!state.receipts.some(r=>r.requestHash===requestHash),'request already consumed');user(caller);assert.equal(caller,actor(state,stage),'stage caller');integer(nonce,(1n<<62n)-1n);assert.ok(nonce>0n);assert.ok(state.receipts.filter(r=>r.caller===caller).every(r=>r.nonce<nonce),'stage nonce must advance');integer(sourceCheckpoint,(1n<<32n)-1n);integer(validUntilCheckpoint,(1n<<32n)-1n);assert.ok(sourceCheckpoint>=state.plan.sourceCheckpoint&&state.receipts.every(r=>sourceCheckpoint>=r.commonCheckpoint),'stage source predates confirmed dependency');assert.ok(sourceCheckpoint<=validUntilCheckpoint&&validUntilCheckpoint<=state.intent.terms.expiresAtCheckpoint,'stage deadline');integer(maximumFee,(1n<<62n)-1n);assert.ok(maximumFee>0n&&state.fees+maximumFee<=state.intent.terms.maxNativeFees,'fee cap');
 const s=structuredClone(state);s.pending={stage,requestHash,proofHash,startLeaf,endLeaf,caller,nonce,sourceCheckpoint,validUntilCheckpoint,maximumFee,broadcast:false};s.status='prepared';s.revision++;return s;
}
export function recordBroadcast(state,{expectedRevision,requestHash}){
 check(state);assert.equal(state.revision,expectedRevision);assert.ok(state.pending);assert.equal(state.pending.requestHash,requestHash,'exact original request only');const s=structuredClone(state);s.pending.broadcast=true;s.status='outcome-unknown';s.revision++;return s;
}
// Caller MUST obtain this event from exact-proof + historical-leaf/index
// verification. Merely recording it cannot authorize a transfer. A future
// chain adapter is mandatory before any unattended financial execution.
export function recordIncluded(state,receipt){
 check(state);assert.deepEqual(Object.keys(receipt).sort(),['requestHash','contentHash','endLeaf','caller','nonce','checkpoint','commonCheckpoint','fee'].sort(),'exact receipt observation fields');const {requestHash,contentHash,endLeaf,caller,nonce,checkpoint,commonCheckpoint,fee}=receipt;h(requestHash);h(contentHash);h(endLeaf);
 const previous=state.receipts.find(r=>r.requestHash===requestHash);
 if(previous){assert.deepEqual(previous,receipt,'conflicting duplicate receipt');return state;}
 assert.ok(state.pending?.broadcast,'no prepared broadcast');const p=state.pending;assert.equal(requestHash,p.requestHash);assert.equal(caller,p.caller);assert.equal(nonce,p.nonce);assert.equal(endLeaf,p.endLeaf);
 integer(checkpoint,(1n<<32n)-1n);integer(commonCheckpoint,(1n<<32n)-1n);assert.ok(checkpoint>=p.sourceCheckpoint&&commonCheckpoint>=checkpoint,'receipt/common checkpoint');integer(fee,(1n<<62n)-1n);
 const s=structuredClone(state);s.receipts.push(structuredClone(receipt));s.fees+=fee;s.pending=null;s.stepIndex++;s.revision++;
 // Preserve an observed included result even when it violates local estimates.
 // Never hide an actual spend by throwing and pretending the stage did not run.
 s.status=fee>p.maximumFee||s.fees>s.intent.terms.maxNativeFees?'review-required':s.stepIndex===steps.length?'completed':'awaiting-verification';return s;
}
export function recoveryPlan(state){
 check(state);
 if(state.pending?.broadcast)return{action:'reconcile-exact-original',requestHash:state.pending.requestHash,newBusinessOperationAllowed:false,requiredAuthority:'exact full proof, historical own leaf and indexed occurrence; no replacement while unknown'};
 if(state.status==='completed')return{action:'none',newBusinessOperationAllowed:false};
 const i=state.stepIndex,asset=i<2?state.intent.terms.input.id:i<5?state.plan.steps[0].outputAsset:state.intent.terms.output.id;
 return{action:i===1||i===4?'cancel-and-finish-or-expire-market-then-sender-bound-refund':i===2||i===5||i===7?'claim-confirmed-outbox-before-any-spend':'return-current-asset-under-controller-policy',assetId:asset,
  executedTradeReversal:false,who:'owner or public relayer only after dedicated controller/key verification',gas:'explicit remaining intent budget or separately authorized top-up',newBusinessOperationAllowed:false,
  scope:'client recovery guidance, not a transaction authorization; deadline is source checkpoint, not attested actual inclusion-time enforcement'};
}
