import test from 'node:test';import assert from 'node:assert/strict';import {freshDeploymentReceipt} from './freshDeployment.mjs';
const before={checkpoint_id:360650,next_contract_id:2477},receipt=(id,cp)=>({included_checkpoint_id:cp,result:{contract_id:id}});
test('a repeated hash with matching old metadata cannot confirm a fresh deployment',()=>{
 assert.throws(()=>freshDeploymentReceipt(before,receipt(2473,358969)),/historical deployment ID/);
 assert.throws(()=>freshDeploymentReceipt(before,receipt(2477,360650)),/historical deployment receipt/);
 assert.throws(()=>freshDeploymentReceipt(before,receipt(2473,360651)),/historical deployment ID/);
});
test('fresh identities allow intervening allocations but reject rounded or out-of-domain evidence',()=>{
 assert.equal(freshDeploymentReceipt(before,receipt(2477,360651)),2477);assert.equal(freshDeploymentReceipt(before,receipt(2480,360660)),2480);
 assert.equal(freshDeploymentReceipt({checkpoint_id:360650n,next_contract_id:2477n},receipt(2477n,360651n)),2477);
 for(const bad of [receipt(9007199254740993,360651),receipt(16777216,360651),receipt(2477,4294967296),receipt(2477,'360651')])assert.throws(()=>freshDeploymentReceipt(before,bad));
});
