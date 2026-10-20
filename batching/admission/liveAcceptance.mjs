// Acceptance fixture for the isolated cohort created on 2026-10-20.
// NOT a daemon: explicit first/refund rounds, no automatic mutation retries.
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LiveMarket} from './liveMarket.mjs';
import {read,save,ordinary,confirmUps} from './liveSupport.mjs';
import {publicState} from '../../executor/publicState.mjs';
import {receiptReader} from '../../executor/chainReceipts.mjs';
import {call,encodeAmount,FEE_ESCROW,parseLosslessJson} from '../../amm/u124/client.mjs';
import {sponsorCalls,curveLimitCalls,nftBuyCalls} from '../v2/client.mjs';
import {queueMaintenance} from './reader.mjs';
import {cohortAssets,payoutClaims} from './liveAssets.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const settleGroup=async jobs=>{const results=await Promise.allSettled(jobs),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;return results.map(r=>r.value);};
export async function runAcceptance({base,ordinaryBinary,compactBinary,round,resumeFtOrders=false,resumeQueue=false,resumeSettlement=false,resumeClaims=false}){
 assert.ok(['first','refund'].includes(round));
 assert.ok([resumeFtOrders,resumeQueue,resumeSettlement,resumeClaims].filter(Boolean).length<=1,'one recovery stage only');
 const resuming=resumeFtOrders||resumeQueue||resumeSettlement||resumeClaims,startedAt=resuming?read(join(base,'public/live-'+round+'-plan.json')).startedAt:new Date().toISOString(),startedTick=performance.now();
 const config=join(base,'public/staging-bundled-profile-rpc-v1.json'),env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'};
 const actors={bob:{id:860352,secret:join(base,'.secrets/bob-bundled-profile-v1.json')},trader:{id:876736,secret:join(base,'.secrets/trader.json')},sponsor:{id:1384640,secret:join(base,'.secrets/sponsor-bundled-profile-v1.json')}};
 assert.ok(existsSync(join(base,'public/all-vaults-activated-v1.json')),'new isolated vault activation required');
 assert.equal(read(join(base,'public/trader-registration-v1.json')).ids[0],actors.trader.id);
 const kinds=['amm','orderbook','bondingcurve','nftmarket'],markets=kinds.map(kind=>{const build=join(base,'markets-v1',kind),registration=read(join(build,'live-registration.json'));return new LiveMarket({base,config,build,policy:read(join(build,'bound/policy.json')),registration,contracts:registration.contracts,ordinaryBinary,compactBinary,env,actors});});
 const by=Object.fromEntries(markets.map(m=>[m.kind,m])),bindings=new Map(markets.flatMap(m=>m.contracts).map(b=>[b.contract.contractId,b]));
 const token=read(join(base,'assets-bob-v1/token-a/compilation_artifact.json')).abi,nft=read(join(base,'assets-bob-v1/nft/compilation_artifact.json')).abi;
 const ordinaryAll=(actor,name,calls)=>ordinary({base,config,binary:ordinaryBinary,secret:actors[actor].secret,name,calls,bindings,env});
 const prefix='live-'+round,epoch=round==='first'?1n:2n,nonce=epoch;
 const cohort={users:[actors.bob.id,actors.trader.id,actors.sponsor.id,...markets.map(m=>m.vault)],assets:[2464,2466],nftId:by.nftmarket.driverConfig.nftId};
 if(resumeFtOrders){assert.equal(round,'first');for(const actor of ['bob','trader'])assert.equal(read(join(base,'attempts','live-first-'+actor+'-ft-orders/included.json')).status,'included');for(const m of markets){const s=await m.snapshot(prefix+'-'+m.kind+'-before-recovery-resume');assert.equal(s.fields.queue_phase[0],0n);assert.equal(s.fields.batch_phase[0],0n);}}
 const before=resuming?parseLosslessJson(readFileSync(join(base,'public',prefix+'-assets-before.json'),'utf8')):await cohortAssets(await publicState(config),cohort);if(!resuming)save(join(base,'public',prefix+'-assets-before.json'),before);for(const total of Object.values(before.totals))assert.equal(total,1000n*10n**18n);assert.equal(before.nfts.length,2);
 const initial=await publicState(config),cutoff=resumeQueue||resumeSettlement||resumeClaims?BigInt(read(join(base,'public',round==='first'?'live-first-recovery-plan-v1.json':prefix+'-plan.json')).cutoff):BigInt(initial.checkpoint)+120n,deadline=cutoff+512n;
 const recoveryTag=resumeClaims?'claims':resumeSettlement?'settlement':'queue';let planName=prefix+(resumeClaims?'-claims-recovery-plan-v1.json':resumeSettlement?'-settlement-recovery-plan-v1.json':resumeQueue?'-queue-recovery-plan-v1.json':resumeFtOrders?'-recovery-plan-v1.json':'-plan.json');if(resumeQueue||resumeSettlement||resumeClaims)for(let version=2;existsSync(join(base,'public',planName));version++)planName=prefix+'-'+recoveryTag+'-recovery-plan-v'+version+'.json';
 save(join(base,'public',planName),{startedAt,resumedAt:resuming?new Date().toISOString():null,resumeFtOrders,resumeQueue,resumeSettlement,resumeClaims,round,epoch,cutoff,deadline,sourceCheckpoint:initial.checkpoint,scope:'two explicitly consenting members per new vault; deterministic, not the market universe; admitted scope and cutoff never replaced'});
 const t=(asset,v,amount)=>call(BigInt(asset),token,'transfer',[BigInt(v),encodeAmount(amount)]),fee=v=>({contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(v),FEE_ESCROW]});
 const consent=m=>m.order('request_admission',[epoch,cutoff]);
 const FTorders=actor=>{
  const a=by.amm,b=by.orderbook,c=by.bondingcurve,isBob=actor==='bob',v=BigInt(a.vault),rows=[];
  if(round==='refund')rows.push(a.order('close_add',[]),b.order(isBob?'close_0':'close_1',[]),c.order('close_buy',[]));
  if(round==='first'){const amount=(isBob?100n:20n)*10n**18n;rows.push(a.order('open_add',[v,encodeAmount(amount),encodeAmount(amount),encodeAmount(1n),deadline,nonce]),fee(v),t(2464,v,amount),t(2466,v,amount),consent(a));}
  else {const side=isBob?0n:1n,amount=(isBob?1n:2n)*10n**18n;rows.push(a.order('open_swap',[v,side,encodeAmount(amount),encodeAmount(1n),deadline,nonce]),fee(v),t(side===0n?2464:2466,v,amount),consent(a));}
  const bv=BigInt(b.vault),amount=(isBob?6n:7n)*10n**18n,minimum=(isBob?7n:6n)*10n**18n;
  rows.push(b.order('open_sell',[bv,isBob?0n:1n,encodeAmount(amount),encodeAmount(minimum),deadline,nonce]),fee(bv),t(isBob?2464:2466,bv,round==='refund'&&!isBob?10n**18n:amount),consent(b));
  rows.push(...curveLimitCalls({buy:round==='first'||isBob,marketId:BigInt(c.id),marketAbi:c.abi,config:c.driverConfig,tokenAbi:token,vaultId:BigInt(c.vault),lots:round==='first'?(isBob?5n:10n):1n,quoteLimit:round==='refund'&&!isBob?1n:15n*10n**18n,deadline,nonce}),consent(c));
  assert.ok(rows.length<=16);return rows;
 };
 if(!resuming)await settleGroup(['bob','trader'].map(actor=>ordinaryAll(actor,prefix+'-'+actor+'-ft-orders',FTorders(actor))));
 const n=by.nftmarket,nv=BigInt(n.vault),price=5n*10n**18n;
 if(!resumeQueue&&!resumeSettlement&&!resumeClaims){const reconsent=resumeFtOrders?[by.amm,by.orderbook,by.bondingcurve].map(consent):[];
 await ordinaryAll('bob',prefix+'-bob-listing',[...reconsent,...(round==='refund'?[n.order('close_listing',[])]:[]),n.order('open_listing',[nv,round==='first'?0n:1n,encodeAmount(price),deadline,nonce]),fee(nv),call(BigInt(n.driverConfig.nftId),nft,'transfer',[round==='first'?0n:1n,nv]),consent(n)]);
 await ordinaryAll('trader',prefix+'-trader-purchase',[...reconsent,...(round==='refund'?[n.order('close_buy',[])]:[]),...nftBuyCalls({marketId:BigInt(n.id),marketAbi:n.abi,config:n.driverConfig,nftAbi:nft,tokenAbi:token,vaultId:nv,seller:BigInt(actors.bob.id),listingNonce:nonce,price,deadline,nonce}),consent(n)]);
 }
 async function sponsorAll(label,purpose){const s=await publicState(config),calls=[];for(const m of markets){const offset=m.abi.contract.state.find(f=>f.name==='sponsor_nonce').offset,nonce=await s.slot(actors.sponsor.id,m.id,offset)+1n;calls.push(...sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce,purpose:BigInt(purpose),amount:purpose===1?2n*FEE_ESCROW:FEE_ESCROW}));}await ordinaryAll('sponsor',prefix+'-'+label+'-fund',calls);}
 async function maintenanceAll(label,name,a,b=0n){await sponsorAll(label,2);await settleGroup(markets.map(async m=>{const s=await publicState(config);await m.compact(prefix+'-'+m.kind+'-'+label,queueMaintenance(m.policy,{name,payer:BigInt(actors.sponsor.id),a,b}),s.checkpoint+96);}));}
 if(!resumeQueue&&!resumeSettlement&&!resumeClaims){await maintenanceAll('start','start_epoch',epoch,cutoff);
 if(round==='first'){
  // Two independently proving processes race different valid admissions for
  // one anchor. At most one may be included; no losing mutation is retried.
  await sponsorAll('admit-race',2);
  const raceMarket=async m=>{
   const s=await publicState(config),attempts=await Promise.allSettled(['bob','trader'].map(actor=>m.compact(prefix+'-'+m.kind+'-race-'+actor,queueMaintenance(m.policy,{name:'admit_entry',payer:BigInt(actors.sponsor.id),a:BigInt(actors[actor].id),b:nonce}),s.checkpoint+96,{confirm:false})));
   const candidates=['bob','trader'].map((actor,i)=>{const path=join(base,'attempts',prefix+'-'+m.kind+'-race-'+actor),file=join(path,'preflight.json');return {actor,path,result:attempts[i].status,preflight:existsSync(file)?read(file):null};});
   const finder=await receiptReader(config);let winner;
   for(let poll=0;poll<120&&!winner;poll++){for(const x of candidates.filter(x=>x.preflight)){const core=x.preflight.core,r=await finder({userId:m.vault,endUserLeafHash:core.state_transition.end_user_leaf_hash});if(r.status==='included'){winner={actor:x.actor,path:x.path,receipt:r,core};break;}}if(!winner)await pause(10000);}
   assert.ok(winner,'race unresolved; no further mutation allowed');
   const winnerCandidate=candidates.find(x=>x.actor===winner.actor);save(join(winner.path,'included.json'),{...winner.receipt,preflight:winnerCandidate.preflight});
   const state=await m.snapshot(prefix+'-'+m.kind+'-race-winner');assert.equal(state.fields.queue_count[0],1n);assert.equal(state.fields.queue_owner[0],BigInt(actors[winner.actor].id));
   for(const x of candidates.filter(x=>x.preflight)){assert.equal(x.preflight.core.new_user_leaf.nonce,winner.core.new_user_leaf.nonce);assert.equal(x.preflight.core.state_transition.start_user_leaf_hash,winner.core.state_transition.start_user_leaf_hash);}
   save(join(base,'public',prefix+'-'+m.kind+'-race-result.json'),{winner,contenders:candidates.map(x=>({actor:x.actor,path:x.path,result:x.result,preflight:x.preflight,broadcastIntentSaved:existsSync(join(x.path,'intent.json'))})),fullProofCandidates:candidates.filter(x=>x.preflight).length,broadcastIntents:candidates.filter(x=>existsSync(join(x.path,'intent.json'))).length,assertedSingleAdmission:true,loserRetryAllowed:false});
   m.missingRaceActor=winner.actor==='bob'?'trader':'bob';console.log(new Date().toISOString(),m.kind,'race winner',winner.actor);
  };
  // Two market races at a time: four proof workers, separate vault anchors.
  for(let i=0;i<markets.length;i+=2)await settleGroup(markets.slice(i,i+2).map(raceMarket));
  await sponsorAll('admit-rest',2);await settleGroup(markets.map(async m=>{const s=await publicState(config);await m.compact(prefix+'-'+m.kind+'-admit-rest',queueMaintenance(m.policy,{name:'admit_entry',payer:BigInt(actors.sponsor.id),a:BigInt(actors[m.missingRaceActor].id),b:nonce}),s.checkpoint+96);}));
 }else for(const actor of ['bob','trader'])await maintenanceAll('admit-'+actor,'admit_entry',BigInt(actors[actor].id),nonce);
 }else if(resumeQueue){
  assert.equal(round,'first');assert.equal(read(join(base,'attempts/live-first-admit-rest-fund/included.json')).status,'included','prepared funding must be confirmed');
  await settleGroup(markets.map(async m=>{const name=prefix+'-'+m.kind+'-admit-rest',attempt=join(base,'attempts',name);if(existsSync(join(attempt,'preflight.json'))){if(!existsSync(join(attempt,'included.json')))await confirmUps(config,attempt);return;}assert.ok(!existsSync(join(base,'public',name+'.calls.json')),'partial intent requires manual reconciliation');const prior=read(join(base,'public',prefix+'-'+m.kind+'-race-result.json')),s=await publicState(config),get=n=>s.slot(m.vault,m.id,m.abi.contract.state.find(f=>f.name===n).offset);assert.equal(await get('queue_count'),1n);assert.equal(await get('queue_phase'),1n);assert.equal(await get('queue_cutoff'),cutoff);m.missingRaceActor=prior.winner.actor==='bob'?'trader':'bob';await m.compact(name,queueMaintenance(m.policy,{name:'admit_entry',payer:BigInt(actors.sponsor.id),a:BigInt(actors[m.missingRaceActor].id),b:nonce}),s.checkpoint+96);}));
 }
 if(!resumeClaims){
 if(round==='refund'&&!resumeSettlement)await settleGroup([ordinaryAll('bob',prefix+'-bob-cancel',markets.map(m=>m.order('request_cancel',[]))),ordinaryAll('trader',prefix+'-trader-cancel',[by.orderbook.order('request_cancel',[]),by.nftmarket.order('request_cancel',[])])]);
 // Source cutoff is not asserted to be actual inclusion time. Sealing the
 // authenticated queue is the immutable accepted-set boundary.
 for(let poll=0;;poll++){const s=await publicState(config);if(BigInt(s.checkpoint)>cutoff)break;assert.ok(poll<240,'cutoff wait exhausted');await pause(15000);}
 if(resumeSettlement){await settleGroup(markets.map(async m=>{const attempt=join(base,'attempts',prefix+'-'+m.kind+(m.kind==='nftmarket'?'-seal-recovery-v1':'-seal'));if(!existsSync(join(attempt,'included.json')))await confirmUps(config,attempt);const s=await publicState(config),get=n=>s.slot(m.vault,m.id,m.abi.contract.state.find(f=>f.name===n).offset);assert.equal(await get('queue_phase'),2n);assert.equal(await get('queue_count'),2n);assert.equal(await get('queue_cutoff'),cutoff);}));}else await maintenanceAll('seal','seal_epoch',epoch);
 await sponsorAll('commit',1);
 if(round==='first')for(const m of markets)m.options=(()=>{const original=m.options.bind(m);return ()=>({...original(),batchExpiryCheckpoints:32});})();
 // Intentionally discard the parent Executor's acknowledgement. The child
 // retains raw transport evidence. Recovery uses only durable proof identity
 // plus historical state/receipt, with zero additional broadcast attempts.
 await settleGroup(markets.map(async m=>{const name=prefix+'-'+m.kind+'-commit',scan=await m.scan(name);assert.equal(scan.action.kind,'batch_commit');const out=await m.compact(name,parseLosslessJson(scan.action.submission),Number(scan.action.validUntilCheckpoint),{confirm:false});save(join(out,'parent-ack-loss.json'),{fault:'parent discards child acknowledgement before recording inclusion',transportAckRetainedForReview:true,retryAllowed:false});}));
 await settleGroup(markets.map(m=>confirmUps(config,join(base,'attempts',prefix+'-'+m.kind+'-commit'))));
 if(round==='first'){
  const committed=await by.amm.snapshot(prefix+'-amm-before-late-cancel');
  await ordinaryAll('trader',prefix+'-late-cancel-amm',[by.amm.order('request_cancel',[])]);
  const unchanged=await by.amm.snapshot(prefix+'-amm-after-late-cancel'),cancelState=await publicState(config),cancelOffset=by.amm.abi.contract.state.find(f=>f.name==='cancelled').offset;
  assert.equal(await cancelState.slot(actors.trader.id,by.amm.id,cancelOffset),1n);assert.deepEqual(unchanged.fields.batch_root,committed.fields.batch_root);assert.deepEqual(unchanged.fields.queue_root,committed.fields.queue_root);assert.equal(unchanged.fields.frozen_cancelled[1],0n,'late cancellation cannot rewrite committed snapshot');
  save(join(base,'public',prefix+'-late-cancel-semantics.json'),{cancelledLiveOrder:true,frozenCancellation:unchanged.fields.frozen_cancelled[1],batchRootUnchanged:true,queueRootUnchanged:true,rule:'later cancellation is read on timeout/refreeze; it does not rewrite the existing commitment'});
  await sponsorAll('refreeze',1);
  for(let poll=0;;poll++){const s=await publicState(config);let expired=true;for(const m of markets){const f=m.abi.contract.state.find(f=>f.name==='batch_expiry');if(BigInt(s.checkpoint)<=await s.slot(m.vault,m.id,f.offset))expired=false;}if(expired)break;assert.ok(poll<240,'expiry wait exhausted');await pause(15000);}
  await settleGroup(markets.map(m=>m.action(prefix+'-'+m.kind+'-expire')));
  // No second queue or replacement member set is created after timeout.
  for(const m of markets){const original=m.options.bind(m);m.options=()=>({...original(),batchExpiryCheckpoints:96});}
  await settleGroup(markets.map(m=>m.action(prefix+'-'+m.kind+'-refreeze')));
  const refrozen=await by.amm.snapshot(prefix+'-amm-refrozen-cancel');assert.equal(refrozen.fields.frozen_cancelled[1],1n);assert.deepEqual(refrozen.fields.queue_root,committed.fields.queue_root,'timeout preserves accepted set');
 }
 await settleGroup(markets.map(m=>m.action(prefix+'-'+m.kind+'-settle')));
 }else{await settleGroup(markets.map(async m=>{const attempt=join(base,'attempts',prefix+'-'+m.kind+(round==='first'&&m.kind==='bondingcurve'?'-settle-recovery-v1':'-settle'));if(!existsSync(join(attempt,'included.json')))await confirmUps(config,attempt);}));}
 for(const m of markets){const file=join(base,'public',prefix+'-'+m.kind+'-settled.state.json'),result=existsSync(file)?parseLosslessJson(readFileSync(file,'utf8')):await m.snapshot(prefix+'-'+m.kind+'-settled');assert.equal(result.fields.batch_phase[0],3n);assert.equal(result.fields.queue_phase[0],3n);assert.equal(result.fields.queue_count[0],2n);assert.deepEqual(result.fields.queue_outcome.slice(0,2),round==='first'?(m.kind==='amm'?[1n,2n]:[1n,1n]):['amm','bondingcurve'].includes(m.kind)?[2n,1n]:[2n,2n]);}
 // Claim only authenticated positive outbox deltas and the one NFT delivery.
 await settleGroup(['bob','trader'].map(async actor=>{const name=prefix+'-'+actor+'-claim';for(const prior of [name,name+'-recovery-v1']){const attempt=join(base,'attempts',prior);if(existsSync(join(attempt,'preflight.json'))){if(!existsSync(join(attempt,'included.json')))await confirmUps(config,attempt);return;}}const calls=await payoutClaims(await publicState(config),{userId:actors[actor].id,markets,tokenAbi:token,nftAbi:nft,nftSlot:actor===(round==='first'?'trader':'bob')?(round==='first'?0:1):undefined});return ordinaryAll(actor,name,calls);}));
 const after=await cohortAssets(await publicState(config),cohort);save(join(base,'public',prefix+'-assets-after.json'),after);for(const asset of cohort.assets)assert.equal(after.totals[asset],before.totals[asset],'FT supply conservation');assert.equal(after.nfts.length,2);assert.equal(after.nfts.find(n=>n.user===actors.trader.id)?.slot,0);assert.equal(after.nfts.find(n=>n.user===actors.bob.id)?.slot,1);
 for(const p of after.pending.filter(p=>markets.some(m=>m.vault===p.sender)&&[actors.bob.id,actors.trader.id].includes(p.recipient))){assert.equal(p.native,0n);for(const amount of Object.values(p.ft))assert.equal(amount,0n);}
 let fees=0n;const accepted=new Set();for(const name of readdirSync(join(base,'attempts')).filter(n=>n.startsWith(prefix+'-'))){const file=join(base,'attempts',name,'included.json');if(!existsSync(file))continue;const p=read(file).preflight;if(!p?.core)continue;const key=p.core.new_user_leaf.user_id+':'+p.core.new_user_leaf.nonce;if(accepted.has(key))continue;accepted.add(key);fees+=BigInt(p.core.stats.guta_fees_collected)+BigInt(p.core.stats.da_fees_collected);}
 assert.equal(before.nativeTotal-after.nativeTotal,fees,'native escrow plus all included UPS fees conservation');save(join(base,'public',prefix+'-conservation.json'),{acceptedUps:accepted.size,fees,nativeBefore:before.nativeTotal,nativeAfter:after.nativeTotal,ftSupplyConserved:true,nftSupplyAndUniqueOwnershipVerified:true,allUserPayoutsClaimed:true});
 save(join(base,'public',prefix+'-complete.json'),{startedAt,completedAt:new Date().toISOString(),wallMilliseconds:Date.now()-Date.parse(startedAt),activeProcessWallMilliseconds:Math.round(performance.now()-startedTick),resumedAfterUncertainAck:round==='first'&&existsSync(join(base,'public/real-ack-loss-recovery-v1.json')),currentProcessResumeMode:resumeClaims?'claims':resumeSettlement?'settlement':resumeQueue?'queue':resumeFtOrders?'orders':null,round,epoch,cutoff,markets:markets.map(m=>({kind:m.kind,id:m.id,vault:m.vault})),terminalOrderDispositions:8,economicTrades:round==='first'?4:2,liquidityAdds:round==='first'?1:0,refundedOrders:round==='first'?1:6,ordinaryClaimsIncluded:true,scope:'wall interval includes cold clients, queue/timeout waits, inclusion, recovery downtime, ordinary recipient claims and final reconciliation; not chain capacity or a controlled speed comparison',productionReady:false});
 console.log(new Date().toISOString(),round,'acceptance round complete');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [base,ordinaryBinary,compactBinary,round,resume]=process.argv.slice(2);assert.ok(base&&ordinaryBinary&&compactBinary&&round,'BASE ORDINARY_BINARY COMPACT_BINARY first|refund [resume-ft|resume-queue|resume-settlement|resume-claims]');assert.ok(resume===undefined||['resume-ft','resume-queue','resume-settlement','resume-claims'].includes(resume));await runAcceptance({base,ordinaryBinary,compactBinary,round,resumeFtOrders:resume==='resume-ft',resumeQueue:resume==='resume-queue',resumeSettlement:resume==='resume-settlement',resumeClaims:resume==='resume-claims'});
}
