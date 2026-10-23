import test from 'node:test';import assert from 'node:assert/strict';
import {compactIdentityCache} from './identityCache.mjs';
const h=c=>c.repeat(64),binding=()=>({driverSha256:h('1'),policySha256:h('2'),rpcConfigSha256:h('3'),identity:{network:'sepolia',fingerprint:h('4'),publicKeyHash:h('5'),vaultId:100},dependencies:[{contract:{contractId:10,codeRoot:h('6'),layoutRoot:h('7')}}]}),value=b=>({profile:'compact-v1',fingerprint:b.identity.fingerprint,publicKeyHash:b.identity.publicKeyHash});
test('concurrent and sequential identical public identities build once; no mutable proof state is retained',async()=>{
 const cache=compactIdentityCache(),b=binding();let calls=0;const load=async()=>{calls++;await new Promise(r=>setImmediate(r));return{...value(b),nonce:99,witness:'must not retain'};};
 const r=await Promise.all([cache(b,load),cache(b,load)]);assert.equal(calls,1);assert.equal(r[0],r[1]);assert.equal(await cache(b,load),r[0]);assert.deepEqual(Object.keys(r[0]).sort(),['fingerprint','profile','publicKeyHash']);assert.ok(Object.isFrozen(r[0]));
});
test('all release, network, key and code/layout dependencies invalidate public metadata reuse',async()=>{
 const cache=compactIdentityCache(),base=binding();let calls=0;const use=b=>cache(b,async()=>{calls++;return value(b);});await use(base);
 for(const change of [b=>b.driverSha256=h('8'),b=>b.policySha256=h('8'),b=>b.rpcConfigSha256=h('8'),b=>b.identity.network='other',b=>b.identity.vaultId=101,b=>b.identity.fingerprint=h('8'),b=>b.identity.publicKeyHash=h('8'),b=>b.dependencies[0].contract.codeRoot=h('8'),b=>b.dependencies[0].contract.layoutRoot=h('8')]){const b=structuredClone(base);change(b);await use(b);}assert.equal(calls,10);
});
test('wrong identities and loader failures never become reusable successful entries',async()=>{
 const cache=compactIdentityCache(),b=binding();let calls=0;
 for(const load of [async()=>{throw Error('failed child');},async()=>({...value(b),fingerprint:h('9')}),async()=>({...value(b),publicKeyHash:h('9')})])await assert.rejects(cache(b,async()=>{calls++;return load();}));
 assert.deepEqual(await cache(b,async()=>{calls++;return value(b);}),value(b));assert.equal(calls,4);
});
test('bounded cache evicts completed metadata rather than accumulating release identities',async()=>{
 const cache=compactIdentityCache({capacity:1}),a=binding(),b=binding();b.driverSha256=h('8');let calls=0;const use=x=>cache(x,async()=>{calls++;return value(x);});await use(a);await use(b);await use(a);assert.equal(calls,3);
});
