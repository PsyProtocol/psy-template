import {assertDeterministicOrdering} from '../random-order/sourceGate.mjs';
import {bootstrapMethod} from './bootstrap.mjs';
import {recoveryMethods} from './recovery.mjs';
import {generateAmm,generateBook,generateCurve,fixture} from '../../amm/u124/generate.mjs';
import {generate as generateNft} from '../../nft-marketplace/generate.mjs';
import {fundingValid,fundingUnchanged} from './funding.mjs';
import {IntegerDsl} from '../../amm/u124/math.mjs';
import {ammRefunds,curveLimits,fundingRefund} from './guards.mjs';
import {controller,controllerFields,frozenStruct,members,method,read,own,memberIndex,enter,mark,pending,live,timeBefore} from './controller.mjs';

// Parse only generated method envelopes; balanced braces avoid truncating a
// method at its first conditional. Every expected transformation is checked.
export function methodSpans(source){const out=[];const re=/#\[contract_method\]\s*pub fn (\w+)\(/g;let m;
 while((m=re.exec(source))){const open=source.indexOf('{',re.lastIndex);let depth=1,end=open+1;for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  if(depth)throw Error('unbalanced generated method');out.push({name:m[1],start:m.index,open,end,signature:source.slice(m.index,open),body:source.slice(open+1,end-1)});re.lastIndex=end;}
 return out;
}
const freezeReads=body=>body.replace(/ctx\.users\[([^\]]+)\]\.contract_state::<Self::ABI>\(ctx\.contract_id\)\.([A-Za-z_]\w*(?:\[[^\]]+\])?)/g,(_,u,f)=>['x','y','z','price'].includes(f)?`[self.frozen[self.batch_index[${u}]].${f}_lo,self.frozen[self.batch_index[${u}]].${f}_hi]`:`self.frozen[self.batch_index[${u}]].${f}`).replaceAll('ctx.checkpoint_id','self.batch_cutoff');
function code(body){return body.text().replace(/\bw_/g,'batch_w_');}
function wrap(body,market,name,c){const d=new IntegerDsl(),end=new IntegerDsl();
 if(name==='match_orders'){
  const a=enter(d,'seller_a'),b=enter(d,'seller_b');
  d.emit(`require(${fundingValid(d,a,market,c)} && ${fundingValid(d,b,market,c)}, "invalid cutoff funding");`);
  d.emit(`require(${live(d,a)} && ${live(d,b)}, "cancelled or expired pair");`);
  d.emit('let batch_seen_ask = false; let batch_seen_bid = false;');
  // Ranking is validated in begin_batch. Pick the first compatible whole pair
  // in that ordering, never an Executor-chosen compatible but inferior pair.
  for(let i=0;i<4;i++){
   const r=own(d,`batch_rank[${i}]`),u=own(d,`frozen[${r}].owner`),side=own(d,`frozen[${r}].side`),rx=own(d,`frozen[${r}].x`),ry=own(d,`frozen[${r}].y`),chosenX=own(d,`frozen[${a}].x`),chosenY=own(d,`frozen[${a}].y`);
   let any='false';for(let j=0;j<4;j++){const jx=own(d,`frozen[${j}].x`),jy=own(d,`frozen[${j}].y`),js=own(d,`frozen[${j}].side`);any=`(${any} || (${pending(d,j)} && ${live(d,j)} && ${js} == 1 && ${d.le(ry,jx)} && ${d.le(jy,rx)}))`;}
   d.emit(`require(!(!batch_seen_ask && ${pending(d,r)} && ${live(d,r)} && ${side} == 0 && ${u} != seller_a && ${any}), "earlier compatible ask");`);
   // The actual rank comparison is a prefix scan: once selected ask/bid is
   // reached, subsequent members cannot displace it.
   d.emit(`require(!(!batch_seen_bid && ${pending(d,r)} && ${live(d,r)} && ${side} == 1 && ${u} != seller_b && ${d.le(chosenY,rx)} && ${d.le(ry,chosenX)}), "earlier compatible bid");`);
   d.emit(`batch_seen_ask = batch_seen_ask || ${u} == seller_a; batch_seen_bid = batch_seen_bid || ${u} == seller_b;`);
  }
  mark(end,'seller_a');mark(end,'seller_b');
 }else if(name==='settle_sale'){
  const s=enter(d,'seller'),b=enter(d,'buyer');
  for(let i=0;i<4;i++){const kind=own(d,`frozen[${i}].kind`),seller=own(d,`frozen[${i}].seller`),ref=own(d,`frozen[${i}].listing_nonce`),listing=own(d,`frozen[${s}].nonce`),price=own(d,`frozen[${i}].price`),paid=own(d,`frozen[${i}].paid_a`),before=timeBefore(d,String(i),b);d.emit(`require(!(${pending(d,i)} && ${live(d,i)} && ${kind} == 2 && ${seller} == seller && ${ref} == ${listing} && ${d.eq(price,paid)} && ${fundingValid(d,i,market,c)} && ${before}), "earlier competing buyer");`);}
  mark(end,'seller');mark(end,'buyer');
 }else{
  const u=market==='nftmarket'?(name.startsWith('refund_buy')?'buyer':'seller'):'payer';
  const index=enter(d,u,{ordered:['amm','bondingcurve'].includes(market)});
  if((market==='amm'&&!name.startsWith('refund_')&&name!=='cancel_remove')||(market==='bondingcurve'&&name.startsWith('settle_')))d.emit(`require(${live(d,index)}, "cancelled or expired frozen order");`);
  if(market==='bondingcurve'&&name.startsWith('settle_'))d.emit(`require(self.frozen[${index}].limit_mode == 0, "use limit settlement entry");`);
  if(market==='orderbook'&&name.startsWith('cancel_'))d.emit(`require(!${live(d,index)}, "live order cannot be cancelled by executor");`);
  mark(end,u);
 }
 return code(d)+'\n'+freezeReads(body)+'\n'+code(end).replaceAll('batch_w_','batch_end_w_');
}

