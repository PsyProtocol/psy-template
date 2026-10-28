import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {join} from 'node:path';
import {auditStreamEvidence,auditUpsRow} from './audit-evidence.mjs';import {parseLosslessJson} from '../../amm/u124/client.mjs';
const root=process.env.STREAM_EVIDENCE;
test('saved complete stream evidence links normal and recovery branches',{skip:!root},async()=>{const r=await auditStreamEvidence(root);assert.equal(r.canBroadcast,false);assert.equal(r.cryptographicVerificationPerformed,false);for(const m of Object.values(r.markets))assert.equal(m.selectedMembers.length,5);});
test('saved request fee, nonce, endpoint and call mutations cannot masquerade as matching evidence',{skip:!root},async()=>{
 const read=async name=>{const raw=(await readFile(join(root,'amm-settle-0',name))).toString();return name==='verification.json'?JSON.parse(raw):parseLosslessJson(raw);};const v=await read('verification.json'),request=await read('request.json'),plan=await read('plan.json'),session=await read('public-session.json');
 auditUpsRow(v,request,plan,session);
 for(const change of [x=>x.user_ec_input.core.stats.da_fees_collected++,x=>x.user_ec_input.core.new_user_leaf.nonce++,x=>x.user_ec_input.core.state_transition.end_user_leaf_hash='0'.repeat(64),x=>x.user_ec_input.core.stats.total_transactions++]){const bad=structuredClone(request);change(bad);assert.throws(()=>auditUpsRow(v,bad,plan,session));}
 const bad=structuredClone(session);bad.actualCalls.at(-1).inputs[0]++;assert.throws(()=>auditUpsRow(v,request,plan,bad));
});
