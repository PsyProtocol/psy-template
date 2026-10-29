// Distinct v9 candidate: triangular completeness and authenticated early exits.
import assert from 'node:assert/strict';
import {generatePairTrade,frontierContext} from './pair-trade-generate.mjs';
import {methodSpans} from '../v2/generate.mjs';
import {method,memberIndex} from '../v2/controller.mjs';
import {fundingValid} from '../v2/funding.mjs';
import {context} from './generate.mjs';
const same=(a,b)=>Array.from({length:4},(_,i)=>`${a}[${i}] == ${b}[${i}]`).join(' && ');
export function generatePairOptimized(market,c){
 let source=generatePairTrade(market,c);
 for(const m of methodSpans(source).reverse()){
  let body=m.body;
  if(m.name==='advance_pair_frontier'){
   const old='cursor > self.frontier_cursor && cursor <= self.frontier_cursor + 4';
   assert.ok(body.includes(old));body=body.replace(old,'(cursor > self.frontier_cursor || (cursor == 0 && self.frontier_cursor == 0 && complete == 1)) && cursor <= self.frontier_cursor + 4');
  }
  if(m.name==='begin_stream_settlement'){
   const old='(ctx.checkpoint_id > self.stream_expiry || (self.frontier_complete == 1 && count == 2))';
   assert.ok(body.includes(old));body=body.replace(old,'(ctx.checkpoint_id > self.stream_expiry || self.frontier_complete == 1)');
   const full='(count == 2 || self.stream_settled + count == self.stream_total)';
   assert.ok(body.includes(full));body=body.replace(full,'(count == 2 || self.stream_settled + count == self.stream_total || self.frontier_complete == 1)');
  }
  source=source.slice(0,m.open+1)+body+source.slice(m.end-1);
 }
 let rejection=method('bind_pair_rejection','before: Hash, best: Hash, payer: Felt',d=>{
  d.batchMarket=market;d.range('payer',24);const i=memberIndex('payer');
  d.emit(`let frontier_stream = ${context('self.stream_',3)}; let frontier_before = ${frontierContext()}; require(self.stream_phase == 3 && self.stream_busy == 1 && self.frontier_complete == 1 && ctx.checkpoint_id <= self.stream_expiry && ${same('before','frontier_before')} && ${same('best','self.frontier_best')}, "exact completed rejection certificate");`);
  d.emit(`require(self.batch_count == 1 && self.frozen_owner[${i}] == payer && self.stream_bound[${i}] == 1 && (self.frozen_cancelled[${i}] == 1 || !${fundingValid(d,i,market,c)}), "current authenticated invalid winner only");`);
 });
 rejection=rejection.replace(/self\.frozen\[(.*?)\]\.([A-Za-z_]\w*)/g,(_,i,n)=>`self.frozen_${n}[${i}]`);
 return source.trimEnd().slice(0,-1)+rejection+'\n}\n';
}
