import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {sha256} from '../../executor/requestBinding.mjs';
import {COMPOSITION_SDK as sdk} from '../contract/runtimePolicy.mjs';
import {routePairBindings,assertPreparedRoutePair} from './routePairBindings.mjs';

function fixture(fn) {
 const base=mkdtempSync(join(tmpdir(),'readonly-pair-bindings-'));
 const save=(file,value)=>{mkdirSync(dirname(file),{recursive:true});const raw=JSON.stringify(value);writeFileSync(file,raw);return sha256(raw);};
 try {
  const binary={file:join(base,'fake-binary'),sha256:sha256('fixture; never executed')};writeFileSync(binary.file,'fixture; never executed');
  const release=join(base,'release.json'),tools=join(base,'tools.json');
  save(release,{sdkManifestSha256:sdk,tools:{composition_wallet:binary}});save(tools,{sdkManifestSha256:sdk,tools:{artifact_identity:binary}});
  save(join(base,'public/PAIR-PLAN-v1.json'),{rounds:['baseline','candidate'],sameSdkManifestSha256:sdk,expectedActualUpsPerRound:28,expectedActualFillsPerRound:2,maxRoundMilliseconds:21600000,maxTotalMilliseconds:43200000});
  save(join(base,'public/MEASURED-RELEASE-v1.json'),{schema:1,sdkManifestSha256:sdk,binaries:{ordinary:binary,compact:binary,composition:binary}});
  for(const [i,variant]of ['baseline','candidate'].entries()) {
   const round=join(base,variant),pub=name=>join(round,'public',name),build=join(round,'controllers-initialized-v1/success/build');
   save(pub('ROUTE-RESOURCE-PLAN-v1.json'),{schema:1,profile:'two-pool-resource-pair-v1',variant,sdkManifestHash:sdk,overlapFundingAndWarmup:variant==='candidate',cutoffLeads:[128,128],expectedFills:2,expectedUps:28,maxRoundMilliseconds:21600000,unknownBroadcastReplacementAllowed:false});
   for(const name of ['BOOTSTRAP-v1.json','rpc.json','CONTROLLER-GENERATION-v1.json','TOKEN-COMPILER-RELEASE-v1.json'])save(pub(name),{});
   save(pub('toolchain-v1.json'),{binaries:{compact_market_wallet:binary}});save(pub('ASSET-SOURCES-v1.json'),[]);
   save(pub('CONTROLLER-PUBLISHER-v1.json'),{publicKeyHash:'publisher-'+i});
   const selected='QA-ORDINARY-RELEASE-v5.json',releaseSha256=save(pub(selected),{...binary,sdkManifestSha256:sdk});save(pub('QA-ORDINARY-SELECTION-v1.json'),{releaseFile:selected,releaseSha256});
   for(const hop of ['hop-1','hop-2'])for(const name of ['main.psy.rs','config.json','token-a.json','token-b.json','native.json','compiled/compilation_artifact.json','bound/policy.json','bound/BOUND.json','BUILD.json','live-registration.json'])save(join(round,'pools',hop,'build',name),{});
   const sourceSha256=save(join(build,'main.psy.rs'),{}),artifactSha256=save(join(build,'compiled/compilation_artifact.json'),{}),policySha256=save(join(build,'policy.json'),{});
   for(const name of ['registry.json','metadata.json'])save(join(build,name),{});
   save(join(build,'REGISTERED.json'),{sdkManifestSha256:sdk,scenario:'success',deployer:{publicKeyHash:'publisher-'+i},sourceSha256,artifactSha256,policySha256,controllerId:900+i,vaultId:1000+i,publicKeyHash:'key-'+i});
   for(const name of ['deploy-controller-v1','register-execution-v1'])for(const file of ['request.json','receipt.json'])save(join(round,'controllers-initialized-v1/success/attempts',name,file),{});
  }
  const readinessFile='READINESS-PREFLIGHT-v1.json',readinessSha256=save(join(base,'public',readinessFile),{newFinancialOperations:0,oldSponsorsFullyClaimed:true,sdkManifestSha256:sdk,checkpoint:12});
  const marker={schema:1,scope:'local-prepared-route-pair-v1',freshStateChecksStillRequired:true,bindings:routePairBindings(base,release,tools),readinessFile,readinessSha256};
  save(join(base,'public/PREPARED-READY-v1.json'),marker);
  fn({base,release,tools,save,marker});
 }finally{rmSync(base,{recursive:true,force:true});}
}
test('prepared pair pins exact native, SDK, new controllers and local input records',()=>fixture(({base,release,tools})=>{assert.equal(assertPreparedRoutePair(base,release,tools).freshStateChecksStillRequired,true);}));
test('readiness flag alone, swapped release or changed network cannot authorize pair',()=>{for(const mutate of [({base,save})=>save(join(base,'public/PREPARED-READY-v1.json'),{ready:true}),({release,save})=>save(release,{sdkManifestSha256:'b'.repeat(64),tools:{}}),({base,save})=>save(join(base,'candidate/public/rpc.json'),{otherNetwork:true})])fixture(x=>{mutate(x);assert.throws(()=>assertPreparedRoutePair(x.base,x.release,x.tools));});});
test('source, key, readiness outcome and observed executable replacement are rejected',()=>{for(const mutate of [({base,save})=>save(join(base,'candidate/controllers-initialized-v1/success/build/main.psy.rs'),{changed:true}),({base,save})=>{const path=join(base,'candidate/controllers-initialized-v1/success/build/REGISTERED.json'),r=JSON.parse(readFileSync(path,'utf8'));save(path,{...r,publicKeyHash:'key-0'});},({base,marker,save})=>{marker.bindings.files={};save(join(base,'public/PREPARED-READY-v1.json'),marker);},({base,save})=>save(join(base,'public/READINESS-PREFLIGHT-v1.json'),{checkpoint:13}),({base,save})=>save(join(base,'public/MEASURED-RELEASE-v1.json'),{binaries:{}})])fixture(x=>{mutate(x);assert.throws(()=>assertPreparedRoutePair(x.base,x.release,x.tools));});});
