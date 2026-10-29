// New candidate only. No existing deterministic contract or queue is rewritten.
import assert from 'node:assert/strict';
import {generateStream,context,beginOrder,orderState,finishOrder} from './generate.mjs';
import {methodSpans} from '../v2/generate.mjs';
const wrap=(base,seed,refund)=>`psystd::poseidon_hash(91647816651058,${base}[0],${base}[1],${base}[2],${base}[3],self.stream_source+1,${seed.join(',')},${refund})`;
const replaceBody=(s,name,body)=>{const m=methodSpans(s).find(m=>m.name===name);assert.ok(m,name);return s.slice(0,m.open+1)+body+s.slice(m.end-1);};
export function generateRandomStream(market,c,{window=256}={}){
 assert.ok(Number.isSafeInteger(window)&&window>=32&&window<=65536);
 let s=generateStream(market,c);
 s=s.replace('pub stream_phase: Felt,','pub stream_seed: ContractStateArray<4,Felt>, pub stream_seed_installed: Felt, pub stream_refund_only: Felt, pub stream_phase: Felt,');
 s=replaceBody(s,'abort_source_stream','self.stream_busy = self.stream_busy; require(false,"sealed random source must finish coverage and disposition; no reopen");');
 let m=methodSpans(s).find(m=>m.name==='open_source_stream');
 s=replaceBody(s,m.name,m.body.replace('expiry == source + 32',`expiry == source + ${window}`)+' self.stream_seed_installed=0; self.stream_refund_only = 0; self.stream_seed[0]=0; self.stream_seed[1]=0; self.stream_seed[2]=0; self.stream_seed[3]=0;');
 m=methodSpans(s).find(m=>m.name==='finish_source_page');
 s=replaceBody(s,m.name,m.body.replace('self.stream_remaining[0] = self.stream_orders[0];','self.stream_remaining[0] = 0;')
  .replace(/self\.stream_remaining\[\d\] = self\.stream_orders\[\d\];/g,'')
  .replace('self.stream_queue_total = self.stream_order_count; self.stream_phase = 3;',
   'self.stream_queue_total = 0; self.stream_phase = 2; self.stream_remaining[0]=self.stream_empty[0]; self.stream_remaining[1]=self.stream_empty[1]; self.stream_remaining[2]=self.stream_empty[2]; self.stream_remaining[3]=self.stream_empty[3]; self.stream_empty[0]=self.stream_orders[0]; self.stream_empty[1]=self.stream_orders[1]; self.stream_empty[2]=self.stream_orders[2]; self.stream_empty[3]=self.stream_orders[3];'));
 // The old source-coverage context is preserved until it closes. All order and
 // settlement contexts additionally bind the one installed seed and exit mode.
 const seed=Array.from({length:4},(_,i)=>`self.stream_seed[${i}]`);
 const base2=context('self.stream_',2),base3=context('self.stream_',3);
 const before=()=>Array.from({length:4},(_,i)=>`before[${i}] == ${wrap(base2,seed,'self.stream_refund_only')}[${i}]`).join(' && ');
 for(const name of ['begin_order_page','set_order_page','finish_order_page']){
  const source={begin_order_page:beginOrder,set_order_page:orderState,finish_order_page:finishOrder}[name]();
  const body=methodSpans('impl X {'+source+'}')[0].body;
  s=replaceBody(s,name,body);
 }
 s=s.replaceAll(base2,wrap(base2,seed,'self.stream_refund_only')).replaceAll(base3,wrap(base3,seed,'self.stream_refund_only'));
 // Extend only the new ordering entry's ABI. The intrinsic is lowered by the
 // owned compiler into an authenticated checkpoint-stat read, never removed.
 m=methodSpans(s).find(m=>m.name==='begin_order_page');
 const body=`require(self.stream_phase == 2 && self.stream_busy == 0 && (self.stream_refund_only == 0 || ctx.checkpoint_id > self.stream_expiry) && ${before()}, "fixed random ordering continuation"); require(draw == self.stream_source + 1 && draw <= ctx.checkpoint_id, "one future draw only"); require(false,"stream_seed_intrinsic"); if (self.stream_seed_installed == 0) { require(self.stream_queue_total == 0 && self.stream_refund_only == 0,"first draw only"); self.stream_seed_installed=1; self.stream_seed[0]=seed[0]; self.stream_seed[1]=seed[1]; self.stream_seed[2]=seed[2]; self.stream_seed[3]=seed[3]; } else { require(seed[0]==self.stream_seed[0] && seed[1]==self.stream_seed[1] && seed[2]==self.stream_seed[2] && seed[3]==self.stream_seed[3],"no seed replacement"); } self.stream_busy=1;`;
 s=replaceBody(s,m.name,body).replace('fn begin_order_page(&mut self, ctx: &mut ChainContext, before: Hash)', 'fn begin_order_page(&mut self, ctx: &mut ChainContext, before: Hash, draw: Felt, seed: Hash)');
 assert.ok(s.includes('fn begin_order_page(&mut self, ctx: &mut ChainContext, before: Hash, draw: Felt, seed: Hash)'), 'extended random ABI');
 // Every accepted source member is refunded in canonical source order only
 // when no ordering page ever committed. This is a declared refund-only exit,
 // never deterministic trading or another draw after an unfavorable result.
 const expire=`\n #[contract_method]\n pub fn expire_unseeded_stream(&mut self, ctx: &mut ChainContext, before: Hash) { require(self.stream_phase == 2 && self.stream_busy == 0 && self.stream_queue_total == 0 && self.stream_seed_installed == 0 && ctx.checkpoint_id > self.stream_expiry && ${before()},"only unseeded accepted stream can expire"); self.stream_refund_only=1; self.stream_queue_total=self.stream_total; self.stream_remaining[0]=self.stream_manifest[0]; self.stream_remaining[1]=self.stream_manifest[1]; self.stream_remaining[2]=self.stream_manifest[2]; self.stream_remaining[3]=self.stream_manifest[3]; self.stream_empty[0]=self.stream_empty[0]; self.stream_phase=3; }\n`;
 // stream_empty is the final-empty root required by settlement completion.
 // Supply it from the exact key, rather than leaving the source manifest there.
 const fixed=expire.replace('before: Hash)', 'before: Hash, empty: Hash)')
  .replace('self.stream_empty[0]=self.stream_empty[0];',Array.from({length:4},(_,i)=>`self.stream_empty[${i}]=empty[${i}];`).join(' '));
 const restart=`\n #[contract_method]\n pub fn restart_expired_random_order(&mut self, ctx: &mut ChainContext, before: Hash, empty: Hash) { require(self.stream_phase == 2 && self.stream_busy == 0 && self.stream_seed_installed == 1 && self.stream_queue_total > 0 && ctx.checkpoint_id > self.stream_expiry && ${before()},"same-seed refund recovery only"); self.stream_refund_only=1; self.stream_queue_total=0; ${Array.from({length:4},(_,i)=>`self.stream_empty[${i}]=self.stream_manifest[${i}]; self.stream_remaining[${i}]=empty[${i}];`).join(' ')} ${Array.from({length:7},(_,i)=>`self.stream_last[${i}]=0;`).join(' ')} }\n`;
 s=s.trimEnd().slice(0,-1)+fixed+restart+'}\n';
 s=s.replace(/self\.stream_(scope|facts|target_users|manifest|users|orders|recovery|empty|remaining)\s*=\s*([^;]+);/g,(_,name,value)=>Array.from({length:4},(_,i)=>`self.stream_${name}[${i}] = ${value.trim()}[${i}];`).join(' '));
 return s;
}
