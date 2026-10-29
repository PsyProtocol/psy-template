import test from 'node:test';import assert from 'node:assert/strict';
import {generatePairStream} from './pair-generate.mjs';import {methodSpans} from '../v2/generate.mjs';import {fixture} from '../../amm/u124/generate.mjs';
for(const market of ['orderbook','nftmarket'])test(`${market}: source-complete terminal refund profile fails closed on trading`,()=>{
 const s=generatePairStream(market,{...fixture,nftId:41,tokenId:42,networkMagic:'1384803358401154921'}),m=new Map(methodSpans(s).map(v=>[v.name,v.body]));
 for(const name of ['commit_batch','begin_batch','expire_batch','finish_batch',market==='orderbook'?'match_orders':'settle_sale','begin_order_page','set_order_page','finish_order_page','claim_stream_member'])assert.match(m.get(name),/require\(false/);
 assert.match(m.get('begin_stream_settlement'),/ctx.checkpoint_id > self.stream_expiry/);assert.match(m.get('begin_stream_settlement'),/count <= 2/);assert.match(m.get('finish_stream_settlement'),/all page refunds terminal/);assert.match(m.get('finish_stream_settlement'),/complete original source set/);
 assert.match(m.get('bind_stream_member'),/source order terms changed/);assert.match(m.get('bind_stream_member'),/self.frozen_cancelled/);assert.doesNotMatch(s,/pub stream_\w+: Hash/);
 for(const name of ['activate','activate_batch_vault','recover_funding','recover_nft','ack_delivery'])if(m.has(name))assert.match(m.get(name),/maintenance blocked by stream/);
 if(market==='nftmarket'){for(const field of ['nft_sequence','token_id_0','token_id_3','metadata_hash_0','metadata_hash_3'])assert.match(m.get('bind_stream_member'),new RegExp('self.frozen_'+field));assert.match(m.get('begin_stream_settlement'),/frozen_nft_matches/);}
});

import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('ABI-only fixture input is rejected before creating output',()=>{
 const root=mkdtempSync(join(tmpdir(),'pair-fixture-preflight-'));try{
  const input=join(root,'input'),output=join(root,'output');mkdirSync(input);writeFileSync(join(input,'native.json'),JSON.stringify({abi:{},state_tree_height:32}));
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('./pair-prepare-fixtures.mjs',import.meta.url)),input,output],{encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/full bytecode required/);assert.equal(existsSync(output),false);assert.equal(existsSync(join(input,'native.json')),true);
 }finally{rmSync(root,{recursive:true,force:true});}
});

for(const market of ['orderbook','nftmarket'])test(`${market}: active ineligible funds have an explicit cancelled recovery path`,()=>{
 const source=generatePairStream(market,{...fixture,nftId:41,tokenId:42,networkMagic:'1384803358401154921'}),m=new Map(methodSpans(source).map(v=>[v.name,v.body]));
 assert.match(m.get('request_recovery'),/active cancellation waits for idle vault/);
 assert.match(m.get('recover_funding'),/require\(false/);
 for(const mask of market==='orderbook'?[1,2,3,4,5,6,7]:[1,4,5])assert.match(m.get(`recover_funding_${mask}`),/sender enrollment and active cancellation required/);
 assert.doesNotMatch(m.get('recover_funding_5'),/contract_state::<Self::ABI>\(43\)/);
 assert.match(m.get('recover_funding_5'),/unselected recovery amount is zero/);
 if(market==='nftmarket'){assert.match(m.get('recover_nft'),/sender enrollment and active cancellation required/);assert.match(m.get('recover_nft'),/self.consumed\[payer\] =/);assert.match(m.get('recover_nft'),/NFT recovery FIFO and scratch/);}
});
