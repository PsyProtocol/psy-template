// Compatibility with the compiled frozen SDK, not runtime attestation/finality.
// Remote verifier bytes are compared, never installed or used for verification.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sdkRelease} from './sdkProfiles.mjs';
export const runtimeEndcapIdentityPath = new URL('./resources/mainnet-beta-endcap-c92880c8.json',import.meta.url);
export function runtimeEndcapPath(profile){return new URL('./resources/'+sdkRelease(profile).resource,import.meta.url);}
export async function assertFrozenRuntimeEndcap(state,{profile='mainnet-beta-20261027-v1'}={}){
 const release=sdkRelease(profile),reviewed=JSON.parse(readFileSync(runtimeEndcapPath(profile),'utf8'));
 assert.equal(reviewed.schema,1);assert.equal(reviewed.sdkCommit,release.sdkCommit);
 assert.equal(BigInt(state.network.magic),BigInt(reviewed.networkMagic),'runtime Endcap network domain differs');
 const urls=state.network.prove_proxy_url;
 assert.ok(Array.isArray(urls)&&urls.length>0&&urls.every(u=>typeof u==='string'&&u.length>0),'Configured proof-resource endpoint required');
 const records=await Promise.all([...new Set(urls)].map(async url=>{
  const encoded=await state.rpc(url,'psy_get_circuits_data',[]);
  assert.equal(typeof encoded,'string','Encoded runtime circuit registry required');
  const registry=JSON.parse(encoded),actual=registry?.ups_end_cap;
  assert.equal(actual?.fingerprint,reviewed.resource.fingerprint,
   'runtime Endcap differs from frozen SDK; preserve requests and stop before proving or sending');
  assert.deepEqual(actual,reviewed.resource,'runtime Endcap verifier bytes differ from frozen SDK');
  return {endpoint:url,fingerprint:actual.fingerprint};
 }));
 return {sdkCommit:reviewed.sdkCommit,networkMagic:reviewed.networkMagic,records,
  scope:'Fresh RPC compatibility observation only; no resource installation, proof verification, finality or broadcast authority'};
}
