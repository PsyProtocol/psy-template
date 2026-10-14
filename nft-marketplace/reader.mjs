import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {publicState} from '../executor/publicState.mjs';import {mapReads,readTogether} from '../executor/readConcurrency.mjs';
import {decodeAmount,encodeAmount,losslessJson,FEE_ESCROW} from './client.mjs';import {signingRequest} from './policy.mjs';import {validateConfig,NFT} from './generate.mjs';
export async function loadFiles(o){const [abi,config,policy]=await readTogether([o.abi,o.driverConfig,o.policy].map(async f=>JSON.parse(await readFile(f,'utf8'))));validateConfig(config);return {abi,config,policy};}
export function proposeAction({orders,checkpoint,policy,vaultId}){
 const rows=new Map(orders.map(o=>[o.userId,o])),cp=BigInt(checkpoint),vault=BigInt(vaultId);
 const active=o=>o&&o.pool===vault&&o.nonce>o.consumed&&[1n,2n].includes(o.kind);
 const fee=o=>o.feeDelta===FEE_ESCROW&&o.feeClaimed===o.feeCursor;
 const present=o=>o.nftClaimed===o.nftSequence&&o.nftSent===o.nftSequence+1n&&o.identityMatches;
 const capacity=o=>o.deliveryClaimed<=o.deliverySent&&o.deliveryClaimed>=o.deliveryAcked&&o.deliverySent-o.deliveryClaimed<4n;
 const invalidListing=o=>{const s=rows.get(Number(o.seller));return !active(s)||s.kind!==1n||s.nonce!==o.listingNonce||s.cancelled===1n||s.deadline<cp;};
 const task=(name,s,b,amount=0n)=>{const branch=policy.branches.find(x=>x.name===name);assert.ok(branch,'NFT policy branch');const f=[BigInt(branch.branch),BigInt(s?.userId??b.userId),BigInt(b?.userId??0),...encodeAmount(amount),0n,0n,0n,0n,0n,s?.nonce??0n,b?.nonce??0n,0n];return {kind:name,submission:losslessJson(signingRequest(policy,f))};};
 // Prioritize explicit/expired seller returns. A live listing cannot be cancelled by an observer.
 for(const s of orders)if(active(s)&&s.kind===1n&&fee(s)&&(s.cancelled===1n||s.deadline<cp)){
  if(present(s)&&capacity(s))return task('refund_listing',s);
  if(s.nftSent===s.nftSequence&&s.nftClaimed===s.nftSequence)return task('refund_listing_fee',s);
 }
 for(const b of orders)if(active(b)&&b.kind===2n&&fee(b)&&b.paymentClaimed===b.paymentCursor){
  if(b.cancelled===1n||b.deadline<cp||invalidListing(b)){
   if(b.paymentDelta>0n)return task('refund_buy',null,b,b.paymentDelta);
   if(b.paymentDelta===0n)return task('refund_buy_fee',null,b);
   continue;
  }
  const s=rows.get(Number(b.seller));if(fee(s)&&present(s)&&s.price===b.price&&b.price>0n&&b.paymentDelta===b.price&&capacity(b))return task('settle_sale',s,b,b.price);
 }
 // Already-claimed outbound NFTs may be ACKed using a separate recipient-funded fee.
 for(const o of orders)if((o.kind===0n||o.nonce<=o.consumed)&&fee(o)&&o.deliveryClaimed>o.deliveryAcked&&o.deliveryClaimed<=o.deliverySent)return task('ack_delivery',o);
 return null;
}
export async function scan(o,readState=publicState,files){files??=await loadFiles(o);const {abi,config,policy}=files,s=await readState(o.rpcConfig),vault=o.vaultId;
 const fields=new Map(abi.contract.state.map(f=>[f.name,f]));
 const own=(u,name,i=0)=>{const f=fields.get(name);assert.ok(f,`market field ${name}`);assert.ok(i<(f.type.length??1));return s.slot(u,o.contractId,f.offset+i*(f.type.item_felt_size??1));};
 const pair=async(u,name,index=0)=>decodeAmount(await readTogether([own(u,name,index),s.slot(u,o.contractId,fields.get(name).offset+index*(fields.get(name).type.item_felt_size??1)+1)]));
 const counters=async(u,peer)=>{const base=NFT.outbox+NFT.stride*peer;const [sent,claimed,acked]=await readTogether([s.slot(u,config.nftId,base+32),s.slot(u,config.nftId,base+33),s.slot(u,config.nftId,base+34)]);return {sent,claimed,acked};};
 const tokenPair=async(u,offset)=>decodeAmount(await readTogether([s.slot(u,config.tokenId,offset),s.slot(u,config.tokenId,offset+1)]));
 const row=async userId=>{
  const names=['kind','pool','nonce','deadline','cancelled','seller','listing_nonce','nft_sequence'];const raw=Object.fromEntries(await readTogether(names.map(async n=>[n,await own(userId,n)])));
  const [price,consumed,feeSent,feeClaimed,feeCursor,paymentSent,paymentClaimed,paymentCursor,out,inbound,delivery]=await readTogether([pair(userId,'price'),own(vault,'consumed',userId),s.slot(userId,0,3+2*vault),s.slot(vault,0,4+2*userId),own(vault,'settled_fee',userId),tokenPair(userId,33554453+4*vault),tokenPair(vault,33554455+4*userId),pair(vault,'settled_payment',userId),counters(userId,vault),counters(vault,userId),counters(userId,vault)]);
  const q=Number(raw.nft_sequence&3n),base=NFT.outbox+NFT.stride*vault+8*q;
  let identityMatches=true;
  if(raw.kind===1n)for(let i=0;i<4;i++){const [tid,meta,expectedId,expectedMeta]=await readTogether([s.slot(userId,config.nftId,base+i),s.slot(userId,config.nftId,base+i+4),s.slot(userId,o.contractId,fields.get(`token_id_${i}`).offset),s.slot(userId,o.contractId,fields.get(`metadata_hash_${i}`).offset)]);if(tid!==expectedId||meta!==expectedMeta)identityMatches=false;}
  return {userId,...raw,seller:raw.seller,listingNonce:raw.listing_nonce,nftSequence:raw.nft_sequence,price,consumed,feeDelta:feeSent-feeCursor,feeClaimed,feeCursor,paymentDelta:paymentSent-paymentCursor,paymentClaimed,paymentCursor,nftSent:out.sent,nftClaimed:inbound.claimed,identityMatches,deliverySent:inbound.sent,deliveryAcked:inbound.acked,deliveryClaimed:delivery.claimed};
 };
 const orders=await mapReads(o.users,row),known=new Set(o.users);const refs=[...new Set(orders.filter(x=>x.kind===2n&&x.seller>0n&&x.seller<16777216n&&x.seller!==BigInt(vault)).map(x=>Number(x.seller)))].filter(id=>!known.has(id));orders.push(...await mapReads(refs,row));
 const [balance,active]=await readTogether([s.slot(vault,config.nftId,0),s.slot(vault,config.nftId,34)]);assert.equal(balance,0n,'NFT vault must hold no NFT between settlements');assert.equal(active,0n,'NFT scratch slot must be empty');
 return {checkpoint:s.checkpoint,orders,action:proposeAction({orders,checkpoint:s.checkpoint,policy,vaultId:vault})};
}
