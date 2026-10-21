// Close the real partial intake with cancelled refunds. Never certify maximum
// capacity, normal economic throughput, or alter the original immutable plan.
import assert from'node:assert/strict';import{existsSync,readFileSync,readdirSync}from'node:fs';import{join}from'node:path';
import{cohort,formal}from'./candidateHarness.mjs';import{read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';
import{parseLosslessJson,FEE_ESCROW as F}from'../../amm/u124/client.mjs';import{sponsorCalls}from'../../batching/v2/client.mjs';import{cohortAssets,payoutClaims,canonicalHeldNfts}from'../../batching/admission/liveAssets.mjs';
const[base,original]=process.argv.slice(2),h=cohort(base,original),p=read(join(base,'public/maximum-retry-v1-plan.json')),names=['bob','trader','charlie','dave'],services=[];
assert.ok(existsSync(join(base,'public/maximum-partial-cancellations-complete-v1.json')));assert.ok(!existsSync(join(base,'public/maximum-complete-v1.json')));
const method=name=>t=>parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===name);
const independent=async jobs=>{const r=await Promise.allSettled(jobs.map(job=>job()));const failed=r.find(x=>x.status==='rejected');if(failed)throw failed.reason;};
async function fundExact(markets,label,purpose,amount){
 const marker=join(base,'public',label+'-ready.json');if(existsSync(marker))return;
 for(const f of services){await f.journal.reconcile(f.adapter.reconcile);assert.equal((await f.journal.unresolved()).length,0,'unknown transmission blocks additional sponsorship');}
 const input=join(base,'public',label+'.json'),adopted=[];let calls=[];
 if(!existsSync(input)){
  const s=await publicState(h.config),id=h.actors.sponsor.id;
  for(const m of markets){const off=n=>m.abi.contract.state.find(f=>f.name===n).offset;
   const [sent,claimed,pool,declared,nonce,used,why,baseFee]=await Promise.all([s.slot(id,0,3+2*m.vault),s.slot(m.vault,0,4+2*id),s.slot(id,m.id,off('sponsor_pool')),s.slot(id,m.id,off('sponsor_amount')),s.slot(id,m.id,off('sponsor_nonce')),s.slot(m.vault,m.id,off('used_sponsorship')+id),s.slot(id,m.id,off('sponsor_purpose')),s.slot(m.vault,m.id,off('settled_fee')+id)]);
   assert.ok(sent>=claimed);const pending=sent-claimed;assert.equal(claimed,baseFee,'native claim cursor differs from market accounting');
   if(pending!==0n){assert.equal(pending,amount,'pending grant differs; never top up blindly');assert.equal(declared,amount);assert.equal(pool,BigInt(m.vault));assert.equal(why,BigInt(purpose));assert.ok(nonce>used);adopted.push({market:m.id,vault:m.vault,amount,nonce});continue;}
   calls.push(...sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:nonce+1n,purpose:BigInt(purpose),amount}));
  }
 }
 if(calls.length||existsSync(input))await h.user('sponsor',label,calls);
 save(marker,{completedAt:new Date().toISOString(),purpose,amountPerSelectedMarket:amount,markets:markets.map(m=>m.id),adopted,ordinaryInput:existsSync(input)?input:null,scope:'explicit exact sponsorship or already matching unused grant; no additional unreviewed top-up'});
}
try{
 for(const m of h.markets)services.push(await formal(h,m,'maximum-partial-v2',{version:1,epoch:p.epochs[m.kind],cutoff:p.cutoff,members:p.members.map(owner=>({owner,nonce:m.kind==='amm'&&owner===h.actors.bob.id?'2':'1'}))},{benchmark:false}));
 await fundExact(h.markets,'maximum-partial-seal-fund',2,F);
 await independent(services.map((f,i)=>()=>f.step('maximum-partial-'+h.markets[i].kind+'-seal',method('seal_epoch'))));
 await fundExact(h.markets,'maximum-partial-commit-fund',1,2n*F);
 for(let i=0;i<services.length;i++){
  const f=services[i],m=h.markets[i];await f.step('maximum-partial-'+m.kind+'-commit-v2',t=>t.kind==='batch_commit');await f.step('maximum-partial-'+m.kind+'-refund-v2',t=>t.kind==='batch_settle');
  const s=await publicState(h.config),off=n=>m.abi.contract.state.find(f=>f.name===n).offset,count=await s.slot(m.vault,m.id,off('queue_count'));assert.ok(count>0n&&count<4n);assert.equal(await s.slot(m.vault,m.id,off('queue_phase')),3n);for(let j=0;j<Number(count);j++)assert.equal(await s.slot(m.vault,m.id,off('queue_outcome')+j),2n,'every accepted order must refund after confirmed cancellation');
 }
 await independent(names.map(name=>()=>h.user(name,'maximum-partial-'+name+'-release-enroll',h.markets.flatMap(m=>[m.order('release_unaccepted',[]),m.order('request_recovery',[BigInt(m.vault)])]))));
 // Preserve the actual 2F contract grant cap. Batch each round's Sponsor
 // UPS and run different vaults in parallel; never raise a grant to 8F.
 let recovered=false;
 for(let round=0;round<24;round++){
  const work=[],needsGas=[];
  for(let i=0;i<services.length;i++){
   const f=services[i],m=h.markets[i],label='maximum-partial-'+m.kind+'-recovery-'+round;
   if(existsSync(join(base,'public',label+'-formal-result.json')))continue;
   const donePrefix='maximum-partial-'+m.kind+'-recovery-done-';if(readdirSync(join(base,'public')).some(n=>n.startsWith(donePrefix)))continue;
   const scan=await f.adapter.scan();
   if(!scan.action){
    if(scan.reason==='recovery-gas-sponsorship-required'){
     assert.equal(scan.fundingRequest.requiredTotal,(2n*F).toString());
     const grants=readdirSync(join(base,'public')).filter(n=>/^maximum-partial-recovery-gas-round-[0-9]+-ready\.json$/.test(n)).map(n=>read(join(base,'public',n))).filter(r=>r.markets.includes(m.id));
     const current=join(base,'public','maximum-partial-recovery-gas-round-'+round+'-ready.json');assert.ok(existsSync(current)||grants.length<4,'four 2F grants exhausted; stop for inspection');needsGas.push(m);work.push({f,m,label,op:'fund_gas'});continue;
    }
    assert.ok(['admission-plan-not-next-epoch','epoch-complete'].includes(scan.reason),'unresolved recovery condition '+JSON.stringify(scan,(_k,v)=>typeof v==='bigint'?v.toString():v));
    save(join(base,'public',donePrefix+round+'.json'),{checkedAt:new Date().toISOString(),scope:'explicit enrolled QA sender hints exhausted; final cohort accounting still required'});continue;
   }
   const calls=parseLosslessJson(scan.action.submission).contract_calls,op=calls.find(c=>['fund_gas','recover_funding','recover_nft'].includes(c.method_name));assert.ok(op,'unexpected recovery operation');if(op.method_name!=='fund_gas')assert.ok(names.some(name=>BigInt(h.actors[name].id)===op.inputs[0]),'recovery outside QA cohort');work.push({f,m,label,op:op.method_name});
  }
  if(!work.length){recovered=true;break;}
  if(needsGas.length)await fundExact(needsGas,'maximum-partial-recovery-gas-round-'+round,2,2n*F);
  await independent(work.map(({f,label,op})=>()=>f.step(label,t=>t.kind==='batch_maintenance'&&method(op)(t))));
 }
 assert.ok(recovered,'recovery round bound exhausted');

 const before=parseLosslessJson(readFileSync(join(base,'public/maximum-assets-pre-orders.json'),'utf8'));
 await independent(names.map(name=>async()=>{const s=await publicState(h.config),id=h.actors[name].id,n=h.by.nftmarket,asset=n.driverConfig.nftId,sent=await s.slot(n.vault,asset,1182+35*id+32),claimed=await s.slot(id,asset,1182+35*n.vault+33);assert.ok(sent>=claimed&&sent-claimed<=1n);const held=before.nfts.find(row=>row.user===BigInt(id));await h.user(name,'maximum-partial-'+name+'-claim',await payoutClaims(s,{userId:id,markets:h.markets,tokenAbi:h.token,nftAbi:h.nft,nftSlot:sent>claimed?Number(held.slot):undefined}));}));
 const spec={users:[...Object.values(h.actors).map(a=>a.id),...h.markets.map(m=>m.vault),...h.markets.map(m=>read(join(original,'markets-v1',m.kind,'live-registration.json')).vaultId),1695936],assets:[2464,2466],nftId:2467},after=await cohortAssets(await publicState(h.config),spec),seen=new Set(),walletFees=new Map();let fees=0n;
 for(const label of readdirSync(join(base,'attempts')).filter(n=>n.startsWith('maximum-'))){const file=join(base,'attempts',label,'included.json');if(!existsSync(file))continue;const r=read(file);assert.ok(!seen.has(r.contentHash));seen.add(r.contentHash);const fee=BigInt(r.receipt.data.result.fees_collected);fees+=fee;const id=r.receipt.data.owner_user_id;walletFees.set(id,(walletFees.get(id)??0n)+fee);}
 for(const f of services)for(const r of (await f.journal.records()).filter(r=>r.status==='included'&&Number(r.result.checkpoint)>Number(before.checkpoint))){assert.ok(!seen.has(r.result.contentHash));seen.add(r.result.contentHash);fees+=BigInt(r.result.receipt.data.result.fees_collected);}
 for(const asset of spec.assets){assert.equal(before.totals[asset],1000n*10n**18n);assert.equal(after.totals[asset],before.totals[asset]);}
 assert.equal(after.nftTotal,2);assert.equal(after.nftPending.length,0);assert.deepEqual(canonicalHeldNfts(after.nfts),canonicalHeldNfts(before.nfts));
 for(const name of names){const id=h.actors[name].id;for(const asset of spec.assets)assert.equal(after.accounts[id].ft[asset],before.accounts[id].ft[asset]);assert.equal(before.accounts[id].native-after.accounts[id].native,walletFees.get(id)??0n,'original sender native principal restored minus exact own UPS fees');}
 assert.equal(before.nativeTotal-after.nativeTotal,fees,'all original maximum attempts through partial refunds: exact cohort native fee conservation');
 save(join(base,'public/maximum-partial-assets-after-v1.json'),after);save(join(base,'public/maximum-partial-cancel-refund-complete-v1.json'),{completedAt:new Date().toISOString(),scope:'failed maximum-intake recovery only, cancelled accepted refunds plus unaccepted sender recovery and ordinary claims',originalCutoff:p.cutoff,originalPlanChanged:false,maximumCapacityPassed:false,economicFills:0,allOriginalFtNftAndNativePrincipalReturned:true,fees,nativeBefore:before.nativeTotal,nativeAfter:after.nativeTotal,ordinaryClaimsIncluded:true,chainTps:null,productionReady:false});
}finally{for(const f of services)await f.close();}
