// Public projection/refusal tests only; fake bytes here are not cryptographic
// acceptance. Real SDK-generated public proofs are exercised separately.
import assert from 'node:assert/strict';
import test from 'node:test';
import {publicMarketProofBundle} from './publicBundle.mjs';
const b64=bytes=>Buffer.from(bytes).toString('base64');
function fixture(external=false){
 const trace={anchor:{checkpoint:101},finalization:{sig_hash:'sig'},steps:[]};
 const outputs=[{type:'ups_start',data:{current_header:{start:1},proof:[1]}},{type:'zk_sign',data:{proof:[2]}}];
 if(external){trace.steps.push({kind:'external_proof',fingerprint:'note',proof_tree_start_root:'a',proof_tree_end_root:'b',proof:b64([3]),verifier_data_alt:{untrusted:'never project'}});outputs.push({type:'external_proof',data:{step_index:0,proof:[3]}});}
 const index=trace.steps.length;
 trace.steps.push({kind:'standard',contract_id:42,method_id:1,method_name:'private_claim',cfc_witness:{session_proof_tree_root:'b',receive_secrets:'never project'},state_delta:{public:1},cfc_inclusion_proof:{public:2},end_header:{end:3}});
 outputs.push({type:'cfc_step',data:{step_index:index,proof_bytes:[[4],[5]],baton:{known_proof_tree_root:'c'}}});
 trace.steps.push({kind:'zk_sign',sign_circuit_source:{kind:'zk_builtin'},public_key_param:'pk',sign_witness:'never project'});
 return {trace,outputs};
}
const project=({trace,outputs})=>publicMarketProofBundle(trace,outputs.map(v=>JSON.stringify(v)),JSON.parse);
test('legacy projections retain schema and omit the new empty field',()=>{
 const p=project(fixture());assert.equal(p.schema,1);assert.ok(!('external_steps'in p));
 assert.ok(!JSON.stringify(p).includes('never project'));
});
test('external outputs are indexed in actual insertion order without witnesses or page verifiers',()=>{
 const p=project(fixture(true));assert.equal(p.schema,2);
 assert.deepEqual(p.external_steps,[{before_call:0,fingerprint:'note',leaf_index:1,start_root:'a',end_root:'b',proof_b64:b64([3])}]);
 assert.ok(!JSON.stringify(p).includes('never project'));assert.ok(!JSON.stringify(p).includes('untrusted'));
});
for(const mode of ['missing','duplicate','changed','extra','unknown-step'])test('refuses '+mode+' external/call framing',()=>{
 const f=fixture(true);
 if(mode==='missing')f.outputs=f.outputs.filter(v=>v.type!=='external_proof');
 if(mode==='duplicate')f.outputs.push(f.outputs.find(v=>v.type==='external_proof'));
 if(mode==='changed')f.outputs.find(v=>v.type==='external_proof').data.proof=[9];
 if(mode==='extra')f.outputs.push({type:'external_proof',data:{step_index:99,proof:[3]}});
 if(mode==='unknown-step')f.trace.steps[0].kind='unsupported';
 assert.throws(()=>project(f));
});
