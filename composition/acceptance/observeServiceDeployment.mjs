// Exact saved independent deployment lookup. Never resends, registers, funds or
// writes an acknowledgement into an attempt still owned by the SDK process.
import assert from 'node:assert/strict';import {mkdirSync,readFileSync} from 'node:fs';import {join,dirname} from 'node:path';
import {read,save,run} from '../../batching/admission/liveSupport.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {publicState} from '../../executor/publicState.mjs';import {initialLookup} from './deploymentRecovery.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
const[base,label]=process.argv.slice(2);assert.match(label??'',/^v[1-9][0-9]*$/);
const home=join(controllerDirectory(base),'service-recovery'),attempt=join(home,'attempts/deploy-controller-independent-v1');
const out=join(home,'public/deployment-observe-'+label);mkdirSync(out);
const release=read(join(dirname(base),'composition-live-v1/public/deployment-identities-v1/RELEASE.json'));
assert.equal(release.binarySha256,'21531c08685dfcadde70deb025e355c6c789d4c9a2e60371cf41a10b36842bff');
assert.equal(sha256(readFileSync(release.binary)),release.binarySha256);
await run(release.binary,[join(attempt,'request.json'),join(out,'identity.json')],join(out,'identity.log'));
const id=read(join(out,'identity.json')),pre=read(join(attempt,'preflight.json')),selection=read(join(home,'public/SELECTED-DEPLOYMENT-v1.json'));
assert.equal(pre.initialLayoutVerified,true);assert.equal(pre.publicEndpointsBound,true);assert.equal(pre.expectedDeployer,selection.publicKeyHash);
assert.equal(id.deployer,selection.publicKeyHash);assert.equal(id.requestSha256,sha256(readFileSync(join(attempt,'request.json'))));
const state=await publicState(join(base,'public/rpc.json')),url=state.network.api_services_url[0].replace(/\/$/,'')+'/api/v1/transaction/hash/'+id.expectedContentHash;
const response=await fetch(url,{signal:AbortSignal.timeout(20000)}),body=await response.text();
save(join(out,'lookup.json'),{httpStatus:response.status,body:JSON.parse(body)});
const status=initialLookup(response.status,JSON.parse(body),id.expectedContentHash,read(join(attempt,'before.json')));
save(join(out,'observation.json'),{checkedAt:new Date().toISOString(),checkpoint:state.checkpoint,identity:id,status,
 scope:'exact initial identity + fresh occurrence lookup; lookup alone not full layout approval or broadcast acknowledgement; no mutations'});
console.log(status.status,'checkpoint',state.checkpoint,'hash',id.expectedContentHash);
