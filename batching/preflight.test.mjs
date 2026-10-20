import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {callBudget,validateCostReport} from './preflight.mjs';
import {makePolicy} from '../amm/u124/policy.mjs';
import {makePolicy as nftPolicy} from '../nft-marketplace/policy.mjs';
// Exercise the actual policy builders. IDs here are fixture ABIs, not deployed identities.
const abi=names=>({contract:{methods:names.map(([name,n],i)=>({name,input_felt_count:n,output_felt_count:0,state_mutability:name==='noop'?'view':'external',method_id:i+1}))}});
const token=abi([['claim',1],['transfer',3]]),nft=abi([['claim',2],['acknowledge',1],['transfer',2]]);
const config={assetA:42,assetB:43,issuer:5,target:400};
const amm=abi([['noop',0],['swap_0',6],['swap_1',6],['refund_swap_0',4],['refund_swap_1',4],['add_liquidity',8],['remove_liquidity',8],['refund_add',6],['cancel_remove',2]]);
const book=abi([['noop',0],['match_orders',8],['cancel_0',4],['cancel_1',4]]);
const curve=abi([['noop',0],['initialize',0],['settle_buy',7],['settle_sell',7],['refund_buy',5],['refund_sell',5],['graduate',5]]);
const market=abi([['noop',0],['settle_sale',6],['refund_listing',2],['refund_listing_fee',2],['refund_buy',4],['refund_buy_fee',2],['ack_delivery',1],['activate',1]]);
const policies=[makePolicy('amm',1000,config,amm,token),makePolicy('orderbook',1001,config,book,token),makePolicy('bondingcurve',1002,config,curve,token),nftPolicy(1003,{nftId:41,tokenId:42},market,nft,token)];
test('capacity counts real settlement calls and the automatic burn, not padded transaction count',()=>{
 const pick=(p,n,b)=>callBudget(p,b).branches.find(x=>x.name===n);
 assert.equal(pick(policies[0],'swap_0',16).maxUnitsByCalls,3);
 assert.equal(pick(policies[0],'refund_add',16).maxUnitsByCalls,2);
 assert.equal(pick(policies[1],'match_orders',16).maxUnitsByCalls,1);
 assert.equal(pick(policies[3],'settle_sale',16).maxUnitsByCalls,1);
 assert.equal(pick(policies[1],'match_orders',32).twoUnitsCalls,19);
 assert.equal(pick(policies[3],'settle_sale',32).twoUnitsCalls,21);
 for(const p of policies){const budget=callBudget(p);assert.equal(budget.authorizationReusable,false);assert.equal(budget.admissionVerified,false);}
});
test('malformed source stacks and impossible budgets cannot silently authorize batching',()=>{
 const p=policies[0];assert.throws(()=>callBudget(p,NaN));assert.throws(()=>callBudget(p,16,{envelopeCalls:-1}));
 const missing=structuredClone(p);missing.branches[0].calls.pop();assert.throws(()=>callBudget(missing));
 const moved=structuredClone(p);moved.branches[0].calls.reverse();assert.throws(()=>callBudget(moved));
 const redirected=structuredClone(p);redirected.branches[0].calls.at(-1).contract_id=42;assert.throws(()=>callBudget(redirected));
 assert.ok(callBudget(p,1).branches.every(b=>b.maxUnitsByCalls===0));
});
test('committed component evidence remains bound and cannot be relabelled as full UPS or TPS',()=>{
 const dir=new URL('./evidence/20261020/',import.meta.url);
 const summary=JSON.parse(readFileSync(new URL('SUMMARY.json',dir),'utf8'));
 for(const [path,digest]of Object.entries(summary.evidenceSha256))assert.equal(createHash('sha256').update(readFileSync(new URL(path,dir))).digest('hex'),digest);
 const proof=JSON.parse(readFileSync(new URL('sdkey-dynamic-cost.json',dir),'utf8'));validateCostReport(proof);
 for(const key of ['fullUpsVerified','nodeAdmissionTested','broadcast','marketBatchImplemented']){const changed=structuredClone(proof);changed[key]=true;assert.throws(()=>validateCostReport(changed));}
 const constant=structuredClone(proof);delete constant.measurements[0].dynamicInputFelts;assert.throws(()=>validateCostReport(constant));
 const missing=structuredClone(proof);missing.measurements.pop();assert.throws(()=>validateCostReport(missing));
 const bad=structuredClone(proof);bad.measurements[0].samples[0].minifyMs=NaN;assert.throws(()=>validateCostReport(bad));
 assert.equal(summary.batchThroughput,null);assert.equal(summary.chainTps,null);
});
