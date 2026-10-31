import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {auditFundedRow, auditFundedEvidence} from './audit-funded-evidence.mjs';

const root = process.env.FUNDED_UPS, fixtures = process.env.FUNDED_FIXTURES;
for (const market of ['amm', 'bondingcurve']) {
  test(`${market}: public bootstrap audit rejects changed caller, funding, fee, key and state chain`, {skip: !root || !fixtures}, async () => {
    const read = async (path, lossless = true) => {
      const text = await readFile(path, 'utf8');
      return lossless ? parseLosslessJson(text) : JSON.parse(text);
    };
    const base = `${root}/${market}-fresh-bootstrap`;
    const args = [await read(`${fixtures}/${market}/stream-policy.json`),
      await read(`${base}/verification.json`, false), await read(`${base}/request.json`),
      await read(`${base}/plan.json`), await read(`${base}/public-session.json`)];
    assert.equal(auditFundedRow(...args).firstUse, true);
    const attacks = [
      x => { x[4].stack[9].caller_contract_id = 1n; },
      x => { [x[4].stack[9], x[4].stack[10]] = [x[4].stack[10], x[4].stack[9]]; },
      x => { x[4].actualCalls[6].inputs[1] += 1n; },
      x => { x[3].registered_key[0] += 1n; },
      x => { x[3].fields[73] += 1n; },
      x => { x[3].fields[23] = 0n; },
      x => { x[0].fee_owner += 1n; },
      x => { x[2].user_ec_input.core.state_transition.start_user_leaf_hash = '1'.repeat(64); },
      x => { x[1].storedStartLeaf = x[1].startLeaf; },
      x => { x[4].session.start_user_leaf.nonce = 1n; },
    ];
    for (const attack of attacks) {
      const changed = structuredClone(args); attack(changed);
      assert.throws(() => auditFundedRow(...changed));
    }
  });
}
test('funded public audit retains the two exact state edges and measured fee sums', {skip: !root || !fixtures}, async () => {
  const report = await auditFundedEvidence(root, fixtures);
  assert.equal(report.completeUps, 4);
  assert.equal(report.cryptographicVerificationPerformed, false);
  assert.equal(report.canBroadcast, false);
});
