import {IntegerDsl} from '../amm/u124/math.mjs';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
export const fixture={nftId:41,tokenId:42};
export const NFT={owned:30,outbox:1182,stride:35,sent:32,claimed:33,acked:34};
export function validateConfig(c){
 if(!c||Object.keys(c).some(k=>!['nftId','tokenId'].includes(k)))throw Error('NFT market config fields');
 for(const k of ['nftId','tokenId'])if(!Number.isSafeInteger(c[k])||c[k]<5||c[k]>=16777216)throw Error(`invalid ${k}`);
 if(c.nftId===c.tokenId)throw Error('distinct NFT and FT required');return c;
}
const read=(d,e)=>{const v=d.name('read');d.emit(`let ${v} = ${e};`);return v;};
const own=(d,f)=>read(d,`self.${f}`);
const remote=(d,u,f)=>read(d,`ctx.users[${u}].contract_state::<Self::ABI>(ctx.contract_id).${f}`);
const slot=(d,u,c,o)=>read(d,`ctx.users[${u}].contract_state::<Self::ABI>(${c}).external_view[${o}]`);
const nftCounter=(d,c,u,peer,field)=>slot(d,u,c.nftId,`${NFT.outbox} + ${NFT.stride} * ${peer} + ${NFT[field]}`);
function id(d,u){d.range(u,24);d.emit(`require(${u} != 0 && ${u} != ctx.user_id, "invalid participant");`);}
function method(name,params,body){const d=new IntegerDsl();d.range('ctx.checkpoint_id',32);body(d);
 // These guards do not depend on their own earlier writes. Keep every external
 // read before local writes: the CFC self-external proofs use the call's start
 // user-contract root. Interleaving a local write changes the witness root.
 const writes=[];const checks=d.text().replace(/self\.[A-Za-z_]\w*(?:\[[^\]]+\])?(?:\.[A-Za-z_]\w*)*\s*=(?!=)\s*[^;]+;/g,s=>{writes.push(s);return '';}).replace(/[ \t]+$/gm,'');
 return `#[contract_method]\npub fn ${name}(&mut self, ctx: &mut ChainContext${params?', '+params:''}) {\n${checks}\n${writes.join('\n')}\n}`;}

