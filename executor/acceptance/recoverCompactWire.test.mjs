import test from'node:test';import assert from'node:assert/strict';import{exactCompactWire}from'./recoverCompactWire.mjs';
test('compact recovery preserves exact request identity and rejects method, proof, endpoint and nonce substitution',()=>{
 const r={user_ec_input:{core:{new_user_leaf:{nonce:7n},state_transition:{end_user_leaf_hash:'a'.repeat(64)}}},proof:[1n,2n,3n]},wire=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method:'psy_submit_user_end_cap',params:r},(_k,v)=>typeof v==='bigint'?Number(v):v));
 assert.doesNotThrow(()=>exactCompactWire(wire,r));
 for(const mutate of [x=>x.proof.push(4n),x=>x.user_ec_input.core.new_user_leaf.nonce++,x=>x.user_ec_input.core.state_transition.end_user_leaf_hash='b'.repeat(64)]){const x=structuredClone(r);mutate(x);assert.throws(()=>exactCompactWire(wire,x));}
 assert.throws(()=>exactCompactWire(Buffer.from(wire.toString().replace('psy_submit_user_end_cap','psy_deploy_contract')),r));
});
