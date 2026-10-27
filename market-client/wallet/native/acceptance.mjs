// Real public proofs through the same compiled verifier used by the extension.
// Synthetic authenticated state only. No wallet, RPC, signer or broadcast.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {parseLosslessJson,losslessJson} from '../../../amm/u124/client.mjs';
import {createNativeMarketBackend} from '../nativeBackend.mjs';
import {publicMarketProofBundle} from '../publicBundle.mjs';
import {shaPublic,stablePublic,publicManifest} from '../capsule.mjs';
import {digest} from '../../protocol.mjs';
const [wasm,fixtures,out]=process.argv.slice(2);assert.ok(out,'NODE_WASM_MODULE PUBLIC_FIXTURES FRESH_OUT');mkdirSync(out);
const read=name=>readFileSync(join(fixtures,name+'.json'),'utf8');
const pack=parseLosslessJson(read('verifiers')),approval=parseLosslessJson(read('approval')),b=parseLosslessJson(read('bundle')),requestJson=read('request');
const nativeModule=createRequire(import.meta.url)(resolve(wasm));
const native={identity:async()=>nativeModule.verifier_identity(),identify:async r=>nativeModule.project_market_identity(r),verify:async(r,a,b)=>nativeModule.verify_market_prepared(r,a,b)};
const nativeIdentity=JSON.parse(await native.identity());
const approvedCalls=approval.calls.map(c=>({...c,...(c.method_id===null?{method_id:undefined}:{})}));
const fullCalls=approvedCalls.map(({method_id,...c})=>method_id===undefined?c:{...c,method_id});
const contracts=pack.contracts.map(c=>({contract:{contractId:Number(c.contract_id),codeRoot:c.code_root,layoutRoot:c.layout_root,stateTreeHeight:Number(c.height)},functionTreeRoot:c.function_root,layoutFieldCount:Number(c.fields),layoutSlotCount:Number(c.slots)}));
const marketId=Number(fullCalls[0].contract_id);
const registry={nativeProtocol:'mainnet-beta-20261027',sdkManifestSha256:pack.sdk_manifest,network:{name:'testnet',magic:String(pack.network_magic),usersPerRealm:1048576,chainRootAt1:'0'.repeat(64)},markets:[{kind:'bondingcurve',marketId,vaultId:100,publicKeyHash:'0'.repeat(64),dependencies:contracts}]};
const bundle={registry,registryHash:await digest(registry),networkConfig:{magic:String(pack.network_magic),users_per_realm:1048576,coordinator_configs:[{id:0,rpc_url:['https://coordinator.invalid']}],realm_configs:[{id:0,rpc_url:['https://realm.invalid']}],api_services_url:['https://services.invalid']}};
const report=JSON.parse(nativeModule.verify_market_prepared(requestJson,read('approval'),read('bundle')));
const record={registryHash:bundle.registryHash,request:{userId:Number(approval.user_id)},plan:{marketId,walletNonce:String(approval.nonce),startCheckpoint:Number(approval.checkpoint_min),validUntilCheckpoint:Number(approval.checkpoint_max),startUserLeafHash:approval.start_leaf,maxNetworkFee:String(approval.max_fee)}};
const p={schema:2,requestJson,verificationBundleJson:read('bundle'),requestSha256:await shaPublic(requestJson),verificationBundleSha256:await shaPublic(read('bundle')),verifierPackSha256:nativeIdentity.verifierPackSha256,contentHash:report.contentHash,userId:Number(approval.user_id),publicKeyHash:approval.public_key,networkHash:await digest(registry.network),registryHash:bundle.registryHash,sdkManifestSha256:pack.sdk_manifest,startUserLeafHash:approval.start_leaf,walletNonce:String(approval.nonce),validUntilCheckpoint:Number(approval.checkpoint_max),actualFee:report.actualFee,fullCalls,endUserLeafHash:report.endUserLeafHash,sigHash:report.sigHash,sessionHash:report.sessionHash,fingerprint:report.fingerprint};
p.manifestSha256=await shaPublic(stablePublic(publicManifest(p)));
const backend=createNativeMarketBackend({bundle,native,expectedVerifierPackSha256:nativeIdentity.verifierPackSha256,parse:parseLosslessJson,stringify:losslessJson,fetcher:async()=>{throw Error('RPC forbidden in public proof acceptance');}});
assert.equal((await backend.verifyPrepared(record,p)).fullProofVerified,true);
assert.equal((await backend.identifyForPreparation(record,fullCalls,requestJson)).contentHash,p.contentHash);
const mutations=[];
for(const [label,change] of [
 ['amount-high-limb',x=>{x.fullCalls[2].inputs[2]='0';}],
 ['nonce',x=>{x.walletNonce='2';}],
 ['signature',x=>{x.sigHash='0'.repeat(64);}],
 ['proof-bundle',x=>{x.verificationBundleJson=x.verificationBundleJson+' ';}],
 ['request-bytes',x=>{x.requestJson=x.requestJson+' ';}],
 ['verifier-build',x=>{x.verifierPackSha256='0'.repeat(64);}],
]){const x=structuredClone(p);change(x);x.manifestSha256=await shaPublic(stablePublic(publicManifest(x)));await assert.rejects(backend.verifyPrepared(record,x));mutations.push(label);}
// Exercise the exact SDK job projection schema using the already saved public
// proofs; only these public fields can survive the in-memory hydrated trace.
const bytes=s=>[...Buffer.from(s,'base64')],steps=b.steps.map(s=>({kind:s.method_name==='burn'?'burn_fee':'standard',contract_id:s.contract_id,method_id:s.method_id,method_name:s.method_name,cfc_witness:{session_proof_tree_root:s.cfc_session_root},state_delta:s.state_delta,cfc_inclusion_proof:s.inclusion,end_header:s.end_header}));
steps.push({kind:'zk_sign',sign_circuit_source:{kind:'zk_builtin'},public_key_param:b.public_key_param});
const outputs=[{type:'ups_start',data:{current_header:b.start_header,proof:bytes(b.start_proof_b64)}},{type:'zk_sign',data:{proof:bytes(b.sign_proof_b64)}},...b.steps.map((s,i)=>({type:'cfc_step',data:{step_index:i,proof_bytes:[bytes(s.cfc_proof_b64),bytes(s.ups_proof_b64)],baton:{known_proof_tree_root:s.ups_known_root}}}))].map(losslessJson);
const projected=publicMarketProofBundle({anchor:b.anchor,steps,finalization:{sig_hash:b.sig_hash}},outputs,parseLosslessJson);
assert.equal(await shaPublic(stablePublic(projected)),await shaPublic(stablePublic(b)));
assert.equal(JSON.parse(await native.verify(requestJson,read('approval'),losslessJson(projected))).fullCallsBound,true);
for(const fields of [{publicKeyHash:p.publicKeyHash,requestSha256:p.requestSha256},nativeIdentity])assert.ok(fields);
writeFileSync(join(out,'REPORT.json'),JSON.stringify({fullUpsVerifiedInWasm:true,allCallAndSessionProofsVerified:true,exactCapsuleAndPublicProjectionVerified:true,mutationsRejected:mutations,verifierPackSha256:nativeIdentity.verifierPackSha256,financialOperations:0,scope:'actual WASM verifier; synthetic authenticated state; HTTP, wallet integration, live inclusion and NFT identity not accepted'},null,2)+'\n',{flag:'wx'});
console.log('Complete public proofs, exact capsule and public projection accepted; mutations rejected. No network operation.');
