import test from'node:test';import assert from'node:assert/strict';import{generateMinimumStream}from'./minimum-generate.mjs';import{fixture}from'../../amm/u124/generate.mjs';import{methodSpans}from'../v2/generate.mjs';
for(const market of ['amm','bondingcurve'])test(`${market}: minimum candidate preserves seed and forbids fee/reset bypasses`,()=>{
 const s=generateMinimumStream(market,{...fixture,feeOwner:600,networkMagic:'1384803358401154921'},{empty24:['1','2','3','4'],empty56:['5','6','7','8']}),m=new Map(methodSpans(s).map(m=>[m.name,m.body]));
 assert.match(m.get('open_source_stream'),/source \+ 8192/);assert.doesNotMatch(m.get('open_source_stream'),/self\.fee_(used|cap)\s*=/);for(const[name,body]of m){if(name!=='account_executor_fee')assert.doesNotMatch(body,/self\.fee_used\s*=/);if(name!=='apply_fee_grant')assert.doesNotMatch(body,/self\.fee_cap\s*=/);}
 for(const n of ['set_order_page','finish_order_page','restart_expired_random_order'])assert.match(m.get(n),/require\(false/);
 assert.match(m.get('begin_order_page'),/stream_seed_intrinsic/);assert.match(m.get('begin_order_page'),/minimum_root/);assert.match(m.get('begin_stream_settlement'),/minimum_root/);
 assert.match(m.get('authorize_fee_budget'),/ctx.user_id==600/);assert.match(m.get('authorize_fee_budget'),/cap>=self.fee_grant_limit\[vault\]/);assert.match(m.get('apply_fee_grant'),/nonce>self.fee_grant_seen/);assert.match(m.get('apply_fee_grant'),/fee_grant_limit\[ctx.user_id\]/);assert.match(m.get('account_executor_fee'),/used<=self.fee_cap/);assert.match(m.get('advance_minimum_stream'),/built==self.stream_total && extracted==self.stream_total/);
 assert.throws(()=>generateMinimumStream(market,{...fixture,feeOwner:0},{empty24:['1','2','3','4'],empty56:['5','6','7','8']}));
});
