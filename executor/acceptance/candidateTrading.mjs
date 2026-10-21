// Explicit LP + four-member acceptance. Every market mutation uses the formal
// factory/journal route; ordinary user/sponsor wallets authorize their own UPSs.
import assert from'node:assert/strict';import{existsSync,readFileSync,readdirSync}from'node:fs';import{join}from'node:path';
import{cohort,formal,pause}from'./candidateHarness.mjs';import{read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';import{call,encodeAmount,FEE_ESCROW as F,parseLosslessJson}from'../../amm/u124/client.mjs';import{sponsorCalls,nftBuyCalls,curveLimitCalls}from'../../batching/v2/client.mjs';import{cohortAssets,payoutClaims}from'../../batching/admission/liveAssets.mjs';
const[base,original,stage]=process.argv.slice(2);assert.ok(['liquidity','maximum'].includes(stage));const h=cohort(base,original),unit=10n**18n;
const parallelPairs=async items=>{for(let i=0;i<items.length;i+=2){const r=await Promise.allSettled(items.slice(i,i+2).map(fn=>fn()));const failure=r.find(x=>x.status==='rejected');if(failure)throw failure.reason;}};
const services=[];
async function fund(ms,label,purpose){const s=await publicState(h.config);const calls=[];for(const m of ms){const f=m.abi.contract.state.find(f=>f.name==='sponsor_nonce');calls.push(...sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:await s.slot(h.actors.sponsor.id,m.id,f.offset)+1n,purpose:BigInt(purpose),amount:purpose===1?2n*F:F}));}await h.user('sponsor',label,calls);}
async function waitCutoff(cutoff){for(let i=0;i<240;i++){if((await publicState(h.config)).checkpoint>cutoff)return;await pause(10000);}throw Error('cutoff unresolved');}
const taskNamed=(name)=>t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===name);
try{
if(stage==='liquidity'){
 const m=h.by.amm,pf=join(base,'public/liquidity-plan-v1.json');if(!existsSync(pf)){const s=await publicState(h.config);save(pf,{version:1,epoch:1,cutoff:s.checkpoint+64,members:[{owner:h.actors.bob.id,nonce:'1'}]});}const p=read(pf),v=BigInt(m.vault),deadline=BigInt(p.cutoff)+1024n;
 await h.user('bob','liquidity-bob-order',[m.order('open_add',[v,encodeAmount(20n*unit),encodeAmount(20n*unit),encodeAmount(20n*unit-1000n),deadline,1n]),{contract_id:0n,method_name:'simple_transfer',inputs:[v,F]},...['assetA','assetB'].map(k=>call(BigInt(m.driverConfig[k]),h.token,'transfer',[v,encodeAmount(20n*unit)]))]);
 const f=await formal(h,m,'liquidity',p);services.push(f);
 await fund([m],'liquidity-start-fund',2);await f.step('liquidity-start',taskNamed('start_epoch'));
 await h.user('bob','liquidity-bob-consent',[m.order('request_admission',[1n,BigInt(p.cutoff)])]);
 await fund([m],'liquidity-admit-fund',2);await f.step('liquidity-admit',taskNamed('admit_entry'));
 await fund([m],'liquidity-seal-fund',2);await waitCutoff(p.cutoff);await f.step('liquidity-seal',taskNamed('seal_epoch'));
 await fund([m],'liquidity-commit-fund',1);await f.step('liquidity-commit',t=>t.kind==='batch_commit');await f.step('liquidity-settle',t=>t.kind==='batch_settle');
 const snapshot=await m.snapshot('liquidity-final');assert.equal(snapshot.fields.batch_phase[0],3n);assert.equal(snapshot.fields.reserve_a[0]+(1n<<62n)*snapshot.fields.reserve_a[1],20n*unit);assert.equal(snapshot.fields.reserve_b[0]+(1n<<62n)*snapshot.fields.reserve_b[1],20n*unit);
 save(join(base,'public/liquidity-complete-v1.json'),{completedAt:new Date().toISOString(),formalExecutor:true,market:m.id,vault:m.vault});
}else{
 assert.ok(existsSync(join(base,'public/liquidity-complete-v1.json')));const names=['bob','trader','charlie','dave'],pf=join(base,'public/maximum-plan-v1.json');
 // Fund and open before selecting the public consent window, avoiding a slow
 // ordinary-wallet cold start silently consuming the admission window.
 const cohortSpec={users:[...Object.values(h.actors).map(a=>a.id),...h.markets.map(m=>m.vault),...['amm','orderbook','bondingcurve','nftmarket'].map(k=>read(join(original,'markets-v1',k,'live-registration.json')).vaultId),1695936],assets:[2464,2466],nftId:2467};assert.equal(new Set(cohortSpec.users).size,cohortSpec.users.length);
 const preOrdersFile=join(base,'public/maximum-assets-pre-orders.json');if(!existsSync(preOrdersFile))save(preOrdersFile,await cohortAssets(await publicState(h.config),cohortSpec));
 const deadline=BigInt((await publicState(h.config)).checkpoint)+2048n;
 await parallelPairs(names.map(name=>async()=>{
  const u=h.actors[name],a=h.by.amm,b=h.by.orderbook,c=h.by.bondingcurve,n=h.by.nftmarket,ask=['bob','charlie'].includes(name),seller=['trader','charlie'].includes(name);const calls=[];
  if(name==='bob')calls.push(a.order('close_add',[]));
  calls.push(a.order('open_swap',[BigInt(a.vault),0n,encodeAmount(unit),encodeAmount(1n),deadline,name==='bob'?2n:1n]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(a.vault),F]},call(2464n,h.token,'transfer',[BigInt(a.vault),encodeAmount(unit)]));
  calls.push(b.order('open_sell',[BigInt(b.vault),ask?0n:1n,encodeAmount(unit),encodeAmount(unit),deadline,1n]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(b.vault),F]},call(ask?2464n:2466n,h.token,'transfer',[BigInt(b.vault),encodeAmount(unit)]));
  calls.push(...curveLimitCalls({marketId:BigInt(c.id),marketAbi:c.abi,tokenAbi:h.token,config:c.driverConfig,vaultId:BigInt(c.vault),buy:true,lots:1n,quoteLimit:2n*unit,deadline,nonce:1n}));
  if(seller)calls.push(call(2467n,h.nft,'acknowledge',[BigInt(n.vault)]),n.order('open_listing',[BigInt(n.vault),name==='trader'?1n:0n,encodeAmount(5n*unit),deadline,1n]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(n.vault),F]},call(2467n,h.nft,'transfer',[name==='trader'?1n:0n,BigInt(n.vault)]));
  else calls.push(...nftBuyCalls({marketId:BigInt(n.id),marketAbi:n.abi,config:n.driverConfig,nftAbi:h.nft,tokenAbi:h.token,vaultId:BigInt(n.vault),seller:BigInt(h.actors[name==='bob'?'trader':'charlie'].id),listingNonce:1n,price:5n*unit,deadline,nonce:1n}));
  assert.ok(calls.length<=16);await h.user(name,'maximum-'+name+'-orders',calls);
 }));
 if(!existsSync(pf)){const s=await publicState(h.config);save(pf,{createdAt:new Date().toISOString(),sourceCheckpoint:s.checkpoint,cutoff:s.checkpoint+128,epochs:{amm:2,orderbook:1,bondingcurve:1,nftmarket:1},members:names.map(n=>h.actors[n].id).sort((a,b)=>a-b)});}const p=read(pf);

 // Orders already funded; the baseline includes every pending incoming delta.
 const beforeFile=join(base,'public/maximum-assets-before.json');if(!existsSync(beforeFile))save(beforeFile,await cohortAssets(await publicState(h.config),cohortSpec));
 for(const m of h.markets){const plan={version:1,epoch:p.epochs[m.kind],cutoff:p.cutoff,members:p.members.map(owner=>({owner,nonce:m.kind==='amm'&&owner===h.actors.bob.id?'2':'1'}))};const f=await formal(h,m,'maximum',plan,{benchmark:true,...(m.kind==='nftmarket'?{contendOnMaintenance:'admit_entry'}:{})});services.push(f);}
 const execute=async(label,expected)=>parallelPairs(services.map((f,i)=>()=>f.step('maximum-'+h.markets[i].kind+'-'+label,expected)));
 await fund(h.markets,'maximum-start-fund',2);await execute('start',taskNamed('start_epoch'));
 await parallelPairs(names.map(name=>()=>h.user(name,'maximum-'+name+'-consent',h.markets.map(m=>m.order('request_admission',[BigInt(p.epochs[m.kind]),BigInt(p.cutoff)])))));
 for(let i=0;i<4;i++){await fund(h.markets,'maximum-admit-'+i+'-fund',2);await execute('admit-'+i,taskNamed('admit_entry'));}
 await fund(h.markets,'maximum-seal-fund',2);await waitCutoff(p.cutoff);await execute('seal',taskNamed('seal_epoch'));
 await fund(h.markets,'maximum-commit-fund',1);
 // No other proof process runs during a paired benchmark. Each market has the
 // identical complete batch for warm and cold, only one proof is broadcast.
 for(let i=0;i<services.length;i++){await services[i].step('maximum-'+h.markets[i].kind+'-commit',t=>t.kind==='batch_commit');await services[i].step('maximum-'+h.markets[i].kind+'-settle',t=>t.kind==='batch_settle');}
 for(const m of h.markets){const state=await m.snapshot('maximum-'+m.kind+'-settled');assert.equal(state.fields.queue_count[0],4n);assert.equal(state.fields.queue_phase[0],3n);assert.deepEqual(state.fields.queue_outcome,[1n,1n,1n,1n]);}
 await parallelPairs(names.map(name=>async()=>{const calls=await payoutClaims(await publicState(h.config),{userId:h.actors[name].id,markets:h.markets,tokenAbi:h.token,nftAbi:h.nft,nftSlot:['bob','dave'].includes(name)?0:undefined});await h.user(name,'maximum-'+name+'-claim',calls);}));
 const after=await cohortAssets(await publicState(h.config),cohortSpec),before=parseLosslessJson(readFileSync(beforeFile,'utf8'));for(const total of Object.values(after.totals))assert.equal(total,1000n*unit);assert.equal(after.nfts.length,2);assert.deepEqual(new Set(after.nfts.map(x=>x.user)),new Set([h.actors.bob.id,h.actors.dave.id]));
 // Baseline is after orders: only consent, sponsor, formal and claims are in
 // this conservation interval. Order UPS fees are reported separately.
 let fees=0n;for(const name of readdirSync(join(base,'attempts')).filter(n=>n.startsWith('maximum-')&&!n.endsWith('-orders'))){const f=join(base,'attempts',name,'included.json');if(existsSync(f))fees+=BigInt(read(f).receipt.data.result.fees_collected);}
 for(const f of services){const records=await f.journal.records();for(const r of records.filter(r=>r.status==='included')){const task=records.find(x=>x.taskId===r.taskId&&x.status==='planned')?.task;if(task){const cp=Number(r.result.checkpoint);if(cp>Number(before.checkpoint))fees+=BigInt(r.result.receipt.data.result.fees_collected);}}}
 const initial=parseLosslessJson(readFileSync(preOrdersFile,'utf8')),expectedOut=new Map(),expectedPrice=new Map();let reserveIn=20n*unit,reserveOut=20n*unit;
 for(const [i,owner]of p.members.entries()){const amount=unit*9970n*reserveOut/(reserveIn*10000n+unit*9970n);expectedOut.set(owner,amount);expectedPrice.set(owner,unit+BigInt(i)*10n**16n);reserveIn+=unit;reserveOut-=amount;}
 const perUser=[];
 for(const name of names){const id=h.actors[name].id,ask=['bob','charlie'].includes(name),seller=['trader','charlie'].includes(name),deltaA=-unit+(ask?-unit:unit)+unit+(seller?5n*unit:-5n*unit),deltaB=expectedOut.get(id)+(ask?unit:-unit)-expectedPrice.get(id);assert.equal(after.accounts[id].ft[2464]-initial.accounts[id].ft[2464],deltaA,'individual FT-A '+name);assert.equal(after.accounts[id].ft[2466]-initial.accounts[id].ft[2466],deltaB,'individual FT-B '+name);
  let userFees=0n;for(const suffix of ['orders','consent','claim']){const r=read(join(base,'attempts','maximum-'+name+'-'+suffix,'included.json'));assert.equal(r.receipt.data.owner_user_id,id);userFees+=BigInt(r.receipt.data.result.fees_collected);}
  const nativeRefunds=(ask?0n:F)+(seller?0n:F);assert.equal(after.accounts[id].native-initial.accounts[id].native,-4n*F+nativeRefunds-userFees,'individual native '+name);perUser.push({name,userId:id,deltaA,deltaB,swapOutput:expectedOut.get(id),curvePrice:expectedPrice.get(id),nativeRefunds,userFees});
 }
 for(const [buyer,seller]of [['bob','trader'],['dave','charlie']]){const src=initial.nfts.find(n=>n.user===h.actors[seller].id),dst=after.nfts.find(n=>n.user===h.actors[buyer].id);assert.ok(src&&dst);assert.deepEqual(dst.tokenId,src.tokenId);assert.deepEqual(dst.metadataHash,src.metadataHash);}
 save(join(base,'public/maximum-individual-conservation.json'),{scope:'independent pricing formula and each user FT/native delta, plus exact NFT identity',perUser,finalAmmReserveA:reserveIn,finalAmmReserveB:reserveOut,curveSoldLots:4});
 assert.equal(before.nativeTotal-after.nativeTotal,fees,'maximum interval exact native fees');save(join(base,'public/maximum-assets-after.json'),after);save(join(base,'public/maximum-complete-v1.json'),{completedAt:new Date().toISOString(),formalExecutor:true,membersPerMarket:4,economicFills:{amm:4,orderbook:2,bondingcurve:4,nftmarket:2},ordinaryClaimsIncluded:true,qaFtSupplyConserved:true,qaNftUniqueOwnership:true,nativeBefore:before.nativeTotal,nativeAfter:after.nativeTotal,fees,chainTps:null,productionReady:false});
}
}finally{for(const f of services)await f.close();}
