// Explicit service-owned proof resources across adapter/stage lifetimes.
// Entries bind complete immutable identities, never state witnesses or nonces.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {residentProver} from './residentProver.mjs';
import {sha256} from './requestBinding.mjs';
export function residentScope({maxEntries=4,create=residentProver}={}) {
 assert.ok(Number.isSafeInteger(maxEntries)&&maxEntries>=1&&maxEntries<=4);
 const entries=new Map();let closed=false,closing;
 const hashes=async(policy,config,binding)=>{assert.equal(sha256(await readFile(policy)),binding.policySha256,'resident policy changed');assert.equal(sha256(await readFile(config)),binding.rpcSha256,'resident network config changed');};
 return {
  acquire:async(binding,binary,policy,config,options)=>{
   binding=structuredClone(binding);options=structuredClone(options);
   assert.deepEqual(options.env??{},binding.env??{},'resident launch environment must match its cache binding');
   assert.equal(closed,false);assert.equal(sha256(await readFile(binary)),binding.driverSha256,'resident driver changed');
   await hashes(policy,config,binding);
   const digest=sha256(JSON.stringify(binding));let entry=entries.get(digest);
   if(!entry){assert.ok(entries.size<maxEntries,'proof resource capacity; close explicit idle scope before adding keys');entry={binding,binary,policy,config,native:create(binary,policy,config,options),refs:0,active:0,poisoned:false};entries.set(digest,entry);}
   assert.equal(entry.poisoned,false,'resident failed; release original leases before explicit restart');entry.refs++;let released=false;
   const request=async(method,args)=>{
    assert.equal(released,false,'resident lease released');assert.equal(closed,false);assert.equal(entry.poisoned,false);
    assert.equal(args.length,6);assert.equal(args[0],method==='prove'?'preflight':'quote');assert.equal(args[1],policy);assert.equal(args[2],config);
    assert.equal(entry.active,0,'one active job per exact key; coordinate its state dependencies');
    entry.active++;
    try{
     // Stage copies may have different paths with identical pinned bytes.
     // Recheck BOTH paths before translating transport-only arguments.
     await hashes(policy,config,binding);await hashes(entry.policy,entry.config,binding);
     assert.equal(sha256(await readFile(entry.binary)),binding.driverSha256);
     return await entry.native[method]([args[0],entry.policy,entry.config,...args.slice(3)]);
    }catch(error){entry.poisoned=true;throw error;}
    finally{entry.active--;}
   };
   return {warm:async()=>{
    assert.equal(released,false);assert.equal(closed,false);assert.equal(entry.poisoned,false);assert.equal(entry.active,0,'one active resource operation per exact key');entry.active++;
    try{await hashes(policy,config,binding);await hashes(entry.policy,entry.config,binding);assert.equal(sha256(await readFile(entry.binary)),binding.driverSha256);return await entry.native.warm();}
    catch(error){entry.poisoned=true;throw error;}finally{entry.active--;}
   },prove:args=>request('prove',args),quote:args=>request('quote',args),close:async()=>{
    if(released)return;assert.equal(entry.active,0,'cannot release an active proof');released=true;entry.refs--;
    if(entry.poisoned&&entry.refs===0){await entry.native.close();entries.delete(digest);}
   }};
  },
  close:async()=>{if(closing)return closing;assert.ok([...entries.values()].every(e=>e.refs===0&&e.active===0),'release all adapters before closing proof resources');closed=true;closing=(async()=>{const results=await Promise.allSettled([...entries.values()].map(e=>e.native.close()));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;entries.clear();})();return closing;},
  size:()=>entries.size
 };
}
