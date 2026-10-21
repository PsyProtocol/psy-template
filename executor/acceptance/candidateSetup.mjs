import assert from'node:assert/strict';import{existsSync}from'node:fs';import{join}from'node:path';
import{cohort,formal}from'./candidateHarness.mjs';import{read,save}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';import{call,encodeAmount,FEE_ESCROW as F}from'../../amm/u124/client.mjs';import{activationFunding}from'../../batching/v2/client.mjs';
const[base,original]=process.argv.slice(2),h=cohort(base,original);assert.ok(existsSync(join(base,'public/deployments-complete-v1.json')));
const oldNft=2467n,A=2464n,B=2466n;const names=['charlie','dave'];
await h.user('sponsor','candidate-new-actor-native-send',names.map(n=>({contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(h.actors[n].id),50_000_000_000n]})));
await h.user('bob','candidate-new-actor-ft-send',names.flatMap(n=>[A,B].map(asset=>call(asset,h.token,'transfer',[BigInt(h.actors[n].id),encodeAmount(50n*10n**18n)]))));
for(const n of names)await h.user(n,'candidate-'+n+'-gas-ft-claim',[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(h.actors.sponsor.id)]},...[A,B].map(asset=>call(asset,h.token,'claim',[BigInt(h.actors.bob.id)])),call(oldNft,h.nft,'acknowledge',[BigInt(h.actors.trader.id)])]);
await h.user('trader','candidate-second-listing-nft-send',[call(oldNft,h.nft,'transfer',[0n,BigInt(h.actors.charlie.id)])]);
await h.user('charlie','candidate-second-listing-nft-claim',[call(oldNft,h.nft,'claim',[0n,BigInt(h.actors.trader.id)])]);
await h.user('bob','candidate-all-activation-seeds',h.markets.flatMap(m=>activationFunding({market:m.kind,config:m.driverConfig,tokenAbi:h.token,vaultId:BigInt(m.vault)})));
for(const m of h.markets){const service=await formal(h,m,'bootstrap',{version:1,epoch:1,cutoff:1,members:[]});try{await service.step('candidate-'+m.kind+'-activate',t=>t.kind==='batch_maintenance');}finally{await service.close();}}
// Inventory belongs to the issuer; new Curve points to the new AMM vault.
const c=h.by.bondingcurve;await h.user('bob','candidate-curve-inventory',[{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(c.vault),F]},call(A,h.token,'transfer',[BigInt(c.vault),encodeAmount(110n*10n**18n)])]);
const service=await formal(h,c,'inventory',{version:1,epoch:1,cutoff:1,members:[]});try{await service.step('candidate-curve-initialize',t=>t.kind==='batch_maintenance');}finally{await service.close();}
if(!existsSync(join(base,'public/setup-complete-v1.json')))save(join(base,'public/setup-complete-v1.json'),{completedAt:new Date().toISOString(),actors:Object.fromEntries(Object.entries(h.actors).map(([k,a])=>[k,a.id])),qaFt:[2464,2466],qaNft:2467,existingPusdtUsed:false,newCurveTarget:h.by.amm.vault,allVaultsActivated:true});
console.log('candidate setup complete');
