// Explicit owned-QA acceptance of the three remaining thin-batch policies.
// Existing deployments and source cases are read-only. A saved financial
// request is reconciled, never replaced automatically with a new signature.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {cohort,formal,pause} from './candidateHarness.mjs';
import {LiveMarket} from '../../batching/admission/liveMarket.mjs';
import {read,save,ordinary,confirmUps} from '../../batching/admission/liveSupport.mjs';
import {publicState} from '../publicState.mjs';
import {cohortAssets,payoutClaims,canonicalHeldNfts} from '../../batching/admission/liveAssets.mjs';
import {call,closeCall,encodeAmount,parseLosslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
import {sponsorCalls,curveLimitCalls,nftBuyCalls} from '../../batching/v2/client.mjs';
import {assertPreSessionFailure} from './ordinaryEvidence.mjs';
import {assertDurableRuntimeDirectory} from '../runtimeStorage.mjs';

const [parent,original,base]=process.argv.slice(2);
assert.ok(parent&&original&&base&&base!==parent&&base!==original);
assertDurableRuntimeDirectory(base);
const h0=cohort(parent,original),h={...h0,base},unit=10n**18n;
mkdirSync(join(base,'public'),{recursive:true});mkdirSync(join(base,'attempts'),{recursive:true});
if(existsSync(join(base,'public/COMPLETE.json'))){console.log('already complete; no transaction attempted');process.exit(0);}
const sdk='0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425';
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(digest('batching/dependencies/session-bound-sdk-20261020/manifest.json'),sdk);
const kinds=['orderbook','bondingcurve','nftmarket'];
const markets=kinds.map(kind=>{const m=h0.by[kind];return new LiveMarket({base,config:h.config,build:m.build,registration:m.registration,policy:m.policy,contracts:m.contracts,ordinaryBinary:h.ordinaryBinary,compactBinary:h.binary,env:h.env,actors:h.actors});});
const by=Object.fromEntries(markets.map(m=>[m.kind,m]));
const offsets=new Map(markets.map(m=>[m.id,new Map(m.abi.contract.state.map(f=>[f.name,f.offset]))]));
const at=(s,m,u,n,i=0)=>{assert.ok(offsets.get(m.id).has(n),'field '+n);return s.slot(u,m.id,offsets.get(m.id).get(n)+i);};
const spec={...h.assetSpec,users:[...h.assetSpec.users,2036928]};
assert.equal(new Set(spec.users).size,spec.users.length);
const sourceName=process.env.PSY_ACCEPTANCE_SOURCE_MANIFEST??'SOURCE.json';
assert.match(sourceName,/^SOURCE(?:-RESUME-v[1-9][0-9]*)?\.json$/);
const sourcePath=join(base,'public',sourceName);
if(sourceName!=='SOURCE.json'){
 assert.ok(existsSync(sourcePath),'explicit reviewed resume manifest required');
 const previous=read(join(base,'public/SOURCE.json')),r=read(sourcePath);
 assert.equal(r.previousSourceSha256,digest(join(base,'public/SOURCE.json')));
 assert.equal(digest(join(base,'public/source-before-resume/thinMarketsLive.mjs')),previous.files['executor/acceptance/thinMarketsLive.mjs'],'original case driver must remain preserved');
 for(const [p,sha]of Object.entries(previous.files))if(p!=='executor/acceptance/thinMarketsLive.mjs')assert.equal(digest(p),sha,'unchanged source dependency');
}
if(!existsSync(sourcePath)){
 const paths=['executor/acceptance/thinMarketsLive.mjs','executor/acceptance/candidateHarness.mjs','executor/admissionReader.mjs','executor/compactAdmissionAdapter.mjs','executor/config.mjs','executor/phaseMetrics.mjs','executor/publicWalletAdapter.mjs','batching/admission/liveSupport.mjs','batching/admission/liveAssets.mjs','batching/v2/client.mjs'];
 save(sourcePath,{version:1,files:Object.fromEntries(paths.map(p=>[p,digest(p)])),sdkManifestSha256:sdk,binarySha256:h.binarySha256,scope:'three existing owned QA markets, new case; source cases read-only; no deployment, update, issuance, pUSDT or wallet policy change; at most two concurrent vault proof operations, shared ordinary signers serialized'});
}
for(const [p,sha]of Object.entries(read(sourcePath).files))assert.equal(digest(p),sha,'case source changed');
const user=async(actor,label,calls)=>{
 const marker=join(base,'public/local-proof-recoveries',label+'.json');
 if(existsSync(marker)){
  // Read-only adoption of an explicitly reviewed, ALREADY INCLUDED repair.
  // This path never retries, signs or broadcasts a failed ordinary operation.
  const r=read(marker),old=join(base,'attempts',label),out=join(base,'attempts',r.replacementLabel);
  assert.equal(r.actor,actor);assert.equal(r.originalLabel,label);assert.match(r.replacementLabel,/^[a-z0-9-]+-reviewed-v[1-9][0-9]*$/);
  assert.deepEqual(readdirSync(old),['failure.json']);assert.equal(digest(h.ordinaryBinary),r.binarySha256);assert.equal(r.binarySha256,'65d16ecf29db6d7d8c0a8204df9219a52976b488efaafa0511a8100d68e2f22a');
  const failure=read(join(old,'failure.json'));if(failure.phase!=='prove-ordinary-calls')assertPreSessionFailure(join(old,'failure.json'));assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.automaticRetry,false);
  for(const [p,sha]of Object.entries(r.files))assert.equal(digest(join(base,p)),sha,'reviewed recovery artifact changed');
  const prior=parseLosslessJson(readFileSync(join(base,'public',label+'.json'),'utf8')),next=parseLosslessJson(readFileSync(join(base,'public',r.replacementLabel+'.json'),'utf8'));
  assert.deepEqual(next.calls,prior.calls);assert.deepEqual(next.contracts,prior.contracts);
  const included=parseLosslessJson(readFileSync(join(out,'included.json'),'utf8'));assert.equal(included.userId,BigInt(h.actors[actor].id));assert.equal(included.preflight.fullUpsVerified,true);assert.equal(included.status,'included');assert.ok(included.commonCheckpoint>=included.checkpoint);assert.equal(included.contentHash,included.receipt.data.content_hash);assert.equal(included.endUserLeafHash,included.preflight.core.state_transition.end_user_leaf_hash);
  return out;
 }
 const out=join(base,'attempts',label);
 if(existsSync(join(out,'preflight.json'))){if(!existsSync(join(out,'included.json')))await confirmUps(h.config,out);return out;}
 assert.ok(!existsSync(join(base,'public',label+'.json')),'partial input requires inspection before any replacement');
 return ordinary({base,config:h.config,binary:h.ordinaryBinary,secret:h.actors[actor].secret,name:label,calls,bindings:h.bindings,env:h.env});
};
const fund=async(ms,label,purpose=2)=>{
 // A single Sponsor UPS authorizes independent vaults. No other operation on
 // this signing account is allowed concurrently with it.
 const s=await publicState(h.config),calls=[];
 for(const m of ms)calls.push(...sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:await at(s,m,h.actors.sponsor.id,'sponsor_nonce')+1n,purpose:BigInt(purpose),amount:purpose===1?2n*F:F}));
 return user('sponsor',label,calls);
};
const pairs=async(jobs)=>{for(let i=0;i<jobs.length;i+=2){const r=await Promise.allSettled(jobs.slice(i,i+2).map(fn=>fn()));const failed=r.find(r=>r.status==='rejected');if(failed)throw failed.reason;}};
const named=name=>t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===name);
const baseline=join(base,'public/assets-before.json');
if(!existsSync(baseline)){
 const s=await publicState(h.config);
 for(const m of markets){assert.equal(await at(s,m,m.vault,'queue_phase'),3n);assert.equal(await at(s,m,m.vault,'batch_phase'),3n);}
 save(baseline,await cohortAssets(s,spec));
}
const before=parseLosslessJson(readFileSync(baseline,'utf8'));
const reviewPath=join(base,'public/order-review.json');
if(!existsSync(reviewPath)){
 const s=await publicState(h.config),orders={};
 for(const m of markets){orders[m.kind]={};for(const name of ['bob','trader','charlie','dave'])orders[m.kind][name]={kind:await at(s,m,h.actors[name].id,'kind'),nonce:await at(s,m,h.actors[name].id,'nonce')+1n,...(m.kind==='nftmarket'?{}:{side:await at(s,m,h.actors[name].id,'side')})};}
 const held=canonicalHeldNfts(before.nfts),nft=held.find(n=>n.user===BigInt(h.actors.trader.id));
 assert.ok(nft,'reviewed seller Trader must hold the exact NFT');assert.ok(!held.some(n=>n.user===BigInt(h.actors.charlie.id)&&n.slot===0n),'buyer slot 0 must be empty');
 const sold=await at(s,by.bondingcurve,by.bondingcurve.vault,'sold_lots'),cost=BigInt(by.bondingcurve.driverConfig.base)+sold*BigInt(by.bondingcurve.driverConfig.step);
 assert.ok(sold+1n<BigInt(by.bondingcurve.driverConfig.threshold));assert.ok(cost<2n*unit);
 save(reviewPath,{checkpoint:s.checkpoint,deadline:s.checkpoint+4096,orders,sold,curveCost:cost,curveQuoteLimit:2n*unit,nftSeller:'trader',nftBuyer:'charlie',nftSlot:nft.slot,nftIdentity:{tokenId:nft.tokenId,metadataHash:nft.metadataHash},nftPrice:5n*unit});
}
const review=parseLosslessJson(readFileSync(reviewPath,'utf8'));
const close=(m,name)=>{const r=review.orders[m.kind][name];return r.kind===0n?[]:m.kind==='nftmarket'?[m.order(r.kind===1n?'close_listing':'close_buy',[])]:[closeCall(BigInt(m.id),m.abi,r)];};
// Seller publication precedes the buyer's authenticated listing read. Book
// and Curve keep their existing pricing; no uniform clearing is introduced.
for(const name of ['bob','trader','charlie']){
 const calls=[],b=by.orderbook,c=by.bondingcurve,n=by.nftmarket;
 if(name!=='charlie')calls.push(...close(b,name),b.order('open_sell',[BigInt(b.vault),name==='bob'?0n:1n,encodeAmount(unit),encodeAmount(unit),review.deadline,review.orders.orderbook[name].nonce]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(b.vault),F]},call(name==='bob'?2464n:2466n,h.token,'transfer',[BigInt(b.vault),encodeAmount(unit)]));
 if(name==='bob')calls.push(...close(c,name),...curveLimitCalls({marketId:BigInt(c.id),marketAbi:c.abi,tokenAbi:h.token,config:c.driverConfig,vaultId:BigInt(c.vault),buy:true,lots:1n,quoteLimit:review.curveQuoteLimit,deadline:review.deadline,nonce:review.orders.bondingcurve[name].nonce}));
 if(name==='trader')calls.push(...close(n,name),call(2467n,h.nft,'acknowledge',[BigInt(n.vault)]),n.order('open_listing',[BigInt(n.vault),review.nftSlot,encodeAmount(review.nftPrice),review.deadline,review.orders.nftmarket[name].nonce]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(n.vault),F]},call(2467n,h.nft,'transfer',[review.nftSlot,BigInt(n.vault)]));
 if(name==='charlie')calls.push(...close(n,name),...nftBuyCalls({marketId:BigInt(n.id),marketAbi:n.abi,config:n.driverConfig,nftAbi:h.nft,tokenAbi:h.token,vaultId:BigInt(n.vault),seller:BigInt(h.actors.trader.id),listingNonce:review.orders.nftmarket.trader.nonce,price:review.nftPrice,deadline:review.deadline,nonce:review.orders.nftmarket.charlie.nonce}));
 assert.ok(calls.length<=16);await user(name,'thin-'+name+'-orders',calls);
}
const eligible={orderbook:['bob','trader'],bondingcurve:['bob'],nftmarket:['trader','charlie']};
// Cold ordinary order/sponsor construction precedes the signed cutoff.
await fund(markets,'thin-start-fund');
const planPath=join(base,'public/plans.json');
if(!existsSync(planPath)){
 const s=await publicState(h.config),plans={};
 for(const m of markets)plans[m.kind]={version:1,epoch:Number(await at(s,m,m.vault,'queue_epoch'))+1,cutoff:s.checkpoint+128,members:['bob','trader','charlie','dave'].map(name=>({owner:h.actors[name].id,nonce:String(review.orders[m.kind][name].nonce)})).sort((a,b)=>a.owner-b.owner)};
 save(planPath,plans);
}
const plans=read(planPath),services=[];
try{
 for(const m of markets)services.push(await formal(h,m,'thin',plans[m.kind],{performanceMetrics:true,bulkFallbackRemainingCheckpoints:64}));
 await pairs(services.map((f,i)=>()=>f.step('thin-'+markets[i].kind+'-start',named('start_epoch'))));
 for(const name of ['bob','trader','charlie']){
  const calls=markets.filter(m=>eligible[m.kind].includes(name)).map(m=>m.order('request_admission',[BigInt(plans[m.kind].epoch),BigInt(plans[m.kind].cutoff)]));
  await user(name,'thin-'+name+'-consent',calls);
 }
 const cutoff=plans.orderbook.cutoff;
 while((await publicState(h.config)).checkpoint<cutoff-64)await pause(10000);
 const scanFile=join(base,'public/pre-admission-scans.json');
 if(!existsSync(scanFile)){
  const scans=[];for(let i=0;i<markets.length;i++){const scan=await services[i].adapter.scan();assert.equal(scan.action?.maintenanceOperation??scan.fundingRequest?.operation,'admit_entry');scans.push({kind:markets[i].kind,eligibleCount:eligible[markets[i].kind].length,scan});}
  save(scanFile,{checkedAt:new Date().toISOString(),plannedHintsPerMarket:4,scope:'explicit hint list only; no global inclusion/fairness proof',scans});
 }
 for(let round=0;round<2;round++){
  const selected=markets.map((m,i)=>({m,f:services[i]})).filter(({m})=>eligible[m.kind].length>round);
  await fund(selected.map(({m})=>m),'thin-admit-'+round+'-fund');
  await pairs(selected.map(({m,f})=>()=>f.step('thin-'+m.kind+'-admit-'+round,named('admit_entry'),{cliOnce:m.kind==='orderbook'&&round===0})));
 }
 await fund(markets,'thin-seal-fund');while((await publicState(h.config)).checkpoint<=cutoff)await pause(10000);
 await pairs(services.map((f,i)=>()=>f.step('thin-'+markets[i].kind+'-seal',named('seal_epoch'))));
 await fund(markets,'thin-commit-fund',1);
 await pairs(services.map((f,i)=>async()=>{await f.step('thin-'+markets[i].kind+'-commit',t=>t.kind==='batch_commit');await f.step('thin-'+markets[i].kind+'-settle',t=>t.kind==='batch_settle');}));
 const snapshots={};
 for(const m of markets){const file=join(base,'public','thin-'+m.kind+'-terminal.state.json');const s=existsSync(file)?parseLosslessJson(readFileSync(file,'utf8')):await m.snapshot('thin-'+m.kind+'-terminal');assert.equal(s.fields.queue_count[0],BigInt(eligible[m.kind].length));assert.equal(s.fields.queue_phase[0],3n);assert.deepEqual(s.fields.queue_outcome.filter((_,i)=>s.fields.queue_owner[i]!==0n),eligible[m.kind].map(()=>1n));snapshots[m.kind]=s;}
 assert.equal(snapshots.bondingcurve.fields.sold_lots[0],review.sold+1n);
 for(const name of ['bob','trader','charlie']){
  const label='thin-'+name+'-claim',out=join(base,'attempts',label);
  const calls=existsSync(join(out,'preflight.json'))?[]:await payoutClaims(await publicState(h.config),{userId:h.actors[name].id,markets:markets.filter(m=>eligible[m.kind].includes(name)),tokenAbi:h.token,nftAbi:h.nft,...(name==='charlie'?{nftSlot:0}:{})});
  await user(name,label,calls);
 }
 for(const f of services){await f.journal.reconcile(f.adapter.reconcile);assert.equal((await f.journal.unresolved()).length,0);}
 const after=await cohortAssets(await publicState(h.config),spec),included=[],seen=new Set();
 const add=(r,source)=>{assert.ok(!seen.has(r.contentHash),'duplicate fee identity');seen.add(r.contentHash);included.push({source,contentHash:r.contentHash,checkpoint:r.checkpoint,fee:BigInt(r.receipt.data.result.fees_collected)});};
 for(const label of readdirSync(join(base,'attempts'))){const p=join(base,'attempts',label,'included.json');if(existsSync(p))add(read(p),'attempts/'+label+'/included.json');}
 for(const f of services)for(const r of(await f.journal.records()).filter(r=>r.status==='included'))add(r.result,'formal journal/'+r.taskId);
 const fees=included.reduce((n,r)=>n+r.fee,0n);for(const asset of spec.assets){assert.equal(before.totals[asset],1000n*unit);assert.equal(after.totals[asset],before.totals[asset]);}assert.equal(before.nativeTotal-after.nativeTotal,fees);
 const expected={bob:[0n,unit-review.curveCost],trader:[unit+review.nftPrice,-unit],charlie:[-review.nftPrice,0n],dave:[0n,0n]};
 for(const [name,[a,b]]of Object.entries(expected)){const id=h.actors[name].id;assert.equal(after.accounts[id].ft[2464]-before.accounts[id].ft[2464],a,'individual FT-A '+name);assert.equal(after.accounts[id].ft[2466]-before.accounts[id].ft[2466],b,'individual FT-B '+name);}
 const nftBefore=canonicalHeldNfts(before.nfts),nftAfter=canonicalHeldNfts(after.nfts);assert.equal(after.nftPending.length,0);assert.equal(nftAfter.length,2);
 const moved=nftAfter.find(n=>n.user===BigInt(h.actors.charlie.id));assert.ok(moved);assert.deepEqual(moved.tokenId,review.nftIdentity.tokenId);assert.deepEqual(moved.metadataHash,review.nftIdentity.metadataHash);assert.deepEqual(nftAfter.find(n=>n.user===BigInt(h.actors.dave.id)),nftBefore.find(n=>n.user===BigInt(h.actors.dave.id)));
 save(join(base,'public/assets-after.json'),after);
 save(join(base,'public/COMPLETE.json'),{completedAt:new Date().toISOString(),markets:markets.map(m=>({kind:m.kind,marketId:m.id,vaultId:m.vault,plannedHints:4,acceptedMembers:eligible[m.kind].length,fills:1})),marketId:null,vaultId:null,plannedHints:12,acceptedMembers:5,fills:3,productionCliAdmission:true,ordinaryClaimIncluded:true,fee:fees,included,nativeBefore:before.nativeTotal,nativeAfter:after.nativeTotal,expectedIndividualFtDeltas:expected,curveChange:review.curveQuoteLimit-review.curveCost,nftIdentity:review.nftIdentity,pricingUnchanged:true,batchCapUnchanged:4,existingPusdtUsed:false,newDeployment:false,globalFairness:false,chainTps:null,productionReady:false});
 console.log('three-market thin economic acceptance complete');
}finally{for(const f of services)await f.close();}
