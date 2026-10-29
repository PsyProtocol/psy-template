// An operator-local recovery invariant, not a randomness/finality certificate.
// Only the owned adapter may install a pin after its complete native preflight.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {publishFile} from './durableFile.mjs';
import {parseLosslessJson} from '../amm/u124/client.mjs';
import {validateProcessorFields,PREVIOUS_PROFILE} from '../batching/checkpoint-processor/policy.mjs';

export function producerBatchStatement(scope,policy,task){
 assert.equal(policy.version,4);assert.equal(policy.execution_profile,PREVIOUS_PROFILE);
 assert.equal(task.profile,'compact-v1');
 const f=parseLosslessJson(task.submission).software_defined_call.inputs;
 const checked=[...f];if(checked[0]!==2n&&checked[73]===0n)checked[73]=1000000000n;
 validateProcessorFields(policy,checked);assert.equal(task.batchId,f[1].toString(),'producer task batch identity');
 if(f[0]!==2n)return null;
 assert.equal(task.kind,'batch_settle');
 assert.match(task.validUntilCheckpoint,/^[1-9]\d*$/);
 const expiry=BigInt(task.validUntilCheckpoint);
 assert.ok(f[3]<expiry&&expiry<1n<<32n,'fixed draw must precede original execution deadline');
 // Whitelist public fields. Do not persist proof witnesses, RPC responses or
 // opaque reports. Fees/outcomes may be requoted; the accepted set/draw cannot.
 return {version:1,profile:PREVIOUS_PROFILE,scope,batch:{id:f[1].toString(),count:Number(f[2]),
  sourceCheckpoint:f[3].toString(),validUntilCheckpoint:expiry.toString(),
  root:f.slice(13,17).map(String),seed:f.slice(74,78).map(String),rank:f.slice(17,21).map(Number),
  members:Array.from({length:Number(f[2])},(_,i)=>({owner:f[22+13*i].toString(),nonce:f[31+13*i].toString()}))},
  producerInfluence:true,qualifiedRandomness:false,finalityVerified:false,
  scopeOfGuarantee:'local immutable recovery pin after owned native complete-UPS verification'};
}

export function producerBatchBindings({directory,scope,policy}){
 // This namespace deliberately excludes the driver/policy hash: changing a
 // configured identity must not silently create another pin for the same batch.
 assert.match(scope.identity.network,/^[a-zA-Z0-9_-]+$/);
 assert.ok(Number.isSafeInteger(scope.identity.vaultId)&&scope.identity.vaultId>0);
 const root=join(directory,'producer-batches',scope.identity.network,String(scope.identity.vaultId));
 const inspect=async task=>{
  const statement=producerBatchStatement(scope,policy,task);if(!statement)return null;
  const path=join(root,statement.batch.id+'.json');
  try{assert.deepEqual(JSON.parse(await readFile(path,'utf8')),statement,
   'verified producer batch changed: retain original set, source, seed, rank and deadline; reconcile original request');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  return {path,statement};
 };
 return {
  check:async task=>{await inspect(task);},
  retainVerified:async task=>{
   const pin=await inspect(task);if(!pin)return;
   await mkdir(root,{recursive:true,mode:0o700});
   try{await publishFile(pin.path,JSON.stringify(pin.statement,null,2)+'\n');}
   catch(e){if(e.code!=='EEXIST')throw e;}
   // Racing local writers must agree on the entire public statement. No
   // overwrite, winner-dependent seed replacement or deterministic fallback.
   await inspect(task);
  }
 };
}
