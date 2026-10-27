// Verify preserved first-session public proofs through the actual WASM core.
// This does not create an extension origin, sign, read RPC or send a request.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {parseLosslessJson,losslessJson} from '../../../amm/u124/client.mjs';
const [modulePath,fixtures,out]=process.argv.slice(2);
assert.ok(out,'NODE_WASM_MODULE PUBLIC_FIXTURES FRESH_REPORT');
assert.ok(modulePath.endsWith('.js'),'wasm-bindgen Node JS module required');
const read=name=>readFileSync(join(fixtures,name+'.json'),'utf8');
const request=read('request'),approval=read('approval'),bundle=read('bundle');
const a=parseLosslessJson(approval),b=parseLosslessJson(bundle),pack=read('verifiers');
const zero='0'.repeat(64),sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(a.start_leaf,zero);assert.equal(BigInt(a.nonce),1n);
assert.deepEqual(a.calls.map(c=>[c.contract_id,c.method_name]),[['0','claim'],['0','burn']]);
const moduleBytes=readFileSync(modulePath),wasmPath=modulePath.replace(/\.js$/,'_bg.wasm'),wasmBytes=readFileSync(wasmPath);
const native=createRequire(import.meta.url)(resolve(modulePath));
const identity=JSON.parse(native.verifier_identity());
assert.equal(identity.verifierPackSha256,sha(pack));
assert.equal(identity.sdkManifestSha256,a.sdk_manifest);
const report=JSON.parse(native.verify_market_prepared(request,approval,bundle));
for(const key of ['fullProofVerified','fullCallsBound','sessionBound','sigHashBound','endpointsAndFeesBound','registrationStartVerified'])assert.equal(report[key],true);
assert.equal(report.requestSha256,sha(request));assert.equal(report.nonce,'1');
assert.equal(report.actualFee,a.calls[1].inputs[0]);
const rejected=[];
for(const [label,mutate] of [
 ['user',(a)=>{a.user_id=BigInt(a.user_id)+1n;}],
 ['claim-source',(a)=>{a.calls[0].inputs[0]=(BigInt(a.calls[0].inputs[0])+1n).toString();}],
 ['nonce',(a)=>{a.nonce=2;}],
 ['public-key',(a)=>{a.public_key=zero;}],
 ['stored-start',(a)=>{a.start_leaf='1'.repeat(64);}],
 ['call-order',(a)=>{a.calls.reverse();}],
 ['session-key',(_,b)=>{b.start_header.session_start_context.start_session_user_leaf.public_key=zero;}],
 ['signature',(_,b)=>{b.sign_proof_b64='AA==';}],
]){
 const changedA=structuredClone(a),changedB=structuredClone(b);mutate(changedA,changedB);
 assert.throws(()=>native.verify_market_prepared(request,losslessJson(changedA),losslessJson(changedB)));
 rejected.push(label);
}
assert.equal(sha(readFileSync(modulePath)),sha(moduleBytes));assert.equal(sha(readFileSync(wasmPath)),sha(wasmBytes));
writeFileSync(out,JSON.stringify({schema:1,approvalSha256:sha(approval),bundleSha256:sha(bundle),moduleFileSha256:sha(moduleBytes),wasmFileSha256:sha(wasmBytes),scope:'actual WASM on preserved synthetic authenticated state; no extension, RPC, broadcast, inclusion or ordinary-wallet acceptance',requestSha256:sha(request),verifierPackSha256:identity.verifierPackSha256,registrationStartVerified:true,completeCallSessionSignatureAndEndpointsVerified:true,mutationsRejected:rejected,newProofsGenerated:0,financialOperations:0},null,2)+'\n',{flag:'wx'});
console.log('Preserved first-session complete proof verified in WASM; mutations rejected; no financial operations.');
