// Resume the one original QA setup transfer, never create a replacement.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';import{join}from'node:path';import{fileURLToPath}from'node:url';
import{threeMarketCase}from'./threeMarketCase.mjs';import{freezeAppModules}from'./sourceClosure.mjs';
import{ordinary,save,confirmUps}from'../../batching/admission/liveSupport.mjs';
import{parseLosslessJson,losslessJson}from'../../amm/u124/client.mjs';import{receiptReader}from'../chainReceipts.mjs';import{sha256}from'../requestBinding.mjs';
const[base,original,releasePath]=process.argv.slice(2);assert.ok(releasePath);assert.ok(!existsSync(join(base,'public/COMPLETE.json')),'closed funding setup');
freezeAppModules(fileURLToPath(import.meta.url),base,process.env.PSY_MEMORY_FUNDING_SOURCE_LABEL??'funding-resume-v1');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),h=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'}),config=join(base,'public/rpc.json'),release=JSON.parse(readFileSync(releasePath,'utf8')),tool=release.binaries.ordinary;
assert.equal(sha256(readFileSync(tool.file)),tool.sha256);
const p=exact(join(base,'attempts/topup/preflight.json')),q=exact(join(base,'attempts/topup/request.json')),input=exact(join(base,'public/topup.json'));
assert.equal(p.inputSha256,sha256(readFileSync(join(base,'public/topup.json'))));assert.deepEqual(q.user_ec_input.core,p.core);assert.equal(p.core.new_user_leaf.public_key,h.actors.bob.publicKeyHash);
assert.deepEqual(input.calls.contract_calls,parseLosslessJson(losslessJson([{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(h.actors.sponsor.id),10_000_000_000n]}])));
if(!existsSync(join(base,'attempts/topup/included.json')))await confirmUps(config,join(base,'attempts/topup'));
const prior=exact(join(base,'attempts/topup/included.json'));assert.equal(prior.endUserLeafHash,p.endUserLeafHash);assert.equal(prior.receipt.data.status,'included');
const observed=await(await receiptReader(config))({userId:h.actors.bob.id,endUserLeafHash:p.endUserLeafHash,minCheckpoint:Number(p.core.checkpoint_id)});assert.equal(observed.status,'included');assert.equal(observed.contentHash,prior.contentHash);save(join(base,'public/ORIGINAL-RECONCILED-v1.json'),observed);
await ordinary({base,config,binary:tool.file,secret:h.actors.sponsor.secret,name:'simple-claim-v1',calls:[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(h.actors.bob.id)]}],bindings:h.bindings,env:{...h.env,PSY_PROVER_MEMORY_MODE:'retain-v1',PSY_PROVER_RESOURCE_METRICS:'1'}});
save(join(base,'public/COMPLETE.json'),{included:true,ordinaryClaimIncluded:true,amount:10_000_000_000n,asset:0n,scope:'owned QA native test PSY setup only, excluded from both measured rounds; original transfer reconciled without replacement or resend'});
console.log('owned QA setup transfer and ordinary simple_claim included');
