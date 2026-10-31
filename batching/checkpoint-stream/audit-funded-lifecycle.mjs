// Public graph/fee consistency only. Does not verify Endcaps, signatures,
// native resource ownership, consensus finality or network receipts.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
// Timing reports contain fractional seconds. Only bounded report fees/counts
// use Number; the actual requests, source amounts and roots stay lossless.
const read=async file=>{const text=await readFile(file,'utf8');return /(?:verification|REPORT)\.json$/.test(file)?JSON.parse(text):parseLosslessJson(text);};
export async function auditFundedLifecycle(root){
 const report=await read(join(root,'REPORT.json'));assert.equal(report.completeUps,12);assert.equal(report.financialOperations,0);assert.equal(report.broadcast,false);
 const rows=[];for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isDirectory()){
  const dir=join(root,entry.name),bytes=await readFile(join(dir,'request.json')),request=parseLosslessJson(bytes.toString()),v=await read(join(dir,'verification.json'));
  const core=request.user_ec_input.core;assert.ok(Array.isArray(request.proof)&&request.proof.length>0,'public proof bytes required');assert.equal(v.fullUpsVerified,true);assert.equal(v.broadcast,false);
  rows.push({name:entry.name,dir,core,v,requestSha256:sha256(bytes)});
 }
 rows.sort((a,b)=>Number(a.core.checkpoint_id-b.core.checkpoint_id));assert.equal(rows.length,12);
 const actors=new Map();let totalFee=0n,sdkFee=0n,ordinaryFee=0n,sdkCount=0;
 for(const [i,row]of rows.entries()){
  const {core,v}=row,leaf=core.new_user_leaf,user=leaf.user_id;assert.equal(core.checkpoint_id,100n+BigInt(i));
  const prior=actors.get(user.toString());assert.equal(leaf.nonce,prior?prior.nonce+1n:1n);
  if(prior){assert.equal(core.state_transition.start_user_leaf_hash,prior.hash);assert.equal(leaf.public_key,prior.publicKey);}
  if(user===100n){sdkCount++;assert.equal(v.fixedVerifier,true);assert.equal(core.state_transition.start_user_leaf_hash,v.storedStartLeaf);
   if(!prior)assert.equal(core.state_transition.start_user_leaf_hash,'0'.repeat(64));
   const source=await read(join(row.dir,'source.json'));if(core.checkpoint_id>=106n)assert.equal(source.fields[6],106n,'source frozen after order funding, unchanged across recovery');
  }else{assert.equal(v.ordinarySignatureVerified,true);assert.equal(v.actualApprovedStackVerified,true);assert.equal(v.calls.at(-1).contract_id,0);assert.equal(v.calls.at(-1).method_name,'burn');assert.equal(v.calls.at(-1).inputs[0],v.fee);}
  const actual=core.stats.guta_fees_collected+core.stats.da_fees_collected;assert.ok(Number.isSafeInteger(v.fee));assert.equal(actual,BigInt(v.fee));assert.equal(core.stats.guta_fees_collected,1_000_000_000n);assert.equal(core.stats.da_fees_collected,core.stats.slots_modified*1000n);assert.ok(actual<=1_000_100_000n);
  totalFee+=actual;if(user===100n)sdkFee+=actual;else ordinaryFee+=actual;
  actors.set(user.toString(),{nonce:leaf.nonce,hash:core.state_transition.end_user_leaf_hash,publicKey:leaf.public_key});
 }
 assert.equal(sdkCount,6);assert.equal(ordinaryFee.toString(),report.ordinaryFee);assert.ok(Number.isSafeInteger(report.sdKeyFee));assert.equal(sdkFee,BigInt(report.sdKeyFee));
 assert.equal(rows.at(-1).name,'ordinary-final-claim');assert.equal(rows.at(-1).core.new_user_leaf.user_id,200n);
 assert.equal(report.originalSetAndExpiryPreserved,true);assert.equal(report.assetConservation,true);assert.equal(report.nativeConservationIncludingAllFees,true);
 return{scope:'Public saved graph/fees only; independent fixed-resource proof verification is required separately',completeUps:12,ordinaryUps:6,sdKeyUps:6,actors:actors.size,ordinaryFee:ordinaryFee.toString(),sdKeyFee:sdkFee.toString(),totalFee:totalFee.toString(),financialOperations:0,requests:rows.map(r=>({stage:r.name,checkpoint:r.core.checkpoint_id.toString(),requestSha256:r.requestSha256}))};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await auditFundedLifecycle(process.argv[2]),null,2));
