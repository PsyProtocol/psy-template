// Explicit public saved fixture required. This tests consistency rejection,
// never independent proof validity, ordinary wallet approval or network use.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {auditFundedPairRow} from './audit-funded-pair.mjs';
const root=process.env.FUNDED_PAIR_AUDIT_STAGE;
test('public pair row rejects fee, endpoint, nonce, caller, key and phase substitutions',{skip:!root},async()=>{
 const read=async f=>parseLosslessJson(await readFile(join(root,f),'utf8'));
 const v=JSON.parse(await readFile(join(root,'verification.json'),'utf8'));
 const original=[v,await read('request.json'),await read('plan.json'),await read('public-session.json')];
 auditFundedPairRow(...original);
 for(const mutate of [
  x=>x[1].user_ec_input.core.stats.guta_fees_collected++,
  x=>x[1].user_ec_input.core.state_transition.end_user_leaf_hash='0'.repeat(64),
  x=>x[1].user_ec_input.core.new_user_leaf.nonce++,
  x=>x[2].fields[73]++,
  x=>x[2].fields[0]=12n,
  x=>x[2].random={},
  x=>x[3].stack[0].caller_contract_id=0n,
  x=>x[3].keyFingerprint='0'.repeat(64),
  x=>x[3].actualCalls.at(-2).inputs[1]++
 ]){const changed=structuredClone(original);mutate(changed);assert.throws(()=>auditFundedPairRow(...changed));}
});
