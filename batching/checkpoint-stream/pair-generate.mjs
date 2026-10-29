// Distinct, offline paired-market terminal-refund candidates. Trading stays
// disabled until global cross-page price/time and buyer-frontier proofs exist.
import assert from 'node:assert/strict';
import {recoveryMethods} from '../v2/recovery.mjs';
import {generateBatch,methodSpans} from '../v2/generate.mjs';
import {method,members,remote,own,slot,pairSlot,memberIndex} from '../v2/controller.mjs';
import {context,open,initialize,beginCoverage,setUsers,setOrders,finishCoverage,abortSource,beginOrder,orderState,finishOrder} from './generate.mjs';
const same=(a,b)=>Array.from({length:4},(_,i)=>`${a}[${i}] == ${b}[${i}]`).join(' && ');
const lower=s=>s.replace(/self\.frozen\[(.*?)\]\.([A-Za-z_]\w*)/g,(_,i,n)=>`self.frozen_${n}[${i}]`);
function begin(market,c){return method('begin_stream_settlement','before: Hash, users: [Felt;4], nonces: [Felt;4], count: Felt',d=>{
 d.batchMarket=market;d.range('count',3);d.emit(`require(self.stream_phase == 3 && self.stream_busy == 0 && ${same('before',context('self.stream_',3))}, "exact stream settlement context"); require(ctx.checkpoint_id > self.stream_expiry && count > 0 && count <= 2 && self.stream_settled + count <= self.stream_total && (count == 2 || self.stream_settled + count == self.stream_total), "expired complete refund page only");`);
 const snapshots=[];
 for(let i=0;i<4;i++){
  d.range(`users[${i}]`,24);d.range(`nonces[${i}]`,62);d.emit(`require((count > ${i} && users[${i}] != 0 && users[${i}] != ctx.user_id && nonces[${i}] != 0) || (count <= ${i} && users[${i}] == 0 && nonces[${i}] == 0), "canonical paired stream member");`);for(let j=0;j<i;j++)d.emit(`require(count <= ${i} || users[${i}] != users[${j}], "unique page owner");`);
  const u=d.name('source');d.emit(`let ${u} = (count > ${i}).to_felt()*users[${i}] + (count <= ${i}).to_felt()*users[0];`);const row={};for(const name of Object.keys(members(market)))row[name]=remote(d,u,name);const used=own(d,`consumed[${u}]`);d.range(used,62);d.range(row.nonce,62);d.emit(`require(count <= ${i} || (${row.pool} == ctx.user_id && ${row.kind} != 0 && ${row.nonce} == nonces[${i}] && ${d.lessLimb(used,row.nonce)}), "current source order identity");`);
  const paid=[];for(const [asset,name]of[[market==='nftmarket'?c.tokenId:c.assetA,market==='nftmarket'?'settled_payment':'settled_a'],[market==='nftmarket'?null:c.assetB,'settled_b']]){if(asset===null){paid.push(d.constant(0));continue;}const sent=pairSlot(d,u,asset,'33554453+4*ctx.user_id'),base=own(d,`${name}[${u}]`),claimed=pairSlot(d,'ctx.user_id',asset,`33554455+4*${u}`);d.emit(`require(${d.eq(base,claimed)}, "paired funding cursor drift");`);paid.push(d.sub(sent,base));}
  const sent=slot(d,u,0,'3+2*ctx.user_id'),base=own(d,`settled_fee[${u}]`),claimed=slot(d,'ctx.user_id',0,`4+2*${u}`);for(const x of[sent,base,claimed])d.range(x,62);d.emit(`require(${claimed} == ${base} && (${sent} == ${base} || ${d.lessLimb(base,sent)}), "paired fee cursor drift"); let stream_fee_${i} = ${sent} - ${base};`);d.range(`stream_fee_${i}`,62);
  let nft=[];if(market==='nftmarket'){const ns=slot(d,u,c.nftId,'1182+35*ctx.user_id+32'),nc=slot(d,'ctx.user_id',c.nftId,`1182+35*${u}+33`);d.range(ns,62);const bits=d.range(nc,62),q=d.name('queue');d.emit(`let ${q} = ${bits}[0].to_felt()+2*${bits}[1].to_felt();`);const eq=[];for(let j=0;j<8;j++)eq.push(`${slot(d,u,c.nftId,`1182+35*ctx.user_id+8*${q}+${j}`)} == ${row[j<4?'token_id_'+j:'metadata_hash_'+(j-4)]}`);const matches=d.name('matches');d.emit(`let ${matches} = (${eq.join(' && ')}).to_felt();`);nft=[ns,nc,matches];}
  snapshots.push({row,paid,sent,nft});
 }
 for(let i=0;i<4;i++){const{row,paid,sent,nft}=snapshots[i];d.emit(`self.frozen_owner[${i}] = users[${i}]; self.batch_users[${i}] = users[${i}]; self.batch_done[${i}] = 0; self.batch_rank[${i}] = ${i}; self.stream_bound[${i}] = 0; self.stream_cancelled[${i}] = ${row.cancelled};`);for(const[name,value]of Object.entries(row)){if(members(market)[name]===2)d.emit(`self.frozen_${name}_lo[${i}] = ${value}[0]; self.frozen_${name}_hi[${i}] = ${value}[1];`);else d.emit(`self.frozen_${name}[${i}] = ${name==='cancelled'?'0':value};`);}d.emit(`self.frozen_paid_a_lo[${i}] = ${paid[0]}[0]; self.frozen_paid_a_hi[${i}] = ${paid[0]}[1]; self.frozen_paid_b_lo[${i}] = ${paid[1]}[0]; self.frozen_paid_b_hi[${i}] = ${paid[1]}[1]; self.frozen_fee_sent[${i}] = ${sent}; self.frozen_fee_delta[${i}] = stream_fee_${i};`);if(nft.length)d.emit(`self.frozen_nft_sent[${i}] = ${nft[0]}; self.frozen_nft_claimed[${i}] = ${nft[1]}; self.frozen_nft_matches[${i}] = ${nft[2]};`);}
 d.emit('self.batch_id = self.batch_id + 1; self.batch_count = count; self.batch_phase = 2; self.batch_cutoff = ctx.checkpoint_id; self.batch_expiry = self.stream_expiry; self.stream_busy = 1;');
 });}
