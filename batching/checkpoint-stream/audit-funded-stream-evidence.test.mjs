import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {auditFundedStreamEvidence, auditFundedStreamRow, auditFixtureSourceAfterFunding} from './audit-funded-stream-evidence.mjs';
const root = process.env.FUNDED_STREAM_UPS;

for (const market of ['amm', 'bondingcurve']) {
  test(`${market}: frozen source contains the accepted funding leaf at its new checkpoint`, {skip: !root}, async () => {
    const read = async name => parseLosslessJson(await readFile(`${root}/${market}-${name}`, 'utf8'));
    const args = [await read('funding-grant/request.json'), await read('open/source.json'), await read('open/plan.json')];
    auditFixtureSourceAfterFunding(...args);
    const oldHeight = structuredClone(args); oldHeight[1].fields[6] = oldHeight[0].user_ec_input.core.checkpoint_id;
    assert.throws(() => auditFixtureSourceAfterFunding(...oldHeight));
    const oldNonce = structuredClone(args);
    oldNonce[1].accounts.find(account => account.leaf.user_id === oldNonce[1].fields[4]).leaf.nonce -= 1n;
    assert.throws(() => auditFixtureSourceAfterFunding(...oldNonce));
  });
  test(`${market}: funded settlement public projection rejects changed fees, keys, callers and U124 limbs`, {skip: !root}, async () => {
    const read = async (name, lossless = true) => {
      const bytes = await readFile(`${root}/${market}-settle-0/${name}`);
      return lossless ? parseLosslessJson(bytes.toString()) : JSON.parse(bytes);
    };
    const args = [await read('verification.json', false), await read('request.json'),
      await read('plan.json'), await read('public-session.json')];
    assert.ok(auditFundedStreamRow(...args));
    const changes = [
      x => { x[2].fields[73] += 1n; },
      x => { x[2].registered_key[0] += 1n; },
      x => { x[3].stack[0].caller_contract_id = 1n; },
      x => { x[2].fields[24] = 2n ** 62n; },
      x => { x[2].fields[25] = 2n ** 62n; },
      x => { x[2].random = {}; },
      x => { x[1].user_ec_input.core.new_user_leaf.nonce += 1n; },
    ];
    for (const change of changes) {
      const altered = structuredClone(args); change(altered);
      assert.throws(() => auditFundedStreamRow(...altered));
    }
  });
}
test('all source/state edges, 4+1 members, three fills, two refunds and fee caps reconcile', {skip: !root}, async () => {
  const report = await auditFundedStreamEvidence(root);
  assert.equal(report.completeUps, 16);
  assert.equal(report.financialOperations, 0);
  assert.equal(report.cryptographicVerificationPerformed, false);
});
