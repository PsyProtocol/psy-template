import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWindowStream,DETERMINISTIC_WINDOW} from './window-policy.mjs';
import {generateExitStream} from './exit-generate.mjs';
import {methodSpans} from '../v2/generate.mjs';
import {fundedProfile} from '../../executor/fundedProfiles.mjs';
const config={assetA:42,assetB:43,nftId:41,tokenId:42,issuer:5,target:400,feeOwner:600,networkMagic:'1384803358401154921'};
for(const market of ['amm','bondingcurve','orderbook','nftmarket'])test(`${market}: fixed new window preserves every other method and all layout declarations`,()=>{
 const old=generateExitStream(market,config),next=generateWindowStream(market,config);
 assert.equal(DETERMINISTIC_WINDOW,4096);
 assert.equal(next.replace('expiry == source + 4096','expiry == source + 32'),old);
 const a=new Map(methodSpans(old).map(m=>[m.name,m.body]));
 for(const m of methodSpans(next))if(m.name!=='open_source_stream')assert.equal(m.body,a.get(m.name));
 assert.doesNotMatch(next,/stream_seed_intrinsic|pub stream_seed:/);
});
test('unaccepted window candidates remain outside formal live routing',()=>{
 for(const profile of ['source-window-authorized-exit-v22','source-window-pair-authorized-exit-v23',
  'source-window-nft-account-bootstrap-v24'])for(const market of ['amm','bondingcurve','orderbook','nftmarket'])
   assert.throws(()=>fundedProfile(profile,market));
 assert.throws(()=>generateWindowStream('unreviewed',config));
});
test('candidate configuration cannot round large integer amounts through Number',()=>{
 assert.throws(()=>generateWindowStream('bondingcurve',{...config,unit:1000000000000000000}),/exact decimal strings/);
});
