// Isolated replacement deployment for the admitted buyer/missing-seller fix.
// Explicit stages; persisted signed intents are reconciled, never regenerated.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,copyFileSync,constants,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LiveMarket,registerMarket,reconcileRegisteredMarket} from './liveMarket.mjs';
import {read,save,run,confirmDeploy,confirmUps,ordinary} from './liveSupport.mjs';
import {publicState} from '../../executor/publicState.mjs';
import {call,encodeAmount,parseLosslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
import {nftBuyCalls} from '../v2/client.mjs';
import {queueMaintenance} from './reader.mjs';
import {cohortAssets,payoutClaims} from './liveAssets.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function runNftRecovery({base,original,ordinaryBinary,compactBinary,stage,proofOut}){
 assert.ok(['deploy','test'].includes(stage));
 const env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'},config=join(base,'public/staging-bundled-profile-rpc-v1.json'),build=join(base,'markets-v1/nftmarket');
 const actors={bob:{id:860352,secret:join(original,'.secrets/bob-bundled-profile-v1.json')},trader:{id:876736,secret:join(original,'.secrets/trader.json')},sponsor:{id:1384640,secret:join(original,'.secrets/sponsor-bundled-profile-v1.json')}};
 if(stage==='deploy'){
  for(const unrelated of [false,true]){const p=read(join(proofOut,`missing-seller-unrelated-${unrelated}.json`));assert.equal(p.fullUpsVerified,true);assert.equal(p.measurements.filter(m=>m.fullUpsVerified&&m.publicEndpointsBound&&m.exportedDeltasVerified).length,2);}
  mkdirSync(base,{recursive:true});for(const d of ['public','attempts','markets-v1'])mkdirSync(join(base,d),{recursive:true});if(!existsSync(config))copyFileSync(join(original,'public/staging-bundled-profile-rpc-v1.json'),config,constants.COPYFILE_EXCL);
  assert.ok(existsSync(join(build,'BUILD.json')),'copy the exact frozen replacement build before deployment');
  const out=join(base,'attempts/deploy-nftmarket-v2');
  if(!existsSync(join(out,'receipt.json'))){assert.ok(!existsSync(out),'unresolved deployment intent requires manual reconciliation');const timing=await run(ordinaryBinary,['deploy',config,actors.bob.secret,join(build,'compiled/compilation_artifact.json'),out],join(base,'deploy-nftmarket-v2.log'),env);save(join(out,'timing.json'),timing);}
  // Contract leaves identify the deployer by public-key hash, not user ID.
  // Pin to Bob's independently confirmed original deployment identity.
  const expectedDeployer=read(join(original,'attempts/deploy-nftmarket-v1/included.json')).leaf.deployer;
  assert.match(expectedDeployer,/^[0-9a-f]{64}$/);
  const deployment=existsSync(join(out,'included.json'))?read(join(out,'included.json')):await confirmDeploy(config,out,expectedDeployer);
  const dependencies=read(join(original,'markets-v1/nftmarket/live-registration.json')).contracts.filter(b=>b.contract.contractId!==2469);
  if(!existsSync(join(build,'live-registration.json'))){const registered=join(base,'attempts/register-nftmarket-vault-v1/receipt.json');if(existsSync(registered))await reconcileRegisteredMarket({base,config,build,deployment,dependencies});else await registerMarket({base,config,build,deployment,dependencies,compactBinary,env});}
  console.log(new Date().toISOString(),'replacement NFT deployment and key registration confirmed');return;
 }
 assert.equal(read(join(original,'public/live-first-complete.json')).round,'first');assert.equal(read(join(original,'public/live-refund-complete.json')).round,'refund','avoid concurrent ordinary actor mutations');
 const registration=read(join(build,'live-registration.json')),m=new LiveMarket({base,config,build,policy:read(join(build,'bound/policy.json')),registration,contracts:registration.contracts,ordinaryBinary,compactBinary,env,actors});
 const token=read(join(build,'token-a.json')).abi,nft=read(join(build,'nft.json')).abi,v=BigInt(m.vault),price=5n*10n**18n;
 // Only reconcile already persisted proof identities. A recovery-v1 attempt
 // must be issued explicitly after classifying the original; never auto-send.
 const known=async name=>{for(const candidate of [name,name+'-recovery-v1']){const attempt=join(base,'attempts',candidate);if(existsSync(join(attempt,'preflight.json'))){if(!existsSync(join(attempt,'included.json')))await confirmUps(config,attempt);return true;}}return false;};
 const onceOrdinary=async(actor,name,calls)=>{if(await known(name))return;assert.ok(!existsSync(join(base,'public',name+'.json')),'partial ordinary intent requires manual reconciliation');await ordinary({base,config,binary:ordinaryBinary,secret:actors[actor].secret,name,calls,bindings:m.bindings,env});};
 const onceCompact=async(name,request,until)=>{if(await known(name))return;assert.ok(!existsSync(join(base,'public',name+'.calls.json')),'partial compact intent requires manual reconciliation');await m.compact(name,request,until);};
 const action=async name=>{if(await known(name))return;const file=join(base,'public',name+'.scan.json'),scan=existsSync(file)?read(file):await m.scan(name);assert.ok(scan.action,'no candidate action '+scan.reason);await onceCompact(name,parseLosslessJson(scan.action.submission),Number(scan.action.validUntilCheckpoint));};
 const sponsor=async(name,purpose)=>{if(await known(name+'-fund'))return;await m.sponsor(name+'-fund',purpose);};
 const maintenance=async(name,method,a,b=0n)=>{if(await known(name))return;await sponsor(name,2);const s=await publicState(config);await onceCompact(name,queueMaintenance(m.policy,{name:method,payer:BigInt(actors.sponsor.id),a,b}),s.checkpoint+96);};
 await onceOrdinary('bob','nft-v2-activate-seed',[{contract_id:0n,method_name:'simple_transfer',inputs:[v,F]},call(2464n,token,'transfer',[v,encodeAmount(1n)])]);
 await action('nft-v2-activate');
 // Separate, explicit gas transfer between owned QA wallets, before the
 // measured baseline. Preserve the plan so a restart cannot top up twice.
 const gasPlan=join(base,'public/nft-v2-trader-gas-plan.json');if(!existsSync(gasPlan)){const s=await publicState(config),balance=await s.slot(actors.trader.id,0,0);save(gasPlan,{checkpoint:s.checkpoint,balance,topUp:balance<15_000_000_000n,amount:25_000_000_000n});}
 if(read(gasPlan).topUp){await onceOrdinary('sponsor','nft-v2-trader-gas-send',[{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(actors.trader.id),25_000_000_000n]}]);await onceOrdinary('trader','nft-v2-trader-gas-claim',[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(actors.sponsor.id)]}]);}
 const cohort={users:[actors.bob.id,actors.trader.id,actors.sponsor.id,...['amm','orderbook','bondingcurve','nftmarket'].map(k=>read(join(original,'markets-v1',k,'live-registration.json')).vaultId),m.vault],assets:[2464,2466],nftId:2467};
 const baseline=join(base,'public/nft-v2-assets-before.json');if(!existsSync(baseline))save(baseline,await cohortAssets(await publicState(config),cohort));
 for(const epoch of [1n,2n]){
  const prefix='nft-v2-epoch-'+epoch;if(existsSync(join(base,'public',prefix+'-complete.json')))continue;
  const pf=join(base,'public',prefix+'-plan.json');let plan;if(existsSync(pf))plan=read(pf);else{const s=await publicState(config);plan={startedAt:new Date().toISOString(),sourceCheckpoint:s.checkpoint,cutoff:s.checkpoint+(epoch===1n?64:96),deadline:s.checkpoint+1024,epoch:Number(epoch),acceptedOwners:epoch===1n?[actors.trader.id]:[actors.bob.id,actors.trader.id],purpose:epoch===1n?'missing seller refund only':'same held listing, valid unique sale'};save(pf,plan);}
  const cutoff=BigInt(plan.cutoff),deadline=BigInt(plan.deadline),consent=m.order('request_admission',[epoch,cutoff]);
  if(epoch===1n)await onceOrdinary('bob',prefix+'-listing',[m.order('open_listing',[v,1n,encodeAmount(price),deadline,1n]),{contract_id:0n,method_name:'simple_transfer',inputs:[v,F]},call(2467n,nft,'transfer',[1n,v])]);
  await onceOrdinary('trader',prefix+'-purchase',[...(epoch===2n?[m.order('close_buy',[])]:[]),...nftBuyCalls({marketId:BigInt(m.id),marketAbi:m.abi,config:m.driverConfig,nftAbi:nft,tokenAbi:token,vaultId:v,seller:BigInt(actors.bob.id),listingNonce:1n,price,deadline,nonce:epoch}),consent]);
  if(epoch===2n)await onceOrdinary('bob',prefix+'-seller-consent',[consent]);
  await maintenance(prefix+'-start','start_epoch',epoch,cutoff);
  if(epoch===2n)await maintenance(prefix+'-admit-bob','admit_entry',BigInt(actors.bob.id),1n);
  await maintenance(prefix+'-admit-trader','admit_entry',BigInt(actors.trader.id),epoch);
  for(let i=0;;i++){const s=await publicState(config);if(BigInt(s.checkpoint)>cutoff)break;assert.ok(i<240);await pause(15000);}
  await maintenance(prefix+'-seal','seal_epoch',epoch);await sponsor(prefix+'-commit',1);await action(prefix+'-commit');await action(prefix+'-settle');
  const stateFile=join(base,'public',prefix+'-settled.state.json'),state=existsSync(stateFile)?read(stateFile):await m.snapshot(prefix+'-settled');assert.equal(BigInt(state.fields.queue_phase[0]),3n);assert.deepEqual(state.fields.queue_outcome.slice(0,epoch===1n?1:2).map(BigInt),epoch===1n?[2n]:[1n,1n]);
  for(const actor of epoch===1n?['trader']:['bob','trader']){const name=prefix+'-'+actor+'-claim',attempt=join(base,'attempts',name);if(existsSync(join(attempt,'preflight.json'))){if(!existsSync(join(attempt,'included.json')))await confirmUps(config,attempt);continue;}const calls=await payoutClaims(await publicState(config),{userId:actors[actor].id,markets:[m],tokenAbi:token,nftAbi:nft,nftSlot:epoch===2n&&actor==='trader'?1:undefined});await onceOrdinary(actor,name,calls);}
  save(join(base,'public',prefix+'-complete.json'),{...plan,completedAt:new Date().toISOString(),marketId:m.id,vaultId:m.vault,outcomes:epoch===1n?[2]:[1,1],ordinaryClaimsIncluded:true,deterministic:true,globalMarketCompleteness:false});console.log(new Date().toISOString(),prefix,'complete');
 }
 const after=await cohortAssets(await publicState(config),cohort);for(const amount of Object.values(after.totals))assert.equal(amount,1000n*10n**18n);assert.equal(after.nfts.length,2);assert.ok(after.nfts.every(n=>n.user===actors.trader.id),'both NFTs owned by trader after the replacement sale');
 save(join(base,'public/nft-v2-assets-after.json'),after);
 let accepted=0,fees=0n;const unique=new Set();for(const n of readdirSync(join(base,'attempts'))){const p=join(base,'attempts',n,'included.json');if(!existsSync(p))continue;accepted++;if(!n.startsWith('nft-v2-epoch-'))continue;const c=read(p).preflight?.core;assert.ok(c);const key=c.new_user_leaf.user_id+':'+c.new_user_leaf.nonce;assert.ok(!unique.has(key));unique.add(key);fees+=BigInt(c.stats.guta_fees_collected)+BigInt(c.stats.da_fees_collected);}
 const before=parseLosslessJson(readFileSync(baseline,'utf8'));assert.equal(before.nativeTotal-after.nativeTotal,fees,'native conservation including all epoch UPS fees');
 save(join(base,'public/nft-v2-complete.json'),{completedAt:new Date().toISOString(),marketId:m.id,vaultId:m.vault,registeredNewKey:true,acceptedAttempts:accepted,epochUps:unique.size,epochFees:fees,nativeBefore:before.nativeTotal,nativeAfter:after.nativeTotal,missingSellerRefundAndOrdinaryClaim:true,sameListingSubsequentUniqueSale:true,ftSupplyConserved:true,nftOwnershipUnique:true,productionReady:false});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const [base,original,ordinaryBinary,compactBinary,stage,proofOut]=process.argv.slice(2);await runNftRecovery({base,original,ordinaryBinary,compactBinary,stage,proofOut});}
