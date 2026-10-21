import assert from'node:assert/strict';import{existsSync}from'node:fs';import{join}from'node:path';
import{cohort,formal}from'./candidateHarness.mjs';import{read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';import{call,encodeAmount,FEE_ESCROW as F,parseLosslessJson}from'../../amm/u124/client.mjs';import{activationFunding,sponsorCalls}from'../../batching/v2/client.mjs';import{cohortAssets,payoutClaims}from'../../batching/admission/liveAssets.mjs';import{readFileSync}from'node:fs';
const[base,original]=process.argv.slice(2),h=cohort(base,original);assert.ok(existsSync(join(base,'public/deployments-complete-v1.json')));
const oldNft=2467n,A=2464n,B=2466n;const names=['charlie','dave'];
await h.user('sponsor','candidate-new-actor-native-send',names.map(n=>({contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(h.actors[n].id),50_000_000_000n]})));
await h.user('bob','candidate-new-actor-ft-send',names.flatMap(n=>[A,B].map(asset=>call(asset,h.token,'transfer',[BigInt(h.actors[n].id),encodeAmount(50n*10n**18n)]))));
for(const n of names)await h.user(n,'candidate-'+n+'-gas-ft-claim',[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(h.actors.sponsor.id)]},...[A,B].map(asset=>call(asset,h.token,'claim',[BigInt(h.actors.bob.id)])),call(oldNft,h.nft,'acknowledge',[BigInt(h.actors.trader.id)])]);
await h.user('trader','candidate-second-listing-nft-send',[call(oldNft,h.nft,'transfer',[0n,BigInt(h.actors.charlie.id)])]);
await h.user('charlie','candidate-second-listing-nft-claim',[call(oldNft,h.nft,'claim',[0n,BigInt(h.actors.trader.id)])]);
await h.user('bob','candidate-all-activation-seeds',h.markets.flatMap(m=>activationFunding({market:m.kind,config:m.driverConfig,tokenAbi:h.token,vaultId:BigInt(m.vault)})));
// An empty holder's acknowledgement alone does not satisfy activate(): it
// requires payer NFT balance > 0. Use the existing holder, preserving Bob's
// earlier unused funding for explicit sender-bound recovery below.
await h.user('bob','candidate-nft-activation-payer-ack-ready-v2',[call(oldNft,h.nft,'acknowledge',[BigInt(h.actors.trader.id)])]);
await h.user('trader','candidate-nft-holder-activation-seeds-v1',activationFunding({market:'nftmarket',config:h.by.nftmarket.driverConfig,tokenAbi:h.token,vaultId:BigInt(h.by.nftmarket.vault)}));
for(const m of h.markets){const nft=m.kind==='nftmarket',service=await formal(h,m,nft?'bootstrap-nft-holder-v3':'bootstrap-abi-v2',{version:1,epoch:1,cutoff:1,members:[]});try{await service.step('candidate-'+m.kind+'-activate'+(nft?'-holder-v3':''),t=>t.kind==='batch_maintenance');}finally{await service.close();}}
const orphanMarker=join(base,'public/bootstrap-orphan-recovery-complete-v1.json');
if(!existsSync(orphanMarker)){
 const n=h.by.nftmarket,spec={users:[h.actors.bob.id,h.actors.sponsor.id,n.vault],assets:[2464],nftId:2467},beforePath=join(base,'public/bootstrap-orphan-assets-before.json');
 if(!existsSync(beforePath))save(beforePath,await cohortAssets(await publicState(h.config),spec));
 const before=parseLosslessJson(readFileSync(beforePath,'utf8'));
 await h.user('bob','candidate-nft-orphan-enroll',[n.order('request_recovery',[BigInt(n.vault)])]);
 const recovery=await formal(h,n,'bootstrap-orphan',{version:1,epoch:1,cutoff:1,members:[]});
 try{
  const operation=name=>t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===name);
  if(!existsSync(join(base,'public/bootstrap-orphan-funding-request-v1.json'))){const scan=await recovery.adapter.scan();assert.equal(scan.reason,'recovery-gas-sponsorship-required');assert.equal(scan.fundingRequest.amount,(2n*F).toString());save(join(base,'public/bootstrap-orphan-funding-request-v1.json'),scan);}
  const state=await publicState(h.config),offset=n.abi.contract.state.find(x=>x.name==='sponsor_nonce').offset;
  await h.user('sponsor','candidate-nft-orphan-gas',sponsorCalls({marketId:BigInt(n.id),abi:n.abi,vaultId:BigInt(n.vault),nonce:await state.slot(h.actors.sponsor.id,n.id,offset)+1n,purpose:2n,amount:2n*F}));
  await recovery.step('candidate-nft-orphan-fund-gas',operation('fund_gas'));
  await recovery.step('candidate-nft-orphan-return',operation('recover_funding'));
  await h.user('bob','candidate-nft-orphan-claim',await payoutClaims(await publicState(h.config),{userId:h.actors.bob.id,markets:[n],tokenAbi:h.token,nftAbi:h.nft}));
  const after=await cohortAssets(await publicState(h.config),spec);let fees=0n,bobFees=0n;
  for(const name of ['candidate-nft-orphan-enroll','candidate-nft-orphan-gas','candidate-nft-orphan-claim']){const r=read(join(base,'attempts',name,'included.json')),fee=BigInt(r.receipt.data.result.fees_collected);fees+=fee;if(r.receipt.data.owner_user_id===h.actors.bob.id)bobFees+=fee;}
  for(const r of(await recovery.journal.records()).filter(x=>x.status==='included'&&Number(x.result.checkpoint)>Number(before.checkpoint)))fees+=BigInt(r.result.receipt.data.result.fees_collected);
  assert.equal(after.totals[2464],before.totals[2464]);assert.equal(before.nativeTotal-after.nativeTotal,fees);
  assert.equal(after.accounts[h.actors.bob.id].ft[2464]-before.accounts[h.actors.bob.id].ft[2464],1n);
  assert.equal(after.accounts[h.actors.bob.id].native-before.accounts[h.actors.bob.id].native,F-bobFees);
  save(join(base,'public/bootstrap-orphan-assets-after.json'),after);save(orphanMarker,{completedAt:new Date().toISOString(),originalSender:h.actors.bob.id,actualActivationPayer:h.actors.trader.id,market:n.id,ftPrincipalReturned:1n,nativePrincipalReturned:F,ordinaryClaimsIncluded:true,totalIncludedFees:fees,bobRecoveryFees:bobFees,cohort:'Bob, sponsor and new NFT vault including pairwise unclaimed transfers; no outside participant changes during interval'});
 }finally{await recovery.close();}
}
// Inventory belongs to the issuer; new Curve points to the new AMM vault.
const c=h.by.bondingcurve;await h.user('bob','candidate-curve-inventory',[{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(c.vault),F]},call(A,h.token,'transfer',[BigInt(c.vault),encodeAmount(110n*10n**18n)])]);
const service=await formal(h,c,'inventory',{version:1,epoch:1,cutoff:1,members:[]});try{await service.step('candidate-curve-initialize',t=>t.kind==='batch_maintenance');}finally{await service.close();}
if(!existsSync(join(base,'public/setup-complete-v1.json')))save(join(base,'public/setup-complete-v1.json'),{completedAt:new Date().toISOString(),actors:Object.fromEntries(Object.entries(h.actors).map(([k,a])=>[k,a.id])),qaFt:[2464,2466],qaNft:2467,existingPusdtUsed:false,newCurveTarget:h.by.amm.vault,allVaultsActivated:true});
console.log('candidate setup complete');
