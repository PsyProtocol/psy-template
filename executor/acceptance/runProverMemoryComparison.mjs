// One controlled successful run per variant; any failure stops the sequence.
// This orchestrator never resumes/replaces an unknown financial request.
import assert from 'node:assert/strict';import{existsSync,readFileSync}from'node:fs';import{join}from'node:path';import{run,read}from'../../batching/admission/liveSupport.mjs';import{saveObservation}from'../observations.mjs';import{freezeAppModules}from'./sourceClosure.mjs';import{fileURLToPath}from'node:url';
const[base,original]=process.argv.slice(2);assert.ok(original);assert.ok(existsSync(join(base,'funding-v1/public/COMPLETE.json')),'finish exact original QA setup first');
freezeAppModules(fileURLToPath(import.meta.url),base,'comparison-orchestrator-v1');
const env={PSY_RESOURCE_COMPARISON:'1',PSY_ORDINARY_RELEASE_FILE:'RELEASE.json',PSY_PROVER_RESOURCE_METRICS:'1'};
for(const selection of ['baseline','candidate']){
 assert.ok(!existsSync(join(base,'public',selection+'-COMPLETE.json')),'explicitly review existing run, never repeat');
 const timing=await run(process.execPath,['executor/acceptance/runRpcOrdinaryComparison.mjs',base,original,selection],join(base,selection+'-parent-v1.log'),env);
 saveObservation(join(base,'public',selection+'-parent-timing-v1.json'),timing);
 await run(process.execPath,['executor/acceptance/auditRpcOrdinaryComparison.mjs',base,selection,original,join(base,selection+'-audit-v1')],join(base,selection+'-audit-v1.log'));
 const audit=read(join(base,selection+'-audit-v1/SUMMARY.json'));assert.equal(audit.fullProofAccountingPending,false);assert.equal(audit.fills,1);assert.equal(audit.actualUps,17);
 console.log(selection,'real fill, ordinary claims, full proofs and conservation closed');
}
saveObservation(join(base,'public/PAIRED-RUNS-CLOSED-v1.json'),{at:new Date().toISOString(),fills:2,actualUps:34,allFullProofsAudited:true,ordinaryClaimsIncluded:true,feesAndFiniteCohortConservation:true,scope:'paired native memory mode experiment; complete report and resource archive still pending'});
