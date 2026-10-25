// One explicitly inspected pre-proof retry. No original signed request exists.
import assert from'node:assert/strict';import{readFileSync,copyFileSync,mkdirSync,constants,existsSync}from'node:fs';import{join}from'node:path';import{fileURLToPath}from'node:url';
import{assertMeasuredPreSessionFailure,ordinaryEvidenceDirectory,PRESESSION_METRICS_DRIVER_SHA256}from'./ordinaryEvidence.mjs';
import{freezeAppModules}from'./sourceClosure.mjs';import{sha256}from'../requestBinding.mjs';import{run,save,confirmUps}from'../../batching/admission/liveSupport.mjs';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
const[base,original]=process.argv.slice(2);assert.ok(original);freezeAppModules(fileURLToPath(import.meta.url),base,'buyer-pre-session-read-recovery-v2');
const rec=join(base,'unused-sponsorship-exit-v1'),label='buyer-claim-original-funding',next=label+'-read-recovery-v1',failed=join(rec,'attempts',label),out=join(rec,'attempts',next),oldInput=join(rec,'public',label+'.json'),newInput=join(rec,'public',next+'.json'),exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
const release=exact(join(base,'public/RELEASE.json')),tool=release.binaries.ordinary;
assert.equal(tool.sha256,PRESESSION_METRICS_DRIVER_SHA256);assert.equal(sha256(readFileSync(tool.file)),tool.sha256);assertMeasuredPreSessionFailure(failed,tool.sha256);
assert.deepEqual(exact(oldInput).calls.contract_calls.map(c=>[c.contract_id,c.method_name,c.inputs]),[[2484n,'claim',[662720n]],[0n,'simple_claim',[662720n]],[0n,'simple_claim',[1717440n]]]);
assert.ok(!existsSync(out)&&!existsSync(newInput),'preserve existing replacement; no second retry');
copyFileSync(oldInput,newInput,constants.COPYFILE_EXCL);
await run(tool.file,['call',join(rec,'public/rpc.json'),join(original,'.secrets/performance-recipient.json'),newInput,out],join(rec,next+'.log'),{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2',PSY_FIXED_VERIFIER_MODE:'cached-v1',PSY_PROVER_MEMORY_MODE:'retain-v1'});
await confirmUps(join(rec,'public/rpc.json'),out);
const markers=join(rec,'public/ordinary-recoveries');if(!existsSync(markers))mkdirSync(markers);
save(join(markers,label+'.json'),{version:3,originalLabel:label,replacementLabel:next,userId:406720,originalDriverSha256:tool.sha256,originalFailureSha256:sha256(readFileSync(join(failed,'failure.json'))),originalMetricsSha256:sha256(readFileSync(join(failed,'metrics.json'))),originalInputSha256:sha256(readFileSync(oldInput)),replacementInputSha256:sha256(readFileSync(newInput)),requestSha256:sha256(readFileSync(join(out,'request.json'))),receiptSha256:sha256(readFileSync(join(out,'included.json'))),scope:'original stopped before any proof or broadcast in the reviewed binary; identical input/calls/dependencies/expiry, one new attempt, no automatic retry'});
assert.equal(ordinaryEvidenceDirectory(rec,label,406720),out);console.log('same original buyer claim input included after explicit verified pre-session restart');
