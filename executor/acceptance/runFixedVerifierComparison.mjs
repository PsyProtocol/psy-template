// Exactly one real successful fill per variant. No automatic financial resume.
import assert from'node:assert/strict';import{existsSync,statSync}from'node:fs';import{join}from'node:path';import{run,read}from'../../batching/admission/liveSupport.mjs';import{saveObservation}from'../observations.mjs';import{freezeAppModules}from'./sourceClosure.mjs';import{fileURLToPath}from'node:url';
const[base,original]=process.argv.slice(2);assert.ok(original);assert.equal(read(join(base,'funding-audit-v1/SUMMARY.json')).actualUps,2);
freezeAppModules(fileURLToPath(import.meta.url),base,'comparison-orchestrator-v1');
const env={PSY_RESOURCE_COMPARISON:'1',PSY_FIXED_VERIFIER_COMPARISON:'1',PSY_ORDINARY_RELEASE_FILE:'RELEASE.json',PSY_PROVER_RESOURCE_METRICS:'1'};
for(const selection of['baseline','candidate']){
 if(process.env.PSY_REQUIRE_RESOURCE_HEARTBEAT==='1')for(const name of ['resources-v1.log','tree-resources-v1.log'])assert.ok(Date.now()-statSync(join(base,name)).mtimeMs<15000,'resource observer stopped before round');
 assert.ok(!existsSync(join(base,'public',selection+'-COMPLETE.json')),'closed round; inspect originals');
 const timing=await run(process.execPath,['executor/acceptance/runRpcOrdinaryComparison.mjs',base,original,selection],join(base,selection+'-parent-v1.log'),env);
 saveObservation(join(base,'public',selection+'-parent-timing-v1.json'),timing);
 await run(process.execPath,['executor/acceptance/auditRpcOrdinaryComparison.mjs',base,selection,original,join(base,selection+'-audit-v1')],join(base,selection+'-audit-v1.log'));
 const audit=read(join(base,selection+'-audit-v1/SUMMARY.json'));assert.equal(audit.fullProofAccountingPending,false);assert.equal(audit.fills,1);assert.equal(audit.actualUps,17);
 console.log(selection,'real fill, ordinary claims, full proofs and conservation closed');
}
saveObservation(join(base,'public/PAIRED-RUNS-CLOSED-v1.json'),{at:new Date().toISOString(),fills:2,actualUps:34,allFullProofsAudited:true,ordinaryClaimsIncluded:true,feesAndFiniteCohortConservation:true,scope:'same binary, SDK, two threads and retain-v1 in both; only fixed verifier fresh-v1/cached-v1 differs; final reporting pending'});