function pairRead(d,u,c,offset){const lo=slot(d,u,c,offset),hi=slot(d,u,c,`(${offset}) + 1`),v=d.name('pair');d.emit(`let ${v}: [Felt; 2] = [${lo}, ${hi}];`);d.pair(v);return v;}
function fee(d,u){const sent=slot(d,u,0,'3 + 2 * ctx.user_id'),claimed=slot(d,'ctx.user_id',0,`4 + 2 * ${u}`),old=own(d,`settled_fee[${u}]`);for(const v of [sent,claimed,old])d.range(v,62);d.emit(`require(${claimed} == ${old} && ${sent} == ${old} + 1000100000, "fee escrow mismatch"); self.settled_fee[${u}] = ${sent};`);}
function payment(d,c,u,amount,zero=false){const sent=pairRead(d,u,c.tokenId,'33554453 + 4 * ctx.user_id'),claimed=pairRead(d,'ctx.user_id',c.tokenId,`33554455 + 4 * ${u}`),old=own(d,`settled_payment[${u}]`);d.pair(old);d.emit(`require(${d.eq(old,claimed)}, "payment cursor mismatch");`);const delta=d.sub(sent,old);d.emit(`require(${zero?`${delta}[0] == 0 && ${delta}[1] == 0`:d.eq(delta,amount)}, "payment delta mismatch"); self.settled_payment[${u}] = ${sent};`);}
const activated=d=>d.emit('require(self.pool == ctx.user_id, "vault activation required");');
function guard(d,u,kind,n,live=false){activated(d);id(d,u);d.range(n,62);const used=own(d,`consumed[${u}]`),last=remote(d,u,'nonce');d.emit(`require(${remote(d,u,'kind')} == ${kind} && ${remote(d,u,'pool')} == ctx.user_id, "wrong order"); require(${last} == ${n} && ${d.lessLimb(used,n)}, "order consumed");`);if(live){d.emit(`require(${remote(d,u,'cancelled')} == 0 && ctx.checkpoint_id <= ${remote(d,u,'deadline')}, "cancelled or expired");`);}}
const finish=(d,u,n)=>d.emit(`self.consumed[${u}] = ${n};`);
// Terminal outcomes live in the vault partition. User-local cancellation is a
// request; these records distinguish the result after settlement wins the race.
function result(d,c,u,n,kind,{peer='0',amount=null,nftSource=null,nftRecipient=null,ftRecipient=null,feeReturn=false}={}){
 const zero=amount??d.constant(0);d.pair(zero);
 d.emit(`self.results[${u}].nonce = ${n}; self.results[${u}].kind = ${kind}; self.results[${u}].peer = ${peer}; self.results[${u}].quote_amount = ${zero};`);
 const currentFt=ftRecipient?pairRead(d,'ctx.user_id',c.tokenId,`33554453 + 4 * ${ftRecipient}`):d.constant(0);
 const outputFt=ftRecipient?d.add(currentFt,zero):currentFt;
 d.emit(`self.results[${u}].ft_output_cursor = ${outputFt};`);
 if(nftRecipient){const sent=nftCounter(d,c,'ctx.user_id',nftRecipient,'sent');d.range(sent,62);d.emit(`require(${sent} < 4611686018427387903, "NFT delivery nonce overflow"); self.results[${u}].nft_output_nonce = ${sent} + 1;`);}else d.emit(`self.results[${u}].nft_output_nonce = 0;`);
 for(const f of ['token_id','metadata_hash']){const v=Array.from({length:4},(_,i)=>nftSource?remote(d,nftSource,`${f}_${i}`):'0');d.emit(`self.results[${u}].${f} = [${v}];`);}
 if(feeReturn){const sent=slot(d,'ctx.user_id',0,`3 + 2 * ${u}`);d.range(sent,62);const next=d.name('fee_out');d.emit(`let ${next} = ${sent} + 1000100000;`);d.range(next,62);d.emit(`self.results[${u}].fee_output_cursor = ${next};`);}else d.emit(`self.results[${u}].fee_output_cursor = 0;`);
}
function open(d,kind){id(d,'pool');d.emit(`require(${remote(d,'pool','pool')} == pool, "vault activation required");`);d.range('nonce',62);d.range('deadline',32);const last=own(d,'nonce');d.emit(`require(self.kind == 0 && ${d.lessLimb(last,'nonce')} && deadline >= ctx.checkpoint_id, "invalid new order"); self.kind = ${kind}; self.pool = pool; self.nonce = nonce; self.deadline = deadline; self.cancelled = 0;`);}
function listingDeposit(d,c,u,present){const seq=remote(d,u,'nft_sequence'),sent=nftCounter(d,c,u,'ctx.user_id','sent'),claimed=nftCounter(d,c,'ctx.user_id',u,'claimed');for(const n of [seq,sent,claimed])d.range(n,62);d.emit(`require(${claimed} == ${seq} && ${sent} == ${seq}${present?' + 1':''}, "NFT FIFO sequence mismatch");`);
 if(present){const bits=d.range(seq,62),q=d.name('queue');d.emit(`let ${q} = ${bits}[0].to_felt() + 2 * ${bits}[1].to_felt();`);for(let i=0;i<4;i++){const token=slot(d,u,c.nftId,`${NFT.outbox} + ${NFT.stride} * ctx.user_id + 8 * ${q} + ${i}`),meta=slot(d,u,c.nftId,`${NFT.outbox} + ${NFT.stride} * ctx.user_id + 8 * ${q} + ${i+4}`);d.emit(`require(${token} == ${remote(d,u,`token_id_${i}`)} && ${meta} == ${remote(d,u,`metadata_hash_${i}`)}, "NFT identity mismatch");`);}d.emit(`require(${slot(d,'ctx.user_id',c.nftId,'34')} == 0, "escrow scratch slot occupied");`);}}