function bind(market){return method('bind_stream_member','payer: Felt, nonce: Felt, terms: Hash, consumed: Felt, paid_a: [Felt;2], paid_b: [Felt;2], fee: Felt',d=>{
 const i=memberIndex('payer');for(const[n,b]of[['payer',24],['nonce',62],['consumed',62],['fee',62]])d.range(n,b);d.pair('paid_a');d.pair('paid_b');d.emit(`require(self.stream_phase == 3 && self.stream_busy == 1 && self.frozen_owner[${i}] == payer && self.frozen_nonce[${i}] == nonce && self.stream_bound[${i}] == 0 && self.consumed[payer] == consumed, "unique source binding");`);
 const names=market==='nftmarket'?Object.keys(members(market)):['kind','pool','side','deadline','nonce','x','y','z','order_checkpoint','cancelled'];
 const args=[String(0x46494e414c4f5244n),'self.stream_source','ctx.contract_id','ctx.user_id','payer',...names.flatMap(n=>members(market)[n]===2?[`self.frozen_${n}_lo[${i}]`,`self.frozen_${n}_hi[${i}]`]:[`self.frozen_${n}[${i}]`]),'consumed','paid_a[0]','paid_a[1]','paid_b[0]','paid_b[1]','fee'];
 const h=d.name('terms');d.emit(`let ${h} = psystd::poseidon_hash(${args.join(',')}); require(${same(h,'terms')}, "source order terms changed"); self.stream_bound[${i}] = 1; self.frozen_cancelled[${i}] = 1;`);
 // Current deposits may grow after capture. The frozen source commitment stays
 // immutable; refund_funding returns actual current deltas to the same sender.
 });}
function finish(){return method('finish_stream_settlement','epoch: Felt, start: Felt, count: Felt, remaining: Hash',d=>{
 d.range('start',24);d.range('count',3);d.emit('require(self.stream_phase == 3 && self.stream_busy == 1 && epoch == self.stream_id && start == self.stream_settled && count == self.batch_count && self.batch_phase == 2, "exact paired settlement cursor");');for(let i=0;i<4;i++)d.emit(`require(self.frozen_owner[${i}] == 0 || (self.stream_bound[${i}] == 1 && self.batch_done[${i}] == 1 && self.consumed[self.frozen_owner[${i}]] == self.frozen_nonce[${i}]), "all page refunds terminal");`);d.emit(`self.stream_settled = start + count; self.stream_remaining = remaining; self.stream_busy = 0; self.batch_phase = 3; if(self.stream_settled == self.stream_total) { require(${same('remaining','self.stream_empty')}, "complete original source set"); self.stream_phase = 7; }`);
 });}
