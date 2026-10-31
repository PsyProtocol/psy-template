import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeFundedPolicy} from './funded-policy.mjs';
import {makeStreamPolicy} from './build-policy.mjs';

const root = process.env.FUNDED_FIXTURES;
for (const market of ['amm', 'bondingcurve']) {
  test(`${market}: funded policy preserves deterministic roles and rejects incompatible fee ABI`, {skip: !root}, async () => {
    const read = async path => JSON.parse(await readFile(`${root}/${path}`, 'utf8'));
    const args = [market, 1000, await read(`${market}/config.json`),
      await read(`${market}/compiled/compilation_artifact.json`),
      await read('token/compilation_artifact.json'), await read('nft/compilation_artifact.json')];
    const before = makeStreamPolicy(...args);
    const funded = makeFundedPolicy(...args);
    assert.equal(funded.version, 14);
    assert.equal(funded.source_window_checkpoints, 32);
    assert.equal(funded.live_authorization, false);
    assert.equal(funded.qualified_randomness, false);
    assert.deepEqual(funded.base, before.base);
    for (const [name, role] of Object.entries(before.stream)) assert.deepEqual(funded.stream[name], role);
    assert.equal(funded.owner_fee_claim.inputs[0].constant, String(args[2].feeOwner));
    for (const method of ['authorize_fee_budget', 'apply_fee_grant', 'account_executor_fee']) {
      for (const [field, value] of [['input_felt_count', 99], ['output_felt_count', 1], ['state_mutability', 'view']]) {
        const changed = structuredClone(args);
        changed[3].abi.contract.methods.find(m => m.name === method)[field] = value;
        assert.throws(() => makeFundedPolicy(...changed));
      }
    }
    for (const owner of [0, 2 ** 24, args[2].issuer, args[2].target, 1.5]) {
      const changed = structuredClone(args);
      changed[2].feeOwner = owner;
      assert.throws(() => makeFundedPolicy(...changed));
    }
  });
}
