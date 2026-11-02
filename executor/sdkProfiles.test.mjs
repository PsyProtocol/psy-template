import test from 'node:test';
import assert from 'node:assert/strict';
import {sdkRelease,sdkReleaseForCommit,assertDriverSdkIdentity} from './sdkProfiles.mjs';
import {assertFrozenRuntimeEndcap} from './runtimeEndcap.mjs';
import {readFileSync} from 'node:fs';
const audit='sdk-audit-20261102-v1',legacy='mainnet-beta-20261027-v1';
test('moving names and unknown commits cannot select SDK releases',()=>{
 for(const p of ['audit','mainnet-beta','automatic',''])assert.throws(()=>sdkRelease(p));
 assert.throws(()=>sdkReleaseForCommit('0'.repeat(40)));
 assert.equal(sdkReleaseForCommit(sdkRelease(audit).sdkCommit).profile,audit);
 assert.ok(Object.isFrozen(sdkRelease(audit)));
});
test('audit driver identity binds client, SDK commit and explicit profile',()=>{
 const r=sdkRelease(audit),d={sdkCommit:r.sdkCommit,clientCommit:r.clientCommit,sdkProfile:audit};
 assertDriverSdkIdentity(d,audit);
 for(const k of ['sdkCommit','clientCommit','sdkProfile']){const wrong={...d,[k]:'wrong'};assert.throws(()=>assertDriverSdkIdentity(wrong,audit));}
 assert.throws(()=>assertDriverSdkIdentity({},audit));
 assert.throws(()=>assertDriverSdkIdentity(d,legacy));
});
test('the audit resource is accepted only under the user-selected exact audit profile',async()=>{
 const resource=JSON.parse(readFileSync(new URL('./resources/audit-endcap-01b8f2b0.json',import.meta.url),'utf8')).resource;
 const s={network:{magic:'1384803358401154921',prove_proxy_url:['https://proof.invalid']},rpc:async()=>JSON.stringify({ups_end_cap:resource})};
 assert.equal((await assertFrozenRuntimeEndcap(s,{profile:audit})).sdkCommit,sdkRelease(audit).sdkCommit);
 await assert.rejects(assertFrozenRuntimeEndcap(s,{profile:legacy}));
 resource.verifier_config.circuit_digest='0'.repeat(64);await assert.rejects(assertFrozenRuntimeEndcap(s,{profile:audit}));
});
