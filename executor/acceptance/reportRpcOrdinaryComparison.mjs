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
const variants=[];
for(const selection of ['baseline','candidate']){
 const done=json(join(base,'public',selection+'-COMPLETE.json')),round=join(base,done.roundTag),auditFile=join(base,selection+'-audit-v1/SUMMARY.json'),audit=exact(auditFile);
 assert.equal(audit.fullProofAccountingPending,false);assert.equal(audit.fills,1n);assert.equal(audit.actualUps,17n);
 const ordinary=[];
 for(const label of ['owner-order','buyer-order','start-fund','owner-consent','buyer-consent','admit-0-fund','admit-1-fund','seal-fund','commit-fund','owner-payout','buyer-payout']){
  const path=join(round,'attempts',label),timing=json(join(path,'timing.json')),confirmation=json(join(path,'confirmation-timing.json')),e2e=json(join(round,'public',label+'-end-to-end.json'));
  const p=exact(join(path,'preflight.json')),fee=p.core.stats.guta_fees_collected+p.core.stats.da_fees_collected,phaseFile=join(path,'metrics.json'),phases=existsSync(phaseFile)?json(phaseFile):null;
  ordinary.push({label,processOrResidentJobMilliseconds:timing.wallMilliseconds,coldStart:timing.coldStart??true,sessionConstructionMillisecondsCharged:timing.sessionConstructionMillisecondsCharged??null,phaseMetrics:phases,confirmationMilliseconds:confirmation.wallMilliseconds,receiptObservations:confirmation.observations,commonObservations:confirmation.commonObservations,endToEndMilliseconds:e2e.wallMilliseconds,startedAt:e2e.startedAt,finishedAt:e2e.finishedAt,feeNativeAtoms:fee.toString(),requestSha256:sha256(readFileSync(join(path,'request.json'))),resources:sampledPhaseResources(e2e,samples)});
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
 const start=Math.min(...ordinary.map(r=>Date.parse(r.startedAt))),end=Math.max(...ordinary.map(r=>Date.parse(r.finishedAt)));
 variants.push({selection,round:done.roundTag,environment:json(join(round,'public/ENVIRONMENT.json')),fills:1,members:2,actualUps:17,ordinary,stages,totalFeesNativeAtoms:audit.totalFees.toString(),cutoffWait:json(join(round,'public/cutoff-wait.json')),observedRoundWallMilliseconds:end-start,roundResources:sampledPhaseResources({startedAt:new Date(start).toISOString(),finishedAt:new Date(end).toISOString()},samples),proofAuditFile:auditFile,proofAuditSha256:sha256(readFileSync(auditFile))});
}
const [before,after]=variants;
assert.equal(before.environment.host,after.environment.host);assert.equal(before.environment.threads,after.environment.threads);assert.equal(before.environment.sdkSha256,after.environment.sdkSha256);assert.equal(before.environment.compactBinary,after.environment.compactBinary);
assert.equal(before.totalFeesNativeAtoms,after.totalFeesNativeAtoms,'same economic workload fee total');
const ordinaryComparison=before.ordinary.map(b=>{
 const a=after.ordinary.find(a=>a.label===b.label);assert.equal(b.feeNativeAtoms,a.feeNativeAtoms,'same ordinary fee');
 return{label:b.label,beforeCold:b.coldStart,afterCold:a.coldStart,beforeJobMilliseconds:b.processOrResidentJobMilliseconds,afterJobMilliseconds:a.processOrResidentJobMilliseconds,beforeConfirmationMilliseconds:b.confirmationMilliseconds,afterConfirmationMilliseconds:a.confirmationMilliseconds,beforeEndToEndMilliseconds:b.endToEndMilliseconds,afterEndToEndMilliseconds:a.endToEndMilliseconds};
});
saveObservation(out,{at:new Date().toISOString(),variants,ordinaryComparison,resourceLogSha256:sha256(readFileSync(resourceFile)),scope:'one successful real thin Book fill per variant, same owned QA instances, users, call workload, machine and two Rayon threads. Baseline early setup includes preserved development/restart pauses; report stages separately. Cold/warm ordinary clients differ in retained immutable circuits. RPC jitter and sequential sample order prevent a steady-state TPS or statistically established general speedup claim. First-order preparation overlaps build/test activity; commit, settlement and payout run without builds. Signed ordinary signature/endcap phase includes SDK RPC and recursion, not pure CPU. Sampled selected-process RSS sums include idle resident clients and shared pages; not a true peak or host total.',chainTps:null,productionGradeClaim:false});
