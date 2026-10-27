// Extension bootstrap only: statically imported bindgen 0.2.126 glue and a
// compiled release pin. No argument is accepted through a page RPC.
const instances=new WeakMap(),HEX=/^[0-9a-f]{64}$/;
const SDK='06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f',MAGIC='1384803358401154921';
const ok=(v,m)=>{if(!v)throw Error(m);};
async function digest(bytes){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function loadOwnedMarketVerifier({module,wasmUrl,release,fetcher=fetch}){
 ok(module&&typeof module.default==='function'&&['verifier_identity','project_market_identity','verify_market_prepared','get_owned_wasm_module'].every(k=>typeof module[k]==='function'),'Statically imported extension verifier module required');
 ok(release?.sdkManifestSha256===SDK&&release.networkMagic===MAGIC&&HEX.test(release.wasmSha256??'')&&HEX.test(release.verifierPackSha256??''),'Reviewed verifier release identity required');
 const pin=Object.freeze({...release}),initialize=module.default,loadedModule=module.get_owned_wasm_module;
 const identity=module.verifier_identity.bind(module),identify=module.project_market_identity.bind(module),verify=module.verify_market_prepared.bind(module);
 const here=new URL(globalThis.location?.href??'about:blank'),url=new URL(wasmUrl);
 ok(['chrome-extension:','moz-extension:'].includes(here.protocol)&&url.protocol===here.protocol&&url.hostname===here.hostname&&!url.username&&!url.password&&!url.search&&!url.hash,'Verifier must be an extension-owned immutable resource');
 const key=[url.href,pin.wasmSha256,pin.verifierPackSha256,SDK,MAGIC].join(':');
 const prior=instances.get(initialize);
 if(prior){ok(prior.key===key,'Verifier module is reserved for another release');return prior.promise;}
 // Bindgen's default initializer is module-global. Reserve ONE release and
 // reject initialization outside this owner, including an I/O-time race.
 ok(loadedModule()===undefined,'Verifier module already initialized outside its owner');
 const promise=(async()=>{
  const r=await fetcher(url.href,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});ok(r.ok,'Extension verifier resource unavailable');
  const bytes=await r.arrayBuffer();ok(bytes.byteLength>=8&&bytes.byteLength<=20_000_000&&await digest(bytes)===pin.wasmSha256,'Verifier binary changed');
  const compiled=await WebAssembly.compile(bytes);
  ok(loadedModule()===undefined,'Verifier module initialized during resource loading');
  await initialize({module_or_path:compiled});
  // The application-owned read-only accessor exposes bindgen's actual module.
  // Old-instance reuse or unsupported glue cannot claim this verified binary.
  ok(loadedModule()===compiled,'Verifier did not initialize the verified binary');
  const id=JSON.parse(identity());
  ok(id.schema===1&&id.verifierPackSha256===pin.verifierPackSha256&&id.sdkManifestSha256===SDK&&id.networkMagic===MAGIC,'Loaded verifier identity differs from release');
  const run=(fn,...args)=>{ok(loadedModule()===compiled,'Verifier instance changed after initialization');return fn(...args);};
  return Object.freeze({identity:async()=>run(identity),identify:async request=>run(identify,request),verify:async(request,approval,bundle)=>run(verify,request,approval,bundle)});
 })();
 instances.set(initialize,{key,promise});
 // Failure remains reserved. No silent key/binary/profile fallback or reload.
 return promise;
}
