// New global-frontier candidate. Existing refund-only profiles stay immutable.
import assert from 'node:assert/strict';
import {generatePairStream} from './pair-generate.mjs';
import {generateBatch,methodSpans} from '../v2/generate.mjs';
import {context} from './generate.mjs';
import {method,memberIndex} from '../v2/controller.mjs';
const eq=(a,b)=>Array.from({length:4},(_,i)=>`${a}[${i}] == ${b}[${i}]`).join(' && ');
export const frontierContext=()=>`psystd::poseidon_hash(6004517965416974136,${[...Array.from({length:4},(_,i)=>`frontier_stream[${i}]`),...['outer','inner','best'].flatMap(n=>Array.from({length:4},(_,i)=>`self.frontier_${n}[${i}]`)),'self.frontier_cursor','self.frontier_complete'].join(',')})`;
const reset=remaining=>`${['outer','inner'].flatMap(n=>Array.from({length:4},(_,i)=>`self.frontier_${n}[${i}] = ${remaining}[${i}];`)).join(' ')} ${Array.from({length:4},(_,i)=>`self.frontier_best[${i}] = 0;`).join(' ')} self.frontier_cursor = 0; self.frontier_complete = 0; self.stream_carried = 0;`;
export function generatePairTrade(market,c){
 assert.ok(['orderbook','nftmarket'].includes(market));let s=generatePairStream(market,c);
 const base=new Map(methodSpans(generateBatch(market,c)).map(m=>[m.name,m]));
 const replace=new Map();
 for(const m of methodSpans(s)){
  let b=m.body;
  if(['match_orders','settle_sale'].includes(m.name))b=base.get(m.name)?.body??b;
  if(m.name==='begin_stream_settlement'){
   b=b.replace('ctx.checkpoint_id > self.stream_expiry && count > 0', '(ctx.checkpoint_id > self.stream_expiry || (self.frontier_complete == 1 && count == 2)) && count > 0');
  }
  if(m.name==='bind_stream_member'){const i=memberIndex('payer'),old=`self.frozen_cancelled[${i}] = 1;`;assert.ok(b.includes(old));b=b.replace(old,`if (self.stream_cancelled[${i}] != 0 || ctx.checkpoint_id > self.frozen_deadline[${i}] || ctx.checkpoint_id > self.stream_expiry) { self.frozen_cancelled[${i}] = 1; }`);}
  if(m.name==='finish_source_page')b+=` if(self.stream_phase == 3 || self.stream_phase == 7) { ${reset('self.stream_remaining')} }`;
  if(m.name==='finish_stream_settlement')b+=reset('self.stream_remaining');
  replace.set(m.name,m.signature+'{'+b+'}');
 }
 for(const m of methodSpans(s).reverse())s=s.slice(0,m.start)+replace.get(m.name)+s.slice(m.end);
 const fields='pub frontier_outer: ContractStateArray<4,Felt>, pub frontier_inner: ContractStateArray<4,Felt>, pub frontier_best: ContractStateArray<4,Felt>, pub frontier_cursor: Felt, pub frontier_complete: Felt, pub stream_carried: Felt,';
 s=s.replace('pub stream_phase: Felt,',fields+'pub stream_phase: Felt,');
 const advance=method('advance_pair_frontier','before: Hash, outer: Hash, inner: Hash, best: Hash, cursor: Felt, complete: Felt',d=>{
 d.range('cursor',48);d.range('complete',1);
 d.emit(`let frontier_stream = ${context('self.stream_',3)}; let frontier_before = ${frontierContext()}; require(self.stream_phase == 3 && self.stream_busy == 0 && self.frontier_complete == 0 && ctx.checkpoint_id <= self.stream_expiry && ${eq('before','frontier_before')}, "exact live frontier continuation"); require(cursor > self.frontier_cursor && cursor <= self.frontier_cursor + 4, "bounded complete comparison page");`);
 for(const n of ['outer','inner','best'])for(let i=0;i<4;i++)d.emit(`self.frontier_${n}[${i}] = ${n}[${i}];`);
 d.emit('self.frontier_cursor = cursor; self.frontier_complete = complete;');
 });
 const choice=method('bind_pair_choice','before: Hash, best: Hash',d=>{
 d.emit(`let frontier_stream = ${context('self.stream_',3)}; let frontier_before = ${frontierContext()}; require(self.stream_phase == 3 && self.stream_busy == 1 && self.frontier_complete == 1 && ctx.checkpoint_id <= self.stream_expiry && ${eq('before','frontier_before')} && ${eq('best','self.frontier_best')}, "actual completed frontier winner");`);
 });
 const carry=method('finish_pair_carry' ,'before: Hash, count: Felt',d=>{
 d.range('count',24);d.emit(`let frontier_stream = ${context('self.stream_',3)}; let frontier_before = ${frontierContext()}; require(self.stream_phase == 3 && self.stream_busy == 0 && self.frontier_complete == 1 && ctx.checkpoint_id <= self.stream_expiry && ${eq('before','frontier_before')} && self.frontier_best[0] == 0 && self.frontier_best[1] == 0 && self.frontier_best[2] == 0 && self.frontier_best[3] == 0 && count == self.stream_total - self.stream_settled && count > 0, "complete no-match carry only"); self.stream_carried = count; self.stream_phase = 7;`);
 });
 return s.trimEnd().slice(0,-1)+advance+'\n'+choice+'\n'+carry+'\n}\n';
}