function listingRefundAllowed(d,u){d.emit(`require(${remote(d,u,'cancelled')} == 1 || ctx.checkpoint_id > ${remote(d,u,'deadline')}, "live listing requires seller cancellation");`);}
function buyRefundAllowed(d){const s=remote(d,'buyer','seller'),ref=remote(d,'buyer','listing_nonce'),consumed=own(d,`consumed[${s}]`);id(d,s);d.range(ref,62);d.range(consumed,62);d.emit(`require(${remote(d,'buyer','cancelled')} == 1 || ctx.checkpoint_id > ${remote(d,'buyer','deadline')} || ${remote(d,s,'kind')} != 1 || ${remote(d,s,'pool')} != ctx.user_id || ${remote(d,s,'nonce')} != ${ref} || ${remote(d,s,'cancelled')} == 1 || ctx.checkpoint_id > ${remote(d,s,'deadline')} || !${d.lessLimb(consumed,ref)}, "live purchase requires buyer cancellation");`);}
export function generate(c){validateConfig(c);const m=[];
 m.push(method('noop','',()=>{}));
 m.push(method('activate','payer: Felt',d=>{
  id(d,'payer');d.emit('require(self.pool == 0 && self.kind == 0 && self.nonce == 0, "vault already used");');
  const sent=slot(d,'payer',0,'3 + 2 * ctx.user_id'),claimed=slot(d,'ctx.user_id',0,'4 + 2 * payer'),balance=slot(d,'ctx.user_id',0,'0');
  d.emit(`require(${sent} == 1000100000 && ${claimed} == ${sent} && ${balance} == ${sent}, "activation fee mismatch");`);
  const paid=pairRead(d,'payer',c.tokenId,'33554453 + 4 * ctx.user_id'),received=pairRead(d,'ctx.user_id',c.tokenId,'33554455 + 4 * payer'),tokenBalance=pairRead(d,'ctx.user_id',c.tokenId,'0');
  for(const p of [paid,received,tokenBalance])d.emit(`require(${p}[0] == 1 && ${p}[1] == 0, "activation token seed mismatch");`);
  d.emit(`require(${slot(d,'payer',c.nftId,'0')} > 0, "activation sponsor NFT state required"); require(${slot(d,'ctx.user_id',c.nftId,'0')} == 0 && ${slot(d,'ctx.user_id',c.nftId,'34')} == 0, "activation NFT state mismatch");`);
  d.emit(`self.settled_fee[payer] = ${sent}; self.settled_payment[payer] = ${paid}; self.pool = ctx.user_id;`);
 }));
 m.push(method('open_listing','pool: Felt, slot_idx: Felt, price: [Felt; 2], deadline: Felt, nonce: Felt',d=>{
  open(d,1);d.range('slot_idx',7);d.nonzero('price');d.emit(`require(${slot(d,'ctx.user_id',c.nftId,`${NFT.owned} + 9 * slot_idx + 4`)} == 1, "seller does not own NFT");`);
  const seq=nftCounter(d,c,'ctx.user_id','pool','sent'),claimed=nftCounter(d,c,'pool','ctx.user_id','claimed');d.range(seq,62);d.emit(`require(${seq} < 4611686018427387903 && ${seq} == ${claimed}, "previous NFT deposit pending"); self.nft_sequence = ${seq}; self.price = price;`);
  const ts=[],ms=[];for(let i=0;i<4;i++){ts.push(slot(d,'ctx.user_id',c.nftId,`${NFT.owned} + 9 * slot_idx + ${i}`));ms.push(slot(d,'ctx.user_id',c.nftId,`${NFT.owned} + 9 * slot_idx + ${i+5}`));}for(let i=0;i<4;i++)d.emit(`self.token_id_${i} = ${ts[i]}; self.metadata_hash_${i} = ${ms[i]};`);
 }));
 m.push(method('open_buy','pool: Felt, seller: Felt, listing_nonce: Felt, price: [Felt; 2], deadline: Felt, nonce: Felt',d=>{
  open(d,2);id(d,'seller');d.emit('require(seller != pool, "seller is escrow");');d.range('listing_nonce',62);d.nonzero('price');const used=remote(d,'pool','consumed[seller]');d.emit(`require(${remote(d,'seller','kind')} == 1 && ${remote(d,'seller','pool')} == pool && ${remote(d,'seller','nonce')} == listing_nonce && ${d.lessLimb(used,'listing_nonce')} && ${remote(d,'seller','cancelled')} == 0 && ctx.checkpoint_id <= ${remote(d,'seller','deadline')}, "listing unavailable");`);const p=remote(d,'seller','price');d.emit(`require(${d.eq('price',p)}, "listing price mismatch"); self.price = price; self.seller = seller; self.listing_nonce = listing_nonce;`);
 }));
 m.push(method('request_cancel','',d=>d.emit('require(self.kind == 1 || self.kind == 2, "no active order"); self.cancelled = 1;')));
 for(const kind of [1,2])m.push(method(kind===1?'close_listing':'close_buy','',d=>{d.emit(`require(self.kind == ${kind}, "wrong order kind");`);const pool=own(d,'pool'),nonce=own(d,'nonce'),used=remote(d,pool,'consumed[ctx.user_id]');d.range(used,62);d.range(nonce,62);d.emit(`require(!${d.lessLimb(used,nonce)}, "order not settled");`);const sent=slot(d,'ctx.user_id',0,`3 + 2 * ${pool}`),claimed=slot(d,pool,0,'4 + 2 * ctx.user_id');d.emit(`require(${sent} == ${claimed}, "fee still pending");`);if(kind===1){d.emit(`require(${nftCounter(d,c,'ctx.user_id',pool,'sent')} == ${nftCounter(d,c,pool,'ctx.user_id','claimed')}, "NFT still pending");`);}else{const a=pairRead(d,'ctx.user_id',c.tokenId,`33554453 + 4 * ${pool}`),b=pairRead(d,pool,c.tokenId,'33554455 + 4 * ctx.user_id');d.emit(`require(${d.eq(a,b)}, "payment still pending");`);}d.emit('self.kind = 0;');}));
 m.push(method('abandon_unfunded','',d=>{d.emit('require(self.kind == 1 || self.kind == 2, "no order");');const pool=own(d,'pool');id(d,pool);d.emit(`require(${slot(d,'ctx.user_id',0,`3 + 2 * ${pool}`)} == ${slot(d,pool,0,'4 + 2 * ctx.user_id')}, "fee pending"); if self.kind == 1 { require(${nftCounter(d,c,'ctx.user_id',pool,'sent')} == self.nft_sequence, "NFT funded"); } else {`);const a=pairRead(d,'ctx.user_id',c.tokenId,`33554453 + 4 * ${pool}`),b=pairRead(d,pool,c.tokenId,'33554455 + 4 * ctx.user_id');d.emit(`require(${d.eq(a,b)}, "payment funded"); } self.kind = 0;`);}));
 m.push(method('settle_sale','seller: Felt, buyer: Felt, price: [Felt; 2], listing_nonce: Felt, buy_nonce: Felt',d=>{
  d.emit('require(seller != buyer, "same participant");');guard(d,'seller',1,'listing_nonce',true);guard(d,'buyer',2,'buy_nonce',true);d.nonzero('price');for(const u of ['seller','buyer']){const p=remote(d,u,'price');d.emit(`require(${d.eq(p,'price')}, "signed price mismatch");`);}d.emit(`require(${remote(d,'buyer','seller')} == seller && ${remote(d,'buyer','listing_nonce')} == listing_nonce, "wrong listing reference");`);listingDeposit(d,c,'seller',true);fee(d,'seller');fee(d,'buyer');payment(d,c,'buyer','price');result(d,c,'seller','listing_nonce',1,{peer:'buyer',amount:'price',nftSource:'seller',ftRecipient:'seller',feeReturn:true});result(d,c,'buyer','buy_nonce',2,{peer:'seller',amount:'price',nftSource:'seller',nftRecipient:'buyer'});finish(d,'seller','listing_nonce');finish(d,'buyer','buy_nonce');
 }));
 for(const present of [true,false])m.push(method(present?'refund_listing':'refund_listing_fee','seller: Felt, listing_nonce: Felt',d=>{guard(d,'seller',1,'listing_nonce');listingRefundAllowed(d,'seller');listingDeposit(d,c,'seller',present);fee(d,'seller');result(d,c,'seller','listing_nonce',present?3:5,{nftSource:present?'seller':null,nftRecipient:present?'seller':null});finish(d,'seller','listing_nonce');}));
 for(const funded of [true,false])m.push(method(funded?'refund_buy':'refund_buy_fee',funded?'buyer: Felt, amount: [Felt; 2], buy_nonce: Felt':'buyer: Felt, buy_nonce: Felt',d=>{guard(d,'buyer',2,'buy_nonce');buyRefundAllowed(d);if(funded)d.nonzero('amount');fee(d,'buyer');payment(d,c,'buyer',funded?'amount':null,!funded);result(d,c,'buyer','buy_nonce',funded?4:6,{amount:funded?'amount':null,ftRecipient:funded?'buyer':null});finish(d,'buyer','buy_nonce');}));
 m.push(method('ack_delivery','payer: Felt',d=>{activated(d);id(d,'payer');const kind=remote(d,'payer','kind'),nonce=remote(d,'payer','nonce'),used=own(d,'consumed[payer]');d.range(nonce,62);d.range(used,62);d.emit(`require(${kind} == 0 || !${d.lessLimb(used,nonce)}, "fee belongs to active order");`);const sent=nftCounter(d,c,'ctx.user_id','payer','sent'),acked=nftCounter(d,c,'ctx.user_id','payer','acked'),claimed=nftCounter(d,c,'payer','ctx.user_id','claimed');for(const v of [sent,acked,claimed])d.range(v,62);d.emit(`require(${claimed} > ${acked} && ${claimed} <= ${sent}, "nothing to acknowledge");`);fee(d,'payer');}));
 return `// Generated NFT Marketplace v3. Bind NFT v3 and U124 FT via build.mjs.\n// external_view is an unused layout view, not a balance or arbitrary-write API.\n#[derive(FeltSized)]\npub struct SettlementResult { pub nonce: Felt, pub kind: Felt, pub peer: Felt, pub quote_amount: [Felt; 2], pub ft_output_cursor: [Felt; 2], pub nft_output_nonce: Felt, pub token_id: Hash, pub metadata_hash: Hash, pub fee_output_cursor: Felt, }\n#[contract]\npub struct NftMarketplace {\npub external_view: ContractStateArray<1073741824, Felt>,\npub consumed: ContractStateArray<16777216, Felt>,\npub settled_fee: ContractStateArray<16777216, Felt>,\npub settled_payment: ContractStateArray<16777216, [Felt; 2]>,\npub kind: Felt, pub pool: Felt, pub nonce: Felt, pub deadline: Felt, pub cancelled: Felt,\npub price: [Felt; 2], pub seller: Felt, pub listing_nonce: Felt, pub nft_sequence: Felt,\n${Array.from({length:4},(_,i)=>`pub token_id_${i}: Felt,`).join(" ")} ${Array.from({length:4},(_,i)=>`pub metadata_hash_${i}: Felt,`).join(" ")}\npub results: ContractStateArray<16777216, SettlementResult>,\n}\n#[contract_implementation]\nimpl NftMarketplace {\n${m.join('\n')}\n}\n`;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const p=new URL('./contract/src/main.psy.rs',import.meta.url),s=generate(fixture);if(process.argv.includes('--check')){if(readFileSync(p,'utf8')!==s)throw Error('generated source drift');}else writeFileSync(p,s);}
