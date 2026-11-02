// Compatibility with the compiled frozen SDK, not runtime attestation/finality.
// Remote verifier bytes are compared, never installed or used for verification.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export const runtimeEndcapIdentityPath = new URL('./resources/mainnet-beta-endcap-c92880c8.json',import.meta.url);
const reviewed = JSON.parse(readFileSync(runtimeEndcapIdentityPath,'utf8'));
assert.equal(reviewed.schema,1);
assert.equal(reviewed.sdkCommit,'c92880c8b6e2c8d392f19368bc8801a2584fd427');
export async function assertFrozenRuntimeEndcap(state){
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