function recoverNft(c){return method('recover_nft','payer: Felt, sequence: Felt',d=>{
 d.batchMarket='nftmarket';d.range('payer',24);d.range('sequence',62);
 d.emit('require(self.batch_ready == 1 && (self.batch_phase == 0 || self.batch_phase == 3 || self.batch_phase == 4) && payer != 0 && payer != ctx.user_id, "idle enrolled NFT recovery");');
 const consent=remote(d,'payer','recovery_pool'),kind=remote(d,'payer','kind'),pool=remote(d,'payer','pool'),nonce=remote(d,'payer','nonce'),cancelled=remote(d,'payer','cancelled'),used=own(d,'consumed[payer]');d.range(nonce,62);d.range(used,62);d.range(cancelled,1);
 const active=`(${kind} != 0 && ${pool} == ctx.user_id && ${d.lessLimb(used,nonce)})`;
 d.emit(`require(${consent} == ctx.user_id && (!${active} || ${cancelled} == 1), "sender enrollment and active cancellation required");`);
 const sent=slot(d,'payer',c.nftId,'1182+35*ctx.user_id+32'),claimed=slot(d,'ctx.user_id',c.nftId,'1182+35*payer+33'),scratch=slot(d,'ctx.user_id',c.nftId,'34');d.range(sent,62);d.range(claimed,62);
 d.emit(`require(${claimed} == sequence && ${d.lessLimb(claimed,sent)} && ${scratch} == 0, "NFT recovery FIFO and scratch"); if (${active}) { self.consumed[payer] = ${nonce}; }`);
 });}
// Selected-component recovery never reads an absent, unselected asset contract.
// A second component remains recoverable under the same explicit enrollment.
function recoverFunding(market,c,mask){return method(`recover_funding_${mask}`,'payer: Felt, a: [Felt;2], b: [Felt;2], native_amount: Felt, mask: Felt',d=>{
 d.batchMarket=market;d.range('payer',24);d.pair('a');d.pair('b');d.range('native_amount',62);
 d.emit(`require(self.stream_phase == 0 || self.stream_phase == 7, "maintenance blocked by stream"); require(self.batch_ready == 1 && (self.batch_phase == 0 || self.batch_phase == 3 || self.batch_phase == 4) && payer != 0 && payer != ctx.user_id && mask == ${mask}, "idle selected recovery");`);
 const consent=remote(d,'payer','recovery_pool'),kind=remote(d,'payer','kind'),pool=remote(d,'payer','pool'),nonce=remote(d,'payer','nonce'),cancelled=remote(d,'payer','cancelled'),used=own(d,'consumed[payer]');d.range(nonce,62);d.range(used,62);d.range(cancelled,1);
 const active=`(${kind} != 0 && ${pool} == ctx.user_id && ${d.lessLimb(used,nonce)})`;
 d.emit(`require(${consent} == ctx.user_id && (!${active} || ${cancelled} == 1), "sender enrollment and active cancellation required");`);
 const writes=[];
 for(const [bit,amount,asset,cursor]of [[1,'a',market==='nftmarket'?c.tokenId:c.assetA,market==='nftmarket'?'settled_payment':'settled_a'],[2,'b',c.assetB,'settled_b']]){
  if(!(mask&bit)){d.emit(`require(${amount}[0] == 0 && ${amount}[1] == 0, "unselected recovery amount is zero");`);continue;}
  const sent=pairSlot(d,'payer',asset,'33554453+4*ctx.user_id'),old=own(d,`${cursor}[payer]`),claimed=pairSlot(d,'ctx.user_id',asset,'33554455+4*payer'),delta=d.sub(sent,old);
  d.emit(`require((${amount}[0] != 0 || ${amount}[1] != 0) && ${d.eq(claimed,old)} && ${d.eq(delta,amount)}, "exact selected asset delta");`);writes.push(`self.${cursor}[payer] = ${sent};`);
 }
 if(mask&4){const sent=slot(d,'payer',0,'3+2*ctx.user_id'),claimed=slot(d,'ctx.user_id',0,'4+2*payer'),old=own(d,'settled_fee[payer]');for(const v of[sent,claimed,old])d.range(v,62);d.emit(`require(native_amount != 0 && ${claimed} == ${old} && ${sent} == ${old} + native_amount, "exact selected native delta");`);writes.push(`self.settled_fee[payer] = ${sent};`);}else d.emit('require(native_amount == 0, "unselected native amount is zero");');
 writes.forEach(v=>d.emit(v));d.emit(`if (${active}) { self.consumed[payer] = ${nonce}; }`);
 });}
