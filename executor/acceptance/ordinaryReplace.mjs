// Explicit, inspected replacement of one ordinary-wallet attempt that stopped
// in a reviewed pre-session phase. Same business calls and dependencies, fresh
// send window; the recovery record is written only after exact inclusion.
import assert from'node:assert/strict';import{createHash}from'node:crypto';import{existsSync,mkdirSync,readdirSync,readFileSync}from'node:fs';import{join}from'node:path';
import{cohort}from'./candidateHarness.mjs';import{ordinary,save}from'../../batching/admission/liveSupport.mjs';import{parseLosslessJson}from'../../amm/u124/client.mjs';
import{assertFailedReplacements,assertPreSessionFailure,ordinaryEvidenceDirectory,PRESESSION_DIAGNOSTIC_DRIVER_SHA256}from'./ordinaryEvidence.mjs';
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const[base,original,label,actor]=process.argv.slice(2),h=cohort(base,original),user=h.actors[actor];assert.ok(user,'known QA actor');
assert.equal(h.ordinaryBinary&&sha(h.ordinaryBinary),PRESESSION_DIAGNOSTIC_DRIVER_SHA256,'unreviewed ordinary driver');
const originalDir=join(base,'attempts',label),recordDir=join(base,'public/ordinary-recoveries'),recordFile=join(recordDir,label+'.json');
assert.ok(!existsSync(recordFile),'recovery already recorded');assert.deepEqual(readdirSync(originalDir),['failure.json'],'original has proof/intent evidence; manual reconciliation required');
assertPreSessionFailure(join(originalDir,'failure.json'));
// The next version is used only when every earlier replacement also stopped pre-session.
const failedReplacements=[];let version=1;
for(;;version++){const dir=join(base,'attempts',label+'-retry-v'+version);if(!existsSync(dir)||existsSync(join(dir,'included.json')))break;failedReplacements.push({label:label+'-retry-v'+version,failureSha256:sha(join(dir,'failure.json'))});}
assertFailedReplacements(base,failedReplacements);
const replacement=label+'-retry-v'+version;
const oldInput=join(base,'public',label+'.json'),old=parseLosslessJson(readFileSync(oldInput,'utf8'));
const out=existsSync(join(base,'attempts',replacement,'included.json'))?join(base,'attempts',replacement):await ordinary({base,config:h.config,binary:h.ordinaryBinary,secret:user.secret,name:replacement,calls:old.calls.contract_calls,bindings:h.bindings,env:h.env});
const newInput=join(base,'public',replacement+'.json');
mkdirSync(recordDir,{recursive:true});
save(recordFile,{version:2,originalLabel:label,replacementLabel:replacement,userId:user.id,originalDriverSha256:PRESESSION_DIAGNOSTIC_DRIVER_SHA256,originalFailureSha256:sha(join(originalDir,'failure.json')),originalInputSha256:sha(oldInput),replacementInputSha256:sha(newInput),receiptSha256:sha(join(out,'included.json')),requestSha256:sha(join(out,'request.json')),...(failedReplacements.length?{failedReplacements}:{})});
assert.equal(ordinaryEvidenceDirectory(base,label,user.id),out);
console.log('replacement included and recorded',label,'->',replacement);
