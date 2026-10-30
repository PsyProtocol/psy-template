// New fixed delayed draw. Existing candidates/queues and rank-v1 hashes stay intact.
import assert from 'node:assert/strict';
import {generateMinimumStream} from './minimum-generate.mjs';
import {method} from '../v2/controller.mjs';
import {methodSpans} from '../v2/generate.mjs';
export const DRAW_DELAY=32;
export function generateSealedMinimumStream(market,c,constants){
 let s=generateMinimumStream(market,c,constants);
 s=s.replace('pub minimum_root:','pub stream_seal_checkpoint: Felt, pub minimum_root:');
 const replace=(name,fn)=>{const m=methodSpans(s).find(x=>x.name===name);assert.ok(m);s=s.slice(0,m.open+1)+fn(m.body)+s.slice(m.end-1);};
 replace('open_source_stream',b=>b+' self.stream_seal_checkpoint=0;');
 const range=methodSpans('impl X {'+method('range','sealed_at: Felt',d=>d.range('sealed_at',32))+'}')[0].body;
 replace('begin_order_page',b=>{
  assert.ok(b.includes('draw == self.stream_source + 1'));
  return range+`require(sealed_at > self.stream_source && sealed_at < draw,"seal must be accepted strictly before fixed draw"); if (self.stream_seal_checkpoint==0) { require(self.stream_seed_installed==0,"seal precedes first seed"); self.stream_seal_checkpoint=sealed_at; } else { require(sealed_at==self.stream_seal_checkpoint,"immutable accepted seal"); } `+b.replace('draw == self.stream_source + 1',`draw == self.stream_source + ${DRAW_DELAY}`);
 });
 const signature='before: Hash, draw: Felt, seed: Hash)';assert.ok(s.includes(signature));
 s=s.replace(signature,'before: Hash, draw: Felt, seed: Hash, sealed_at: Felt)');
 return s;
}
