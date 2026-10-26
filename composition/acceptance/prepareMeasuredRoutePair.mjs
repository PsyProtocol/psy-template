// Nonfinancial gate after separately confirmed fresh setup. This never
// deploys, registers, funds, signs, quotes, proves or submits a transaction.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {run,binding,contractBinding} from '../../batching/admission/liveSupport.mjs';
import {publicState} from '../../executor/publicState.mjs';
import {saveObservation} from '../../executor/observations.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {COMPOSITION_SDK} from '../contract/runtimePolicy.mjs';
import {routePairBindings,assertPreparedRoutePair} from './routePairBindings.mjs';

const [base,releasePath,toolsPath,label]=process.argv.slice(2);
assert.match(label??'',/^v[1-9][0-9]*$/);
const read=path=>JSON.parse(readFileSync(path,'utf8'));
assert.ok(!existsSync(join(base,'public/PREPARED-READY-v1.json')),'original readiness must not be replaced');
assert.ok(!existsSync(join(base,'financial-run.lock')));
const release=read(releasePath),first=join(base,'baseline'),selection=read(join(first,'public/QA-ORDINARY-SELECTION-v1.json'));
const ordinary=read(join(first,'public',selection.releaseFile));
const measured={schema:1,sdkManifestSha256:COMPOSITION_SDK,binaries:{ordinary:{file:ordinary.file,sha256:ordinary.sha256},compact:read(join(first,'public/toolchain-v1.json')).binaries.compact_market_wallet,composition:release.tools.composition_wallet}};
const measuredPath=join(base,'public/MEASURED-RELEASE-v1.json');
if(existsSync(measuredPath))assert.deepEqual(read(measuredPath),measured);else saveObservation(measuredPath,measured);
const bindings=routePairBindings(base,releasePath,toolsPath);
await run(process.execPath,['composition/acceptance/routePairPreflight.mjs',base,label],join(base,'prepared-readiness-'+label+'.log'),{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'});
const readinessFile='READINESS-PREFLIGHT-'+label+'.json',evidence=read(join(base,'public',readinessFile));
assert.ok(BigInt(evidence.accounts.find(a=>a.role==='sponsor').native)>=40000000000n,'setup Sponsor funding must already be claimed; no implicit funding here');
const controllers=[];
for(const variant of ['baseline','candidate']) {
 const round=join(base,variant),s=await publicState(join(round,'public/rpc.json')),r=read(join(round,'controllers-initialized-v1/success/build/REGISTERED.json'));
 assert.deepEqual(await s.userIds(r.publicKeyHash),[r.vaultId]);
 assert.deepEqual(await binding(s,r.controllerId),contractBinding(r.controllerId,r.deployment.leaf));
 for(const asset of [0,2483,2484])for(const slot of (asset===0?[0]:[0,1]))assert.equal(await s.slot(r.vaultId,asset,slot),0n,'unstarted isolated controller must have no spendable funds');
 const abi=read(join(round,'controllers-initialized-v1/success/build/compiled/compilation_artifact.json')).abi;
 const phase=abi.contract.state.find(f=>f.name==='phase');assert.ok(phase);assert.equal(await s.slot(r.vaultId,r.controllerId,phase.offset),0n);
 controllers.push({variant,checkpoint:s.checkpoint,controllerId:r.controllerId,vaultId:r.vaultId,publicKeyHash:r.publicKeyHash});
}
assert.deepEqual(routePairBindings(base,releasePath,toolsPath),bindings);
saveObservation(join(base,'public/PREPARED-READY-v1.json'),{schema:1,scope:'local-prepared-route-pair-v1',preparedAt:new Date().toISOString(),bindings,readinessFile,readinessSha256:sha256(readFileSync(join(base,'public',readinessFile))),controllers,freshStateChecksStillRequired:true,financialOperations:0,runtimeAttestation:false,upgradeAuthorizationAttestation:false});
assertPreparedRoutePair(base,releasePath,toolsPath);
console.log('local prepared pair pinned; fresh transaction checks still required');
