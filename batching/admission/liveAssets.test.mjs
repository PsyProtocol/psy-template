import test from 'node:test';
import assert from 'node:assert/strict';
import {cohortAssets,payoutClaims} from './liveAssets.mjs';

function fixture() {
 const values=new Map(),set=(user,slot,value)=>values.set(`${user}:${slot}`,BigInt(value));
 const state={checkpoint:10,slot:async(user,contract,slot)=>contract===9?(values.get(`${user}:${slot}`)??0n):0n};
 const cursor=(sender,recipient,sent,claimed)=>{set(sender,1182+35*recipient+32,sent);set(recipient,1182+35*sender+33,claimed);};
 const entry=(sender,recipient,ringSlot,id)=>{for(let i=0;i<8;i++)set(sender,1182+35*recipient+8*ringSlot+i,i===0?id:i===4?id+100:0);};
 const snapshot=()=>cohortAssets(state,{users:[1,2],assets:[],nftId:9});
 return {set,cursor,entry,snapshot};
}

test('NFT accounting follows wrapped unclaimed FIFO entries and ignores retained old entries',async()=>{
 const x=fixture();x.cursor(1,2,5,3);x.entry(1,2,3,11);x.entry(1,2,0,22);x.entry(1,2,1,99);
 const r=await x.snapshot();assert.equal(r.nfts.length,0);assert.equal(r.nftTotal,2);assert.deepEqual(r.nftPending.map(n=>n.tokenId[0]),[11n,22n]);assert.deepEqual(r.nftPending.map(n=>n.deliveryNonce),[4n,5n]);assert.equal(r.nftScope.globalInventoryProof,false);
 x.cursor(1,2,5,4);x.set(2,30,11);x.set(2,34,1);x.set(2,35,111);
 const claimed=await x.snapshot();assert.equal(claimed.nftTotal,2);assert.equal(claimed.nfts.length,1);assert.equal(claimed.nftPending.length,1);
});

test('held plus unclaimed duplicate identities cannot pass NFT conservation',async()=>{
 const x=fixture();x.cursor(1,2,1,0);x.entry(1,2,0,11);x.set(2,30,11);x.set(2,34,1);
 await assert.rejects(x.snapshot,/duplicate NFT ownership or pending delivery/);
});

test('invalid NFT cursors and zero unclaimable entries fail the snapshot',async()=>{
 for(const [sent,claimed]of [[0,1],[5,0]]){const x=fixture();x.cursor(1,2,sent,claimed);await assert.rejects(x.snapshot,/NFT FIFO cursor/);}
 const x=fixture();x.cursor(1,2,1,0);await assert.rejects(x.snapshot,/zero pending NFT identity/);
});

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