// Return a boolean comparison for bounded integer products, without folding a
// 248-bit cross product into a field element.
function digitsLess(d,a,b){let lt='false',eq='true';for(let i=0;i<Math.max(a.length,b.length);i++){const av=a[i]??'0',bv=b[i]??'0',x=d.lessLimb(av,bv,30),n=d.name('lt'),e=d.name('eq');d.emit(`let ${n} = ${x} || (${av} == ${bv} && ${lt}); let ${e} = ${eq} && ${av} == ${bv};`);lt=n;eq=e;}return {lt,eq};}
function beginBook(){return method('begin_batch','batch: Felt, root: Hash, rank: [Felt;4]',d=>{
 d.emit('require(self.batch_phase == 1 && self.batch_id == batch && ctx.checkpoint_id <= self.batch_expiry, "batch not executable");');const h=own(d,'batch_root');for(let i=0;i<4;i++){d.range(`rank[${i}]`,2);d.emit(`require(root[${i}] == ${h}[${i}], "batch commitment mismatch");`);for(let j=0;j<i;j++)d.emit(`require(rank[${i}] != rank[${j}], "rank must be a permutation");`);}
 for(let i=0;i<3;i++){
  const a=`rank[${i}]`,b=`rank[${i+1}]`,ua=own(d,`frozen[${a}].owner`),ub=own(d,`frozen[${b}].owner`),sa=own(d,`frozen[${a}].side`),sb=own(d,`frozen[${b}].side`),ax=own(d,`frozen[${a}].x`),ay=own(d,`frozen[${a}].y`),bx=own(d,`frozen[${b}].x`),by=own(d,`frozen[${b}].y`);
  const left=d.product(ay,bx),right=d.product(by,ax),cmp=digitsLess(d,left,right),tie=timeBefore(d,a,b);
  d.emit(`require(${ub} == 0 || (${ua} != 0 && (${sa} < ${sb} || (${sa} == ${sb} && (${cmp.lt} || (${cmp.eq} && ${tie}))))), "price time ranking");`);
 }
 for(let i=0;i<4;i++)d.emit(`self.batch_rank[${i}] = rank[${i}];`);d.emit('self.batch_phase = 2;');
});}
function finishBatch(market,c){return method('finish_batch','batch: Felt',d=>{
 d.emit('require(self.batch_phase == 2 && self.batch_id == batch, "batch not active");');
 for(let i=0;i<4;i++){
  if(['amm','bondingcurve'].includes(market))d.emit(`require(self.frozen[${i}].owner == 0 || self.batch_done[${i}] == 1, "unprocessed member");`);
  else if(market==='orderbook'){
   const xi=own(d,`frozen[${i}].x`),yi=own(d,`frozen[${i}].y`),si=own(d,`frozen[${i}].side`);
   d.emit(`require(!${pending(d,i)} || (${live(d,i)} && ${fundingValid(d,i,market,c)}), "invalid carry requires refund");`);
   for(let j=0;j<4;j++){const xj=own(d,`frozen[${j}].x`),yj=own(d,`frozen[${j}].y`),sj=own(d,`frozen[${j}].side`);d.emit(`require(!(${pending(d,i)} && ${pending(d,j)} && ${si} != ${sj} && ${d.le(yi,xj)} && ${d.le(yj,xi)}), "compatible pair left unfilled");`);}
  }else{
   // A remaining buy must be refunded, including a losing competing buyer.
   // Only an unmatched live listing can carry without touching its escrow.
   d.emit(`require(!${pending(d,i)} || (self.frozen[${i}].kind == 1 && ${live(d,i)} && ${fundingValid(d,i,market,c)}), "unprocessed purchase or refund");`);
  }
 }
 d.emit('self.batch_phase = 3;');
});}

