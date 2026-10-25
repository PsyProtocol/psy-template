// Finish the already accepted queue; never admit a late member or extend it.
import assert from'node:assert/strict';import{existsSync,mkdirSync,readFileSync}from'node:fs';import{join}from'node:path';import{fileURLToPath}from'node:url';
import{threeMarketCase,SDK}from'./threeMarketCase.mjs';import{formal}from'./candidateHarness.mjs';import{freezeAppModules}from'./sourceClosure.mjs';import{LiveMarket}from'../../batching/admission/liveMarket.mjs';import{publicState}from'../publicState.mjs';import{ordinary,save,read}from'../../batching/admission/liveSupport.mjs';import{parseLosslessJson,FEE_ESCROW as F}from'../../amm/u124/client.mjs';import{sponsorCalls}from'../../batching/v2/client.mjs';import{payoutClaims,cohortAssets}from'../../batching/admission/liveAssets.mjs';import{sha256}from'../requestBinding.mjs';
const[base,original]=process.argv.slice(2);assert.ok(original);freezeAppModules(fileURLToPath(import.meta.url),base,'expired-admission-recovery-v1');
const old=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'}),round=join(base,'baseline'),r=read(join(base,'public/RELEASE.json')),config=join(round,'public/rpc.json');assert.equal(r.sdkManifestSha256,SDK);assert.equal(sha256(readFileSync(r.binaries.compact.file)),r.binaries.compact.sha256);
const m=new LiveMarket({...old.by.orderbook,base:round,config}),h={...old,base:round,config,markets:[m],by:{orderbook:m},binary:r.binaries.compact.file,binarySha256:r.binaries.compact.sha256,proverMemoryMode:'retain-v1',fixedVerifierMode:'fresh-v1'},plan=read(join(round,'public/PLAN.json'));
const recovery=join(base,'expiry-recovery-v1');mkdirSync(recovery);mkdirSync(join(recovery,'public'));mkdirSync(join(recovery,'attempts'));
const named=name=>t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===name);
const f=await formal(h,m,'rpc-ordinary',plan,{performanceMetrics:true,expiry:512,runtimeSuffix:'-comparison'});
try{
 assert.equal((await f.journal.unresolved()).length,0,'no unknown transmission may be replaced');
 const failed=read(join(round,'public/admit-1-formal-task.json')),records=await f.journal.records();assert.ok(!records.some(x=>x.status==='broadcast-intent'&&JSON.stringify(x.task)===JSON.stringify(failed)),'original admission must never have been broadcast');
 const s=await publicState(config);assert.ok(s.checkpoint>plan.cutoff);assert.equal(await h.at(s,m,m.vault,'queue_phase'),1n);assert.equal(await h.at(s,m,m.vault,'queue_count'),1n);
 save(join(recovery,'public/START.json'),{at:new Date().toISOString(),queueEpoch:plan.epoch,cutoff:plan.cutoff,accepted:1,lateMembersNotAdmitted:true,failedAdmissionNoBroadcastIntent:true,failedAdmission:failed,scope:'seal and refund the exact accepted singleton; unaccepted order subsequently cancels, releases and recovers original funding'});
 // The previously funded purpose-2 grant was not consumed by the rejected
 // admission. Scan chooses seal_epoch; no extra maintenance payment is made.
 await f.step('expiry-seal',named('seal_epoch'));
 const fundCalls=async()=>{const s=await publicState(config);return sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:await h.at(s,m,h.actors.sponsor.id,'sponsor_nonce')+1n,purpose:1n,amount:2n*F});};
 await ordinary({base:recovery,config,binary:r.binaries.ordinary.file,secret:h.actors.sponsor.secret,name:'refund-commit-fund',calls:await fundCalls(),bindings:h.bindings,env:{...h.env,PSY_FIXED_VERIFIER_MODE:'fresh-v1',PSY_PROVER_MEMORY_MODE:'retain-v1'}});
 await f.step('expiry-commit',t=>t.kind==='batch_commit');await f.step('expiry-refund',t=>t.kind==='batch_settle');
 const accepted=Number(await h.at(await publicState(config),m,m.vault,'queue_owner',0));
 const actor=Object.values(h.actors).find(a=>a.id===accepted);assert.ok(actor);
 await ordinary({base:recovery,config,binary:r.binaries.ordinary.file,secret:actor.secret,name:'accepted-refund-claim',calls:await payoutClaims(await publicState(config),{userId:accepted,markets:[m],tokenAbi:h.token,nftAbi:h.nft}),bindings:h.bindings,env:{...h.env,PSY_FIXED_VERIFIER_MODE:'fresh-v1',PSY_PROVER_MEMORY_MODE:'retain-v1'}});
 save(join(recovery,'public/ACCEPTED-REFUND-COMPLETE.json'),{accepted,queueEpoch:plan.epoch,acceptedOriginalAssetRefundClaimed:true,lateMemberStillRequiresExplicitCancellationAndRecovery:true,scope:'not a successful fill and not a performance comparison'});
 console.log('accepted singleton refunded and claimed; inspect unaccepted member recovery next');
}finally{await f.close();}
