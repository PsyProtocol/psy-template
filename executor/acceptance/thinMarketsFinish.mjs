// Explicit continuation of the interrupted three-market owned QA case.
// Finish its accepted Curve member; abort proven-empty epochs before renewing
// ONLY unaccepted Book/NFT consents. No order refund/redeposit or old update.
import assert from'node:assert/strict';import{existsSync,mkdirSync,readFileSync,readdirSync}from'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';
import{ownedCase}from'./ownedCase.mjs';import{formal,pause}from'./candidateHarness.mjs';import{read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';
import{parseLosslessJson}from'../../amm/u124/client.mjs';import{cohortAssets,payoutClaims,canonicalHeldNfts}from'../../batching/admission/liveAssets.mjs';
const[parent,original,base]=process.argv.slice(2),h=ownedCase(parent,original,base),kinds=['orderbook','bondingcurve','nftmarket'],markets=kinds.map(k=>h.by[k]),oldPlans=read(join(base,'public/plans.json')),unit=10n**18n,services=[];
const complete=join(base,'public/COMPLETE.json');if(existsSync(complete)){console.log('already closed; no transaction');process.exit(0);}
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),sourceName=process.env.PSY_FINISH_SOURCE_MANIFEST??'FINISH-SOURCE-v1.json';assert.match(sourceName,/^FINISH-SOURCE-v[1-9][0-9]*\.json$/);const pin=join(base,'public',sourceName);
if(!existsSync(pin)){
 const files=['executor/acceptance/thinMarketsFinish.mjs','executor/acceptance/ownedCase.mjs','executor/acceptance/candidateHarness.mjs','executor/admissionReader.mjs','executor/compactAdmissionAdapter.mjs','executor/publicWalletAdapter.mjs','executor/phaseMetrics.mjs','executor/acceptance/ordinaryEvidence.mjs'];
 save(pin,{at:new Date().toISOString(),previousSourceSha256:digest(join(base,'public/SOURCE.json')),sdkManifestSha256:'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425',binarySha256:h.binarySha256,files:Object.fromEntries(files.map(p=>[p,digest(p)])),scope:'explicit post-timeout continuation; original sources and evidence retained; accepted Curve set unchanged; Book/NFT empty epochs must close before new consent'});
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
 const old={};for(const m of markets){old[m.kind]=await formal(h,m,'thin',oldPlans[m.kind],{performanceMetrics:true,bulkFallbackRemainingCheckpoints:64});services.push(old[m.kind]);}
 await reconcileAll();
 const inspected=join(base,'public/interrupted-intake-inspection-v1.json');
 if(!existsSync(inspected)){
  const s=await publicState(h.config),rows=[];assert.ok(s.checkpoint>oldPlans.orderbook.cutoff);
  for(const m of markets){const count=await h.at(s,m,m.vault,'queue_count');assert.equal(await h.at(s,m,m.vault,'queue_phase'),1n);assert.equal(count,m.kind==='bondingcurve'?1n:0n);if(count)assert.equal(await h.at(s,m,m.vault,'queue_owner'),BigInt(h.actors.bob.id));rows.push({marketId:m.id,epoch:await h.at(s,m,m.vault,'queue_epoch'),count});}
  save(inspected,{at:new Date().toISOString(),checkpoint:s.checkpoint,rows,scope:'no unknown journal transmission; only Curve Bob accepted; empty other epochs may abort, accepted member must settle'});
 }
 await fund(markets,'thin-timeout-close-fund');
 await pairs(markets.map(m=>()=>step(old[m.kind],'thin-'+m.kind+'-old-epoch-close',named(m.kind==='bondingcurve'?'seal_epoch':'abort_empty_epoch'))));
 await fund([h.by.bondingcurve],'thin-curve-finish-commit-fund',1);
 await step(old.bondingcurve,'thin-curve-finish-commit',t=>t.kind==='batch_commit');await step(old.bondingcurve,'thin-curve-finish-settle',t=>t.kind==='batch_settle');
 const curveLabel='thin-curve-finish-claim',curveOut=join(base,'attempts',curveLabel);
 await h.user('bob',curveLabel,existsSync(join(curveOut,'preflight.json'))?[]:await payoutClaims(await publicState(h.config),{userId:h.actors.bob.id,markets:[h.by.bondingcurve],tokenAbi:h.token,nftAbi:h.nft}));
 const renewed=[h.by.orderbook,h.by.nftmarket];
 const renewal=Number(process.env.PSY_THIN_RENEWAL??1);assert.ok([1,2,3].includes(renewal));const prefix=renewal===1?'thin-renewed':'thin-renewed-v'+renewal;
 for(let priorVersion=1;priorVersion<renewal;priorVersion++){
  const priorPlans=read(join(base,'public/renewed-plans-v'+priorVersion+'.json')),prior=[];
  for(const m of renewed){const tag='thin-renewed-v'+priorVersion+(priorVersion===2?'-reviewed':'');const f=await formal(h,m,tag,priorPlans[m.kind],{performanceMetrics:true,bulkFallbackRemainingCheckpoints:64});services.push(f);prior.push(f);}
  await reconcileAll();const check=join(base,'public/renewed-v'+priorVersion+'-empty-timeout-v1.json');
  if(!existsSync(check)){const s=await publicState(h.config);assert.ok(s.checkpoint>priorPlans.orderbook.cutoff);const rows=[];for(const m of renewed){assert.equal(await h.at(s,m,m.vault,'queue_count'),0n);assert.equal(await h.at(s,m,m.vault,'queue_phase'),1n);assert.equal(await h.at(s,m,m.vault,'queue_epoch'),BigInt(priorPlans[m.kind].epoch));rows.push({market:m.id,count:0,epoch:priorPlans[m.kind].epoch});}save(check,{at:new Date().toISOString(),checkpoint:s.checkpoint,rows,scope:'expired empty renewed queues; no unresolved transmission; original funded orders remain intact'});}
  await fund(renewed,'thin-renewed-v'+priorVersion+'-empty-close-fund');
  await pairs(prior.map((f,i)=>()=>step(f,'thin-renewed-v'+priorVersion+'-'+renewed[i].kind+'-empty-close',named('abort_empty_epoch'))));
 }

 await fund(renewed,prefix+'-start-fund');
 const path=join(base,'public/renewed-plans-v'+renewal+'.json');
 if(!existsSync(path)){const s=await publicState(h.config),p={};for(const m of renewed){assert.equal(await h.at(s,m,m.vault,'queue_phase'),3n);p[m.kind]={...oldPlans[m.kind],epoch:Number(await h.at(s,m,m.vault,'queue_epoch'))+1,cutoff:s.checkpoint+(renewal===2?64:128)};}if(renewal===3){p.orderbook.members=p.orderbook.members.filter(m=>[h.actors.bob.id,h.actors.trader.id].includes(m.owner));p.nftmarket.members=p.nftmarket.members.filter(m=>[h.actors.trader.id,h.actors.charlie.id].includes(m.owner));}save(path,p);}
 const plans=read(path),fs={};for(const m of renewed){fs[m.kind]=await formal(h,m,'thin-renewed-v'+renewal+(renewal===2?'-reviewed':''),plans[m.kind],{performanceMetrics:true,bulkFallbackRemainingCheckpoints:64});services.push(fs[m.kind]);}
 await pairs(renewed.map(m=>()=>step(fs[m.kind],prefix+'-'+m.kind+'-start',named('start_epoch'))));
 const names=['bob','trader','charlie'];
 await pairs(names.map(name=>()=>h.user(name,prefix+'-'+name+'-consent',renewed.filter(m=>m.kind==='orderbook'?name!=='charlie':name!=='bob').map(m=>m.order('request_admission',[BigInt(plans[m.kind].epoch),BigInt(plans[m.kind].cutoff)])))));
 const cutoff=plans.orderbook.cutoff;await fund(renewed,prefix+'-admit-0-fund');while(renewal!==3&&(await publicState(h.config)).checkpoint<cutoff-64)await pause(10000);
 const scansPath=join(base,'public/renewed-pre-admission-scans-v'+renewal+'.json');if(!existsSync(scansPath)){const scans=[];for(const m of renewed){const scan=await fs[m.kind].adapter.scan();assert.equal(scan.action?.maintenanceOperation??scan.fundingRequest?.operation,'admit_entry');scans.push({kind:m.kind,scan,eligibleHintCount:2});}save(scansPath,{at:new Date().toISOString(),plannedHintsPerMarket:renewal===3?2:4,scans,scope:'renewed consent only after original empty epoch terminal; no global completeness claim'});}
 for(let round=0;round<2;round++){
  if(round)await fund(renewed,prefix+'-admit-'+round+'-fund');
  await pairs(renewed.map(m=>()=>step(fs[m.kind],prefix+'-'+m.kind+'-admit-'+round,named('admit_entry'),{cliOnce:m.kind==='orderbook'&&round===0})));
 }
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
