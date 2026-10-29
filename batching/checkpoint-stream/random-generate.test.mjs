import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateRandomStream} from './random-generate.mjs';
import {generateStream} from './generate.mjs';
import {makeStreamPolicy} from './build-policy.mjs';
import {methodSpans} from '../v2/generate.mjs';
import {fixture} from '../../amm/u124/generate.mjs';
for(const market of ['amm','bondingcurve'])test(`${market}: versioned global ordering and refund-only timeout cannot change legacy semantics`,()=>{
 const c={...fixture,networkMagic:'1384803358401154921',rewardReceiver:600};
 const old=generateStream(market,c),s=generateRandomStream(market,c);const methods=new Map(methodSpans(s).map(m=>[m.name,m]));
 assert.ok(s!==old);assert.ok(s.includes('pub stream_seed: ContractStateArray<4,Felt>'));
 assert.match(methods.get('open_source_stream').body,/expiry == source \+ 256/);
 assert.match(methods.get('finish_source_page').body,/self.stream_phase = 2/);
 assert.match(methods.get('begin_order_page').body,/draw == self.stream_source \+ 1/);
 assert.match(methods.get('begin_order_page').body,/stream_seed_intrinsic/);
 assert.match(methods.get('begin_order_page').body,/no seed replacement/);
 assert.doesNotMatch(methods.get('set_order_page').body,/partial sorting disabled/);
 assert.match(methods.get('expire_unseeded_stream').body,/self.stream_queue_total == 0/);
 assert.match(methods.get('expire_unseeded_stream').body,/ctx.checkpoint_id > self.stream_expiry/);
 assert.match(methods.get('expire_unseeded_stream').body,/self.stream_refund_only=1/);
 assert.match(methods.get('begin_stream_settlement').body,/91647816651058/);
 assert.match(methods.get('abort_source_stream').body,/require\(false/);
 assert.match(methods.get('restart_expired_random_order').body,/self.stream_seed_installed == 1/);
 assert.match(methods.get('restart_expired_random_order').body,/self.stream_refund_only=1/);
 assert.doesNotMatch(methods.get('restart_expired_random_order').body,/self\.stream_seed\[\d\]\s*=/);
 assert.match(methods.get('bind_stream_member').body,/source order terms changed/);
 assert.match(methods.get('finish_stream_settlement').body,/every page member needs a terminal disposition/);
 assert.match(methodSpans(old).find(m=>m.name==='begin_order_page').body,/partial sorting disabled/);
 assert.throws(()=>generateRandomStream(market,c,{window:65537}));
});
test('default deterministic policy remains byte-identical',{skip:!process.env.STREAM_LEGACY_FIXTURES},async()=>{
 const root=process.env.STREAM_LEGACY_FIXTURES,read=async p=>JSON.parse(await readFile(root+'/'+p,'utf8'));
 for(const m of ['amm','bondingcurve']){const p=makeStreamPolicy(m,1000,await read(m+'/config.json'),await read(m+'/compiled/compilation_artifact.json'),await read('token/compilation_artifact.json'),await read('nft/compilation_artifact.json'));assert.deepEqual(p,await read(m+'/stream-policy.json'));}
});
