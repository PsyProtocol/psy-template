import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateSealedMinimumStream,DRAW_DELAY} from './sealed-generate.mjs';
import {fixture} from '../../amm/u124/generate.mjs';
import {methodSpans} from '../v2/generate.mjs';
import {makeStreamPolicy} from './build-policy.mjs';
const constants={empty24:['1','2','3','4'],empty56:['5','6','7','8']};
for(const market of ['amm','bondingcurve']){
 test(`${market}: accepted seal is immutable and precedes one fixed delayed draw`,()=>{
  const s=generateSealedMinimumStream(market,{...fixture,feeOwner:600,networkMagic:'1384803358401154921'},constants),m=new Map(methodSpans(s).map(m=>[m.name,m.body]));
  assert.equal(DRAW_DELAY,32);assert.match(s,/pub stream_seal_checkpoint: Felt/);
  const begin=m.get('begin_order_page');assert.match(begin,/sealed_at > self.stream_source && sealed_at < draw/);assert.match(begin,/draw == self.stream_source \+ 32/);assert.match(begin,/stream_seed_intrinsic/);
  assert.match(begin,/sealed_at==self.stream_seal_checkpoint/);assert.match(begin,/self.stream_seed_installed==0/);
  assert.match(m.get('open_source_stream'),/self.stream_seal_checkpoint=0/);
  for(const[name,body]of m)if(!['open_source_stream','begin_order_page'].includes(name))assert.doesNotMatch(body,/self\.stream_seal_checkpoint\s*=/,name);
  for(const name of ['set_order_page','finish_order_page','restart_expired_random_order'])assert.match(m.get(name),/require\(false/);
  assert.match(s,/self.stream_source\+1/,'rank-v1 domain word stays stable; actual draw is separately constrained');
 });
 test(`${market}: profile binds new ABI without claiming secrecy or finality`,{skip:!process.env.SEALED_FIXTURES},async()=>{
  const r=process.env.SEALED_FIXTURES,read=async p=>JSON.parse(await readFile(r+'/'+p,'utf8'));
  const a=[market,1000,await read(market+'/config.json'),await read(market+'/compiled/compilation_artifact.json'),await read('token/compilation_artifact.json'),await read('nft/compilation_artifact.json')];
  const p=makeStreamPolicy(...a,{random:true,minimum:true,bootstrap:true,sealed:true,window:8192});
  assert.equal(p.version,13);assert.equal(p.stream.begin_order_page.input_count,10);assert.equal(p.draw_delay_checkpoints,32);assert.equal(p.accepted_seal_history_binding,true);
  assert.equal(p.qualified_randomness,false);assert.equal(p.live_authorization,false);assert.equal(p.seed_unpredictability_authenticated,false);
  assert.throws(()=>makeStreamPolicy(...a,{sealed:true}),/requires minimum bootstrap/);
  assert.throws(()=>makeStreamPolicy(...a,{random:true,minimum:true,bootstrap:true}),/begin_order_page/,'old profiles cannot silently consume changed ABI');
 });
}
