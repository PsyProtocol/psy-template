// Actual trades through the formal Executor adapters and journals. Financial
// requests are never substituted on timeout; reruns only adopt exact receipts.
import assert from 'node:assert/strict';import{readFileSync,existsSync}from'node:fs';import{join}from'node:path';
import {threeMarketCase} from './threeMarketCase.mjs';import{formal,pause}from'./candidateHarness.mjs';
import{residentScope}from'../residentScope.mjs';import{withGuardCalibration}from'./guardCalibration.mjs';
import{read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';
import{call,encodeAmount,FEE_ESCROW as F,parseLosslessJson}from'../../amm/u124/client.mjs';
import{activationFunding,curveLimitCalls,nftBuyCalls}from'../../batching/v2/client.mjs';
import{cohortAssets,payoutClaims,canonicalHeldNfts}from'../../batching/admission/liveAssets.mjs';import{sha256}from'../requestBinding.mjs';
import{seedRecovery}from'./seedRecovery.mjs';
const[base,resume]=process.argv.slice(2);assert.ok(base);assert.ok(resume===undefined||['seed-without-ack-v1','state-reads-v2'].includes(resume));assert.ok(!existsSync(join(base,'public/COMPLETE.json')),'closed case: no transaction');
const h=await threeMarketCase(base),U=h.actors.bob.id,B=h.actors.buyer.id,T=h.actors.sponsor.id,unit=10n**18n;
h.activationPayers={nftmarket:U};h.residentScope=residentScope();const services=[];
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),by=h.by,nftId=read(join(base,'public/NFT-DEPLOYMENT.json')).contractId;
const originalSource=join(base,'public/RUN-SOURCE.json');if(resume){for(const[p,d]of Object.entries(read(originalSource).files)){assert.equal(sha256(readFileSync(join(base,'public/run-source-v1',p))),d,'preserved original source');if(p!=='executor/acceptance/runThreeMarkets.mjs')assert.equal(sha256(readFileSync(p)),d,'unrelated dependency changed');}}
const source=join(base,'public',resume==='state-reads-v2'?'RUN-SOURCE-READS-v2.json':resume?'RUN-SOURCE-RESUME-v1.json':'RUN-SOURCE.json');if(!existsSync(source)){const files=['executor/acceptance/runThreeMarkets.mjs','executor/acceptance/seedRecovery.mjs','executor/acceptance/threeMarketCase.mjs','executor/acceptance/candidateHarness.mjs','executor/acceptance/guardCalibration.mjs','executor/compactAdmissionAdapter.mjs','executor/publicWalletAdapter.mjs','executor/residentScope.mjs','executor/journal.mjs',...(resume==='state-reads-v2'?['executor/publicState.mjs','executor/readSingleFlight.mjs']:[])];save(source,{files:Object.fromEntries(files.map(p=>[p,sha256(readFileSync(p))])),previousSourceSha256:resume?sha256(readFileSync(originalSource)):null,...(resume==='state-reads-v2'?{previousResumeSourceSha256:sha256(readFileSync(join(base,'public/RUN-SOURCE-RESUME-v1.json')))}:{}),binarySha256:h.binarySha256,scope:'new owned QA markets; 3 actual trades and ordinary claims; same SDK and existing pricing, no Node edits'});}for(const[p,d]of Object.entries(read(source).files))assert.equal(sha256(readFileSync(p)),d,'financial worker source changed');
const pairs=async jobs=>{for(let i=0;i<jobs.length;i+=2){const results=await Promise.allSettled(jobs.slice(i,i+2).map(fn=>fn()));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}};
const named=name=>t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===name);
const get=async(m,tag,plan,benchmark=false,benchmarkKinds)=>{const f=await formal(h,m,tag,plan,{performanceMetrics:true,benchmark,...(benchmarkKinds?{benchmarkKinds}:{})});services.push(f);return f;};
try{
 await h.user('bob','mint-and-distribute-v1',[
  call(BigInt(nftId),h.nft,'set_collection_metadata',[24n,[24n,10n,24n,1n]]),
  call(BigInt(nftId),h.nft,'set_max_supply',[1n]),
  call(BigInt(nftId),h.nft,'mint',[0n,1n,[24n,10n,24n,2n]]),
  call(BigInt(nftId),h.nft,'renounce_mint_authority',[]),
  ...[2483,2484].map(id=>call(BigInt(id),h.token,'transfer',[BigInt(B),encodeAmount(10n*unit)])),
  {contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(T),75_000_000_000n]},
  {contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(B),20_000_000_000n]}
 ]);
 // These two ordinary signers are independent; shared signers never overlap.
 await pairs([
  ()=>h.user('buyer','buyer-asset-claim-v1',[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(U)]},...[2483,2484].map(id=>call(BigInt(id),h.token,'claim',[BigInt(U)]))]),
  ()=>h.user('sponsor','sponsor-native-claim-v1',[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(U)]}])
 ]);
 const seeds=h.markets.flatMap(m=>activationFunding({market:m.kind,config:m.driverConfig,tokenAbi:h.token,vaultId:BigInt(m.vault)}));
 if(resume)await seedRecovery(h,seeds);else await h.user('bob','activation-seeds-v1',seeds);
 const boot={version:1,epoch:1,cutoff:1,members:[]},setup=[];
 for(const m of h.markets)setup.push(await get(m,'three-setup',boot));
 await pairs(setup.map((f,i)=>()=>f.step('three-'+h.markets[i].kind+'-activate',named(h.markets[i].kind==='nftmarket'?'activate':'activate_batch_vault'))));
 await setup[1].close();
 const c=by.bondingcurve;await h.user('bob','curve-inventory-v1',[{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(c.vault),F]},call(2483n,h.token,'transfer',[BigInt(c.vault),encodeAmount(20n*unit)])]);
 const inventory=await get(c,'three-inventory',boot,true,['batch_maintenance']);
 await inventory.step('three-bondingcurve-initialize',named('initialize'));await inventory.close();
 await h.user('bob','activation-seed-claim-v1',async()=>payoutClaims(await publicState(h.config),{userId:U,markets:h.markets,tokenAbi:h.token,nftAbi:h.nft}));
 for(const f of setup)await f.close();
 const spec={users:[U,B,T,...h.markets.map(m=>m.vault),...h.pin.legacyAssetVaults],assets:[2483,2484],nftId};
 const beforeFile=join(base,'public/assets-before.json');if(!existsSync(beforeFile))save(beforeFile,await cohortAssets(await publicState(h.config),spec));const before=exact(beforeFile);
 const reviewFile=join(base,'public/ORDER-REVIEW.json');if(!existsSync(reviewFile)){const s=await publicState(h.config);for(const m of h.markets){assert.equal(await h.at(s,m,U,'kind'),0n);assert.equal(await h.at(s,m,B,'kind'),0n);}save(reviewFile,{checkpoint:s.checkpoint,deadline:s.checkpoint+4096,nonce:1,nftSlot:0,nftPrice:5n*unit,curveLimit:2n*unit,bookInput:unit,scope:'two exact Book members, one Curve buyer, one NFT seller/buyer pair; no pricing change'});}const review=exact(reviewFile),book=by.orderbook,nft=by.nftmarket;
 await h.user('bob','owner-orders-v1',[
  book.order('open_sell',[BigInt(book.vault),0n,encodeAmount(unit),encodeAmount(unit),review.deadline,1n]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(book.vault),F]},call(2483n,h.token,'transfer',[BigInt(book.vault),encodeAmount(unit)]),
  ...curveLimitCalls({marketId:BigInt(c.id),marketAbi:c.abi,config:c.driverConfig,tokenAbi:h.token,vaultId:BigInt(c.vault),buy:true,lots:1n,quoteLimit:review.curveLimit,deadline:review.deadline,nonce:1n}),
  nft.order('open_listing',[BigInt(nft.vault),0n,encodeAmount(review.nftPrice),review.deadline,1n]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(nft.vault),F]},call(BigInt(nftId),h.nft,'transfer',[0n,BigInt(nft.vault)])
 ]);
 await h.user('buyer','buyer-orders-v1',[
  book.order('open_sell',[BigInt(book.vault),1n,encodeAmount(unit),encodeAmount(unit),review.deadline,1n]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(book.vault),F]},call(2484n,h.token,'transfer',[BigInt(book.vault),encodeAmount(unit)]),
  ...nftBuyCalls({marketId:BigInt(nft.id),marketAbi:nft.abi,config:nft.driverConfig,tokenAbi:h.token,nftAbi:h.nft,vaultId:BigInt(nft.vault),seller:BigInt(U),listingNonce:1n,price:review.nftPrice,deadline:review.deadline,nonce:1n})
 ]);
 await h.fund(h.markets,'start-fund-v1');
 const planFile=join(base,'public/PLANS.json');if(!existsSync(planFile)){const s=await publicState(h.config);save(planFile,Object.fromEntries(h.markets.map(m=>[m.kind,{version:1,epoch:1,cutoff:s.checkpoint+128,members:(m.kind==='bondingcurve'?[U]:[U,B]).sort((a,b)=>a-b).map(owner=>({owner,nonce:'1'}))}])));}const plans=read(planFile),fs=[];
 for(const m of h.markets)fs.push(withGuardCalibration(await get(m,'three-trade',plans[m.kind],false),h,m.kind));
 await pairs(fs.map((f,i)=>()=>f.step('three-'+h.markets[i].kind+'-start',named('start_epoch'))));
 // Gas authorization can be proved alongside different users' consents.
 // The prior grants are already consumed; each signer has one active UPS.
 await pairs([
  ()=>h.user('bob','owner-consent-v1',h.markets.map(m=>m.order('request_admission',[1n,BigInt(plans[m.kind].cutoff)]))),
  ()=>h.fund(h.markets,'admit-0-fund-v1')
 ]);
 // Curve needs only the already confirmed owner consent and sponsor grant.
 // Its independent vault can proceed while the buyer consents to Book/NFT.
 await pairs([
  ()=>h.user('buyer','buyer-consent-v1',[book,nft].map(m=>m.order('request_admission',[1n,BigInt(plans[m.kind].cutoff)]))),
  ()=>fs[1].step('three-bondingcurve-admit-0',named('admit_entry'))
 ]);
 await pairs([0,2].map(i=>()=>fs[i].step('three-'+h.markets[i].kind+'-admit-0',named('admit_entry'))));
 await h.fund([book,nft],'admit-1-fund-v1');
 await pairs([0,2].map(i=>()=>fs[i].step('three-'+h.markets[i].kind+'-admit-1',named('admit_entry'))));
 await h.fund(h.markets,'seal-fund-v1');while((await publicState(h.config)).checkpoint<=plans.orderbook.cutoff)await pause(10000);
 await pairs(fs.map((f,i)=>()=>f.step('three-'+h.markets[i].kind+'-seal',named('seal_epoch'))));
 await h.fund(h.markets,'commit-fund-v1',1);
 await pairs(fs.map((f,i)=>async()=>{await f.step('three-'+h.markets[i].kind+'-commit',t=>t.kind==='batch_commit');await f.step('three-'+h.markets[i].kind+'-settle',t=>t.kind==='batch_settle');}));
 for(const m of h.markets){const s=await m.snapshot('three-'+m.kind+'-terminal'),count=m.kind==='bondingcurve'?1:2;assert.equal(s.fields.queue_count[0],BigInt(count));assert.equal(s.fields.queue_phase[0],3n);assert.deepEqual(s.fields.queue_outcome.slice(0,count),Array(count).fill(1n));}
 await pairs([
  ()=>h.user('bob','owner-payout-claim-v1',async()=>payoutClaims(await publicState(h.config),{userId:U,markets:h.markets,tokenAbi:h.token,nftAbi:h.nft})),
  ()=>h.user('buyer','buyer-payout-claim-v1',async()=>payoutClaims(await publicState(h.config),{userId:B,markets:[book,nft],tokenAbi:h.token,nftAbi:h.nft,nftSlot:0}))
 ]);
 for(const f of fs){await f.journal.reconcile(f.adapter.reconcile);assert.equal((await f.journal.unresolved()).length,0);}
 const after=await cohortAssets(await publicState(h.config),spec);for(const id of spec.assets)assert.equal(before.totals[id],after.totals[id]);assert.equal(after.nftPending.length,0);const held=canonicalHeldNfts(after.nfts),oldHeld=canonicalHeldNfts(before.nfts);assert.equal(held.length,1);assert.equal(held[0].user,BigInt(B));assert.deepEqual(held[0].tokenId,oldHeld[0].tokenId);assert.deepEqual(held[0].metadataHash,oldHeld[0].metadataHash);
 assert.equal(after.accounts[U].ft[2483]-before.accounts[U].ft[2483],5n*unit);assert.equal(after.accounts[U].ft[2484],before.accounts[U].ft[2484]);assert.equal(after.accounts[B].ft[2483]-before.accounts[B].ft[2483],-4n*unit);assert.equal(after.accounts[B].ft[2484]-before.accounts[B].ft[2484],-unit);
 save(join(base,'public/assets-after.json'),after);save(join(base,'public/COMPLETE.json'),{at:new Date().toISOString(),fills:3,ordinaryClaimsIncluded:true,markets:h.markets.map(m=>({kind:m.kind,marketId:m.id,vaultId:m.vault,acceptedMembers:m.kind==='bondingcurve'?1:2,fills:1})),assets:spec,ftConserved:true,nftUniqueBuyer:B,fullProofAccountingPending:true,scope:'actual three thin batches through formal adapters, deterministic order; complete fee/proof audit is separate; no TPS or production claim'});
 console.log('three real fills and ordinary claims complete');
}finally{for(const f of services)await f.close();await h.residentScope.close();}
