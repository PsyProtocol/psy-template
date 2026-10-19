import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {publishFile} from './durableFile.mjs';

// Detect accidental deployment/configuration replacement while a worker is
// running. This is not a defense against an attacker controlling this host.
export async function captureInputs(paths){
 const originals=new Map(await Promise.all([...new Set(paths)].map(async path=>[path,await readFile(path)])));
 return async()=>{
  for(const [path,bytes]of originals)assert.ok(bytes.equals(await readFile(path)),`executor input changed: ${path}`);
 };
}
export async function publishSubmissionGuard(options,policy,contracts){
 const ids=contracts.map(c=>c.contractId),required=[...new Set(policy.branches.flatMap(b=>b.calls.map(c=>c.contract_id)))].sort((a,b)=>a-b);
 assert.equal(new Set(ids).size,ids.length,'duplicate guard contract');
 assert.deepEqual([...ids].sort((a,b)=>a-b),required,'guard must cover every policy contract');
 assert.ok(ids.includes(0)&&ids.includes(options.contractId),'guard must bind PSY and market');
 for(const c of contracts){
  for(const key of ['codeRoot','layoutRoot'])assert.match(c[key],/^[0-9a-f]{64}$/,'guard root encoding');
  assert.ok(Number.isSafeInteger(c.stateTreeHeight)&&c.stateTreeHeight>=1&&c.stateTreeHeight<=32,'guard state height');
 }
 const guard={version:1,network:options.network,marketId:options.contractId,vaultId:options.vaultId,fingerprint:options.fingerprint,publicKeyHash:options.publicKeyHash,contracts:[...contracts].sort((a,b)=>a.contractId-b.contractId)};
 // Reusing a runtime must not silently adopt changed roots, including native
 // fee-token roots, after a restart. Operators review a new release explicitly.
 const file=join(options.runtimeDirectory,'bindings',options.network,String(options.vaultId),options.fingerprint+'.json');
 const serialized=JSON.stringify(guard,null,2)+'\n';
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 try{await publishFile(file,serialized);}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(file,'utf8'),serialized,'persisted submission bindings changed; review release before using a new runtime');}
 return {guard,file};
}
