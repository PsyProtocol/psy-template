import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertFrozenRuntimeEndcap,runtimeEndcapIdentityPath} from './runtimeEndcap.mjs';
const expected=JSON.parse(readFileSync(runtimeEndcapIdentityPath,'utf8'));
const current=JSON.parse(readFileSync(new URL('./test-fixtures/observed-endcap-reset-20261102.json',import.meta.url),'utf8'));
const state=(resource=expected.resource)=>({network:{magic:expected.networkMagic,prove_proxy_url:['https://proof.invalid']},rpc:async()=>JSON.stringify({ups_end_cap:resource})});
test('the actual reset-chain Endcap capture rejects the unchanged frozen SDK',async()=>{
 await assert.rejects(assertFrozenRuntimeEndcap(state(current.resource)),/runtime Endcap differs/);
});
test('an exact compatibility observation cannot become proof or broadcasting authority',async()=>{
 const result=await assertFrozenRuntimeEndcap(state());
 assert.equal(result.records[0].fingerprint,expected.resource.fingerprint);
 assert.match(result.scope,/no resource installation, proof verification, finality or broadcast authority/);
});
test('all configured proof endpoints must agree with the compiled resource',async()=>{
 const s=state();s.network.prove_proxy_url.push('https://other.invalid');
 s.rpc=async url=>JSON.stringify({ups_end_cap:url.includes('other')?current.resource:expected.resource});
 await assert.rejects(assertFrozenRuntimeEndcap(s),/runtime Endcap differs/);
});
test('a completed compatibility observation is never a cache for the next transaction',async()=>{
 let calls=0;const s=state();s.rpc=async()=>JSON.stringify({ups_end_cap:++calls===1?expected.resource:current.resource});
 await assertFrozenRuntimeEndcap(s);await assert.rejects(assertFrozenRuntimeEndcap(s),/runtime Endcap differs/);assert.equal(calls,2);
});
test('wrong domain, missing endpoints, malformed registry and key substitution fail closed',async()=>{
 let s=state();s.network.magic='1';await assert.rejects(assertFrozenRuntimeEndcap(s),/domain differs/);
 s=state();s.network.prove_proxy_url=[];await assert.rejects(assertFrozenRuntimeEndcap(s),/endpoint required/);
 for(const reply of [null,'{}','{broken',JSON.stringify({ups_end_cap:{...expected.resource,verifier_config:{}}})]){
  s=state();s.rpc=async()=>reply;await assert.rejects(assertFrozenRuntimeEndcap(s));
 }
});
