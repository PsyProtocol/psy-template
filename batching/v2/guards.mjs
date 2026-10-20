import {fundingUnchanged,fundingValid} from './funding.mjs';
import {method,own,read,slot,pairSlot,enter,mark,live,memberIndex} from './controller.mjs';
const F=1000100000n;
const view=(d,c)=>{d.batchMarket=c.market;};
const frozen=(d,i,f)=>own(d,`frozen[${i}].${f}`);
function order(d,i,kind){const n=frozen(d,i,'nonce'),used=own(d,'consumed[payer]');d.range('nonce',62);d.emit(`require(${n} == nonce && ${d.lessLimb(used,'nonce')} && self.frozen[${i}].kind == ${kind}, "wrong frozen order");`);}
function pay(d,c,i,which,amount,writes){
 const asset=which==='a'?(c.market==='nftmarket'?c.tokenId:c.assetA):c.assetB;
 const cursor=c.market==='nftmarket'?'settled_payment':`settled_${which}`;
 const sent=pairSlot(d,'payer',asset,'33554453+4*ctx.user_id'),old=own(d,`${cursor}[payer]`),claimed=pairSlot(d,'ctx.user_id',asset,'33554455+4*payer');
 const paid=frozen(d,i,`paid_${which}`),delta=d.sub(sent,old);
 d.emit(`require(${d.eq(old,claimed)} && ${d.eq(delta,paid)} && ${d.eq(paid,amount)}, "frozen funding mismatch");`);
 writes.push(`self.${cursor}[payer] = ${sent};`);
}
function fee(d,writes){const sent=slot(d,'payer',0,'3+2*ctx.user_id'),old=own(d,'settled_fee[payer]'),claimed=slot(d,'ctx.user_id',0,'4+2*payer');for(const x of[sent,old,claimed])d.range(x,62);d.emit(`require(${claimed} == ${old} && ${sent} == ${old} + ${F}, "fee funding mismatch");`);writes.push(`self.settled_fee[payer] = ${sent};`);}
function complete(d,writes){for(const s of writes)d.emit(s);d.emit('self.consumed[payer] = nonce;');mark(d,'payer');}
function swapQuote(d,amount,ri,ro,out){
 const eff=d.mul(d.digits(amount),['9970']),den=d.addDigits(d.mul(d.digits(ri),['10000']),eff),num=d.mul(eff,d.digits(ro));d.floor(out,num,den,'refund exact quote');
}
export function ammRefunds(c){const methods=[];
 for(const side of[0,1])methods.push(method(`batch_refund_swap_${side}`,'payer: Felt, amount: [Felt;2], quote: [Felt;2], nonce: Felt',d=>{
  view(d,{...c,market:'amm'});const i=enter(d,'payer',{ordered:true});order(d,i,1);d.nonzero('amount');d.pair('quote');
  const x=frozen(d,i,'x'),min=frozen(d,i,'y'),ri=own(d,side===0?'reserve_a':'reserve_b'),ro=own(d,side===0?'reserve_b':'reserve_a');
  d.emit(`require(self.frozen[${i}].side == ${side} && ${d.eq(x,'amount')}, "refund order mismatch");`);
  // Denominator is nonzero even for an empty pool because amount > 0.
  swapQuote(d,'amount',ri,ro,'quote');const acceptable=d.le(min,'quote');
  d.emit(`require(${live(d,i)} && (!${acceptable} || (${ri}[0] == 0 && ${ri}[1] == 0) || (${ro}[0] == 0 && ${ro}[1] == 0)), "executable swap cannot be refunded");`);
  const w=[];fee(d,w);pay(d,{...c,market:'amm'},i,side===0?'a':'b','amount',w);complete(d,w);
 }));
 methods.push(method('batch_refund_add','payer: Felt, a: [Felt;2], b: [Felt;2], quote: [Felt;2], nonce: Felt',d=>{
  view(d,{...c,market:'amm'});const i=enter(d,'payer',{ordered:true});order(d,i,2);for(const x of['a','b'])d.nonzero(x);d.pair('quote');const a=frozen(d,i,'x'),b=frozen(d,i,'y'),min=frozen(d,i,'z'),ra=own(d,'reserve_a'),rb=own(d,'reserve_b'),total=own(d,'total_shares');d.emit(`require(${d.eq(a,'a')} && ${d.eq(b,'b')}, "refund deposit mismatch");`);
  // Quote is gross sqrt for an initial pool, and minted shares otherwise.
  const initial=d.name('initial');d.emit(`let ${initial} = ${total}[0] == 0 && ${total}[1] == 0; if ${initial} {`);
  const prod=d.product('a','b');d.cmpDigits(d.product('quote','quote'),prod,'<=','sqrt too high');const next=d.addDigits(d.digits('quote'),['1']);d.cmpDigits(prod,d.mul(next,next),'<','sqrt too low');d.emit('}');
  const required=d.addDigits(d.digits(min),['1000']),initialOk=digitsLe(d,required,d.digits('quote'));
  const p=d.product('a',rb),q=d.product('b',ra);const equal=digitsEqual(d,p,q);d.emit(`if !${initial} && ${equal} {`);d.floor('quote',d.product('a',total),d.digits(ra),'add share quote');d.emit(`} require(${live(d,i)} && ((${initial} && !${initialOk}) || (!${initial} && (!(${equal}) || !${d.le(min,'quote')} || (quote[0] == 0 && quote[1] == 0)))), "executable LP deposit cannot be refunded");`);
  const w=[];fee(d,w);pay(d,{...c,market:'amm'},i,'a','a',w);pay(d,{...c,market:'amm'},i,'b','b',w);complete(d,w);
 }));
 methods.push(method('batch_cancel_remove','payer: Felt, a: [Felt;2], b: [Felt;2], nonce: Felt',d=>{
  view(d,{...c,market:'amm'});const i=enter(d,'payer',{ordered:true});order(d,i,3);d.pair('a');d.pair('b');const burn=frozen(d,i,'x'),ma=frozen(d,i,'y'),mb=frozen(d,i,'z'),shares=own(d,'shares[payer]'),total=own(d,'total_shares'),ra=own(d,'reserve_a'),rb=own(d,'reserve_b');const needed=d.addDigits(d.digits(burn),['1000']),enough=digitsLe(d,needed,d.digits(total)),owned=d.le(burn,shares);d.emit(`if ${enough} && ${owned} {`);d.floor('a',d.product(burn,ra),d.digits(total),'withdraw quote a');d.floor('b',d.product(burn,rb),d.digits(total),'withdraw quote b');d.emit(`} require(${live(d,i)} && (!(${enough}) || !(${owned}) || !${d.le(ma,'a')} || !${d.le(mb,'b')} || (a[0] == 0 && a[1] == 0) || (b[0] == 0 && b[1] == 0)), "executable withdrawal cannot be cancelled");`);const w=[];fee(d,w);complete(d,w);
 }));return methods;
}
function digitsEqual(d,a,b){return Array.from({length:Math.max(a.length,b.length)},(_,i)=>`(${a[i]??'0'} == ${b[i]??'0'})`).join(' && ');}
function digitsLe(d,a,b){let lt='false',eq='true';for(let i=0;i<Math.max(a.length,b.length);i++){const av=a[i]??'0',bv=b[i]??'0',bit=d.lessLimb(av,bv,30),l=d.name('less'),e=d.name('equal');d.emit(`let ${l} = ${bit} || (${av} == ${bv} && ${lt}); let ${e} = ${eq} && ${av} == ${bv};`);lt=l;eq=e;}return `(${lt} || ${eq})`;}
function curvePrice(d,c,lots,sold,buy){const slope=d.name('slope');d.range(lots,20);d.range(sold,20);d.emit(`let ${slope} = ${lots} * (2 * ${sold} ${buy?'+':'-'} ${lots} - 1) / 2;`);d.range(slope,41);return d.addDigits(d.mul(d.digits(d.constant(c.base)),[lots]),d.mul(d.digits(d.constant(c.step)),d.scalar(slope,41)));}
function tokenAmount(d,c,lots,amount){d.nonzero(amount);d.cmpDigits(d.mul(d.digits(d.constant(c.unit)),[lots]),d.digits(amount),'==','curve token amount');}
export function curveLimits(c){const out=[];
 for(const buy of[true,false])out.push(method(buy?'settle_limit_buy':'settle_limit_sell',`payer: Felt, lots: Felt, quoted: [Felt;2], token_amount: [Felt;2]${buy?', change: [Felt;2]':''}, nonce: Felt`,d=>{
  const config={...c,market:'bondingcurve'};view(d,config);const i=enter(d,'payer',{ordered:true});order(d,i,buy?1:2);d.emit(`require(self.phase == 1 && self.frozen[${i}].limit_mode == 1 && ${live(d,i)}, "limit order not executable");`);const sold=own(d,'sold_lots'),limit=frozen(d,i,'x');d.range(sold,20);d.range('lots',20);d.emit(`require(lots != 0 && self.frozen[${i}].lots == lots && ${buy?`${sold} + lots <= ${c.cap}`:`lots <= ${sold}`}, "curve capacity");`);d.nonzero('quoted');tokenAmount(d,c,'lots','token_amount');d.cmpDigits(curvePrice(d,c,'lots',sold,buy),d.digits('quoted'),'==','curve exact quote');d.emit(`require(${buy?d.le('quoted',limit):d.le(limit,'quoted')}, "curve limit price");`);
  if(buy){const sum=d.add('quoted','change');d.emit(`require(${d.eq(sum,limit)}, "curve change mismatch");`);}
  const reserve=own(d,'quote_reserve'),next=buy?d.add(reserve,'quoted'):d.sub(reserve,'quoted'),w=[];fee(d,w);pay(d,config,i,buy?'b':'a',buy?limit:'token_amount',w);w.push(`self.sold_lots = ${sold} ${buy?'+':'-'} lots; self.quote_reserve = ${next};`);complete(d,w);
 }));
 for(const buy of[true,false])out.push(method(buy?'batch_refund_curve_buy':'batch_refund_curve_sell',`payer: Felt, lots: Felt, amount: [Felt;2], quote: [Felt;2], nonce: Felt`,d=>{
  const config={...c,market:'bondingcurve'};view(d,config);const i=enter(d,'payer',{ordered:true});order(d,i,buy?1:2);d.range('lots',20);d.nonzero('amount');d.pair('quote');d.emit(`require(lots > 0 && lots <= ${c.cap} && self.frozen[${i}].lots == lots && (self.phase == 1 || self.phase == 2), "curve refund lots");`);
  const sold=own(d,'sold_lots');d.range(sold,20);const safe=d.name('safe_sold'),capacity=d.name('capacity');if(buy)d.emit(`let ${capacity} = ${sold}+lots <= ${c.cap}; let ${safe} = ${sold} * ${capacity}.to_felt();`);else d.emit(`let ${capacity} = lots <= ${sold}; let ${safe} = ${sold} * ${capacity}.to_felt() + lots * (1 - ${capacity}.to_felt());`);
  d.cmpDigits(curvePrice(d,c,'lots',safe,buy),d.digits('quote'),'==','refund price witness');const limit=frozen(d,i,'x');
  if(buy)d.emit(`require(${d.eq(limit,'amount')}, "refund quote funding");`);else tokenAmount(d,c,'lots','amount');
  const cap=buy?`${sold}+lots <= ${c.cap}`:`lots <= ${sold}`,exact=`self.frozen[${i}].limit_mode == 0 && self.frozen[${i}].expected_sold == ${sold} && ${d.eq(limit,'quote')}`,bounded=`self.frozen[${i}].limit_mode == 1 && ${buy?d.le('quote',limit):d.le(limit,'quote')}`;
  d.emit(`require(${live(d,i)} && (self.phase == 2 || !(${cap}) || !((${exact}) || (${bounded}))), "executable curve order cannot be refunded");`);
  const w=[];fee(d,w);pay(d,config,i,buy?'b':'a','amount',w);complete(d,w);
 }));return out;
}
export function fundingRefund(market,c){return method('refund_funding','payer: Felt, a: [Felt;2], b: [Felt;2], native_amount: Felt, nonce: Felt, mask: Felt',d=>{
 const config={...c,market};view(d,config);const i=enter(d,'payer',{ordered:['amm','bondingcurve'].includes(market)});const kind=frozen(d,i,'kind');d.emit(`require(self.frozen[${i}].nonce == nonce && ${d.lessLimb(own(d,'consumed[payer]'),'nonce')}, "refund nonce");`);d.pair('a');d.pair('b');d.range('native_amount',62);d.range('mask',market==='nftmarket'?4:3);
 const pa=frozen(d,i,'paid_a'),pb=frozen(d,i,'paid_b'),fd=frozen(d,i,'fee_delta');d.emit(`require(${d.eq(pa,'a')} && ${d.eq(pb,'b')} && native_amount == ${fd}, "refund frozen funding");`);
 const hasA=d.name('has_a'),hasB=d.name('has_b'),hasN=d.name('has_native');d.emit(`let ${hasA} = a[0] != 0 || a[1] != 0; let ${hasB} = b[0] != 0 || b[1] != 0; let ${hasN} = native_amount != 0; `);
 let valid,hasNft='false',actualNft=[];
 if(market==='nftmarket'){
  fundingUnchanged(d,'payer',market,c);const price=frozen(d,i,'price'),sent=frozen(d,i,'nft_sent'),claimed=frozen(d,i,'nft_claimed');hasNft=d.name('has_nft');d.emit(`let ${hasNft} = ${d.lessLimb(claimed,sent)}; require((${kind} == 1 || ${kind} == 2) && b[0] == 0 && b[1] == 0 && (${sent} == ${claimed} || ${hasNft}), "NFT refund funding");`);
  const isBuy=d.name('buy'),seller=d.name('seller');d.emit(`let ${isBuy} = ${kind} == 2; let ${seller} = ${isBuy}.to_felt()*self.frozen[${i}].seller + (1 - ${isBuy}.to_felt())*payer;`);const si=memberIndex(seller),sn=frozen(d,si,'nonce'),ref=frozen(d,i,'listing_nonce'),used=own(d,`consumed[${seller}]`);d.range(sn,62);d.range(used,62);const sellerReady=`(self.frozen[${si}].kind == 1 && self.frozen[${si}].pool == ctx.user_id && ${sn} == ${ref} && ${d.lessLimb(used,sn)} && ${live(d,si)} && ${fundingValid(d,si,'nftmarket',c)})`;
  valid=`((${kind} == 2 && ${d.eq(pa,price)} && !${hasNft} && ${sellerReady}) || (${kind} == 1 && a[0] == 0 && a[1] == 0 && ${sent} == ${claimed} + 1 && self.frozen[${i}].nft_matches == 1)) && ${fd} == ${F}`;
  const bits=d.range(claimed,62),q=d.name('queue');d.emit(`let ${q} = ${bits}[0].to_felt() + 2*${bits}[1].to_felt(); require(!${hasNft} || ${slot(d,'ctx.user_id',c.nftId,'34')} == 0, "NFT refund scratch");`);
  for(let n=0;n<8;n++)actualNft.push(slot(d,'payer',c.nftId,`1182+35*ctx.user_id+8*${q}+${n}`));
 }
 else{const x=frozen(d,i,'x'),side=frozen(d,i,'side'),zero=d.constant(0);
  if(market==='amm')valid=`(${kind} == 1 && ((${side} == 0 && ${d.eq(pa,x)} && ${d.eq(pb,zero)}) || (${side} == 1 && ${d.eq(pb,x)} && ${d.eq(pa,zero)}))) || (${kind} == 2 && ${d.eq(pa,x)} && ${d.eq(pb,frozen(d,i,'y'))}) || (${kind} == 3 && ${d.eq(pa,zero)} && ${d.eq(pb,zero)})`;
  else if(market==='orderbook')valid=`${kind} == 1 && ((${side} == 0 && ${d.eq(pa,x)} && ${d.eq(pb,zero)}) || (${side} == 1 && ${d.eq(pb,x)} && ${d.eq(pa,zero)}))`;
  else{const lots=frozen(d,i,'lots'),quantity=d.mul(d.digits(d.constant(c.unit)),[lots]);valid=`(${kind} == 1 && ${d.eq(pb,x)} && ${d.eq(pa,zero)}) || (${kind} == 2 && (${digitsEqual(d,d.digits(pa),quantity)}) && ${d.eq(pb,zero)})`;}
  valid=`((${valid}) && ${fd} == ${F})`;
 }
 d.emit(`require(mask == ${hasA}.to_felt() + 2*${hasB}.to_felt() + 4*${hasN}.to_felt()${market==='nftmarket'?` + 8*${hasNft}.to_felt()`:""}, "refund transfer mask");`);
 d.emit(`require(!${live(d,i)} || !(${valid}), "valid order needs trade, quote refund, or carry");`);
 const w=[];const sent=slot(d,'payer',0,'3+2*ctx.user_id'),old=own(d,'settled_fee[payer]'),claimed=slot(d,'ctx.user_id',0,'4+2*payer');for(const v of[sent,old,claimed])d.range(v,62);d.emit(`require(${claimed} == ${old} && ${sent} == self.frozen[${i}].fee_sent && ${sent} == ${old} + native_amount, "native refund cursor");`);w.push(`self.settled_fee[payer] = ${sent};`);pay(d,config,i,'a','a',w);if(market!=='nftmarket')pay(d,config,i,'b','b',w);
 if(market==='nftmarket'){const output=pairSlot(d,'ctx.user_id',c.tokenId,'33554453+4*payer'),end=d.add(output,'a');w.push(`self.results[payer].nonce = nonce; self.results[payer].kind = 4; self.results[payer].peer = 0; self.results[payer].quote_amount = a; self.results[payer].ft_output_cursor = ${end}; self.results[payer].nft_output_nonce = 0; self.results[payer].token_id = [0,0,0,0]; self.results[payer].metadata_hash = [0,0,0,0];`);const nativeOut=slot(d,'ctx.user_id',0,'3+2*payer');w.push(`self.results[payer].fee_output_cursor = ${nativeOut} + native_amount;`);}
 if(market==='nftmarket'){
  const current=slot(d,'ctx.user_id',c.nftId,'1182+35*payer+32');d.range(current,62);const listing=d.name('listing');d.emit(`let ${listing} = ${kind} == 1;`);w.push(`self.results[payer].kind = 3*${hasNft}.to_felt() + (1 - ${hasNft}.to_felt()) * (4*${hasA}.to_felt() + (1 - ${hasA}.to_felt()) * (6 - ${listing}.to_felt())); self.results[payer].nft_output_nonce = ${hasNft}.to_felt() * (${current} + 1);`);
  for(const [offset,n] of [[0,'token_id'],[4,'metadata_hash']])w.push(`self.results[payer].${n} = [${Array.from({length:4},(_,j)=>`${hasNft}.to_felt() * ${actualNft[offset+j]}`).join(',')}];`);
 }
 complete(d,w);
});}
