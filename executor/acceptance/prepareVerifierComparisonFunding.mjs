// Owned QA setup, excluded from performance rounds. Unknown original requests
// are reconciled by exact identity; this entry never resends or replaces them.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';import{join}from'node:path';import{fileURLToPath}from'node:url';
import{threeMarketCase,SDK}from'./threeMarketCase.mjs';import{freezeAppModules}from'./sourceClosure.mjs';
import{ordinary,save,confirmUps}from'../../batching/admission/liveSupport.mjs';
import{parseLosslessJson,losslessJson}from'../../amm/u124/client.mjs';import{receiptReader}from'../chainReceipts.mjs';import{sha256}from'../requestBinding.mjs';
const[base,original,releasePath]=process.argv.slice(2);assert.ok(releasePath);assert.ok(!existsSync(join(base,'public/COMPLETE.json')),'closed QA setup');
freezeAppModules(fileURLToPath(import.meta.url),base,'funding-run-v1');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),h=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'}),config=join(base,'public/rpc.json'),release=JSON.parse(readFileSync(releasePath,'utf8')),tool=release.binaries.ordinary;
assert.equal(release.sdkManifestSha256,SDK);assert.equal(sha256(readFileSync(tool.file)),tool.sha256);
const plan=exact(join(base,'public/SETUP-PLAN.json'));assert.deepEqual(Object.keys(plan).sort(),['amountNativeAtoms','version']);assert.equal(plan.version,1n);assert.ok(plan.amountNativeAtoms>0n&&plan.amountNativeAtoms<=30_000_000_000n);
for(const[label,actor,calls]of[
 ['topup',h.actors.bob,[{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(h.actors.sponsor.id),plan.amountNativeAtoms]}]],
 ['simple-claim-v1',h.actors.sponsor,[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(h.actors.bob.id)]}]]]){
 const out=join(base,'attempts',label),input=join(base,'public',label+'.json');
 if(existsSync(out)){
  const p=exact(join(out,'preflight.json')),q=exact(join(out,'request.json'));assert.equal(p.inputSha256,sha256(readFileSync(input)));assert.deepEqual(q.user_ec_input.core,p.core);assert.equal(p.core.new_user_leaf.public_key,actor.publicKeyHash);
  assert.deepEqual(exact(input).calls,parseLosslessJson(losslessJson({contract_calls:calls,software_defined_call:{inputs:[]}})));
  if(!existsSync(join(out,'included.json')))await confirmUps(config,out);
 }else{
  assert.ok(!existsSync(input),'partial original input; inspect, do not replace');
  await ordinary({base,config,binary:tool.file,secret:actor.secret,name:label,calls,bindings:h.bindings,env:{...h.env,PSY_PROVER_MEMORY_MODE:'retain-v1',PSY_FIXED_VERIFIER_MODE:'cached-v1'}});
 }
 const p=exact(join(out,'preflight.json')),prior=exact(join(out,'included.json'));
 assert.equal(prior.endUserLeafHash,p.endUserLeafHash);assert.equal(prior.receipt.data.status,'included');
 const observed=await(await receiptReader(config))({userId:actor.id,endUserLeafHash:p.endUserLeafHash,minCheckpoint:Number(p.core.checkpoint_id)});
 assert.equal(observed.status,'included');assert.equal(observed.contentHash,prior.contentHash);
 save(join(base,'public',label+'-RECONCILED.json'),observed);
}
save(join(base,'public/COMPLETE.json'),{included:true,ordinaryClaimIncluded:true,amount:plan.amountNativeAtoms,asset:0n,scope:'owned QA native test PSY setup only; excluded from both measured rounds; no replacement payment'});
console.log('owned QA funding transfer and ordinary native claim included');
