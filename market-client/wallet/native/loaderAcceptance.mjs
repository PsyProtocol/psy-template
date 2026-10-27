// Actual web-target bindgen glue and full public proof, in Node with simulated
// extension location/file transport. Not browser-extension financial acceptance.
import {parseLosslessJson} from '../../../amm/u124/client.mjs';
import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{pathToFileURL}from'node:url';import{resolve,join}from'node:path';import{createHash}from'node:crypto';import{loadOwnedMarketVerifier}from'./ownedLoader.mjs';
const [webModule,wasmFile,packFile,fixtures,out]=process.argv.slice(2);assert.ok(out,'WEB_MODULE WASM PACK PUBLIC_FIXTURES FRESH_REPORT');mkdirSync(out);
const bytes=readFileSync(wasmFile),pack=parseLosslessJson(readFileSync(packFile,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const moduleUrl=pathToFileURL(resolve(webModule)).href,module=await import(moduleUrl);Object.defineProperty(globalThis,'location',{value:{href:'chrome-extension://qa-owned/background.html'},configurable:true});
const release={sdkManifestSha256:pack.sdk_manifest,networkMagic:String(pack.network_magic),wasmSha256:hash(bytes),verifierPackSha256:hash(readFileSync(packFile))};let reads=0;
const options={module,wasmUrl:'chrome-extension://qa-owned/assets/market_verifier_bg.wasm',release,fetcher:async url=>{reads++;assert.equal(url,'chrome-extension://qa-owned/assets/market_verifier_bg.wasm');return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}};
const [a,b]=await Promise.all([loadOwnedMarketVerifier(options),loadOwnedMarketVerifier(options)]);assert.equal(a,b);assert.equal(reads,1);
const raw=n=>readFileSync(join(fixtures,n+'.json'),'utf8');const report=JSON.parse(await a.verify(raw('request'),raw('approval'),raw('bundle')));assert.equal(report.fullProofVerified,true);
const approval=JSON.parse(raw('approval'));approval.nonce++;
await assert.rejects(a.verify(raw('request'),JSON.stringify(approval),raw('bundle')));assert.equal(reads,1);
// Same verifier pack, different valid WASM bytes: append a custom section.
const other=Buffer.concat([bytes,Buffer.from([0,2,1,120])]),otherRelease={...release,wasmSha256:hash(other)};
await assert.rejects(loadOwnedMarketVerifier({...options,release:otherRelease}),/another release/);
const preinitialized=await import(moduleUrl+'?preinitialized=1');
await preinitialized.default({module_or_path:bytes});
await assert.rejects(loadOwnedMarketVerifier({...options,module:preinitialized,release:otherRelease}),/already initialized/);
const racing=await import(moduleUrl+'?racing=1');
await assert.rejects(loadOwnedMarketVerifier({...options,module:racing,release:otherRelease,fetcher:async()=>{await racing.default({module_or_path:bytes});return{ok:true,arrayBuffer:async()=>other.buffer.slice(other.byteOffset,other.byteOffset+other.byteLength)};}}),/initialized during/);
// An outside initializer can begin before ownership and finalize after us.
// Recheck the module on every use, not only immediately after initialization.
const late=await import(moduleUrl+'?late=1');let finishOutside;
const outside=late.default({module_or_path:new Promise(resolve=>{finishOutside=resolve;})});
const active=await loadOwnedMarketVerifier({...options,module:late,release:otherRelease,fetcher:async()=>({ok:true,arrayBuffer:async()=>other.buffer.slice(other.byteOffset,other.byteOffset+other.byteLength)})});
assert.equal(JSON.parse(await active.identity()).verifierPackSha256,release.verifierPackSha256);
finishOutside(bytes);await outside;
await assert.rejects(active.verify(raw('request'),raw('approval'),raw('bundle')),/instance changed/);
writeFileSync(join(out,'REPORT.json'),JSON.stringify({actualWebTargetWasm:true,verifiedBinaryBeforeInitialization:true,secondSamePackBinaryRejected:true,outsidePreinitializationRejected:true,initializationRaceRejected:true,lateOutsideInitializationDetectedOnUse:true,concurrentResourceLoads:2,resourceReads:reads,fullProofVerified:true,changedNonceRejectedWithoutResourceReload:true,...release,financialOperations:0,scope:'actual WASM and complete proof; Node simulated extension location and file response, not actual extension-origin or live acceptance'},null,2)+'\n',{flag:'wx'});
console.log('Owned loader verified actual binary and full proof; resource reuse did not cache state-proof validity.');
