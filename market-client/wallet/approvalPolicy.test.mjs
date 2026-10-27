// Application policy tests; no cryptography, extension or financial acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digest} from '../protocol.mjs';
import {marketCapabilities,reviewMarketConfirmation,assertMarketPolicyRecord,marketLimitRows} from './approvalPolicy.mjs';
async function fixture(){
 const registry=JSON.parse(readFileSync(new URL('../reviewed/mainnet-beta-amm-20261027-v2/registry.json',import.meta.url)));
 const bundle={registry,registryHash:await digest(registry)};
 const terms={actualFee:'1000001000',maxNetworkFee:'2000000000',validUntilCheckpoint:164,
 review:{request:{kind:'remove'},plan:{registryHash:bundle.registryHash,marketId:9,kind:'remove',network:registry.network,recipientId:201,walletNonce:'1',debits:[],
 withdrawal:{burned:'4611686018427387921',minimumA:'17',minimumB:'4611686018427387905'}}}};
 return {bundle,terms};
}
test('application policy exposes exact primary limits and reviewed identity without wallet branches',async()=>{
 const {bundle,terms}=await fixture(),view=await reviewMarketConfirmation(terms,bundle);
 assert.equal(view.componentId,'9');assert.equal(view.limits.length,3);assert.equal(view.limits[2].value,'4611686018427387905 base units');
 assert.ok(view.rows.some(r=>r.label==='Actual network fee'&&r.value==='1000001000 PSY base units'));
 bundle.registry.markets[0].marketId=99;bundle.registryHash=await digest(bundle.registry);terms.review.plan.marketId=99;terms.review.plan.registryHash=bundle.registryHash;
 assert.deepEqual(marketCapabilities(bundle).enabledMarketIds,[99]);assert.equal((await reviewMarketConfirmation(terms,bundle)).componentId,'99');
});
test('unknown, quarantined and NFT components never acquire a policy from matching ABI or page fields',async()=>{
 for(const kind of ['nftmarket','unreviewed']){
  const {bundle,terms}=await fixture();bundle.registry.markets[0].kind=kind;
  assert.deepEqual(marketCapabilities(bundle).enabledMarketIds,[]);await assert.rejects(reviewMarketConfirmation(terms,bundle));
 }
 const {bundle,terms}=await fixture();bundle.registry.markets[0].quarantined=true;
 assert.throws(()=>assertMarketPolicyRecord(bundle,{plan:terms.review.plan}));
});
test('registry, chain, asset, decimals, action and U124 changes reject without an alternate policy',async()=>{
 for(const change of [
  (b,t)=>b.registry.markets[0].dependencies[0].contract.codeRoot='f'.repeat(64),
  (b,t)=>t.review.plan.network={...t.review.plan.network,chainRootAt1:'f'.repeat(64)},
  (b,t)=>t.review.plan.debits=[{contractId:999,amount:'17'}],
  (b,t)=>t.review.plan.debits=[{contractId:6,amount:String(1n<<124n)}],
  (b,t)=>t.review.plan.kind='curve-buy',
 ]){
  const {bundle,terms}=await fixture();change(bundle,terms);await assert.rejects(reviewMarketConfirmation(terms,bundle));
 }
 const {bundle,terms}=await fixture();bundle.registry.markets[0].assets[0].decimals=9;bundle.registryHash=await digest(bundle.registry);terms.review.plan.registryHash=bundle.registryHash;
 await assert.rejects(reviewMarketConfirmation(terms,bundle),/decimals/);
 assert.throws(()=>assertMarketPolicyRecord(bundle,{registryHash:'a'.repeat(64),plan:terms.review.plan}),/registry/);
});
test('Book and Curve retain their existing whole-order and quote-limit semantics',async()=>{
 const {terms}=await fixture();terms.review.plan.kind='book-order';terms.review.request={kind:'book-order',terms:{side:'0',amount:'4.611686018427387921',minimum:'2.000000000000000017'}};
 assert.equal(marketLimitRows(terms)[2].value,'Not allowed');
 terms.review.plan.kind='curve-sell';terms.review.request={kind:'curve-sell',terms:{lots:'17',quoteLimit:'4.611686018427387921'}};
 assert.equal(marketLimitRows(terms)[1].label,'Minimum quote output');
});
