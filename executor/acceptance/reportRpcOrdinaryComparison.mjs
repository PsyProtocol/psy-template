// Observed matched-workload timings. Financial values come from the separate
// complete-proof audit, never from lossy JSON timing parsing.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {sha256} from '../requestBinding.mjs';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {saveObservation} from '../observations.mjs';
import {sampledPhaseResources} from '../../composition/acceptance/phaseResources.mjs';
const [base,out]=process.argv.slice(2);assert.ok(out);
const json=p=>JSON.parse(readFileSync(p,'utf8')),exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
const resourceFile=join(base,'resources-v1.log'),samples=readFileSync(resourceFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
assert.ok(existsSync(join(base,'resources-v1-SUMMARY.json')),'close resource observer before final report');
const selectionFile=process.env.PSY_RESOURCE_SELECTION_FILE??'RESOURCE-SELECTION-v1.json';assert.match(selectionFile,/^RESOURCE-SELECTION-v[1-9][0-9]*\.json$/);
const resourceSelection=json(join(base,'public',selectionFile));
const completeResources=resourceSelection.completeDeclaredProvers===true;
const selectedResources=phase=>{const row=sampledPhaseResources(phase,samples);if(completeResources){row.intervalMilliseconds=1000;row.scope='one-second sampled sum of all declared prover process RSS in this phase, including idle residents and shared pages; not a true peak or host physical footprint';}return row;};
assert.deepEqual([...new Set(samples.flatMap(s=>s.processes.map(p=>p.binary)))].sort(),resourceSelection.observedBinaryNames);
const variants=[];
for(const selection of ['baseline','candidate']){
 const done=json(join(base,'public',selection+'-COMPLETE.json')),round=join(base,done.roundTag),auditFile=join(base,selection+'-audit-v1/SUMMARY.json'),audit=exact(auditFile);
 assert.equal(audit.fullProofAccountingPending,false);assert.equal(audit.fills,1n);assert.equal(audit.actualUps,17n);
 const ordinary=[];
 for(const label of ['owner-order','buyer-order','start-fund','owner-consent','buyer-consent','admit-0-fund','admit-1-fund','seal-fund','commit-fund','owner-payout','buyer-payout']){
  const path=join(round,'attempts',label),confirmation=json(join(path,'confirmation-timing.json'));
  let timing,e2e,missingTiming=null;
  if(existsSync(join(path,'timing.json'))){timing=json(join(path,'timing.json'));e2e=json(join(round,'public',label+'-end-to-end.json'));}
  else{
   assert.equal(completeResources,false,'this new acceptance requires all timings; historical gaps cannot satisfy it');
   assert.equal(selection,'candidate');assert.ok(['owner-order','buyer-order'].includes(label),'unexpected missing timing');
   const recovery=json(join(base,'public/CANDIDATE-ORIGINAL-ORDERS-RECOVERED-v1.json')),row=recovery.rows.find(r=>r.label===label);
   assert.ok(row&&recovery.allOriginalsConfirmed&&row.nativePhaseMetricsAvailable);assert.equal(row.requestSha256,sha256(readFileSync(join(path,'request.json'))));
   const ready=readFileSync(join(round,label+'.log'),'utf8').split('\n').filter(l=>l.startsWith('PSY_ORDINARY_SERVER ')).map(l=>JSON.parse(l.slice(20))).find(r=>r.ready===true);assert.ok(ready);
   timing={wallMilliseconds:null,coldStart:true,sessionConstructionMillisecondsCharged:ready.sessionConstructionMs};e2e={startedAt:null,finishedAt:null,wallMilliseconds:null};
   missingTiming='original ACK succeeded but outer timing serialization failed; native construction/job phases retained; no reconstructed wall time. Confirmation below starts at read-only recovery, not original ACK.';
  }
  const p=exact(join(path,'preflight.json')),fee=p.core.stats.guta_fees_collected+p.core.stats.da_fees_collected,phaseFile=join(path,'metrics.json'),phases=existsSync(phaseFile)?json(phaseFile):null;
  const receipt=exact(join(path,'included.json')).receipt.data;
  const input=exact(join(round,'public',label+'.json')),callShape=input.calls.contract_calls.map(c=>({contractId:c.contract_id.toString(),method:c.method_name,arguments:c.inputs.length}));assert.equal(input.calls.software_defined_call.inputs.length,0);
  ordinary.push({label,callShape,processOrResidentJobMilliseconds:timing.wallMilliseconds,coldStart:timing.coldStart??true,sessionConstructionMillisecondsCharged:timing.sessionConstructionMillisecondsCharged??null,phaseMetrics:phases,missingTiming,confirmationScope:confirmation.scope,confirmationMilliseconds:confirmation.wallMilliseconds,receiptObservations:confirmation.observations,commonObservations:confirmation.commonObservations,endToEndMilliseconds:e2e.wallMilliseconds,startedAt:e2e.startedAt,finishedAt:e2e.finishedAt,feeNativeAtoms:fee.toString(),gutaFeeNativeAtoms:p.core.stats.guta_fees_collected.toString(),daFeeNativeAtoms:p.core.stats.da_fees_collected.toString(),slotsModified:p.core.stats.slots_modified.toString(),changedBalanceHighLimbs:(receipt.slot_updates??[]).filter(s=>[2483n,2484n].includes(s.contract_id)&&s.slot_index===1n).map(s=>({asset:s.contract_id.toString(),old:s.old_value,new:s.new_value})),requestSha256:sha256(readFileSync(join(path,'request.json'))),resources:missingTiming?null:selectedResources(e2e)});
 }
 const stages=[];
 for(const label of ['start','admit-0','admit-1','seal','commit','settle']){
  const r=json(join(round,'public',label+'-formal-result.json'));
  const included=audit.actual.find(a=>exact(a.source).taskId===r.taskId);assert.ok(included,'exact actual stage request');
  const includedRecord=json(included.source),records=readdirSync(dirname(included.source)).filter(n=>/^\d{8}-broadcast-result\.json$/.test(n)).map(n=>json(join(dirname(included.source),n))),ack=records.findLast(x=>x.taskId===r.taskId);
  assert.ok(ack,'durable original broadcast outcome');const ackToCommonMilliseconds=Date.parse(includedRecord.at)-Date.parse(ack.at);assert.ok(ackToCommonMilliseconds>=0);
  const p=json(join(dirname(included.request),'preflight.json')); // timing fields only
  stages.push({label,taskId:r.taskId,calls:p.actualCalls,timingsMilliseconds:p.timingsMilliseconds,parentAttemptMilliseconds:r.wallMilliseconds,submit:r.submitMetricsFile?json(r.submitMetricsFile):null,ackRecordedAt:ack.at,inclusionAndCommonObservedAt:includedRecord.at,ackToCommonMilliseconds,confirmationScope:'durable native HTTP outcome to exact indexed historical receipt and common realm visibility, including polling; not server finality alone',feeNativeAtoms:included.fee.toString(),requestSha256:included.requestSha256});
 }
 const start=Date.parse(json(join(round,'public/ENVIRONMENT.json')).at),end=Date.parse(json(join(round,'public/assets-after.json')).observation.finishedAt);
 variants.push({selection,round:done.roundTag,environment:json(join(round,'public/ENVIRONMENT.json')),fills:1,members:2,actualUps:17,ordinary,stages,totalFeesNativeAtoms:audit.totalFees.toString(),cutoffWait:json(join(round,'public/cutoff-wait.json')),observedRoundWallMilliseconds:end-start,roundResources:selectedResources({startedAt:new Date(start).toISOString(),finishedAt:new Date(end).toISOString()}),proofAuditFile:auditFile,proofAuditSha256:sha256(readFileSync(auditFile))});
}
const [before,after]=variants;
assert.equal(before.environment.host,after.environment.host);assert.equal(before.environment.threads,after.environment.threads);assert.equal(before.environment.sdkSha256,after.environment.sdkSha256);assert.equal(before.environment.compactBinary,after.environment.compactBinary);
// Sequential live fills necessarily have different balances/nonces. A carry
// in one U124 balance limb can change DA write fees despite identical calls.
// Keep exact receipt fees and expose the delta; do not attribute it to caching.
const ordinaryComparison=before.ordinary.map(b=>{
 const a=after.ordinary.find(a=>a.label===b.label);
 assert.deepEqual(a.callShape,b.callShape,'same actual ordinary call identities/arity per paired stage');
 return{label:b.label,beforeCold:b.coldStart,afterCold:a.coldStart,beforeJobMilliseconds:b.processOrResidentJobMilliseconds,afterJobMilliseconds:a.processOrResidentJobMilliseconds,beforeConfirmationMilliseconds:b.confirmationMilliseconds,afterConfirmationMilliseconds:a.confirmationMilliseconds,beforeEndToEndMilliseconds:b.endToEndMilliseconds,afterEndToEndMilliseconds:a.endToEndMilliseconds,beforeFeeNativeAtoms:b.feeNativeAtoms,afterFeeNativeAtoms:a.feeNativeAtoms,feeDeltaNativeAtoms:(BigInt(a.feeNativeAtoms)-BigInt(b.feeNativeAtoms)).toString()};
});
saveObservation(out,{at:new Date().toISOString(),variants,ordinaryComparison,totalFeeDeltaNativeAtoms:(BigInt(after.totalFeesNativeAtoms)-BigInt(before.totalFeesNativeAtoms)).toString(),resourceSelection,resourceLogSha256:sha256(readFileSync(resourceFile)),scope:completeResources?'one actual thin Book fill per variant on the same QA instances, users, semantic workload, machine, pinned SDK and two Rayon threads. Both use the same instrumented binaries and resident resources; the explicit experiment and selected resource modes are recorded in each environment. No other resource setting is intentionally varied. All declared proof processes are sampled at one second intervals, including idle residents; sums may count shared pages and are not true peaks or host footprint. Complete new cold/warm ordinary job timing required. Source, reads, nonce and proofs remain fresh each job. Sequential balances/checkpoints and RPC variation differ; no steady-state TPS/general speedup claim. Proving phase includes SDK RPC and recursion. Full proof and exact fee/state endpoint validation retained.':'one successful real thin Book fill per variant, same owned QA instances, users, semantic call workload, machine and two Rayon threads. Sequential starting balances/nonces differ; actual U124 carry/borrow writes and fee deltas are exposed, not credited to caching. Both early setups include preserved development/restart pauses; two first candidate outer timings are unavailable. Report stages separately. Cold/warm ordinary clients differ in retained immutable circuits. RPC jitter and sequential sample order prevent a steady-state TPS or statistically established general speedup claim. First baseline preparation overlaps build/test activity; commit, settlement and payout run without builds. Signed ordinary signature/endcap phase includes SDK RPC and recursion, not pure CPU. RSS is sampled ordinary-wallet process sum including idle residents and shared pages; sealed compact driver was omitted from the initial observer filter. No complete prover RSS comparison, true peak or host total is available.',chainTps:null,productionGradeClaim:false});
