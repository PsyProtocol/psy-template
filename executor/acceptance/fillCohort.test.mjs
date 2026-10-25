import test from 'node:test';import assert from 'node:assert/strict';import {assertBookFillCohort} from './fillCohort.mjs';import {parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
const make=()=>{const before={totals:{41:1000n,42:1000n},accounts:{1:{ft:{41:500n,42:500n}},2:{ft:{41:500n,42:500n}},3:{ft:{41:0n,42:0n}}},nfts:[{user:2,slot:0,tokenId:[1n,2n,3n,4n],metadataHash:[5n,6n,7n,8n]}],nftPending:[]};const after=structuredClone(before);after.accounts[1].ft[41]-=7n;after.accounts[1].ft[42]+=7n;after.accounts[2].ft[41]+=7n;after.accounts[2].ft[42]-=7n;return{before:parseLosslessJson(losslessJson(before)),after,options:{owner:1,buyer:2,assets:[41,42],unit:7n}};};
test('preserved lossless snapshot and live Number NFT metadata compare by exact ownership',()=>{const x=make();assert.equal(assertBookFillCohort(x.before,x.after,x.options),true);});
test('NFT identity, real recipient, pending delivery and unsafe metadata remain rejected',()=>{
 for(const change of [a=>a.nfts[0].user=1,a=>a.nfts[0].tokenId[0]++,a=>a.nfts[0].metadataHash[0]++,a=>a.nftPending.push({sender:3,recipient:1,deliveryNonce:1n}),a=>a.nfts[0].user=Number.MAX_SAFE_INTEGER+1]){const x=make();change(x.after);assert.throws(()=>assertBookFillCohort(x.before,x.after,x.options));}
});
test('a wrong FT amount, unrelated vault change, missing account or total cannot be normalized away',()=>{
 for(const change of [a=>a.accounts[1].ft[41]++,a=>a.accounts[3].ft[42]++,a=>delete a.accounts[3],a=>a.totals[41]++,a=>a.accounts[1].ft[41]=493]){const x=make();change(x.after);assert.throws(()=>assertBookFillCohort(x.before,x.after,x.options));}
});
