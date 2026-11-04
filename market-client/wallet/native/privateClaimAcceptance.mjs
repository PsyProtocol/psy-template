// Verify preserved complete synthetic claim bytes through actual WASM. The
// fixture receive randoms are public constants; never use a real-wallet trace.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {parseLosslessJson,losslessJson} from '../../../amm/u124/client.mjs';
import {publicMarketProofBundle} from '../publicBundle.mjs';
const [wasm,fixture,out]=process.argv.slice(2);assert.ok(out,'WASM MODULE PUBLIC SYNTHETIC FIXTURE FRESH REPORT');
const read=name=>readFileSync(join(fixture,name+'.json'),'utf8');
const request=read('request'),approval=read('approval'),bundle=read('bundle'),pack=read('verifiers');
const a=parseLosslessJson(approval),b=parseLosslessJson(bundle);
assert.equal(BigInt(b.schema),2n);assert.equal(a.calls[0].inputs.length,86);
assert.equal(a.calls[0].inputs[11],'7');assert.equal(a.calls[0].inputs[12],'8');
const native=createRequire(import.meta.url)(resolve(wasm));
assert.equal(JSON.parse(native.verifier_identity()).verifierPackSha256,createHash('sha256').update(pack).digest('hex'));
const verify=(aa=approval,bb=bundle)=>JSON.parse(native.verify_market_prepared(request,aa,bb));
const actual=verify();for(const flag of ['fullProofVerified','fullCallsBound','sessionBound','sigHashBound','endpointsAndFeesBound'])assert.equal(actual[flag],true);
const bytes=s=>[...Buffer.from(s,'base64')];
const steps=b.external_steps.map(e=>({kind:'external_proof',fingerprint:e.fingerprint,proof_tree_start_root:e.start_root,proof_tree_end_root:e.end_root,proof:e.proof_b64}));
const outputs=[{type:'ups_start',data:{current_header:b.start_header,proof:bytes(b.start_proof_b64)}},{type:'zk_sign',data:{proof:bytes(b.sign_proof_b64)}}];
b.external_steps.forEach((e,i)=>outputs.push({type:'external_proof',data:{step_index:i,proof:bytes(e.proof_b64)}}));
b.steps.forEach((s,i)=>{outputs.push({type:'cfc_step',data:{step_index:steps.length,proof_bytes:[bytes(s.cfc_proof_b64),bytes(s.ups_proof_b64)],baton:{known_proof_tree_root:s.ups_known_root}}});steps.push({kind:i?'burn_fee':'standard',contract_id:s.contract_id,method_id:s.method_id,method_name:s.method_name,cfc_witness:{session_proof_tree_root:s.cfc_session_root,receive_secrets:'MUST_NOT_SURVIVE'},state_delta:s.state_delta,cfc_inclusion_proof:s.inclusion,end_header:s.end_header});});
steps.push({kind:'zk_sign',sign_circuit_source:{kind:'zk_builtin'},public_key_param:b.public_key_param,sign_witness:'MUST_NOT_SURVIVE'});
const projected=publicMarketProofBundle({anchor:b.anchor,steps,finalization:{sig_hash:b.sig_hash}},outputs.map(losslessJson),parseLosslessJson);
assert.ok(!losslessJson(projected).includes('MUST_NOT_SURVIVE'));
assert.deepEqual(parseLosslessJson(losslessJson(projected)),b);
verify(approval,losslessJson(projected));
let refused=0;
for(const mode of ['missing','swap','index','start','end','fingerprint','after-call','proof','amount-high','recipient','random','call-order','nonce','fee']){
 const aa=structuredClone(a),bb=structuredClone(b);
 if(mode==='missing')bb.external_steps.pop();
 else if(mode==='swap')bb.external_steps.reverse();
 else if(mode==='index')bb.external_steps[0].leaf_index=9;
 else if(mode==='start'||mode==='end')bb.external_steps[0][mode+'_root']='0'.repeat(64);
 else if(mode==='fingerprint')bb.external_steps[0].fingerprint='0'.repeat(64);
 else if(mode==='after-call')bb.external_steps[0].before_call=1;
 else if(mode==='proof')bb.external_steps[0].proof_b64='AA==';
 else if(mode==='amount-high')aa.calls[0].inputs[5]='0';
 else if(mode==='recipient')aa.calls[0].inputs[0]='1';
 else if(mode==='random')aa.calls[0].inputs[11]='9';
 else if(mode==='call-order')aa.calls.reverse();
 else if(mode==='nonce')aa.nonce=2;
 else aa.max_fee=1;
 assert.throws(()=>verify(losslessJson(aa),losslessJson(bb)),mode);refused++;
}
writeFileSync(out,JSON.stringify({schema:1,scope:'Actual WASM complete compact claim and external-proof stack; preserved synthetic source, not extension or live acceptance',fullProofAndCallsVerified:true,externalInsertions:b.external_steps.length,uniqueNoteProofs:new Set(b.external_steps.map(e=>e.proof_b64)).size,exactPublicProjectionVerified:true,mutationsRefused:refused,newProofs:0,financialOperations:0,requestSha256:createHash('sha256').update(request).digest('hex')},null,2)+'\n',{flag:'wx'});
console.log('Complete compact claim, all external notes, calls and public projection verified in actual WASM; no new proofs or broadcast.');
