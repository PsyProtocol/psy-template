// Reconcile existing closed measurements; never start a wallet or a build.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../requestBinding.mjs';
import {saveObservation} from '../observations.mjs';

export function cargoReportedBuild(log) {
 const matches=[...log.matchAll(/Finished [`'][^\n]+?target\(s\) in (?:(\d+)m )?([\d.]+)s/g)];
 assert.equal(matches.length,1,'exactly one successful Cargo completion required');
 return {cargoReportedMilliseconds:(Number(matches[0][1]??0)*60+Number(matches[0][2]))*1000,
  coldSdkCompilationMilliseconds:null,fullApplicationBuildWallMilliseconds:null,
  cacheState:'not recorded; do not label this a clean SDK build',
  scope:'Cargo-reported application build interval, separate from resource construction and transaction latency'};
}

export function inventory(base,buildLog) {
 const inputs=['PERFORMANCE-v1.json','PROVER-RESOURCES-v1.json','FIXED-VERIFIER-PERFORMANCE-v1.json','PROCESS-TREE-PERFORMANCE-v1.json','COLD-WARM-RESOURCES-v1.json','PAIRED-RUNS-CLOSED-v1.json','MEASUREMENT-POSTFLIGHT-v1.json'];
 const files=inputs.map(n=>join(base,'public',n)),reports=Object.fromEntries(files.map((f,i)=>[inputs[i],JSON.parse(readFileSync(f,'utf8'))]));
 const closed=reports['PAIRED-RUNS-CLOSED-v1.json'],tree=reports['PROCESS-TREE-PERFORMANCE-v1.json'],native=reports['PROVER-RESOURCES-v1.json'],post=reports['MEASUREMENT-POSTFLIGHT-v1.json'];
 assert.equal(closed.actualUps,34);assert.equal(closed.fills,2);assert.equal(closed.allFullProofsAudited,true);assert.equal(closed.ordinaryClaimsIncluded,true);
 assert.equal(tree.completeParentAndNativeTimeline,true);assert.equal(native.crossRoundAssetNonceAndStateContinuity,true);assert.equal(native.allNewOrdinaryColdAndWarmTimingsPresent,true);assert.equal(post.sameMeasuredFinancialSourceClosure,true);
 const performance=reports['PERFORMANCE-v1.json'];assert.equal(performance.variants.length,2);
 const rows=performance.variants.map((v,i)=>{
  assert.equal(v.actualUps,17);assert.equal(v.fills,1);assert.equal(v.ordinary.length,11);assert.equal(v.stages.length,6);assert.equal(native.rows[i].coldNativeProcessConstructions.length,4);
  for(const j of v.ordinary){assert.equal(j.missingTiming,null);assert.ok(j.endToEndMilliseconds>0);}
  return{selection:v.selection,ordinaryColdJobs:v.ordinary.filter(j=>j.coldStart).map(j=>j.label),ordinaryWarmJobs:v.ordinary.filter(j=>!j.coldStart).map(j=>j.label),parentInvocation:native.rows[i].parentInvocation,bootstrap:native.rows[i].bootstrap,actualUps:v.actualUps,actualFills:v.fills,actualFeesNativeAtoms:v.totalFeesNativeAtoms,sourceSdk:v.environment.sdkSha256,sourceBinaries:[v.environment.ordinaryBinary,v.environment.compactBinary],threads:v.environment.threads,completeSampledMemory:tree.rows[i]};
 });
 assert.equal(rows[0].sourceSdk,rows[1].sourceSdk);assert.deepEqual(rows[0].sourceBinaries,rows[1].sourceBinaries);
 return{schema:1,rows,compilation:cargoReportedBuild(readFileSync(buildLog,'utf8')),sources:[...files,buildLog].map(file=>({file,sha256:sha256(readFileSync(file))})),
  completed:'same-configuration Book real-fill pair, cold/warm native resources, full lifecycle sampled RSS, exact proof/receipt/claim/fee accounting',
  gaps:['clean SDK compilation and total application compilation wall time were not measured','other three markets lack this new matched fixed-verifier pair','two-pool preparation comparison is not a complete matched route confirmation/claim comparison','continuous multi-batch financial soak and all requested injected failures remain separate gates'],
  scopes:['compilation, first resource construction and subsequent same-process tasks are distinct','parallel phase durations and sampled RSS maxima must not be added','RSS sums are not physical footprint or true instantaneous peaks','no new financial operation or compilation started by this inventory'],productionGradeClaim:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const[base,buildLog,out]=process.argv.slice(2);assert.ok(out);saveObservation(out,inventory(base,buildLog));
}
