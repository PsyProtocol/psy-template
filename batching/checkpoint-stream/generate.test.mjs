import test from 'node:test';import assert from 'node:assert/strict';
import {generateStream} from './generate.mjs';import {methodSpans} from '../v2/generate.mjs';
import {fixture} from '../../amm/u124/generate.mjs';
for(const market of ['amm','bondingcurve'])test(`${market}: distinct priority-stream candidate has bounded continuation and recovery`,()=>{
 const source=generateStream(market,{...fixture,networkMagic:'1384803358401154921',rewardReceiver:600});
 const methods=new Map(methodSpans(source).map(m=>[m.name,m.body]));
 for(const name of ['commit_batch','begin_batch','expire_batch','finish_batch','begin_order_page','set_order_page','finish_order_page'])assert.match(methods.get(name),/require\(false/);
 assert.match(methods.get('open_source_stream'),/total == 0/);assert.match(methods.get('open_source_stream'),/source == ctx.checkpoint_id/);assert.match(methods.get('open_source_stream'),/expiry == source \+ 32/);
 assert.match(methods.get('abort_source_stream'),/self.stream_phase == 1/);assert.match(methods.get('abort_source_stream'),/ctx.checkpoint_id > self.stream_expiry/);
 assert.doesNotMatch(methods.get('abort_source_stream'),/self\.consumed|\.claimed|self\.stream_remaining\s*=/);
 assert.match(methods.get('finish_source_page'),/self.stream_total = self.stream_order_count/);
 assert.match(methods.get('finish_stream_settlement'),/every page member needs a terminal disposition/);
 assert.match(methods.get('bind_stream_member'),/source order terms changed/);assert.match(methods.get('bind_stream_member'),/ctx.checkpoint_id > self.stream_expiry/);
 assert.doesNotMatch(source,/pub stream_\w+: Hash/,'commitments use compiler-supported scalar arrays');
});
