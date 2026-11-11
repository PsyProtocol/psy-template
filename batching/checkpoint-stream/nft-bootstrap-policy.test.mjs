import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {makeNftBootstrapPolicy,nftAccountBuyCalls,nftAccountListingCalls,NFT_INITIALIZATION} from './nft-bootstrap-policy.mjs';
import {fundedProfile} from '../../executor/fundedProfiles.mjs';
import {makeExitPolicy} from './exit-policy.mjs';
import {parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
const root=process.env.NFT_BOOTSTRAP_REVIEWED_FIXTURES,candidate=process.env.NFT_BOOTSTRAP_CANDIDATE_FIXTURES;
test('new NFT profile is explicitly separate and never admitted for another market',()=>{
 assert.equal(fundedProfile('source-nft-account-bootstrap-v21','nftmarket').version,21n);
 for(const kind of ['amm','bondingcurve','orderbook'])assert.throws(()=>fundedProfile('source-nft-account-bootstrap-v21',kind));
 assert.equal(fundedProfile('source-pair-authorized-exit-v19','nftmarket').version,19n);
});
test('ordinary NFT buyer rejects impossible nonce/deadline terms before call construction',()=>{
 const config={nftId:41,tokenId:42},policy={version:21,profile:'source-covered-nft-account-bootstrap-exit-v1',collection_initialization:NFT_INITIALIZATION,market_id:1000,base:{config}};
 const abi=(name,input_felt_count)=>({contract:{methods:[{name,input_felt_count,method_id:1}]}});
 const args={marketId:1000n,marketAbi:abi('open_buy',7),config,nftAbi:abi('prepare_account',0),tokenAbi:abi('transfer',3),vaultId:100n,seller:200n,listingNonce:1n,price:(1n<<80n)+17n,deadline:4294967295n,nonce:1n,nativeProtocol:'mainnet-beta-20261027'};
 const calls=nftAccountBuyCalls(policy,args);
 assert.deepEqual(calls[1].inputs,[100n,200n,1n,17n,1n<<18n,4294967295n,1n]);
 for(const change of [{nonce:0n},{listingNonce:0n},{nonce:1n<<62n},{listingNonce:1n<<62n},{deadline:1n<<32n},{deadline:-1n},{deadline:4294967295}])
  assert.throws(()=>nftAccountBuyCalls(policy,{...args,...change}));
 const last=(1n<<62n)-1n;
 assert.equal(nftAccountBuyCalls(policy,{...args,nonce:last,listingNonce:last})[1].inputs[2],last);
});
test('exact reviewed artifacts retain every old financial call except the unused collection acknowledgement',{skip:!root||!candidate},()=>{
 const read=p=>JSON.parse(readFileSync(join(root,p)));
 const c=read('nftmarket/config.json'),a=read('nftmarket/compiled/compilation_artifact.json'),token=read('token/compilation_artifact.json'),nft=read('nft/compilation_artifact.json');
 const nextNft=JSON.parse(readFileSync(join(candidate,'nft/compilation_artifact.json')));
 const old=makeExitPolicy('nftmarket',1000,c,a,token,nft,'sdk-audit-20261102-v1'),original=JSON.stringify(old);
 const next=makeNftBootstrapPolicy(1000,c,a,token,nextNft,'sdk-audit-20261102-v1');
 assert.equal(next.version,21);assert.equal(next.collection_initialization,NFT_INITIALIZATION);
 const before=old.base.operations.find(o=>o.name==='activate'),after=next.base.operations.find(o=>o.name==='activate');
 const active=v=>v.filter(x=>x.method_name!=='noop');
 assert.deepEqual(active(after.calls),active(before.calls).map(x=>x.method_name==='acknowledge'?{contract_id:c.nftId,method_id:1475740684,method_name:'prepare_account',inputs:[]}:x));
 assert.equal(after.calls.length,9);assert.equal(after.calls.filter(x=>x.contract_id===c.nftId).length,1);
 assert.deepEqual(next.base.operations.filter(o=>o.name!=='activate'),old.base.operations.filter(o=>o.name!=='activate'));
 for(const field of ['stream','exit_policy','fee_owner','source_window_checkpoints','qualified_randomness','scan_capacity','page_capacity'])assert.deepEqual(next[field],old[field]);
 assert.equal(JSON.stringify(old),original);
 assert.throws(()=>makeNftBootstrapPolicy(1000,c,a,token,nextNft,'mainnet-beta-20261027-v1'));
 const args={marketId:1000n,marketAbi:a.abi,config:c,nftAbi:nextNft.abi,tokenAbi:token.abi,vaultId:100n,seller:200n,listingNonce:1n,price:(1n<<80n)+17n,deadline:200n,nonce:1n,nativeProtocol:'mainnet-beta-20261027'};
 const calls=nftAccountBuyCalls(next,args);
 assert.deepEqual(nftAccountBuyCalls(parseLosslessJson(losslessJson(next)),args),calls);
 assert.deepEqual(calls.map(c=>c.method_name),['prepare_account','open_buy','transfer','transfer']);
 assert.deepEqual(calls[3].inputs,[100n,17n,1n<<18n]);
 assert.throws(()=>nftAccountBuyCalls(old,args));
 assert.throws(()=>nftAccountBuyCalls(next,{...args,marketId:1001n}));
 assert.throws(()=>nftAccountBuyCalls(next,{...args,config:{...c,tokenId:43}}));
 assert.throws(()=>nftAccountBuyCalls(next,{...args,nativeProtocol:'legacy-v1'}));
 assert.throws(()=>nftAccountBuyCalls(next,{...args,nativeProtocol:undefined}));
 assert.throws(()=>nftAccountBuyCalls(next,{...args,nftAbi:nft.abi}));
 const sell={...args,slot:0n},listing=nftAccountListingCalls(next,sell);
 assert.deepEqual(nftAccountListingCalls(parseLosslessJson(losslessJson(next)),sell),listing);
 assert.deepEqual(listing.map(c=>c.method_name),['acknowledge','open_listing','transfer','transfer']);
 assert.deepEqual(listing[0].inputs,[100n]);
 assert.equal(listing[1].contract_id,1000n);
 assert.deepEqual(listing[1].inputs,[100n,0n,17n,1n<<18n,200n,1n]);
 assert.deepEqual(listing[2],{contract_id:0n,method_name:'transfer',inputs:[100n,1000100000n]});
 assert.deepEqual(listing[3].inputs,[0n,100n]);
 for(const change of [{slot:128n},{slot:-1n},{nonce:0n},{nonce:1n<<62n},
  {price:0n},{price:1n<<124n},{deadline:1n<<32n},
  {marketId:1001n},{nativeProtocol:'legacy-v1'},{nativeProtocol:undefined},
  {config:{...c,nftId:99}},{config:{...c,tokenId:99}}])assert.throws(()=>nftAccountListingCalls(next,{...sell,...change}));
 assert.throws(()=>nftAccountListingCalls(old,sell));
});
