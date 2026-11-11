import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderbookSellCalls, orderbookCancelCall} from './client.mjs';
import {losslessJson, parseLosslessJson} from '../../amm/u124/client.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';

const release = sdkRelease('sdk-audit-20261102-v1');
const config = {assetA: 41, assetB: 42, networkMagic: '1384803358401154921'};
// Host fixtures check encoding and rejection only. No current deployment or
// registered fingerprint is authenticated by this unit test.
const marketAbi = JSON.parse(readFileSync(new URL('../../executor/fixtures/u124/orderbook.abi.json', import.meta.url)));
const tokenAbi = {contract: {methods: [{name: 'transfer', method_id: 1, input_felt_count: 3}]}};
const policy = {version: 2, market: 'orderbook', market_id: 1000, config,
  execution_scope: 'explicit-selected-orders-v1', whole_market_completeness: false,
  qualified_randomness: false, native_protocol: 'mainnet-beta-20261027',
  sdk_commit: release.sdkCommit, client_commit: release.clientCommit, chain_root_at1: 'ab'.repeat(32)};
const args = {marketId: 1000n, marketAbi, tokenAbi, vaultId: 100n, config,
  side: 0n, amount: (1n << 80n) + 17n, minimum: (1n << 90n) + 19n,
  deadline: (1n << 32n) - 1n, nonce: (1n << 62n) - 1n};

test('selected Book ordinary order preserves both U124 limbs and current Native funding', () => {
  const calls = orderbookSellCalls(policy, args);
  assert.deepEqual(calls.map(c => [c.contract_id, c.method_name]), [[1000n, 'open_sell'], [0n, 'transfer'], [41n, 'transfer']]);
  assert.deepEqual(calls[0].inputs, [100n, 0n, 17n, 1n << 18n, 19n, 1n << 28n, args.deadline, args.nonce]);
  assert.deepEqual(calls[1].inputs, [100n, 1000100000n]);
  assert.deepEqual(calls[2].inputs, [100n, 17n, 1n << 18n]);
  assert.equal(orderbookSellCalls(policy, {...args, side: 1n})[2].contract_id, 42n);
  assert.deepEqual(orderbookSellCalls(parseLosslessJson(losslessJson(policy)), args), calls);
});

test('selected Book rejects unsupported scope, release, identities and impossible whole orders', () => {
  for (const change of [{market: 'amm'}, {version: 19}, {execution_scope: 'source-covered'},
    {whole_market_completeness: true}, {qualified_randomness: true}, {native_protocol: 'legacy-v1'},
    {sdk_commit: '0'.repeat(40)}, {client_commit: '0'.repeat(40)}, {chain_root_at1: '0'.repeat(64)}]) {
    assert.throws(() => orderbookSellCalls({...policy, ...change}, args));
  }
  for (const change of [{marketId: 1001n}, {vaultId: 0n}, {config: {...config, assetA: 43}},
    {side: 2n}, {amount: 0n}, {minimum: 0n}, {amount: 1n << 124n}, {minimum: 1n << 124n},
    {amount: 1}, {deadline: 0n}, {deadline: 1n << 32n}, {nonce: 0n}, {nonce: 1n << 62n}]) {
    assert.throws(() => orderbookSellCalls(policy, {...args, ...change}));
  }
  assert.throws(() => orderbookSellCalls(policy, {...args, tokenAbi: {contract: {methods: [{name: 'transfer', method_id: 1, input_felt_count: 2}]}}}));
});

test('ordinary Book cancellation requests a flag without constructing payouts', () => {
  const abi = {contract: {methods: [{name: 'request_cancel', method_id: 1, input_felt_count: 0}]}};
  assert.deepEqual(orderbookCancelCall(policy, {...args, marketAbi: abi}),
    {contract_id: 1000n, method_id: 1n, method_name: 'request_cancel', inputs: []});
  assert.throws(() => orderbookCancelCall(policy, args));
});

test('Book client binds the builder domain and exact deterministic configuration', () => {
  const both = change => ({policy: {...policy, config: {...config, ...change}}, config: {...config, ...change}});
  for (const change of [{networkMagic: '1'}, {networkMagic: 1384803358401154921n}, {networkMagic: undefined},
    {ordering: 'random'}, {seed: '1'}, {bootstrap: {}}, {unusedMetadata: true}]) {
    const bad = both(change);
    assert.throws(() => orderbookSellCalls(bad.policy, {...args, config: bad.config}));
    assert.throws(() => orderbookCancelCall(bad.policy, {...args, config: bad.config}));
  }
  for (const patch of [{networkMagic: '1'}, {networkMagic: undefined}, {ordering: 'deterministic'}]) {
    assert.throws(() => orderbookSellCalls({...policy, config: {...config, ...patch}}, args));
    assert.throws(() => orderbookSellCalls(policy, {...args, config: {...config, ...patch}}));
  }
  const deterministic = both({ordering: 'deterministic'});
  assert.deepEqual(orderbookSellCalls(deterministic.policy, {...args, config: deterministic.config}), orderbookSellCalls(policy, args));
  assert.deepEqual(orderbookSellCalls(parseLosslessJson(losslessJson(deterministic.policy)), {...args, config: deterministic.config}), orderbookSellCalls(policy, args));
});
