// Retire the empty LP intake after a real pre-session funding failure allowed
// its cutoff and the order deadline to pass. Bob's expired open_add funding
// returns only to him through the enrolled-recovery route; the renewed intake
// then needs a fresh order and fresh consent.
import assert from'node:assert/strict';import{existsSync,readdirSync,readFileSync}from'node:fs';import{join}from'node:path';
import{cohort,formal,pause}from'./candidateHarness.mjs';import{read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';import{parseLosslessJson,FEE_ESCROW as F,losslessJson}from'../../amm/u124/client.mjs';import{sponsorCalls}from'../../batching/v2/client.mjs';import{cohortAssets,payoutClaims,canonicalHeldNfts}from'../../batching/admission/liveAssets.mjs';import{enrolledRecovery}from'./enrolledRecovery.mjs';import{ordinaryEvidenceDirectory}from'./ordinaryEvidence.mjs';
const[base,original]=process.argv.slice(2),h=cohort(base,original),m=h.by.amm,p=read(join(base,'public/liquidity-plan-v1.json')),bob=h.actors.bob.id,services=[];
assert.equal(h.bobLpNonce,1n,'renewed LP intake is already prepared');
assert.ok(!existsSync(join(base,'public/liquidity-complete-v1.json')),'completed LP interval has no empty intake to retire');
for(const label of ['liquidity-bob-order','liquidity-bob-consent'])assert.ok(existsSync(join(base,'attempts',label,'included.json')),label+' must be included before its intake can be retired');
{const f=read(join(base,'attempts/liquidity-admit-fund/failure.json'));assert.equal(f.broadcastMayHaveBeenAttempted,false,'ambiguous admission funding requires exact reconciliation');assert.equal(f.automaticRetry,false);assert.ok(['verify-ordinary-input-and-dependencies','start-ordinary-session'].includes(f.phase),'admission funding progressed beyond the pre-session phases');}
const off=name=>m.abi.contract.state.find(f=>f.name===name).offset,plan={version:1,epoch:p.epoch,cutoff:p.cutoff,members:[]};
const beforeFile=join(base,'public/liquidity-timeout-assets-before-v1.json');if(!existsSync(beforeFile))save(beforeFile,await cohortAssets(await publicState(h.config),h.assetSpec));
async function validateEmpty(){const s=await publicState(h.config),f=await s.fields(m.vault,m.id,m.abi,['queue_epoch','queue_phase','queue_count','queue_cutoff','batch_phase']);assert.equal(f.queue_epoch,BigInt(p.epoch));assert.equal(f.queue_count,0n,'nonempty intake requires separate settlement/refund recovery');assert.equal(f.queue_cutoff,BigInt(p.cutoff));assert.ok([1n,3n].includes(f.queue_phase));assert.ok([0n,3n].includes(f.batch_phase),'no frozen/economic batch may be discarded');return s;}
async function fund(label){const s=await publicState(h.config);await h.user('sponsor',label,sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:await s.slot(h.actors.sponsor.id,m.id,off('sponsor_nonce'))+1n,purpose:2n,amount:F}));}
try{
 await validateEmpty();while((await publicState(h.config)).checkpoint<=p.cutoff)await pause(10000);
 const f=await formal(h,m,'liquidity-timeout-v1',plan);services.push(f);
 await fund('liquidity-timeout-abort-fund');
 await f.step('liquidity-amm-timeout-abort',t=>t.maintenanceOperation==='abort_empty_epoch');
 {const s=await validateEmpty();assert.equal(await s.slot(m.vault,m.id,off('queue_phase')),3n);assert.equal(await s.slot(bob,m.id,off('nonce')),1n);assert.ok(await s.slot(m.vault,m.id,off('consumed')+bob)<1n,'LP order must remain unconsumed');}
 await h.user('bob','liquidity-timeout-bob-release-enroll',[m.order('request_cancel',[]),m.order('release_unaccepted',[]),m.order('request_recovery',[BigInt(m.vault)])]);
 await enrolledRecovery({...h,markets:[m]},services,{prefix:'liquidity-timeout-recovery',owners:[bob],maxGrantsPerMarket:2,maxRounds:12});
 if(!existsSync(join(ordinaryEvidenceDirectory(base,'liquidity-timeout-bob-claim',bob),'included.json')))await h.user('bob','liquidity-timeout-bob-claim',await payoutClaims(await publicState(h.config),{userId:bob,markets:[m],tokenAbi:h.token,nftAbi:h.nft}));
 const s=await publicState(h.config);assert.equal(await s.slot(bob,m.id,off('kind')),0n,'expired LP order must be released');
 const afterFile=join(base,'public/liquidity-timeout-assets-after-v1.json');if(!existsSync(afterFile))save(afterFile,await cohortAssets(s,h.assetSpec));
 const exact=path=>parseLosslessJson(readFileSync(path,'utf8')),before=exact(beforeFile),after=exact(afterFile),lpBefore=exact(join(base,'public/liquidity-assets-before-v1.json'));
 for(const asset of h.assetSpec.assets){assert.equal(after.totals[asset],before.totals[asset]);assert.equal(after.accounts[bob].ft[asset],lpBefore.accounts[bob].ft[asset],'Bob LP principal returned');}
 assert.equal(after.nftTotal,before.nftTotal);assert.equal(after.nftPending.length,0);assert.deepEqual(canonicalHeldNfts(after.nfts),canonicalHeldNfts(before.nfts));
 let fees=0n,bobFees=0n;for(const name of readdirSync(join(base,'attempts')).filter(n=>n.startsWith('liquidity-timeout-'))){const path=join(base,'attempts',name,'included.json');if(!existsSync(path))continue;const r=read(path),fee=BigInt(r.receipt.data.result.fees_collected);fees+=fee;if(r.receipt.data.owner_user_id===bob)bobFees+=fee;}
 for(const r of(await f.journal.records()).filter(r=>r.status==='included'&&Number(r.result.checkpoint)>Number(before.checkpoint)))fees+=BigInt(r.result.receipt.data.result.fees_collected);
 assert.equal(before.nativeTotal-after.nativeTotal,fees,'cohort native delta equals included fees');
 const completed=join(base,'public/liquidity-empty-intake-timeout-v1.json');if(!existsSync(completed))save(completed,{completedAt:new Date().toISOString(),retiredEpoch:p.epoch,originalCutoff:p.cutoff,originalOrderNonce:1,acceptedMembers:0,failedAdmissionFunding:'attempts/liquidity-admit-fund/failure.json',senderBoundRefund:true,ordinaryClaimIncluded:true,bobFtPrincipalReturned:true,bobFees,fees,qaFtNftConserved:true,scope:'actual empty LP intake timeout and expired order; no LP mint occurred, the renewed intake needs a fresh order and consent'});
 // Fund before choosing the next immutable cutoff, keeping cold sponsorship
 // proof/confirmation outside that new intake window.
 await fund('liquidity-retry-v1-start-fund');
 const ready=join(base,'public/liquidity-retry-ready-v1.json');if(!existsSync(ready))save(ready,{readyAt:new Date().toISOString(),oldIntakeEvidence:completed,renewedOrderNonce:2,ordinaryOrderResubmitted:true,newConsentRequired:true,cutoffExtended:false});
 console.log('empty LP intake closed; Bob refunded and claimed; next-epoch sponsorship confirmed');
}finally{for(const f of services)await f.close();}
