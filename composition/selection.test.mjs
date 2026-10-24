import test from 'node:test';import assert from 'node:assert/strict';import{selectCompositionAction}from'./selection.mjs';
test('unknown broadcast blocks scan, quote and substitute operation',async()=>{let called=0;const r=await selectCompositionAction({scan:()=>called++,quote:()=>called++},{unresolved:async()=>[{taskId:'original'}]});assert.equal(called,0);assert.deepEqual(r,{status:'unresolved',tasks:['original']});});
test('restart retains exact valid proof window; stale proof is regenerated from current proposal',async()=>{
 const task={operation:'fund',validUntilCheckpoint:'164'},proof={preparedDirectory:'original'};let scans=0,quotes=0;
 const journal={unresolved:async()=>[],records:async()=>[{taskId:'x',status:'planned',task},{taskId:'x',status:'proved',proof}]};
 const adapter={isCurrent:async()=>true,validateProof:async(t,p)=>{assert.equal(t,task);assert.equal(p,proof);return true;},scan:async()=>{scans++;return{checkpoint:120,action:{operation:'fund',validUntilCheckpoint:'184'}};},quote:async t=>{quotes++;return t;}};
 assert.deepEqual(await selectCompositionAction(adapter,journal),{status:'selected',task,reusedPreparedProof:true});assert.equal(scans+quotes,0);
 adapter.validateProof=async()=>false;const next=await selectCompositionAction(adapter,journal);assert.equal(next.task.validUntilCheckpoint,'184');assert.equal(next.checkpoint,120);assert.equal(scans,1);assert.equal(quotes,1);
});
test('included or explicitly never-submitted attempts do not shadow fresh planning',async()=>{
 for(const status of ['included','not-submitted']){const r=await selectCompositionAction({scan:async()=>({checkpoint:100,action:null,reason:'waiting'})},{unresolved:async()=>[],records:async()=>[{status:'planned',taskId:'x',task:{}},{status:'proved',taskId:'x',proof:{}},{status,taskId:'x'}]});assert.equal(r.status,'idle');assert.equal(r.reason,'waiting');}
});
test('safe proof-session restart retains exact advisory fee task but never a stale or unbound task',async()=>{
 const task={operation:'open-1',validUntilCheckpoint:'164'},rows=[{status:'planned',taskId:'x',task}];let quoted=0,scanned=0;
 const a={validateFeePreparation:async t=>{assert.equal(t,task);return true;},scan:async()=>{scanned++;return{action:task,checkpoint:120};},quote:async t=>{quoted++;return t;}};
 const journal={unresolved:async()=>[],records:async()=>rows};
 assert.deepEqual(await selectCompositionAction(a,journal),{status:'selected',task,reusedPreparedProof:false,reusedPreparedFee:true});assert.equal(quoted+scanned,0);
 a.validateFeePreparation=async()=>false;await selectCompositionAction(a,journal);assert.equal(quoted,1);assert.equal(scanned,1);
 rows.push({status:'broadcast-intent',taskId:'x'});journal.unresolved=async()=>[rows.at(-1)];await selectCompositionAction(a,journal);assert.equal(quoted,1);
});
test('expired exact proof is never retimed; advisory renewal selects a fresh task before proving',async()=>{
 const old={operation:'open-1',validUntilCheckpoint:'164'},next={...old,validUntilCheckpoint:'234'},journal={unresolved:async()=>[],records:async()=>[{status:'planned',taskId:'old',task:old},{status:'proved',taskId:'old',proof:{file:'old-signed'}}]};let quoted=0;
 const a={isCurrent:async()=>false,scan:async()=>({checkpoint:170,action:next}),renewFeePreparation:async(t,p)=>{assert.equal(t,old);assert.equal(p,next);return next;},quote:async()=>quoted++};const r=await selectCompositionAction(a,journal);assert.equal(r.task,next);assert.equal(r.reusedPreparedFee,true);assert.equal(r.reusedPreparedProof,false);assert.equal(quoted,0);
});
