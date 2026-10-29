import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePairOptimized} from './pair-optimized-generate.mjs';
import {generatePairTrade} from './pair-trade-generate.mjs';
import {methodSpans} from '../v2/generate.mjs';
const c={assetA:42,assetB:43,nftId:41,tokenId:42,networkMagic:'1384803358401154921'};
for(const market of ['orderbook','nftmarket']) test(market+': distinct triangular source and current-invalid predicate',()=>{
 const old=generatePairTrade(market,c),s=generatePairOptimized(market,c);assert.equal(generatePairTrade(market,c),old);
 const m=new Map(methodSpans(s).map(m=>[m.name,m.body]));
 assert.ok(m.get('advance_pair_frontier').includes('cursor == 0 && self.frontier_cursor == 0 && complete == 1'));
 const r=m.get('bind_pair_rejection');for(const part of ['self.frontier_complete == 1','self.batch_count == 1','self.stream_bound[','current authenticated invalid winner only','self.stream_expiry']) assert.ok(r.includes(part),part);
 assert.ok(!r.includes('require(false'));assert.ok(m.get('bind_pair_choice').includes('actual completed frontier winner'));
 assert.ok(m.get('finish_stream_settlement').includes('all page refunds terminal'));
 assert.ok(m.get('bind_stream_member').includes('source order terms changed'));
});
