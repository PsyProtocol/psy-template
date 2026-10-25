import test from 'node:test';import assert from 'node:assert/strict';
import {assertPreEpochPrefix,assertOriginalStartFunding} from './preEpochResume.mjs';
import {parseLosslessJson,losslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
const make=()=>({labels:['owner-order','buyer-order','start-fund'],hasPlan:false,hasPrewarm:false,selection:'baseline',vault:100,grant:{sent:5n*F,claimed:4n*F,settledFee:4n*F,pool:100n,amount:F,nonce:3n,used:2n,purpose:2n}});
test('only confirmed pre-epoch prefix with one precise unused grant is eligible',()=>{assert.equal(assertPreEpochPrefix(make()).adopt,true);});
test('fixed epoch, partial future attempt or different variant is rejected',()=>{
 for(const patch of [{hasPlan:true},{hasPrewarm:true},{selection:'candidate'},{labels:['owner-order','buyer-order','start-fund','owner-consent']},{labels:['owner-order','buyer-order']}])assert.throws(()=>assertPreEpochPrefix({...make(),...patch}));
});
test('extra funding, stale/consumed sponsorship, wrong destination and inconsistent cursors are rejected',()=>{
 for(const patch of [{sent:6n*F},{sent:4n*F},{amount:2n*F},{used:3n},{pool:101n},{purpose:1n},{settledFee:3n*F}]){const x=make();assert.throws(()=>assertPreEpochPrefix({...x,grant:{...x.grant,...patch}}));}
});
test('exact calls tolerate lossless object prototypes while recipient, amount, purpose and nonce remain exact',()=>{
 const expected=[{contract_id:2497n,method_id:123n,method_name:'authorize_sponsor',inputs:[662720n,F,40n,2n]},{contract_id:0n,method_name:'simple_transfer',inputs:[662720n,F]}];
 const parsed=()=>parseLosslessJson(losslessJson(expected));assertOriginalStartFunding(parsed(),expected);
 for(const [call,index]of [[0,0],[0,1],[0,2],[0,3],[1,0],[1,1]]){const x=parsed();x[call].inputs[index]++;assert.throws(()=>assertOriginalStartFunding(x,expected));}
 for(const field of ['contract_id','method_id']){const x=parsed();x[0][field]++;assert.throws(()=>assertOriginalStartFunding(x,expected));}
 const x=parsed();x[0].method_name='other';assert.throws(()=>assertOriginalStartFunding(x,expected));
});
