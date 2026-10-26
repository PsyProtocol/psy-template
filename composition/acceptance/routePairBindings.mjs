// A readiness marker is only a local, immutable preparation record. Every
// actual transaction still needs fresh network/state/nonce/fee checks.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {sha256} from '../../executor/requestBinding.mjs';
import {COMPOSITION_SDK} from '../contract/runtimePolicy.mjs';
import {routeResourcePlan} from './routeResourcePlan.mjs';

const read=path=>JSON.parse(readFileSync(path,'utf8'));
const hash=path=>sha256(readFileSync(path));
export function routePairBindings(base,releasePath,toolsPath) {
 const plan=read(join(base,'public/PAIR-PLAN-v1.json'));
 assert.deepEqual(plan.rounds,['baseline','candidate']);
 assert.equal(plan.sameSdkManifestSha256,COMPOSITION_SDK);
 assert.equal(plan.expectedActualUpsPerRound,28);
 assert.equal(plan.expectedActualFillsPerRound,2);
 assert.equal(plan.maxRoundMilliseconds,21600000);
 assert.equal(plan.maxTotalMilliseconds,43200000);
 const release=read(releasePath),tools=read(toolsPath);
 for(const r of [release,tools]) {
  assert.equal(r.sdkManifestSha256,COMPOSITION_SDK);
  for(const b of Object.values(r.tools))assert.equal(hash(b.file),b.sha256,'native release changed');
 }
 const files={};
 const add=path=>{const name=relative(resolve(base),resolve(path));assert.ok(name&&!name.startsWith('..')&&!name.startsWith('/'));files[name]=hash(path);};
 add(join(base,'public/PAIR-PLAN-v1.json'));
 add(join(base,'public/MEASURED-RELEASE-v1.json'));
 const controllers=[],ordinary=[],compacts=[],networks=[];
 for(const variant of plan.rounds) {
  const round=join(base,variant),p=routeResourcePlan(round);assert.equal(p.variant,variant);
  for(const name of ['ROUTE-RESOURCE-PLAN-v1.json','BOOTSTRAP-v1.json','rpc.json','toolchain-v1.json','CONTROLLER-GENERATION-v1.json','QA-ORDINARY-SELECTION-v1.json','CONTROLLER-PUBLISHER-v1.json','ASSET-SOURCES-v1.json','TOKEN-COMPILER-RELEASE-v1.json'])add(join(round,'public',name));
  networks.push(hash(join(round,'public/rpc.json')));
  const compact=read(join(round,'public/toolchain-v1.json')).binaries.compact_market_wallet;assert.equal(hash(compact.file),compact.sha256);compacts.push(compact);
  for(const asset of read(join(round,'public/ASSET-SOURCES-v1.json')))for(const name of [asset.source,asset.artifact])add(join(round,name));
  for(const hop of ['hop-1','hop-2'])for(const name of ['main.psy.rs','config.json','token-a.json','token-b.json','native.json','compiled/compilation_artifact.json','bound/policy.json','bound/BOUND.json','BUILD.json','live-registration.json'])add(join(round,'pools',hop,'build',name));
  const selection=read(join(round,'public/QA-ORDINARY-SELECTION-v1.json'));
  assert.match(selection.releaseFile,/^QA-ORDINARY-RELEASE-v[1-9][0-9]*\.json$/);
  const selected=join(round,'public',selection.releaseFile);add(selected);assert.equal(hash(selected),selection.releaseSha256);
  const binary=read(selected);assert.equal(binary.sdkManifestSha256,COMPOSITION_SDK);assert.equal(hash(binary.file),binary.sha256);ordinary.push({file:binary.file,sha256:binary.sha256});
  const local=join(round,'controllers-initialized-v1/success'),build=join(local,'build');
  for(const name of ['REGISTERED.json','registry.json','main.psy.rs','metadata.json','policy.json','compiled/compilation_artifact.json'])add(join(build,name));
  for(const name of ['deploy-controller-v1','register-execution-v1'])for(const file of ['request.json','receipt.json'])add(join(local,'attempts',name,file));
  const r=read(join(build,'REGISTERED.json'));
  assert.equal(r.sdkManifestSha256,COMPOSITION_SDK);assert.equal(r.scenario,'success');
  assert.equal(hash(join(build,'main.psy.rs')),r.sourceSha256);
  assert.equal(hash(join(build,'compiled/compilation_artifact.json')),r.artifactSha256);
  assert.equal(hash(join(build,'policy.json')),r.policySha256);
  const publisher=read(join(round,'public/CONTROLLER-PUBLISHER-v1.json'));
  assert.equal(r.deployer.publicKeyHash,publisher.publicKeyHash);
  controllers.push({id:r.controllerId,vault:r.vaultId,key:r.publicKeyHash});
 }
 assert.deepEqual(ordinary[0],ordinary[1],'ordinary application differs across comparison');
 assert.deepEqual(compacts[0],compacts[1],'base market driver differs across comparison');assert.equal(networks[0],networks[1],'network config differs across comparison');
 assert.deepEqual(read(join(base,'public/MEASURED-RELEASE-v1.json')),{schema:1,sdkManifestSha256:COMPOSITION_SDK,binaries:{ordinary:ordinary[0],compact:compacts[0],composition:release.tools.composition_wallet}},'observer release must describe actual drivers');
 for(const k of ['id','vault','key'])assert.notEqual(controllers[0][k],controllers[1][k],'fresh separate controller/key/vault required');
 return {files,releaseSha256:hash(releasePath),toolsSha256:hash(toolsPath),sdkManifestSha256:COMPOSITION_SDK};
}
export function assertPreparedRoutePair(base,releasePath,toolsPath) {
 const marker=read(join(base,'public/PREPARED-READY-v1.json'));
 assert.equal(marker.schema,1);assert.equal(marker.scope,'local-prepared-route-pair-v1');
 assert.equal(marker.freshStateChecksStillRequired,true);
 assert.deepEqual(marker.bindings,routePairBindings(base,releasePath,toolsPath),'prepared route inputs changed');
 assert.match(marker.readinessFile,/^READINESS-PREFLIGHT-v[1-9][0-9]*\.json$/);
 const file=join(base,'public',marker.readinessFile);assert.equal(hash(file),marker.readinessSha256);
 const evidence=read(file);assert.equal(evidence.newFinancialOperations,0);
 assert.equal(evidence.oldSponsorsFullyClaimed,true);assert.equal(evidence.sdkManifestSha256,COMPOSITION_SDK);
 assert.ok(Number.isSafeInteger(evidence.checkpoint));
 return marker;
}
