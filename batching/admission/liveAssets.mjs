import assert from 'node:assert/strict';
import {decodeAmount,call} from '../../amm/u124/client.mjs';
export async function cohortAssets(s,{users,assets,nftId}){
 assert.equal(new Set(users).size,users.length);const totals=Object.fromEntries(assets.map(a=>[a,0n]));let nativeTotal=0n;const accounts={},pending=[],nfts=[];
 // publicState bounds concurrent RPC reads globally. Resolve independent
 // leaves together, then fold in input order for reproducible evidence.
 const accountRows=await Promise.all(users.map(async user=>{
  const [native,ft,slots]=await Promise.all([s.slot(user,0,0),Promise.all(assets.map(async asset=>({asset,balance:decodeAmount(await Promise.all([s.slot(user,asset,0),s.slot(user,asset,1)])),root:await s.contractStateRoot(user,asset)}))),Promise.all([0,1].map(slot=>Promise.all(Array.from({length:9},(_,i)=>s.slot(user,nftId,30+9*slot+i)))))]);
  return {user,native,ft,slots};
 }));
 for(const {user,native,ft,slots}of accountRows){const account={native,ft:{},roots:{}};nativeTotal+=native;for(const {asset,balance,root}of ft){account.ft[asset]=balance;account.roots[asset]=root;totals[asset]+=balance;}for(const [slot,values]of slots.entries()){assert.ok([0n,1n].includes(values[4]));if(values[4]===1n)nfts.push({user,slot,tokenId:values.slice(0,4),metadataHash:values.slice(5)});}accounts[user]=account;}
 const pairs=users.flatMap(sender=>users.filter(u=>u!==sender).map(recipient=>({sender,recipient})));
 pending.push(...await Promise.all(pairs.map(async({sender,recipient})=>{
  const [sent,claimed,ft]=await Promise.all([s.slot(sender,0,3+2*recipient),s.slot(recipient,0,4+2*sender),Promise.all(assets.map(async asset=>{const [sent,claimed]=await Promise.all([Promise.all([s.slot(sender,asset,33554453+4*recipient),s.slot(sender,asset,33554454+4*recipient)]).then(decodeAmount),Promise.all([s.slot(recipient,asset,33554455+4*sender),s.slot(recipient,asset,33554456+4*sender)]).then(decodeAmount)]);assert.ok(sent>=claimed,'FT cursor');return [asset,sent-claimed];}))]);assert.ok(sent>=claimed,'native cursor');return {sender,recipient,native:sent-claimed,ft:Object.fromEntries(ft)};
 })));
 for(const row of pending){nativeTotal+=row.native;for(const asset of assets)totals[asset]+=row.ft[asset];}
 assert.equal(new Set(nfts.map(n=>n.tokenId.map(String).join(':'))).size,nfts.length,'duplicate NFT ownership');
 return {checkpoint:s.checkpoint,accounts,pending,nfts,totals,nativeTotal};
}
export async function payoutClaims(s,{userId,markets,tokenAbi,nftAbi,nftSlot}){
 const calls=[];
 for(const m of markets){for(const asset of m.kind==='nftmarket'?[m.driverConfig.tokenId]:[m.driverConfig.assetA,m.driverConfig.assetB]){
  const sent=decodeAmount(await Promise.all([s.slot(m.vault,asset,33554453+4*userId),s.slot(m.vault,asset,33554454+4*userId)])),claimed=decodeAmount(await Promise.all([s.slot(userId,asset,33554455+4*m.vault),s.slot(userId,asset,33554456+4*m.vault)]));assert.ok(sent>=claimed);if(sent>claimed)calls.push(call(BigInt(asset),tokenAbi,'claim',[BigInt(m.vault)]));
 }
 const sent=await s.slot(m.vault,0,3+2*userId),claimed=await s.slot(userId,0,4+2*m.vault);assert.ok(sent>=claimed);if(sent>claimed)calls.push({contract_id:0n,method_name:'simple_claim',inputs:[BigInt(m.vault)]});
 }
 if(nftSlot!==undefined){const m=markets.find(m=>m.kind==='nftmarket'),id=m.driverConfig.nftId,sent=await s.slot(m.vault,id,1182+35*userId+32),claimed=await s.slot(userId,id,1182+35*m.vault+33);assert.equal(sent-claimed,1n,'exactly one delivery');calls.push(call(BigInt(id),nftAbi,'claim',[BigInt(nftSlot),BigInt(m.vault)]));}
 assert.ok(calls.length>0&&calls.length<=16);return calls;
}
