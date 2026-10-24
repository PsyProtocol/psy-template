// Fresh controller/key and journals over two already owned, validated QA pools.
// Copies immutable public fixtures; no old contract update or old task replay.
import assert from 'node:assert/strict';
import{existsSync,mkdirSync,copyFileSync,constants,readFileSync,readdirSync,chmodSync}from'node:fs';
import{join,resolve}from'node:path';
import{read,save,run}from'../../batching/admission/liveSupport.mjs';
import{ordinaryRelease}from'./applicationRelease.mjs';
import{sha256}from'../../executor/requestBinding.mjs';
import{assertDurableRuntimeDirectory}from'../../executor/runtimeStorage.mjs';
import{COMPOSITION_SDK}from'../contract/runtimePolicy.mjs';
const[previous,base,baselineRoot]=process.argv.slice(2);assertDurableRuntimeDirectory(base);assert.ok(previous&&baselineRoot&&!existsSync(base));
assert.equal(read(join(previous,'public/SERVICE-LOCAL-ACCEPTANCE-COMPLETE-v1.json')).ordinaryOwnerClaimIncluded??true,true);
const copy=(src,dst)=>{mkdirSync(join(dst,'..'),{recursive:true});copyFileSync(src,dst,constants.COPYFILE_EXCL);};
mkdirSync(base,{mode:0o700});for(const d of['public','attempts','.secrets','controllers-initialized-v1'])mkdirSync(join(base,d),{mode:0o700});
const publicNames=['rpc.json','toolchain-v1.json','BOOTSTRAP-v1.json','ASSET-SOURCES-v1.json','qa-a-deployment-v1.json','qa-b-deployment-v1.json','TOKEN-COMPILER-RELEASE-v1.json','ASSETS-READY-v1.json','COMPOSITION-LIQUIDITY-READY-v1.json','COMPOSITION-INITIALIZATION-READY-v1.json','CONTROLLER-GENERATION-v1.json','QA-ORDINARY-RELEASE-v3.json','QA-ORDINARY-RELEASE-v4.json','QA-ORDINARY-SELECTION-v1.json'];
for(const n of publicNames)if(existsSync(join(previous,'public',n)))copy(join(previous,'public',n),join(base,'public',n));
const assets=read(join(base,'public/ASSET-SOURCES-v1.json'));for(const a of assets)for(const n of[a.source,a.artifact])copy(join(previous,n),join(base,n));
for(const hop of['hop-1','hop-2'])for(const n of['main.psy.rs','config.json','token-a.json','token-b.json','native.json','compiled/compilation_artifact.json','bound/policy.json','bound/BOUND.json','BUILD.json','live-registration.json'])copy(join(previous,'pools',hop,'build',n),join(base,'pools',hop,'build',n));
for(const a of read(join(base,'public/BOOTSTRAP-v1.json')).actors){copy(join(previous,'.secrets',a.name+'.json'),join(base,'.secrets',a.name+'.json'));chmodSync(join(base,'.secrets',a.name+'.json'),0o600);}
const tools=read(join(base,'public/toolchain-v1.json'));assert.equal(tools.sdkManifestSha256,COMPOSITION_SDK);const ordinary=ordinaryRelease(base,tools.binaries.isolated_wallet),name='performance-publisher-v1',identity=join(base,'public/publisher-identity-v1.json');
await run(ordinary.file,['create',join(base,'public/rpc.json'),join(base,'.secrets',name+'.json'),identity],join(base,'publisher-create-v1.log'),{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'});
save(join(base,'public/CONTROLLER-PUBLISHER-v1.json'),{schema:1,scenario:'success',secretName:name,publicKeyHash:read(identity).publicKeyHash});
save(join(base,'public/PREPARATION-COMPARISON-v1.json'),{baselineSource:join(resolve(baselineRoot),'baseline-source'),baselineManifest:join(resolve(baselineRoot),'SOURCE-BASELINE.json'),outputDirectory:join(base,'paired-preparation'),proofMode:'same-source-first-open-exact-request-reuse-v1'});
save(join(base,'public/PERFORMANCE-PLAN-v1.json'),{schema:1,startedAt:new Date().toISOString(),previousCase:previous,scope:'fresh controller/key, existing owned QA AMM pools 2485/2486, new epochs/orders; exact same tasks independently prepared/proved before one optimized submission',baselineCommit:'efe3c9fad1605f23a8177ec3d0ea71826badb9cd',sdkManifestHash:COMPOSITION_SDK,ordinarySha256:ordinary.sha256,pricingChanged:false,existingPusdtUsed:false,baselineProofBroadcasts:0,comparisonScope:'paired preparation/full proof only; optimized confirmation/ordinary claim observed separately; no matched baseline confirmation measurement or chain TPS claim'});
console.log('new performance controller case prepared',base);
