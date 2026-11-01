import test from 'node:test';
import assert from 'node:assert/strict';
import {generateFundedPair} from './funded-pair.mjs';
import {generatePairOptimized} from './pair-optimized-generate.mjs';
import {methodSpans} from '../v2/generate.mjs';
const c={assetA:42,assetB:43,nftId:41,tokenId:42,issuer:5,target:400,feeOwner:600,networkMagic:'1384803358401154921'};
for(const market of ['orderbook','nftmarket'])test(market+': funding does not replace global priority, cancellation or refund predicates',()=>{
 const old=generatePairOptimized(market,c),next=generateFundedPair(market,c),methods=new Map(methodSpans(next).map(m=>[m.name,m.body]));
 for(const method of methodSpans(old))assert.equal(methods.get(method.name),'require(ctx.user_id!=600,"reserved fees-only principal"); '+method.body);
 for(const method of methodSpans(next)){
  if(method.name!=='account_executor_fee')assert.doesNotMatch(method.body,/self\.fee_used\s*=/);
  if(method.name!=='apply_fee_grant')assert.doesNotMatch(method.body,/self\.fee_cap\s*=/);
 }
 assert.doesNotMatch(next,/stream_seed_intrinsic|pub stream_seed:/);
 for(const owner of [0,2**24,c.issuer,c.target])assert.throws(()=>generateFundedPair(market,{...c,feeOwner:owner}));
});
