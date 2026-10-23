// Application domain pin, NOT an attestation of the running server's binary or
// an independently authenticated genesis checkpoint. The complete registry
// hash compiles this domain into the owner's on-chain commitment.
import assert from 'node:assert/strict';import{commitment}from'./intent.mjs';import{COMPOSITION_MAGIC,COMPOSITION_SDK}from'./contract/runtimePolicy.mjs';
export function compositionDomain(networkName,network){
 assert.equal(networkName,'sepolia');assert.equal(BigInt(network.magic),COMPOSITION_MAGIC);assert.ok(Number.isSafeInteger(network.users_per_realm)&&network.users_per_realm>0);
 const urls=rows=>{assert.ok(Array.isArray(rows)&&rows.length);return rows.map(r=>{assert.ok(Number.isSafeInteger(r.id)&&r.id>=0);assert.ok(Array.isArray(r.rpc_url)&&r.rpc_url.length);return{id:r.id,urls:r.rpc_url.map(url=>{const u=new URL(url);assert.equal(u.protocol,'https:');assert.equal(u.username+u.password+u.hash,'');return u.href;})};}).sort((a,b)=>a.id-b.id);};
 const realms=urls(network.realm_configs),coordinators=urls(network.coordinator_configs);for(const rows of [realms,coordinators])assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
 return commitment('psy-composition-application-domain-v1',{version:1,network:networkName,magic:String(COMPOSITION_MAGIC),sdkManifestHash:COMPOSITION_SDK,usersPerRealm:network.users_per_realm,realms,coordinators});
}
