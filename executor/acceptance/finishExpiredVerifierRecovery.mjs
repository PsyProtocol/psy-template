// Explicitly return the unaccepted sender's original funding. Fixture reset
// orders are unfunded and separately charged, never reported as real fills.
import assert from'node:assert/strict';import{mkdirSync,readFileSync,existsSync}from'node:fs';import{join}from'node:path';import{fileURLToPath}from'node:url';import{threeMarketCase}from'./threeMarketCase.mjs';import{formal}from'./candidateHarness.mjs';import{freezeAppModules}from'./sourceClosure.mjs';import{LiveMarket}from'../../batching/admission/liveMarket.mjs';import{ordinary,read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';import{parseLosslessJson,losslessJson,encodeAmount,FEE_ESCROW as F}from'../../amm/u124/client.mjs';import{sponsorCalls}from'../../batching/v2/client.mjs';import{payoutClaims,cohortAssets}from'../../batching/admission/liveAssets.mjs';import{sha256}from'../requestBinding.mjs';
const[base,original]=process.argv.slice(2);assert.ok(original);freezeAppModules(fileURLToPath(import.meta.url),base,process.env.PSY_EXPIRED_FINISH_SOURCE_LABEL??'finish-expired-admission-v1');
const old=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'}),round=join(base,'baseline'),config=join(round,'public/rpc.json'),release=read(join(base,'public/RELEASE.json')),m=new LiveMarket({...old.by.orderbook,base:round,config});
const h={...old,base:round,config,binary:release.binaries.compact.file,binarySha256:release.binaries.compact.sha256,proverMemoryMode:'retain-v1',fixedVerifierMode:'fresh-v1'};
const rec=join(base,'unaccepted-recovery-v1');for(const dir of [rec,join(rec,'public'),join(rec,'attempts')])if(!existsSync(dir))mkdirSync(dir);assert.equal(sha256(readFileSync(release.binaries.ordinary.file)),release.binaries.ordinary.sha256);
const env={...h.env,PSY_FIXED_VERIFIER_MODE:'fresh-v1',PSY_PROVER_MEMORY_MODE:'retain-v1'};
const user=async(actor,label,calls)=>{
 const originalLabel=label,out=join(rec,'attempts',label);
 if(existsSync(out)){
  assert.equal(process.env.PSY_ALLOW_PREPROOF_RECOVERY,'1','explicit inspection required');
  for(const name of ['request.json','intent.json','receipt.json','wire.json','wire.body','preflight.json'])assert.equal(existsSync(join(out,name)),false,'never replace a signed or potentially broadcast operation');
  const prior=readFileSync(join(rec,label+'.log'),'utf8').split('\n').filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean).at(-1);
  assert.equal(prior.ok,false);assert.equal(prior.phase,'start-ordinary-session');assert.equal(prior.reasonCode,'RPC_CONNECTION');
  const input=parseLosslessJson(readFileSync(join(rec,'public',label+'.json'),'utf8'));assert.deepEqual(input.calls.contract_calls,parseLosslessJson(losslessJson(calls)));
  label+='-read-recovery-v2';assert.equal(existsSync(join(rec,'attempts',label)),false);
  save(join(rec,'public',label+'-INSPECTION.json'),{originalLabel,phase:prior.phase,reasonCode:prior.reasonCode,originalRequestAbsent:true,originalIntentAbsent:true,completeSignedUpsProofAbsent:true,explicitNewAttempt:true});
 }
 return ordinary({base:rec,config,binary:release.binaries.ordinary.file,secret:h.actors[actor].secret,name:label,calls,bindings:h.bindings,env});
};
const U=h.actors.bob.id,B=h.actors.buyer.id;const s=await publicState(config);assert.equal(await h.at(s,m,m.vault,'queue_phase'),3n);assert.equal(await h.at(s,m,m.vault,'queue_count'),1n);assert.equal(await h.at(s,m,m.vault,'queue_owner',0),BigInt(B));assert.equal(await h.at(s,m,m.vault,'queue_outcome',0),3n);assert.equal(await h.at(s,m,U,'kind'),1n);assert.equal(await h.at(s,m,U,'nonce'),7n);assert.ok(await h.at(s,m,m.vault,'consumed',U)<7n);
if(!existsSync(join(rec,'public/START.json')))save(join(rec,'public/START.json'),{queueEpoch:8,accepted:B,outcome:3,scope:'unmatched accepted Book order legally carried; no payout exists yet. Both original senders explicitly cancel and release after epoch closure, then enroll sender-only funding recovery.'});
const f=await formal(h,m,'rpc-ordinary',read(join(round,'public/PLAN.json')),{performanceMetrics:true,expiry:512,runtimeSuffix:'-comparison'});
try{for(const actor of ['bob','buyer']){
 const owner=h.actors[actor].id;
 await user(actor,actor+'-cancel-release-and-enroll',[m.order('request_cancel',[]),m.order('release_unaccepted',[]),m.order('request_recovery',[BigInt(m.vault)])]);
 const at=await publicState(config);await user('sponsor',actor+'-original-recovery-fund',sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:await h.at(at,m,h.actors.sponsor.id,'sponsor_nonce')+1n,purpose:2n,amount:2n*F}));
 await f.step(actor+'-original-funding-refund',t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name==='recover_funding'&&c.inputs[0]===BigInt(owner)));
 await user(actor,actor+'-original-funding-claim',await payoutClaims(await publicState(config),{userId:owner,markets:[m],tokenAbi:h.token,nftAbi:h.nft}));
}}finally{await f.close();}
const before=parseLosslessJson(readFileSync(join(round,'public/assets-before.json'),'utf8')),spec={users:Object.keys(before.accounts).map(Number),assets:[2483,2484],nftId:2496},after=await cohortAssets(await publicState(config),spec);save(join(rec,'public/ASSETS-AFTER-REFUNDS.json'),after);
for(const id of Object.keys(before.accounts))for(const asset of spec.assets)assert.equal(after.accounts[id].ft[asset],before.accounts[id].ft[asset],'all original FT funds return; no trade');assert.deepEqual(after.totals,before.totals);
save(join(rec,'public/REFUNDS-COMPLETE.json'),{accepted:B,unaccepted:U,actualFills:0,allOriginalFtReturned:true,lateAdmissionNeverSubmitted:true,scope:'actual cancellation, terminal epoch release, sender-enrolled SD-key recovery and ordinary claim; native fees require independent audit'});
// Restore equal, unfunded QA order fixtures before the next experiment. The
// contract permits close when incoming cursors are settled, including an
// unfunded order; consumed need not be manufactured or incremented.
const unit=10n**18n,cp=(await publicState(config)).checkpoint;
await user('bob','normalize-unfunded-owner',[m.order('open_sell',[BigInt(m.vault),0n,encodeAmount(unit),encodeAmount(unit),BigInt(cp)+8192n,8n])]);
await user('buyer','normalize-unfunded-buyer',[m.order('open_sell',[BigInt(m.vault),1n,encodeAmount(unit),encodeAmount(unit),BigInt(cp)+8192n,8n])]);
const normalized=await cohortAssets(await publicState(config),spec);save(join(rec,'public/ASSETS-AFTER-NORMALIZATION.json'),normalized);for(const id of Object.keys(after.accounts))for(const asset of spec.assets)assert.equal(normalized.accounts[id].ft[asset],after.accounts[id].ft[asset]);
save(join(rec,'public/COMPLETE.json'),{actualFills:0,originalFundsReturned:true,normalizationOrderNonce:8,normalizationFunded:false,scope:'two separately charged ordinary QA fixture transactions; not fills, not part of cache comparison, no consumed counter or contract update'});console.log('both original FT deposits returned; unfunded nonce-8 QA fixtures ready');
