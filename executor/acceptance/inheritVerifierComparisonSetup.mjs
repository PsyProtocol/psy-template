// Reuse confirmed QA setup evidence, not old proofs for new transactions.
// No signing, broadcasts, new transfers, registrations or contract updates.
import assert from'node:assert/strict';
import{readFileSync,readdirSync,mkdirSync,copyFileSync,constants}from'node:fs';
import{join}from'node:path';import{fileURLToPath}from'node:url';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
import{save}from'../../batching/admission/liveSupport.mjs';
import{publicState}from'../publicState.mjs';import{sha256}from'../requestBinding.mjs';
import{freezeAppModules}from'./sourceClosure.mjs';import{SDK}from'./threeMarketCase.mjs';
const[base,prior]=process.argv.slice(2);assert.ok(prior);assert.notEqual(base,prior);
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),bytes=p=>readFileSync(p),funding=join(prior,'funding-audit-v1'),closed=join(prior,'unused-sponsorship-audit-v1/SUMMARY.json');
const f=exact(join(funding,'SUMMARY.json')),a=exact(closed),release=join(prior,'public/RELEASE.json'),r=exact(release);
assert.equal(f.actualUps,2n);assert.equal(f.rows.length,2);assert.equal(f.ordinaryNativeClaimVerified,true);assert.ok(f.rows.every(x=>x.fullProofVerified===true));
assert.equal(a.actualUps,15n);assert.equal(a.actualFills,0n);assert.equal(a.allActualFullProofsVerified,true);assert.equal(a.fullProofAccountingPending,false);assert.equal(a.finiteCohortNativeAndFtConservationVerified,true);assert.equal(a.nonceAndStateChainsVerified,true);
assert.equal(r.sdkManifestSha256,SDK);for(const tool of Object.values(r.binaries))assert.equal(sha256(bytes(tool.file)),tool.sha256);
const config=join(prior,'public/rpc.json'),s=await publicState(config),last=new Map();
for(const row of a.actual){const key=String(row.userId);if(!last.has(key)||last.get(key).nonce<row.nonce)last.set(key,row);}
assert.deepEqual([...last.keys()].sort(),['1717440','406720','519360','662720'].sort());
const observations=await Promise.all([...last.values()].map(async row=>{
 assert.ok(BigInt(s.checkpoint)>=row.checkpoint);const userId=Number(row.userId),realm=s.network.realm_configs.find(x=>x.id===Math.floor(userId/s.network.users_per_realm));assert.ok(realm);
 const args={checkpoint_id:s.checkpoint,user_id:userId},[hash,leaf]=await Promise.all([s.rpc(realm.rpc_url[0],'psy_get_user_tree_leaf_hash',args),s.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',args,{exactIntegers:true})]);
 assert.equal(hash,row.end,'intervening account change; cannot inherit setup');assert.equal(leaf.nonce,row.nonce);return{userId,nonce:row.nonce,userLeafHash:hash,checkpoint:s.checkpoint};
}));
// Fail before creating a new run on stale state; every destination is fresh.
mkdirSync(base);mkdirSync(join(base,'public'));copyFileSync(config,join(base,'public/rpc.json'),constants.COPYFILE_EXCL);copyFileSync(release,join(base,'public/RELEASE.json'),constants.COPYFILE_EXCL);
mkdirSync(join(base,'funding-audit-v1'));const copied=[];for(const name of readdirSync(funding)){
 const source=join(funding,name);copyFileSync(source,join(base,'funding-audit-v1',name),constants.COPYFILE_EXCL);copied.push({name,sha256:sha256(bytes(source))});
}
save(join(base,'public/SETUP-REUSE-v1.json'),{at:new Date().toISOString(),prior,originalFundingAuditSha256:sha256(bytes(join(funding,'SUMMARY.json'))),closedRecoveryAudit:closed,closedRecoveryAuditSha256:sha256(bytes(closed)),sdkManifestSha256:SDK,releaseSha256:sha256(bytes(release)),observations,copiedAuditFiles:copied,newTransfers:0,newClaims:0,scope:'byte-identical historical two-UPS native QA setup audit plus closed fifteen-UPS recovery; current four user-leaf endpoints match the full-proof audit. No saved proof is submitted again. The historical setup is not counted twice or reported as a new payment.'});
copyFileSync(join(prior,'public/RESOURCE-SELECTION-v1.json'),join(base,'public/RESOURCE-SELECTION-v1.json'),constants.COPYFILE_EXCL);
freezeAppModules(fileURLToPath(import.meta.url),base,'inherited-setup-v1');
console.log('fresh comparison initialized from confirmed unchanged QA endpoints; no new funding or claim');
