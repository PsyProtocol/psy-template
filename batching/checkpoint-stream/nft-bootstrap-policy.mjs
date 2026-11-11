// New collection and key identities. Existing v19 policies and market bytecode stay intact.
import assert from 'node:assert/strict';
import {makeExitPolicy} from './exit-policy.mjs';
import {nftBuyCalls,nftListingCalls} from '../v2/client.mjs';
export const NFT_BOOTSTRAP_VERSION=21;
export const NFT_BOOTSTRAP_PROFILE='source-covered-nft-account-bootstrap-exit-v1';
export const NFT_INITIALIZATION='explicit-account-version-v1';
function reviewedOrder(policy,args){
 assert.equal(BigInt(policy.version),BigInt(NFT_BOOTSTRAP_VERSION));assert.equal(policy.profile,NFT_BOOTSTRAP_PROFILE);
 assert.equal(policy.collection_initialization,NFT_INITIALIZATION);
 assert.equal(args.nativeProtocol,'mainnet-beta-20261027','exact current native ABI required');
 assert.equal(BigInt(args.marketId),BigInt(policy.market_id));
 for(const name of ['nftId','tokenId'])assert.equal(BigInt(args.config[name]),BigInt(policy.base.config[name]));
}
// Call construction is not identity authentication or wallet approval. The
// formal driver/wallet still verifies actual code/layout, stack and state.
export function nftAccountBuyCalls(policy,args){
 reviewedOrder(policy,args);
 return nftBuyCalls({...args,collectionInitialization:NFT_INITIALIZATION});
}
export function nftAccountListingCalls(policy,args){
 reviewedOrder(policy,args);
 return nftListingCalls(args);
}
export function makeNftBootstrapPolicy(id,config,artifact,token,nft,sdkProfile){
 assert.equal(sdkProfile,'sdk-audit-20261102-v1','explicit selected frozen SDK required');
 const previous=makeExitPolicy('nftmarket',id,config,artifact,token,nft,sdkProfile);
 const next=structuredClone(previous),base=next.base;
 const index=base.operations.findIndex(o=>o.name==='activate');
 assert.ok(index>=0);const op=base.operations[index];assert.equal(op.maintenance,true);
 const acknowledgements=op.calls.filter(c=>c.contract_id===config.nftId&&c.method_name==='acknowledge');
 assert.equal(acknowledgements.length,1,'exact original bootstrap acknowledgement');
 assert.deepEqual(acknowledgements[0].inputs,[{witness:1}]);
 const method=nft.abi.contract.methods.find(m=>m.name==='prepare_account');
 assert.equal(method?.method_id,1475740684);assert.equal(method.input_felt_count,0);assert.equal(method.output_felt_count,0);
 const calls=op.calls.map(c=>c===acknowledgements[0]?{contract_id:config.nftId,method_id:method.method_id,method_name:'prepare_account',inputs:[]}:c);
 assert.equal(calls.length,9);op.calls=calls;
 assert.deepEqual(base.branches[2+index].calls,previous.base.operations[index].calls);
 base.branches[2+index].calls=structuredClone(calls);
 return {...next,version:NFT_BOOTSTRAP_VERSION,profile:NFT_BOOTSTRAP_PROFILE,
  collection_initialization:NFT_INITIALIZATION};
}
