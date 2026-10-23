// Client/key-template unit tests only. The compiled bytecode and actual key
// proof tests are Rust tests; these synthetic ABIs do not certify deployments.
import test from 'node:test';import assert from 'node:assert/strict';
import{fundsPolicy,fundsRequest}from'./contract/policy.mjs';
import{fundsFixture}from'./fundsFixtures.mjs';
const fixture=()=>fundsFixture().policy;
test('one-shot route uses exact hop identities and both U124 limbs; fee is shared with the burn',()=>{
 const p=fixture(),amount=(1n<<124n)-1n,minimum=(1n<<62n)+17n;
 for(const hop of [1,2]){
  const r=fundsRequest(p,'open-'+hop,{owner:200n,nonce:1n,amount,minimum,deadline:500n,orderNonce:3n,fee:1000001000n});
  const order=r.contract_calls.find(c=>c.method_name==='open_swap');assert.equal(order.contract_id,hop===1?1000n:1001n);assert.deepEqual(order.inputs,[hop===1?300n:400n,BigInt(hop-1),(1n<<62n)-1n,(1n<<62n)-1n,17n,1n,500n,3n]);
  assert.deepEqual(r.contract_calls.find(c=>c.method_name==='charge').inputs,[r.software_defined_call.inputs[73]]);assert.equal(r.software_defined_call.inputs[33],r.software_defined_call.inputs[73]);
 }
});
test('final payments target original owner only; unexpected receiver, unsafe ranges and unused fields fail',()=>{
 const p=fixture(),terms={owner:200n,nonce:1n,amount:(1n<<62n)+17n,nativeRefund:10000000000n,fee:1000001000n};
 for(const name of ['return-input','return-middle']){
  const r=fundsRequest(p,name,terms),payments=r.contract_calls.filter(c=>c.method_name==='transfer'||c.method_name==='simple_transfer');assert.equal(payments.length,2);assert.ok(payments.every(c=>c.inputs[0]===200n));assert.equal(payments[0].contract_id,name==='return-input'?42n:43n);
  assert.throws(()=>fundsRequest(p,name,{...terms,receiver:201n}));
 }
 for(const bad of [{amount:1n<<124n},{owner:0n},{fee:1000001001n},{nonce:1n<<62n},{deadline:1n<<32n},{orderNonce:1n<<62n}])assert.throws(()=>fundsRequest(p,'return-input',{...terms,...bad}));
 assert.throws(()=>fundsRequest(p,'fund',{owner:200n,nonce:1n,amount:1n,fee:1000001000n}));
 assert.throws(()=>fundsRequest(p,'unknown',terms));
});
