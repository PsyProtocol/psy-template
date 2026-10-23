// Read-only analysis of a CLOSED economic acceptance case. Observations are
// not proof inputs, receipt verification or a controlled before/after trial.
import assert from'node:assert/strict';
import{readFileSync,readdirSync,existsSync}from'node:fs';
import{join,resolve,relative,isAbsolute}from'node:path';
import{pathToFileURL}from'node:url';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
import{saveObservation}from'../observations.mjs';
const read=p=>parseLosslessJson(readFileSync(p,'utf8'));
const number=x=>{assert.ok(typeof x==='number'||typeof x==='bigint','invalid measured type');const n=Number(x);assert.ok(Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER,'invalid measured value');return n;};
export function residentConstruction(log){
 const rows=log.split('\n').filter(s=>s.startsWith('PSY_COMPACT_SERVER ')).map(s=>JSON.parse(s.slice(19))).filter(r=>r.ready===true);
 assert.ok(rows.length<=1,'ambiguous resident construction observation');
 return rows.length?{keyConstructionMilliseconds:number(rows[0].keyConstructionMs),sessionConstructionMilliseconds:number(rows[0].sessionConstructionMs)}:null;
}
export function summarizePhases(rows){
 const out={};for(const r of rows){assert.ok(r.schema===1||r.schema===1n);assert.equal(typeof r.failed,'boolean');const ms=number(r.wallMilliseconds);assert.ok(typeof r.phase==='string');const a=out[r.phase]??={samples:0,failures:0,operationWallSumMilliseconds:0,minimumMilliseconds:ms,maximumMilliseconds:ms,maximumParentRssEndpointBytes:0};a.samples++;a.failures+=Number(r.failed);a.operationWallSumMilliseconds+=ms;a.minimumMilliseconds=Math.min(a.minimumMilliseconds,ms);a.maximumMilliseconds=Math.max(a.maximumMilliseconds,ms);a.maximumParentRssEndpointBytes=Math.max(a.maximumParentRssEndpointBytes,number(r.parentRssBeforeBytes),number(r.parentRssAfterBytes));}return out;
}
function files(dir){if(!existsSync(dir))return[];return readdirSync(dir,{withFileTypes:true}).flatMap(d=>{assert.ok(!d.isSymbolicLink(),'evidence symlink refused');const p=join(dir,d.name);return d.isDirectory()?files(p):[p];});}
export function analyzeLivePerformance(directory){
 const base=resolve(directory),inside=p=>{const r=relative(base,resolve(p));assert.ok(r&&!r.startsWith('..')&&!isAbsolute(r),'report path outside case');return join(base,r);};
 const complete=read(join(base,'public/COMPLETE.json')),source=read(join(base,'public/SOURCE.json'));assert.equal(complete.ordinaryClaimIncluded,true);assert.equal(complete.productionReady,false);const proofPaths=files(join(base,'runtime/compact')).filter(p=>p.endsWith('/preflight.json'));assert.ok(proofPaths.length);
 const proofs=proofPaths.map(p=>{const r=read(p);assert.equal(r.fullUpsVerified,true);assert.equal(r.exactStackAndSessionVerified,true);const log=resolve(p,'..')+'.preflight.log';assert.ok(existsSync(log),'missing proof process observation');return{file:relative(base,p),actualCalls:r.actualCalls,sourceCheckpoint:r.core.checkpoint_id,fee:r.fee,proofProfile:r.proofProfile,residentConstruction:residentConstruction(readFileSync(log,'utf8')),timingsMilliseconds:r.timingsMilliseconds,scope:'full UPS preflight, includes fresh state/identity checks; construction shown separately when resident starts'};});
 // These are observational fractional millisecond measurements, not financial
 // Felt values. Keep the lossless integer parser for proofs/fees/receipts.
 const metrics=files(join(base,'runtime/performance')).map(p=>JSON.parse(readFileSync(p,'utf8')));assert.ok(metrics.length);
 const ordinary=files(join(base,'attempts')).filter(p=>p.endsWith('/timing.json')).map(p=>{const r=read(p),included=join(resolve(p,'..'),'included.json'),i=existsSync(included)?read(included):null;let confirmation=null;
  if(i){assert.equal(i.status,'included');const ack=Date.parse(r.finishedAt),observed=Date.parse(i.checkedAt);assert.ok(Number.isFinite(ack)&&Number.isFinite(observed)&&observed>=ack);confirmation=observed-ack;}
  return{file:relative(base,p),...r,included:i!==null,includedObservedAt:i?.checkedAt??null,fee:i?.receipt.data.result.fees_collected??null,acknowledgementToIncludedCommonObservationMilliseconds:confirmation,scope:'ordinary wallet child wall includes its build/read/proof/verification/HTTP acknowledgement; subsequent exact receipt/common observation reported separately'};});
 const phases=summarizePhases(metrics),results=files(join(base,'public')).filter(p=>p.endsWith('-formal-result.json')).map(p=>{const r=read(p);assert.equal(r.result.status,'included');let s=null,confirmation=null;
  // CLI once uses its own process; the parent harness may have no correlated
  // per-task acknowledgement record. Keep that gap rather than fabricating zero
  // or borrowing another transaction's submit observation.
  if(r.submitMetricsFile!==null&&r.submitMetricsFile!==undefined){s=read(inside(r.submitMetricsFile));const ack=Date.parse(s.finishedAt),observed=Date.parse(r.checkedAt);assert.ok(Number.isFinite(ack)&&Number.isFinite(observed)&&observed>=ack);confirmation=observed-ack;}
  return{file:relative(base,p),taskId:r.taskId,kind:r.task.kind,operation:r.task.maintenanceOperation??null,checkpoint:r.result.checkpoint,fee:r.result.receipt.data.result.fees_collected,submitVerificationFreshChecksAndAcknowledgementMilliseconds:s?.processWallMilliseconds??null,acknowledgementToIncludedCommonObservationMilliseconds:confirmation,parentAttemptWallMilliseconds:r.wallMilliseconds,scope:s?'confirmation observation includes receipt polling and common-state visibility; not server finality latency':'no correlated per-task acknowledgement measurement; CLI adapter phase observations remain separate'};});
 const failedProofLogs=files(join(base,'runtime/compact')).filter(p=>p.endsWith('.preflight-failure.log')).map(p=>relative(base,p));
 const intervals=ordinary.filter(r=>r.included&&typeof r.startedAt==='string'&&r.includedObservedAt!==null),first=[...intervals].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt))[0],last=[...intervals].sort((a,b)=>Date.parse(b.includedObservedAt)-Date.parse(a.includedObservedAt))[0];let ordinaryEnvelope=null;
 if(first&&last){const elapsed=Date.parse(last.includedObservedAt)-Date.parse(first.startedAt);assert.ok(Number.isFinite(elapsed)&&elapsed>=0);ordinaryEnvelope={firstAttempt:first.file,lastAttempt:last.file,startedAt:first.startedAt,finishedAt:last.includedObservedAt,wallMilliseconds:elapsed,scope:'first ordinary wallet process start to last included/common ordinary observation; includes sponsorship, cutoff waits, proofs and polling; excludes earlier preparation and later audit; not service SLO or TPS'};}
 const assetAudits=Object.fromEntries(['before','after'].map(which=>{const p=join(base,'public/assets-'+which+'.json');return[which,existsSync(p)?read(p).observation:null];}));
 return{schema:1,generatedAt:new Date().toISOString(),caseSource:source,marketId:complete.marketId,vaultId:complete.vaultId,fills:complete.fills,acceptedMembers:complete.acceptedMembers,actualFees:complete.fee,ordinaryClaimIncluded:complete.ordinaryClaimIncluded,proofs,phases,ordinary,results,failedProofLogs,ordinaryEnvelope,assetAudits,
  measurementLimits:{coldBinaryBuild:'not measured in this live case',stateReadAndOrderPreparation:'included in operation walls; not independently isolated',childPeakRssBytes:null,memory:'Node parent endpoints only, not process-tree or child peak RSS',confirmation:'local acknowledgement to exact indexed/common observation; clocks and polling affect values',beforeAfterSpeedup:null,chainTps:null,productionReady:false,comparison:'no matched old-profile live control in this run; offline fixed40/compact measurements are a separate experiment',phaseSums:'operations overlap; do not sum phase totals as elapsed case wall'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[base,out]=process.argv.slice(2);assert.ok(base&&out);saveObservation(out,analyzeLivePerformance(base));}
