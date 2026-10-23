// Process-local cache of deterministic PUBLIC identity metadata only.
// No state, witness, nonce, authorization decision or proof enters this cache.
import assert from 'node:assert/strict';
import {sha256} from './requestBinding.mjs';
export function compactIdentityCache({capacity=32}={}){
 assert.ok(Number.isSafeInteger(capacity)&&capacity>0);
 const entries=new Map();
 return async(binding,load)=>{
  for(const k of ['driverSha256','policySha256','rpcConfigSha256'])assert.match(binding[k]??'',/^[0-9a-f]{64}$/);
  assert.ok(binding.identity?.network&&Array.isArray(binding.dependencies));
  for(const k of ['fingerprint','publicKeyHash'])assert.match(binding.identity[k]??'',/^[0-9a-f]{64}$/);
  const key=sha256(JSON.stringify(binding)),expected={fingerprint:binding.identity.fingerprint,publicKeyHash:binding.identity.publicKeyHash};
  if(entries.has(key))return entries.get(key).promise;
  const entry={settled:false};
  entry.promise=(async()=>{
   const value=await load();
   assert.equal(value?.profile,'compact-v1');
   assert.equal(value.fingerprint,expected.fingerprint,'wallet fingerprint');
   assert.equal(value.publicKeyHash,expected.publicKeyHash,'wallet public key');
   return Object.freeze({profile:value.profile,fingerprint:value.fingerprint,publicKeyHash:value.publicKeyHash});
  })();
  // Do not evict in-flight work: that could duplicate an expensive build.
  if(entries.size>=capacity){const old=[...entries].find(([,v])=>v.settled);if(old)entries.delete(old[0]);}
  if(entries.size<capacity)entries.set(key,entry);
  try{const value=await entry.promise;entry.settled=true;return value;}
  catch(error){if(entries.get(key)===entry)entries.delete(key);throw error;}
 };
}
export const processCompactIdentity=compactIdentityCache();
