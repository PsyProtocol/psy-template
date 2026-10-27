// Explicit synthetic WASM glue/resource adapters. Real WASM proofs are separate.
import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{loadOwnedMarketVerifier}from'./native/ownedLoader.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('owned verifier pins binary, resource identity and extension domain before use',async()=>{
 const saved=Object.getOwnPropertyDescriptor(globalThis,'location');Object.defineProperty(globalThis,'location',{value:{href:'chrome-extension://qa-owned/background.html'},configurable:true});
 try{
 const bytes=Uint8Array.from([0,97,115,109,1,0,0,0,0,2,1,120]),release={sdkManifestSha256:'06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f',networkMagic:'1384803358401154921',wasmSha256:hash(bytes),verifierPackSha256:hash('pack')};let reads=0,initializations=0;
 const identity={schema:1,...release};let loaded;const module={default:async options=>{assert.ok(options.module_or_path instanceof WebAssembly.Module);loaded=options.module_or_path;initializations++;},get_owned_wasm_module:()=>loaded,verifier_identity:()=>JSON.stringify(identity),project_market_identity:()=>'{"verified":false}',verify_market_prepared:()=>'{"synthetic":true}'};
 const freshModule=(overrides={})=>{let instance;const m={...module,...overrides,get_owned_wasm_module:()=>instance};m.default=async options=>{instance=options.module_or_path;initializations++;};return m;};
 const options={module,wasmUrl:'chrome-extension://qa-owned/assets/verifier.wasm',release,fetcher:async()=>{reads++;return{ok:true,arrayBuffer:async()=>bytes.buffer};}};
 const [a,b]=await Promise.all([loadOwnedMarketVerifier(options),loadOwnedMarketVerifier(options)]);assert.equal(a,b);assert.equal(reads,1);assert.equal(initializations,1);
 await assert.rejects(loadOwnedMarketVerifier({...options,release:{...release,wasmSha256:hash('another same-pack binary')}}),/another release/);assert.equal(reads,1);
 for(const wasmUrl of ['https://other.invalid/verifier.wasm','chrome-extension://other/assets/verifier.wasm','chrome-extension://qa-owned/assets/verifier.wasm?replace=1'])await assert.rejects(loadOwnedMarketVerifier({...options,wasmUrl}));
 await assert.rejects(loadOwnedMarketVerifier({...options,release:{...release,networkMagic:'1'}}));
 await assert.rejects(loadOwnedMarketVerifier({...options,module:freshModule(),release:{...release,wasmSha256:hash('changed')}}));assert.equal(initializations,1);
 await assert.rejects(loadOwnedMarketVerifier({...options,module:freshModule({verifier_identity:()=>JSON.stringify({...identity,verifierPackSha256:hash('changed')})})}));
 await assert.rejects(loadOwnedMarketVerifier({...options,module:{...module,get_owned_wasm_module:()=>undefined,default:async()=>{}}}),/did not initialize/);
 const mutable={...release},changed=new TextEncoder().encode('replaced binary after await');let changedStarts=0;
 await assert.rejects(loadOwnedMarketVerifier({...options,module:{...module,get_owned_wasm_module:()=>undefined,default:async()=>{changedStarts++;}},release:mutable,fetcher:async()=>{mutable.wasmSha256=hash(changed);return{ok:true,arrayBuffer:async()=>changed.buffer};}}),/binary changed/);assert.equal(changedStarts,0);
 }finally{if(saved)Object.defineProperty(globalThis,'location',saved);else delete globalThis.location;}
});
