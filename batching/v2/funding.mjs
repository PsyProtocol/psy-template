// A frozen candidate is eligible only for its cutoff funding. A later payment
// cannot turn an unfunded candidate into an executable order in this batch.
import {own,pairSlot,slot,memberIndex} from './controller.mjs';
const F=1000100000n;
export function fundingValid(d,i,market,c){
 const get=f=>own(d,`frozen[${i}].${f}`),a=get('paid_a'),b=get('paid_b'),fee=get('fee_delta'),kind=get('kind'),zero=d.constant(0);let valid;
 if(market==='nftmarket')valid=`((${kind} == 2 && ${d.eq(a,get('price'))} && ${get('nft_sent')} == ${get('nft_claimed')}) || (${kind} == 1 && ${d.eq(a,zero)} && ${get('nft_sent')} == ${get('nft_claimed')} + 1 && ${get('nft_matches')} == 1))`;
 else{const x=get('x'),side=get('side');
  const sideValid=`((${side} == 0 && ${d.eq(a,x)} && ${d.eq(b,zero)}) || (${side} == 1 && ${d.eq(b,x)} && ${d.eq(a,zero)}))`;
  if(market==='amm')valid=`((${kind} == 1 && ${sideValid}) || (${kind} == 2 && ${d.eq(a,x)} && ${d.eq(b,get('y'))}) || (${kind} == 3 && ${d.eq(a,zero)} && ${d.eq(b,zero)}))`;
  else if(market==='orderbook')valid=`(${kind} == 1 && ${sideValid})`;
  else{const quantity=d.mul(d.digits(d.constant(c.unit)),[get('lots')]),digits=d.digits(a);const same=Array.from({length:Math.max(quantity.length,digits.length)},(_,n)=>`(${quantity[n]??'0'} == ${digits[n]??'0'})`).join(' && ');valid=`((${kind} == 1 && ${d.eq(b,x)} && ${d.eq(a,zero)}) || (${kind} == 2 && (${same}) && ${d.eq(b,zero)}))`;}
 }
 return `(${valid} && ${fee} == ${F})`;
}
export function fundingUnchanged(d,u,market,c){d.batchMarket=market;const i=memberIndex(u);
 for(const[asset,cursor,name]of[[market==='nftmarket'?c.tokenId:c.assetA,market==='nftmarket'?'settled_payment':'settled_a','paid_a'],...(market==='nftmarket'?[]:[[c.assetB,'settled_b','paid_b']])]){
  const sent=pairSlot(d,u,asset,'33554453+4*ctx.user_id'),claimed=pairSlot(d,'ctx.user_id',asset,`33554455+4*${u}`),base=own(d,`${cursor}[${u}]`),delta=d.sub(sent,base),frozen=own(d,`frozen[${i}].${name}`);
  d.emit(`require(${d.eq(claimed,c.checkpointGraph?sent:base)} && ${d.eq(delta,frozen)}, "funding changed after cutoff");`);
 }
 if(market==='nftmarket'){const sent=slot(d,u,c.nftId,'1182+35*ctx.user_id+32'),claimed=slot(d,'ctx.user_id',c.nftId,`1182+35*${u}+33`),fs=own(d,`frozen[${i}].nft_sent`),fc=own(d,`frozen[${i}].nft_claimed`);d.emit(`require(${sent} == ${fs} && ${claimed} == ${fc}, "NFT funding changed after cutoff");`);}
 const sent=slot(d,u,0,'3+2*ctx.user_id'),claimed=slot(d,'ctx.user_id',0,`4+2*${u}`),base=own(d,`settled_fee[${u}]`),fs=own(d,`frozen[${i}].fee_sent`),fd=own(d,`frozen[${i}].fee_delta`);for(const v of[sent,claimed,base,fs,fd])d.range(v,62);
 d.emit(`require(${claimed} == ${base} && ${sent} == ${fs} && ${sent} == ${base} + ${fd}, "fee changed after cutoff");`);
}
