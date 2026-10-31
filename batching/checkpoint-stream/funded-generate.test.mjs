import test from 'node:test';import assert from 'node:assert/strict';
import{generateFundedStream}from'./funded-generate.mjs';import{generateStream}from'./generate.mjs';import{methodSpans}from'../v2/generate.mjs';import{fixture}from'../../amm/u124/generate.mjs';
for(const kind of ['amm','bondingcurve'])test(`${kind}: funded source retains deterministic transitions and isolates lifetime fee state`,()=>{
 const c={...fixture,feeOwner:600},s=generateFundedStream(kind,c),methods=new Map(methodSpans(s).map(m=>[m.name,m.body]));
 assert.doesNotMatch(s,/stream_seed_intrinsic|pub stream_seed:/);assert.match(methods.get('open_source_stream'),/source \+ 32/);
 for(const m of methodSpans(generateStream(kind,c)))assert.equal(methods.get(m.name),`require(ctx.user_id!=600,"reserved fees-only principal"); `+m.body);
 for(const[name,body]of methods){if(name!=='account_executor_fee')assert.doesNotMatch(body,/self\.fee_used\s*=/);if(name!=='apply_fee_grant')assert.doesNotMatch(body,/self\.fee_cap\s*=/);}
 assert.match(methods.get('authorize_fee_budget'),/nonce==self.fee_grant_nonce\[vault\]\+1/);assert.match(methods.get('apply_fee_grant'),/nonce>self.fee_grant_seen/);assert.match(methods.get('account_executor_fee'),/used<=self.fee_cap/);
 for(const feeOwner of [0,c.issuer,c.target])assert.throws(()=>generateFundedStream(kind,{...c,feeOwner}));
});
