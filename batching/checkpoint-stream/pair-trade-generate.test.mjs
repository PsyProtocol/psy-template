import test from 'node:test';import assert from 'node:assert/strict';
import {generatePairTrade} from './pair-trade-generate.mjs';import {methodSpans} from '../v2/generate.mjs';import {fixture} from '../../amm/u124/generate.mjs';
for(const market of ['orderbook','nftmarket'])test(`${market}: distinct frontier requires actual stored certificate and preserves expiry refunds`,()=>{
 const source=generatePairTrade(market,{...fixture,nftId:41,tokenId:42,networkMagic:'1384803358401154921'}),methods=new Map(methodSpans(source).map(m=>[m.name,m.body]));
 for(const name of ['commit_batch','begin_batch','begin_order_page'])assert.match(methods.get(name),/require\(false/);
 assert.doesNotMatch(methods.get(market==='orderbook'?'match_orders':'settle_sale'),/global paired trading frontier not installed/);
 assert.match(methods.get('advance_pair_frontier'),/exact live frontier continuation/);assert.match(methods.get('advance_pair_frontier'),/cursor <= self.frontier_cursor \+ 4/);assert.match(methods.get('advance_pair_frontier'),/self.frontier_best\[3\] = best\[3\]/);
 assert.match(methods.get('bind_pair_choice'),/actual completed frontier winner/);assert.match(methods.get('bind_pair_choice'),/best\[3\] == self.frontier_best\[3\]/);
 assert.match(methods.get('begin_stream_settlement'),/self.frontier_complete == 1 && count == 2/);
 assert.match(methods.get('bind_stream_member'),/if \(self.stream_cancelled/);assert.doesNotMatch(methods.get('bind_stream_member'),/,if \(/);
 assert.match(methods.get('finish_pair_carry'),/complete no-match carry only/);assert.doesNotMatch(methods.get('finish_pair_carry'),/self.consumed\[/);
 assert.match(methods.get('finish_stream_settlement'),/self.frontier_cursor = 0/);assert.match(methods.get('finish_source_page'),/self.frontier_outer\[0\] = self.stream_remaining\[0\]/);
});
