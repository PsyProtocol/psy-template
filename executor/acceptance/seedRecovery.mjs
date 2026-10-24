// Explicit recovery of the diagnosed, unsigned seed preparation. No generic
// retry/alias: only the known redundant NFT acknowledgement may be removed.
import assert from'node:assert/strict';import{readFileSync,readdirSync,existsSync}from'node:fs';import{join}from'node:path';
import{save}from'../../batching/admission/liveSupport.mjs';import{parseLosslessJson,losslessJson,call}from'../../amm/u124/client.mjs';import{publicState}from'../publicState.mjs';import{sha256}from'../requestBinding.mjs';
const exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
export async function seedRecovery(h,calls){
 const b=h.base,old=join(b,'attempts/activation-seeds-v1'),input=join(b,'public/activation-seeds-v1.json'),failure=exact(join(old,'failure.json')),n=h.by.nftmarket,U=h.actors.bob.id;
 assert.deepEqual(readdirSync(old),['failure.json']);assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.phase,'prove-ordinary-calls');
 const original=exact(input).calls.contract_calls,expected=parseLosslessJson(losslessJson(calls)),ack=call(BigInt(n.driverConfig.nftId),h.nft,'acknowledge',[BigInt(n.vault)]);
 assert.deepEqual(original.slice(0,-1),expected);assert.deepEqual(original.at(-1),parseLosslessJson(losslessJson(ack)));
 const diag=exact(join(b,'diagnose-activation-ack-v1/RESULT.json'));assert.equal(diag.failedCallIndex,0n);assert.equal(diag.broadcast,false);assert.equal(diag.signedEndcap,false);assert.equal(diag.calls[0].contractId,BigInt(n.driverConfig.nftId));assert.equal(diag.calls[0].localCallProved,false);
 const label='activation-seeds-reviewed-v1',review=join(b,'public/SEED-REPAIR-REVIEW-v1.json');
 if(!existsSync(review)){
  const s=await publicState(h.config),mint=exact(join(b,'attempts/mint-and-distribute-v1/included.json')),realm=s.network.realm_configs.find(r=>r.id===Math.floor(U/s.network.users_per_realm)),leaf=await s.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',{checkpoint_id:s.checkpoint,user_id:U},{exactIntegers:true});
  assert.equal(BigInt(leaf.nonce),mint.preflight.core.new_user_leaf.nonce,'original failed attempt consumed no nonce');
  assert.equal(await s.slot(U,n.driverConfig.nftId,0),1n);assert.equal(await s.contractStateRoot(n.vault,n.driverConfig.nftId),'0'.repeat(64));
  for(const m of h.markets){assert.equal(await s.slot(U,0,3+2*m.vault),0n);for(const asset of m.kind==='nftmarket'?[m.driverConfig.tokenId]:[m.driverConfig.assetA,m.driverConfig.assetB])for(const i of [0,1])assert.equal(await s.slot(U,asset,33554453+4*m.vault+i),0n);}
  save(review,{at:new Date().toISOString(),checkpoint:s.checkpoint,actor:U,originalInputSha256:sha256(readFileSync(input)),failureSha256:sha256(readFileSync(join(old,'failure.json'))),diagnosticSha256:sha256(readFileSync(join(b,'diagnose-activation-ack-v1/RESULT.json'))),newCallsSha256:sha256(losslessJson(expected)),originalBroadcast:false,originalNonceUnchanged:true,allSeedOutboxesZero:true,newLabel:label,scope:'remove redundant owner-to-uninitialized-vault NFT acknowledgement; retain holder checks and required vault activation acknowledgement; fresh ordinary proof, not old proof reuse'});
 }
 const r=exact(review);assert.equal(r.originalInputSha256,sha256(readFileSync(input)));assert.equal(r.newCallsSha256,sha256(losslessJson(expected)));assert.equal(r.originalBroadcast,false);
 return h.user('bob',label,calls);
}
