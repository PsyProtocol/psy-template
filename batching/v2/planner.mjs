// This is a quote/selection aid. The contract and SD-key independently verify
// every proposed operation against the committed set and progressive state.
import assert from 'node:assert/strict';
import {encodeAmount,swapQuote,sqrt,initialShares,addShares,withdraw,curveQuote,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
import {signingRequest,witness} from './policy.mjs';
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export const timeCompare=(a,b)=>cmp(a.order_checkpoint,b.order_checkpoint)||cmp(a.owner,b.owner)||cmp(a.nonce,b.nonce);
export const bookCompare=(a,b)=>cmp(a.side,b.side)||cmp(a.y*b.x,b.y*a.x)||timeCompare(a,b);
export const isLive=(o,cutoff)=>o.cancelled===0n&&o.deadline>=cutoff;
export function validFunding(market,o,c){if(o.fee_delta!==F)return false;const a=o.paid_a,b=o.paid_b;
 if(market==='nftmarket')return o.kind===1n?a===0n&&o.nft_sent===o.nft_claimed+1n&&o.nft_matches===1n:o.kind===2n&&a===o.price&&o.nft_sent===o.nft_claimed;
 if(market==='amm'){if(o.kind===2n)return a===o.x&&b===o.y;if(o.kind===3n)return a===0n&&b===0n;}
 if(market==='bondingcurve')return o.kind===1n?a===0n&&b===o.x:o.kind===2n&&b===0n&&a===o.lots*BigInt(c.unit);
 return (market==='orderbook'?o.kind===1n:o.kind===1n)&&(o.side===0n?a===o.x&&b===0n:o.side===1n&&b===o.x&&a===0n);
}
export function operation(policy,name,{payer=0n,peer=0n,x=0n,y=0n,z=0n,lots=0n,nonce=0n,peerNonce=0n}={}){
 const op=policy.operations.find(o=>o.name===name);assert.ok(op,`unknown operation ${name}`);const f=[BigInt(op.branch),payer,peer,...encodeAmount(x),...encodeAmount(y),...encodeAmount(z),lots,nonce,peerNonce,0n];
 const used=new Set([0,...op.calls.flatMap(c=>c.inputs.filter(v=>v.witness!==undefined).map(v=>v.witness))]);return f.map((n,i)=>used.has(i)?BigInt(n):0n);
}
export function planSettlement({market,policy,config,rows,pool,cutoff}){
 const active=rows.filter(o=>o.owner>0n&&o.done===0n),state={...pool},ops=[],done=new Set();
 const add=(name,o,more={})=>{ops.push(operation(policy,name,{payer:o.owner,nonce:o.nonce,...more}));done.add(o.owner);};
 const refund=o=>{const mask=(o.paid_a?1:0)+(o.paid_b?2:0)+(o.fee_delta?4:0)+(market==='nftmarket'&&o.nft_sent>o.nft_claimed?8:0);add(`refund_funding_${mask}`,o,{x:o.paid_a,y:o.paid_b,lots:o.fee_delta});};
 if(market==='amm'||market==='bondingcurve')for(const o of [...active].sort(timeCompare)){
  if(!isLive(o,cutoff)||!validFunding(market,o,config)){refund(o);continue;}
  if(market==='amm'){
   if(o.kind===1n){const ri=o.side===0n?'reserve_a':'reserve_b',ro=o.side===0n?'reserve_b':'reserve_a';
    const q=o.x*9970n*state[ro]/(state[ri]*10000n+o.x*9970n);
    if(q>0n&&q>=o.y&&state[ri]>0n&&state[ro]>0n&&state[ri]+o.x<(1n<<124n)){add(`swap_${o.side}`,o,{x:o.x,y:q});state[ri]+=o.x;state[ro]-=q;}
    else add(`refund_swap_${o.side}`,o,{x:o.x,y:q});
   }else if(o.kind===2n){let q=state.total_shares===0n?sqrt(o.x*o.y):state.reserve_a>0n?o.x*state.total_shares/state.reserve_a:0n;
    try{const minted=state.total_shares===0n?initialShares(o.x,o.y):addShares(o.x,o.y,state.reserve_a,state.reserve_b,state.total_shares);assert.ok(minted>=o.z);add('add_liquidity',o,{x:o.x,y:o.y,z:minted});state.reserve_a+=o.x;state.reserve_b+=o.y;state.total_shares+=minted+(state.total_shares===0n?1000n:0n);}catch(error){if(!(error instanceof Error))throw error;add('refund_add',o,{x:o.x,y:o.y,z:q});}
   }else if(o.kind===3n){const a=state.total_shares?o.x*state.reserve_a/state.total_shares:0n,b=state.total_shares?o.x*state.reserve_b/state.total_shares:0n;
    try{const q=withdraw(o.x,state.reserve_a,state.reserve_b,state.total_shares,o.ownedShares);assert.ok(q.a>=o.y&&q.b>=o.z);add('remove_liquidity',o,{x:o.x,y:q.a,z:q.b});state.total_shares-=o.x;state.reserve_a-=q.a;state.reserve_b-=q.b;}catch(error){if(!(error instanceof Error))throw error;add('cancel_remove',o,{y:a,z:b});}
   }else throw Error('invalid AMM order kind');
  }else{
   const buy=o.kind===1n;assert.ok(buy||o.kind===2n,'curve kind');const lots=o.lots,sold=state.sold_lots,capacity=buy?sold+lots<=BigInt(config.cap):lots<=sold;
   const safe=capacity?sold:buy?0n:lots;const quoted=BigInt(config.base)*lots+BigInt(config.step)*lots*(2n*safe+(buy?lots:-lots)-1n)/2n;
   const token=lots*BigInt(config.unit),ok=state.phase===1n&&capacity&&(o.limit_mode===1n?(buy?quoted<=o.x:quoted>=o.x):o.expected_sold===sold&&o.x===quoted);
   if(ok){if(o.limit_mode===1n&&buy)add(quoted===o.x?'settle_limit_buy_exact':'settle_limit_buy_change',o,{lots,x:quoted,y:token,z:o.x-quoted});else add(o.limit_mode===1n?'settle_limit_sell':buy?'settle_buy':'settle_sell',o,{lots,x:quoted,y:token});state.sold_lots+=buy?lots:-lots;state.quote_reserve+=buy?quoted:-quoted;}
   else add(buy?'refund_buy':'refund_sell',o,{lots,x:buy?o.x:0n,y:buy?0n:token,z:quoted});
  }
 }
 if(market==='orderbook'){
  for(const o of active)if(!isLive(o,cutoff)||!validFunding(market,o,config))refund(o);
  const available=active.filter(o=>!done.has(o.owner)).sort(bookCompare);
  for(const a of available.filter(o=>o.side===0n))for(const b of available.filter(o=>o.side===1n))if(!done.has(a.owner)&&!done.has(b.owner)&&a.y<=b.x&&b.y<=a.x){add('match_orders',a,{peer:b.owner,x:a.x,y:b.x,peerNonce:b.nonce});done.add(b.owner);break;}
 }
 if(market==='nftmarket'){
  for(const o of active)if(!isLive(o,cutoff)||!validFunding(market,o,config))refund(o);
  for(const buyer of [...active].filter(o=>o.kind===2n&&!done.has(o.owner)).sort(timeCompare)){
   const seller=active.find(o=>o.owner===buyer.seller&&o.kind===1n&&o.nonce===buyer.listing_nonce);
   if(seller&&!done.has(seller.owner)&&isLive(seller,cutoff)&&validFunding(market,seller,config)&&seller.price===buyer.price){add('settle_sale',seller,{peer:buyer.owner,x:buyer.price,peerNonce:buyer.nonce});done.add(buyer.owner);}
   else refund(buyer);
  }
 }
 assert.ok(ops.length<=4,'operation stack capacity');
 const ranked=rows.map((o,i)=>({...o,index:BigInt(i)})).sort((a,b)=>a.owner===0n?b.owner===0n?cmp(a.index,b.index):1:b.owner===0n?-1:bookCompare(a,b));
 return {operations:ops,rank:market==='orderbook'?ranked.map(o=>o.index):[0n,0n,0n,0n],state,terminal:[...done]};
}
export function settlementFields(context){const plan=planSettlement(context);return witness({mode:2,batch:context.batch,root:context.root,rank:plan.rank,operations:plan.operations,burn:0n});}
export {signingRequest};
