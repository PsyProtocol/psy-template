// Explicit owned-QA repair of a reviewed pre-session connection failure.
// One caller-selected new label, one send. No retry loop or unknown replacement.
import assert from 'node:assert/strict';import{existsSync,mkdirSync,readdirSync,readFileSync}from'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';
import{cohort}from'./candidateHarness.mjs';import{assertPreSessionFailure,PRESESSION_DIAGNOSTIC_DRIVER_SHA256}from'./ordinaryEvidence.mjs';
import{read,save,ordinary,confirmUps}from'../../batching/admission/liveSupport.mjs';import{parseLosslessJson}from'../../amm/u124/client.mjs';
import{assertDurableRuntimeDirectory}from'../runtimeStorage.mjs';
const[parent,original,base,actor,label,replacementLabel]=process.argv.slice(2);assert.ok(parent&&original&&base&&base!==parent);for(const n of[label,replacementLabel])assert.match(n,/^[a-z0-9-]+$/);assert.match(replacementLabel,/-reviewed-v[1-9][0-9]*$/);assert.notEqual(label,replacementLabel);
assertDurableRuntimeDirectory(base);
const h=cohort(parent,original),user=h.actors[actor];assert.ok(user,'owned QA actor only');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),old=join(base,'attempts',label),out=join(base,'attempts',replacementLabel),marker=join(base,'public/local-proof-recoveries',label+'.json');
assert.ok(!existsSync(marker),'already recorded, do not send again');assert.equal(sha(h.ordinaryBinary),PRESESSION_DIAGNOSTIC_DRIVER_SHA256);assert.deepEqual(readdirSync(old),['failure.json']);
const failure=read(join(old,'failure.json'));
if(failure.phase==='prove-ordinary-calls'){
 // This pinned driver writes its request only after all calls and end-cap
 // verification. A local RPC read failed before that point; no request,
 // signature or broadcast artifact exists. This is an explicit one-off
 // repair, never a generic retry for an unknown submission.
 assert.equal(failure.reasonCode,'RPC_CONNECTION');assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.automaticRetry,false);
}else assertPreSessionFailure(join(old,'failure.json'));
const input=join(base,'public',label+'.json'),data=parseLosslessJson(readFileSync(input,'utf8'));
if(existsSync(join(out,'preflight.json'))){if(!existsSync(join(out,'included.json')))await confirmUps(h.config,out);}
else{assert.ok(!existsSync(out)&&!existsSync(join(base,'public',replacementLabel+'.json')),'inspect prior replacement; never silently renew it');await ordinary({base,config:h.config,binary:h.ordinaryBinary,secret:user.secret,name:replacementLabel,calls:data.calls.contract_calls,bindings:h.bindings,env:h.env});}
const next=parseLosslessJson(readFileSync(join(base,'public',replacementLabel+'.json'),'utf8'));assert.deepEqual(next.calls,data.calls);assert.deepEqual(next.contracts,data.contracts);
const paths=['public/'+label+'.json','attempts/'+label+'/failure.json','public/'+replacementLabel+'.json',...['included.json','preflight.json','intent.json','request.json','receipt.json'].map(n=>'attempts/'+replacementLabel+'/'+n)];
mkdirSync(join(base,'public/local-proof-recoveries'),{recursive:true});save(marker,{version:1,actor,originalLabel:label,replacementLabel,binarySha256:PRESESSION_DIAGNOSTIC_DRIVER_SHA256,files:Object.fromEntries(paths.map(p=>[p,sha(join(base,p))])),scope:'explicit reviewed pre-broadcast RPC failure repair; original has only pinned failure record, no completed proof/request/broadcast; same business calls; no automatic retry'});
console.log('exact ordinary repair included and recorded');