export function generatePairStream(market,c){assert.ok(['orderbook','nftmarket'].includes(market));let s=generateBatch(market,c);
 // Reuse the reviewed cancellation/enrollment rules of the processor recovery
 // path, without enabling its unrelated claims-first trading transformation.
 const replacement=new Map(methodSpans(recoveryMethods(market,{...c,checkpointGraph:true})).filter(m=>['request_recovery','recover_funding'].includes(m.name)).map(m=>{
  let body=m.body;if(m.name==='recover_funding'){
   const writes=body.match(/if \([^{}]+\) \{ self\.consumed\[payer\] = [^;]+; \}/g);assert.equal(writes?.length,1,'one enrolled nonce terminalization');
   // Preserve all source reads against the call's initial market root.
   body=body.replace(writes[0],'')+'\n'+writes[0];
  }
  return[m.name,m.signature+'{'+body+'}'];
 }));
 replacement.set('recover_funding',method('recover_funding','payer: Felt, a: [Felt;2], b: [Felt;2], native_amount: Felt, mask: Felt',d=>d.emit('self.stream_busy = self.stream_busy; require(false, "use exact selected-component recovery");')));
 if(market==='nftmarket')replacement.set('recover_nft',recoverNft(c));
 for(const m of methodSpans(s).reverse())if(replacement.has(m.name))s=s.slice(0,m.start)+replacement.get(m.name)+s.slice(m.end);

 const fields=`pub stream_phase: Felt, pub stream_aborted: Felt, pub stream_busy: Felt, pub stream_id: Felt, pub stream_source: Felt, pub stream_expiry: Felt, pub stream_total: Felt, pub stream_settled: Felt, pub stream_queue_total: Felt, pub stream_scope: ContractStateArray<4,Felt>, pub stream_facts: ContractStateArray<4,Felt>, pub stream_target_users: ContractStateArray<4,Felt>, pub stream_manifest: ContractStateArray<4,Felt>, pub stream_accounts: Felt, pub stream_last_owner: Felt, pub stream_order_count: Felt, pub stream_recovery_count: Felt, pub stream_users: ContractStateArray<4,Felt>, pub stream_orders: ContractStateArray<4,Felt>, pub stream_recovery: ContractStateArray<4,Felt>, pub stream_empty: ContractStateArray<4,Felt>, pub stream_remaining: ContractStateArray<4,Felt>, pub stream_last: ContractStateArray<7,Felt>, pub stream_bound: ContractStateArray<4,Felt>, pub stream_cancelled: ContractStateArray<4,Felt>,`;
 s=s.replace('pub batch_sponsor: Felt,','pub batch_sponsor: Felt,'+fields);
 for(const m of methodSpans(s).reverse()){
  if(['commit_batch','begin_batch','expire_batch','finish_batch','match_orders','settle_sale'].includes(m.name)){s=s.slice(0,m.open+1)+'self.batch_phase = self.batch_phase; require(false, "global paired trading frontier not installed");'+s.slice(m.end-1);continue;}
  if(['activate','activate_batch_vault','initialize','graduate','recover_funding','recover_nft','ack_delivery'].includes(m.name))s=s.slice(0,m.open+1)+'require(self.stream_phase == 0 || self.stream_phase == 7, "maintenance blocked by stream");'+s.slice(m.open+1);
 }
 const recoveries=Array.from({length:7},(_,i)=>i+1).filter(mask=>market!=='nftmarket'||!(mask&2)).map(mask=>recoverFunding(market,c,mask));
 const extra=[...recoveries,open(),initialize(),beginCoverage(),setUsers(),setOrders(),finishCoverage(),abortSource(),beginOrder(),orderState(),finishOrder(),begin(market,c),bind(market),method('claim_stream_member','payer: Felt, nonce: Felt',d=>d.emit('self.stream_busy = self.stream_busy; require(false, "paired refunds use complete sequential operations");')),finish()];
 s=s.trimEnd().slice(0,-1)+extra.map(lower).join('\n')+'\n}\n';
 for(const m of methodSpans(s).reverse())if(['begin_order_page','set_order_page','finish_order_page'].includes(m.name))s=s.slice(0,m.open+1)+'self.stream_busy = self.stream_busy; require(false, "certified source minimum only");'+s.slice(m.end-1);
 s=s.replace(/self\.stream_(scope|facts|target_users|manifest|users|orders|recovery|empty|remaining)\s*=\s*([^;]+);/g,(_,n,v)=>Array.from({length:4},(_,i)=>`self.stream_${n}[${i}] = ${v.trim()==='[0,0,0,0]'?'0':`${v.trim()}[${i}]`};`).join(' '));return s;
}
