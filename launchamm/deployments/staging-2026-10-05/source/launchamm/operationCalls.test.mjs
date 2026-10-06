import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPoolCalls} from './operationCalls.mjs';
const config={poolContractId:67,poolUserId:1283072,tokenId:65,curveContractId:66,curveVaultId:758784,issuerId:1882112,psyUnit:1000,tokenUnit:1000000};
const p=createPoolCalls(config),payerId=222;
const launch={tokenId:65,issuerId:1882112,targetId:1283072,maxLots:4,liquidityLots:2,lotSize:1000000000,basePrice:100000000,stepPrice:1000,thresholdLots:3};
test('graduation seed fixes source and exact units, fee claims and LP owner',()=>{
 const seed=p.seedFromCurveCalls({launch,soldLots:3});
 assert.deepEqual(seed.contract_calls[0].inputs,[66,758784,65,1882112,1000,1000000,300003,3000,29000]);
 assert.deepEqual(seed.software_defined_call.inputs,[10,1882112,300003,3000,29000,0,0]);
 assert.deepEqual(seed.contract_calls.slice(1,4),[{contract_id:0,method_name:'simple_claim',inputs:[758784]},{contract_id:65,method_name:'claim',inputs:[758784]},{contract_id:0,method_name:'simple_claim',inputs:[1882112]}]);
 assert.throws(()=>createPoolCalls({...config,psyUnit:999}).seedFromCurveCalls({launch,soldLots:3}),/inexact/);
 assert.throws(()=>p.seedFromCurveCalls({launch:{...launch,targetId:222},soldLots:3}),/binding/);
});
test('signed payments use native base units; public outputs scale once',()=>{
 assert.deepEqual(p.openSwapCalls({payerId,asset:0,amountIn:10000,minOut:1,deadline:200,nonce:1}).contract_calls[1].inputs,[1283072,1010100000]);
 const s=p.withPoolSignInputs(p.settleSwapCalls({payerId,asset:65,amountIn:90,amountOut:9500,nonce:1}));
 assert.deepEqual(s.contract_calls[2],{contract_id:65,method_name:'claim',inputs:[222]});
 assert.deepEqual(s.contract_calls[3],{contract_id:0,method_name:'simple_transfer',inputs:[222,9500000]});
 assert.deepEqual(s.software_defined_call.inputs,[2,222,90,9500,0,1,0]);
});
test('LP refunds return both raw legs to original payer',()=>{
 const s=p.withPoolSignInputs(p.refundAddCalls({payerId,amountPsy:100,amountToken:200}));
 assert.deepEqual(s.contract_calls[3].inputs,[222,100000]);assert.deepEqual(s.contract_calls[4].inputs,[222,200000000]);
 assert.equal(s.software_defined_call.inputs[0],9);
});
test('LP remove uses the launch token minimum in its signed intent',()=>{
 assert.deepEqual(p.openRemoveCalls({payerId,shares:20,minPsy:30,minToken:40,deadline:200,nonce:2}).contract_calls[0].inputs,[1283072,20,30,40,200,2]);
});
test('invalid assets, IDs, units and amounts fail before a payment is built',()=>{
 assert.throws(()=>p.openSwapCalls({payerId,asset:4,amountIn:1,minOut:1,deadline:1,nonce:1}),/asset/);
 assert.throws(()=>createPoolCalls({...config,tokenUnit:100000001}),/unit/i);
 assert.throws(()=>p.openAddCalls({payerId,amountPsy:10000001,amountToken:1,minShares:1,deadline:1,nonce:1}),/amountPsy/);
 assert.throws(()=>createPoolCalls({...config,curveContractId:65}),/differ/);
});
test('compiled AMM preserves every curve-prefix offset and token Outbox ABI',()=>{
 const a=JSON.parse(readFileSync(new URL('./contract/target-v2/abi.json',import.meta.url))).contract;
 const c=JSON.parse(readFileSync(new URL('../bondingcurve/deployments/staging-2026-09-30/curve.abi.json',import.meta.url))).contract;
 assert.deepEqual(a.state.slice(0,c.state.length),c.state);
 assert.equal(a.state.find(x=>x.name==='other_user_info').offset,3);
 assert.equal(a.methods.length,15);assert.equal(a.state_tree_height,32);
});
