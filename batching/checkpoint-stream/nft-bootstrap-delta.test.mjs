// Consistency of actual exported public data; fixed cryptographic verification
// is performed separately. No proof generation or network operation here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {auditNftAccountBootstrap} from './audit-funded-pair.mjs';
const stage=process.env.NFT_BOOTSTRAP_AUDIT_STAGE;
test('actual first-use request exports only the explicit account marker',{skip:!stage},()=>{
 const request=parseLosslessJson(readFileSync(join(stage,'request.json'),'utf8'));
 assert.equal(auditNftAccountBootstrap(request).assetOrFifoPadding,false);
 for(const mutate of [x=>x.updates[0].Positional.delta_proof.index--,x=>x.updates[0].Positional.delta_proof.new_value='f'.repeat(64),x=>x.updates.push(structuredClone(x.updates[0])),x=>x.user_contract_tree_update_proof.old_value='1'.repeat(64),x=>x.user_contract_tree_update_proof.new_value='0'.repeat(64)]){
  const changed=structuredClone(request),row=changed.user_ec_input.contract_state_updates.find(x=>x.user_contract_tree_update_proof.index===41n);mutate(row);assert.throws(()=>auditNftAccountBootstrap(changed));
 }
});
