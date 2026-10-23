// Resume only confirmed, fixed three-market thin case. No order/intake renewal.
// Explicit continuation of the interrupted three-market owned QA case.
// Finish its accepted Curve member; abort proven-empty epochs before renewing
// ONLY unaccepted Book/NFT consents. No order refund/redeposit or old update.
import assert from'node:assert/strict';import{existsSync,mkdirSync,readFileSync,readdirSync}from'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';
import{ExecutionJournal}from'../journal.mjs';
import{ownedCase}from'./ownedCase.mjs';import{formal,pause}from'./candidateHarness.mjs';import{read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';
import{parseLosslessJson}from'../../amm/u124/client.mjs';import{cohortAssets,payoutClaims,canonicalHeldNfts}from'../../batching/admission/liveAssets.mjs';
const[parent,original,base]=process.argv.slice(2),h=ownedCase(parent,original,base),kinds=['orderbook','bondingcurve','nftmarket'],markets=kinds.map(k=>h.by[k]),oldPlans=read(join(base,'public/plans.json')),unit=10n**18n,services=[];
const complete=join(base,'public/COMPLETE.json');if(existsSync(complete)){console.log('already closed; no transaction');process.exit(0);}
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),sourceName=process.env.PSY_FINISH_SOURCE_MANIFEST??'FINISH-SOURCE-v7.json';assert.match(sourceName,/^FINISH-SOURCE-v[1-9][0-9]*\.json$/);const pin=join(base,'public',sourceName);
if(!existsSync(pin)){
 const files=['executor/acceptance/thinMarketsSettle.mjs','executor/acceptance/ownedCase.mjs','executor/acceptance/candidateHarness.mjs','executor/admissionReader.mjs','executor/compactAdmissionAdapter.mjs','executor/publicWalletAdapter.mjs','executor/phaseMetrics.mjs','executor/acceptance/ordinaryEvidence.mjs'];
 save(pin,{at:new Date().toISOString(),previousSourceSha256:digest(join(base,'public/SOURCE.json')),sdkManifestSha256:'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425',binarySha256:h.binarySha256,files:Object.fromEntries(files.map(p=>[p,digest(p)])),scope:'settlement-only continuation; all accepted members unchanged; only active market adapters initialized; confirmed Curve uses its read-only journal'});
}
for(const[p,d]of Object.entries(read(pin).files))assert.equal(digest(p),d,'frozen finish source changed');
const review=parseLosslessJson(readFileSync(join(base,'public/order-review.json'),'utf8')),before=parseLosslessJson(readFileSync(join(base,'public/assets-before.json'),'utf8'));
for(const [actor,label]of [['bob','thin-bob-orders'],['trader','thin-trader-orders'],['charlie','thin-charlie-orders']]){
 // All original financial orders must already be independently confirmed.
 const marker=join(base,'public/local-proof-recoveries',label+'.json'),name=existsSync(marker)?read(marker).replacementLabel:label;assert.ok(existsSync(join(base,'attempts',name,'included.json')));await h.user(actor,label,[]);
}
const named=name=>t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===name);
const pairs=async jobs=>{for(let i=0;i<jobs.length;i+=2){const r=await Promise.allSettled(jobs.slice(i,i+2).map(fn=>fn()));const failure=r.find(r=>r.status==='rejected');if(failure)throw failure.reason;}};
async function reconcileAll(){for(const f of services){await f.journal.reconcile(f.adapter.reconcile);assert.equal((await f.journal.unresolved()).length,0,'unknown original broadcast blocks funding or replacement');}}
async function step(f,label,expected,options={}){
 const aliases=join(base,'public/CONTROL-TASK-ALIASES-v1.json');
 if(existsSync(aliases)){
  const a=read(aliases).aliases.find(a=>a.originalLabel===label);
  if(a){
   assert.match(label,/^thin-(orderbook|bondingcurve)-old-epoch-close$/);assert.match(a.replacementLabel,/^thin-(orderbook|bondingcurve)-old-epoch-close-reviewed-v1$/);assert.equal(a.vaultId,f.options.vaultId);
   const task=read(join(base,'public',label+'-formal-task.json'));assert.ok(['seal_epoch','abort_empty_epoch'].includes(task.maintenanceOperation));
   const id=createHash('sha256').update(JSON.stringify({scope:f.journal.scope,task})).digest('hex');assert.equal(id,a.originalTaskId);
   const records=await f.journal.records();assert.ok(records.some(r=>r.taskId===id&&r.status==='not-submitted'&&JSON.stringify(r)===JSON.stringify(a.resolutionEvent)),'explicit original non-submission must be recorded');
   for(const[p,hash]of Object.entries(a.files))assert.equal(digest(join(base,p)),hash);
   label=a.replacementLabel;
  }
 }
 for(let retry=0;retry<2;retry++){
  try{return await f.step(label,expected,options);}
  catch(error){
   // Only reuse an existing exact proof after the pinned child explicitly
   // certifies that broadcasting did NOT start. Unknown sends cannot use this.
   // Other independent vault workers may hold THEIR own locks. Do not try to
   // acquire all journals from a single worker's recovery handler.
   // A failed read during confirmation does not invalidate the proof or allow
   // a new operation. Keep reconciling that original identity, read-only.
   if(error.name==='ReadUnavailable'&&(await f.journal.unresolved()).length){
    let recovered=false;
    for(let poll=0;poll<120;poll++){
     try{await f.journal.reconcile(f.adapter.reconcile);if(!(await f.journal.unresolved()).length){recovered=true;break;}}
     catch(readError){if(readError.name!=='ReadUnavailable')throw readError;}
     await pause(10000);
    }
    assert.ok(recovered,'original identity remains unresolved; no replacement');
    const taskFile=join(base,'public',label+'-formal-task.json'),task=read(taskFile),id=createHash('sha256').update(JSON.stringify({scope:f.journal.scope,task})).digest('hex');
    if((await f.journal.records()).some(r=>r.taskId===id&&r.status==='included'))return f.step(label,expected,options);
   }
   await f.journal.reconcile(f.adapter.reconcile);assert.equal((await f.journal.unresolved()).length,0,'unknown own broadcast');const records=await f.journal.records(),last=records.at(-1);
   if(retry||last?.status!=='not-submitted'||!String(last.reason).includes('Connection error to https://'))throw error;
   const task=(existsSync(join(base,'public',label+'-production-cli-execution.json'))?read(join(base,'public',label+'-production-cli-execution.json')).actualTask:read(join(base,'public',label+'-formal-task.json')));
   const id=createHash('sha256').update(JSON.stringify({scope:f.journal.scope,task})).digest('hex');assert.equal(last.taskId,id);
   const proved=records.findLast(r=>r.taskId===id&&r.status==='proved');assert.ok(proved);assert.equal(await f.adapter.validateProof(task,proved.proof),true);assert.equal(await f.adapter.isCurrent(task),true);
   const s=await publicState(h.config);assert.ok(s.checkpoint+8<Number(task.validUntilCheckpoint),'original proof window too short');
   save(join(base,'public',label+'-exact-proof-resume-v1.json'),{at:new Date().toISOString(),taskId:id,proof:proved.proof,sourceCheckpoint:s.checkpoint,explicitNonSubmission:last,sameBusinessOperation:true,newProofAllowed:false,newPaymentAllowed:false});
   const prove=f.adapter.prove;f.adapter.prove=async()=>{throw Error('reviewed exact-proof resume forbids re-proving');};
   try{return await f.step(label,expected,options);}finally{f.adapter.prove=prove;}
  }
 }
}
async function fund(ms,label,purpose=2){await reconcileAll();await h.fundExact(ms,label,purpose);}
try{
 const renewal=3,prefix='thin-renewed-v3',renewed=[h.by.orderbook,h.by.nftmarket],plans=read(join(base,'public/renewed-plans-v3.json')),fs={},names=['bob','trader','charlie'];
 const claim=read(join(base,'attempts/thin-curve-finish-claim/included.json'));assert.equal(claim.status,'included');assert.equal(claim.preflight.fullUpsVerified,true);assert.equal(claim.userId,h.actors.bob.id);
 const co=read(join(base,'public/thin-bondingcurve-executor/executor.json'));assert.equal(co.vaultId,h.by.bondingcurve.vault);assert.equal(co.fingerprint,h.by.bondingcurve.registration.fingerprint);assert.equal(co.runtimeDirectory,join(base,'runtime'));
 const cj=new ExecutionJournal({directory:co.runtimeDirectory,network:co.network,vaultId:co.vaultId,fingerprint:co.fingerprint});assert.equal((await cj.unresolved()).length,0,'closed Curve original must already be included');
 services.push({journal:cj,adapter:{reconcile:async()=>{throw Error('closed Curve unexpectedly pending; operator reconciliation required');}},close:async()=>{}});
 for(const m of renewed){
  assert.equal(plans[m.kind].members.length,2);
  fs[m.kind]=await formal(h,m,'thin-renewed-v3',plans[m.kind],{performanceMetrics:true,bulkFallbackRemainingCheckpoints:64});services.push(fs[m.kind]);
  for(let round=0;round<2;round++){
   const accepted=read(join(base,'public',prefix+'-'+m.kind+'-admit-'+round+'-formal-result.json'));assert.equal(accepted.result.status,'included');assert.equal(accepted.task.maintenanceOperation,'admit_entry');
   const call=parseLosslessJson(accepted.task.submission).contract_calls.find(c=>c.method_name==='admit_entry');assert.equal(call.contract_id,BigInt(m.id));assert.equal(call.inputs[0],BigInt(plans[m.kind].members[round].owner));assert.equal(call.inputs[1],BigInt(plans[m.kind].members[round].nonce));
   assert.ok((await fs[m.kind].journal.records()).some(r=>r.taskId===accepted.taskId&&r.status==='included'&&r.result.contentHash===accepted.result.contentHash),'exact accepted receipt must exist in pinned journal');
  }
 }
 await reconcileAll();
 const cutoff=plans.orderbook.cutoff;assert.equal(cutoff,plans.nftmarket.cutoff);
 await fund(renewed,prefix+'-seal-fund');while((await publicState(h.config)).checkpoint<=cutoff)await pause(10000);
 await pairs(renewed.map(m=>()=>step(fs[m.kind],prefix+'-'+m.kind+'-seal',named('seal_epoch'))));
 await fund(renewed,prefix+'-commit-fund',1);
 await pairs(renewed.map(m=>async()=>{await step(fs[m.kind],prefix+'-'+m.kind+'-commit',t=>t.kind==='batch_commit');await step(fs[m.kind],prefix+'-'+m.kind+'-settle',t=>t.kind==='batch_settle');}));
 for(const m of markets){const s=await m.snapshot('thin-final-'+m.kind);assert.equal(s.fields.queue_phase[0],3n);assert.equal(s.fields.queue_count[0],m.kind==='bondingcurve'?1n:2n);assert.deepEqual(s.fields.queue_outcome.filter((_,i)=>s.fields.queue_owner[i]!==0n),m.kind==='bondingcurve'?[1n]:[1n,1n]);if(m.kind==='bondingcurve')assert.equal(s.fields.sold_lots[0],review.sold+1n);}
 for(const name of names){const label='thin-final-'+name+'-claim',out=join(base,'attempts',label);await h.user(name,label,existsSync(join(out,'preflight.json'))?[]:await payoutClaims(await publicState(h.config),{userId:h.actors[name].id,markets:renewed.filter(m=>m.kind==='orderbook'?name!=='charlie':name!=='bob'),tokenAbi:h.token,nftAbi:h.nft,...(name==='charlie'?{nftSlot:0}:{})}));}
 await reconcileAll();const after=await cohortAssets(await publicState(h.config),h.spec),included=[],seen=new Map();
 const add=(r,source)=>{const row={source,contentHash:r.contentHash,checkpoint:r.checkpoint,fee:BigInt(r.receipt.data.result.fees_collected)};if(seen.has(row.contentHash)){const prior=seen.get(row.contentHash);assert.equal(prior.checkpoint,row.checkpoint);assert.equal(prior.fee,row.fee);return;}seen.set(row.contentHash,row);included.push(row);};
 for(const n of readdirSync(join(base,'attempts'))){const p=join(base,'attempts',n,'included.json');if(existsSync(p))add(read(p),'attempts/'+n+'/included.json');}
 for(const f of services)for(const r of(await f.journal.records()).filter(r=>r.status==='included'))add(r.result,'formal/'+r.taskId);
 const fees=included.reduce((n,r)=>n+r.fee,0n);for(const a of h.spec.assets){assert.equal(before.totals[a],1000n*unit);assert.equal(after.totals[a],before.totals[a]);}assert.equal(before.nativeTotal-after.nativeTotal,fees);
 const expected={bob:[0n,unit-review.curveCost],trader:[unit+review.nftPrice,-unit],charlie:[-review.nftPrice,0n],dave:[0n,0n]};for(const[name,[a,b]]of Object.entries(expected)){const id=h.actors[name].id;assert.equal(after.accounts[id].ft[2464]-before.accounts[id].ft[2464],a);assert.equal(after.accounts[id].ft[2466]-before.accounts[id].ft[2466],b);}
 const nf=canonicalHeldNfts(after.nfts),oldNf=canonicalHeldNfts(before.nfts),buyer=nf.find(n=>n.user===BigInt(h.actors.charlie.id));assert.ok(buyer);assert.equal(nf.length,2);assert.equal(after.nftPending.length,0);assert.deepEqual(buyer.tokenId,review.nftIdentity.tokenId);assert.deepEqual(buyer.metadataHash,review.nftIdentity.metadataHash);assert.deepEqual(nf.find(n=>n.user===BigInt(h.actors.dave.id)),oldNf.find(n=>n.user===BigInt(h.actors.dave.id)));
 save(join(base,'public/assets-after.json'),after);save(complete,{completedAt:new Date().toISOString(),markets:markets.map(m=>({kind:m.kind,marketId:m.id,vaultId:m.vault,plannedHints:m.kind==='bondingcurve'?4:renewal===3?2:4,acceptedMembers:m.kind==='bondingcurve'?1:2,fills:1})),marketId:null,vaultId:null,acceptedMembers:5,fills:3,productionCliAdmission:true,ordinaryClaimIncluded:true,fee:fees,included,nativeBefore:before.nativeTotal,nativeAfter:after.nativeTotal,expectedIndividualFtDeltas:expected,curveChange:review.curveQuoteLimit-review.curveCost,nftIdentity:review.nftIdentity,originalEpochRecovery:true,acceptedSetChanged:false,unacceptedOrdersResigned:false,unacceptedAdmissionConsentsRenewed:true,sourceManifest:sourceName,existingPusdtUsed:false,newDeployment:false,globalFairness:false,chainTps:null,productionReady:false});console.log('three-market thin acceptance, original interruption and recovery closed');
}finally{for(const f of services)await f.close();}
