import test from 'node:test';
import assert from 'node:assert/strict';
import {cohortAssets,payoutClaims} from './liveAssets.mjs';
const setup=()=>{const values=new Map(),set=(u,c,o,n)=>values.set(`${u}:${c}:${o}`,BigInt(n)),s={checkpoint:9,slot:async(u,c,o)=>values.get(`${u}:${c}:${o}`)??0n,contractStateRoot:async()=> '0'.repeat(64)};return {s,set};};
test('conservation includes unclaimed outboxes and rejects cursor inversion',async()=>{
 const {s,set}=setup();set(1,0,0,50);set(2,0,0,20);set(1,0,7,30);set(2,0,6,10);
 set(1,42,0,100);set(1,42,33554461,40);set(2,42,33554459,15);
 const r=await cohortAssets(s,{users:[1,2],assets:[42],nftId:41});assert.equal(r.nativeTotal,90n);assert.equal(r.totals[42],125n);
 set(2,42,33554459,41);await assert.rejects(()=>cohortAssets(s,{users:[1,2],assets:[42],nftId:41}),/cursor/);
});
test('NFT duplicate ownership is rejected across separate wallets',async()=>{
 const {s,set}=setup();for(const u of [1,2]){set(u,41,30,99);set(u,41,34,1);}
 await assert.rejects(()=>cohortAssets(s,{users:[1,2],assets:[42],nftId:41}),/duplicate NFT/);
});
test('a missing or duplicate NFT delivery cannot be reported as a claim',async()=>{
 const {s}=setup(),options={userId:1,markets:[{kind:'nftmarket',vault:2,driverConfig:{nftId:41,tokenId:42}}],tokenAbi:{contract:{methods:[]}},nftAbi:{contract:{methods:[]}},nftSlot:0};
 await assert.rejects(()=>payoutClaims(s,options),/exactly one delivery/);
});