export function generateBatch(market,config={}){assertDeterministicOrdering(config);
 if(!['amm','orderbook','bondingcurve','nftmarket'].includes(market))throw Error('batch market');
 const c=market==='nftmarket'?{nftId:41,tokenId:42,networkMagic:'1',...config}:{...fixture,networkMagic:'1',...config};
 const base=market==='nftmarket'?generateNft({nftId:c.nftId,tokenId:c.tokenId}):({amm:generateAmm,orderbook:generateBook,bondingcurve:generateCurve}[market])(c);
 const spans=methodSpans(base);const settlements=new Set(market==='amm'?['swap_0','swap_1','refund_swap_0','refund_swap_1','add_liquidity','remove_liquidity','refund_add','cancel_remove']:market==='orderbook'?['match_orders','cancel_0','cancel_1']:market==='bondingcurve'?['settle_buy','settle_sell','refund_buy','refund_sell']:['settle_sale','refund_listing','refund_listing_fee','refund_buy','refund_buy_fee']);
 let source=base;
 for(const s of [...spans].reverse()){
  if((market==='orderbook'&&s.name.startsWith('cancel_'))||(market==='nftmarket'&&s.name.startsWith('refund_'))){source=source.slice(0,s.start)+source.slice(s.end);continue;}
  if((market==='amm'&&['refund_swap_0','refund_swap_1','refund_add','cancel_remove'].includes(s.name))||(market==='bondingcurve'&&s.name.startsWith('refund_'))){source=source.slice(0,s.start)+source.slice(s.end);continue;}
  let body=s.body;
  if(s.name.startsWith('open_'))body+='\nself.order_checkpoint = ctx.checkpoint_id;'+(market==='nftmarket'?'':'self.cancelled = 0;');
  if(market==='bondingcurve'&&s.name.startsWith('open_'))body+='self.limit_mode = 0;';
  if(market==='nftmarket'&&s.name==='open_buy'){
   const prep=new IntegerDsl();prep.emit(`let batch_nft_sent = ctx.users[ctx.user_id].contract_state::<Self::ABI>(${c.nftId}).external_view[1182+35*pool+32]; let batch_nft_claimed = ctx.users[pool].contract_state::<Self::ABI>(${c.nftId}).external_view[1182+35*ctx.user_id+33]; require(batch_nft_sent == batch_nft_claimed, "prepare NFT account and clear previous deposits before buy");`);body=code(prep)+'\n'+body;
  }
  if(s.name==='activate')body='require(self.batch_ready == 0, "already activated");\n'+body+'\nself.batch_ready = 1;';
  if(['initialize','graduate','ack_delivery'].includes(s.name))body='require(self.batch_ready == 1, "batch activation required");\n'+body;
  if(['initialize','graduate','activate','ack_delivery'].includes(s.name))body='require(self.batch_phase == 0 || self.batch_phase == 3 || self.batch_phase == 4, "maintenance blocked by batch");\n'+body;
  if(settlements.has(s.name))body=wrap(body,market,s.name,c);
  source=source.slice(0,s.open+1)+body+source.slice(s.end-1);
 }
 const extraFields=`pub order_checkpoint: Felt, ${market==='nftmarket'?'':'pub cancelled: Felt,'} ${market==='bondingcurve'?'pub limit_mode: Felt,':''}\n${controllerFields(market)}`;
 const marker='}\n#[contract_implementation]';if(source.split(marker).length!==2)throw Error('unexpected generated envelope');source=source.replace(marker,extraFields+'}\n#[contract_implementation]');
 let extra=controller(market,c);if(market==='orderbook')extra=extra.filter(x=>!x.includes('pub fn begin_batch(')).concat(beginBook());
 if(market==='amm')extra.push(...ammRefunds(c));
 if(market==='bondingcurve'){
  for(const name of ['open_buy','open_sell']){const s=spans.find(x=>x.name===name);extra.push(s.signature.replace(`fn ${name}(`,`fn open_limit_${name.slice(5)}(`)+'{'+s.body+'\nself.order_checkpoint = ctx.checkpoint_id; self.cancelled = 0; self.limit_mode = 1;\n}');}
  extra.push(...curveLimits(c));
 }
 if(market!=='nftmarket')extra.push(method('request_cancel','',d=>d.emit('require(self.kind != 0, "no order"); self.cancelled = 1;')));
 extra.push(finishBatch(market,c));source=source.trimEnd().slice(0,-1)+extra.join('\n')+'\n}\n';
 // The deployed layout protocol caps a field's type DAG at 16 nodes. A large
 // FrozenOrder struct exceeds it. Store independent scalar columns, each a
 // four-member array, rather than weakening that preflight or changing Node.
 source=source.trimEnd().slice(0,-1)+fundingRefund(market,c)+'\n'+bootstrapMethod(market,c)+'\n'+recoveryMethods(market,c)+'\n}\n';
 const valueGuards=new Set([...settlements,...(market==='amm'?['batch_refund_swap_0','batch_refund_swap_1','batch_refund_add','batch_cancel_remove']:market==='bondingcurve'?['settle_limit_buy','settle_limit_sell','batch_refund_curve_buy','batch_refund_curve_sell']:[])]);
 for(const span of methodSpans(source).reverse())if(valueGuards.has(span.name)){
  const d=new IntegerDsl();const users=span.name==='match_orders'?['seller_a','seller_b']:span.name==='settle_sale'?['seller','buyer']:market==='nftmarket'?[span.name.startsWith('refund_buy')?'buyer':'seller']:['payer'];
  for(const u of users){fundingUnchanged(d,u,market,c);if(market!=='nftmarket'||!span.name.endsWith('_fee'))d.emit(`require(${fundingValid(d,memberIndex(u),market,c)}, "invalid cutoff funding");`);}
  source=source.slice(0,span.open+1)+code(d)+'\n'+source.slice(span.open+1);
 }
 const columns=['owner',...Object.entries(members(market)).flatMap(([n,w])=>w===2?[n+'_lo',n+'_hi']:[n]),'paid_a_lo','paid_a_hi','paid_b_lo','paid_b_hi','fee_sent','fee_delta',...(market==='nftmarket'?['nft_sent','nft_claimed','nft_matches']:[])];
 source=source.replace('pub frozen: ContractStateArray<4,FrozenOrder>,',columns.map(n=>`pub frozen_${n}: ContractStateArray<4,Felt>,`).join('\n'));
 source=source.replace(/self\.batch_index\[([^\]]+)\]/g,(_,u)=>memberIndex(u));
 source=source.replace(/self\.frozen\[(.*?)\]\.([A-Za-z_]\w*)/g,(_,i,n)=>`self.frozen_${n}[${i}]`);
 if(source.includes('self.frozen['))throw Error('unlowered frozen reference');
 return source;
}
