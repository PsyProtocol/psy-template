import test from 'node:test';
import assert from 'node:assert/strict';
import {orderbookSellCalls, orderbookCancelCall} from './client.mjs';
import {assertBookSellStack} from './coreClient.mjs';
import {losslessJson, parseLosslessJson} from '../../amm/u124/client.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';

const release = sdkRelease('sdk-audit-20261102-v1');
const config = {assetA: 41, assetB: 42, networkMagic: '1384803358401154921'};
// Host fixtures check encoding and rejection only. No current deployment or
// registered fingerprint is authenticated by this unit test. Select the exact
// current Book methods so legacy source methods cannot bypass the ABI gate.
const reviewedMarketAbi = structuredClone(
  readReviewedAbis().admission.markets.orderbook.artifact.abi);
const selectedBookMethods = new Set([
  'open_sell', 'request_cancel', 'close_0', 'close_1',
]);
const marketAbi = {
  ...reviewedMarketAbi,
  contract: {
    ...reviewedMarketAbi.contract,
    methods: reviewedMarketAbi.contract.methods.filter(method =>
      selectedBookMethods.has(method.name)),
  },
};
assert.equal(marketAbi.contract.methods.length, selectedBookMethods.size);
const tokenAbi = {contract: {methods: [{name: 'transfer', method_id: 1, input_felt_count: 3,
  output_felt_count: 0, state_mutability: 'external'}]}};
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
  assert.throws(() => orderbookSellCalls(policy, {...args, tokenAbi: {contract: {methods: [{name: 'transfer', method_id: 1,
    input_felt_count: 2, output_felt_count: 0, state_mutability: 'external'}]}}}));
});

test('ordinary Book cancellation requests a flag without constructing payouts', () => {
  assert.deepEqual(orderbookCancelCall(policy, args),
    {contract_id: 1000n, method_id: BigInt(marketAbi.contract.methods.find(m => m.name === 'request_cancel').method_id),
      method_name: 'request_cancel', inputs: []});
  const missingCancel = structuredClone(marketAbi);
  missingCancel.contract.methods = missingCancel.contract.methods.filter(m => m.name !== 'request_cancel');
  assert.throws(() => orderbookCancelCall(policy, {...args, marketAbi: missingCancel}));
});

test('Book client rejects malformed ordinary ABI selectors and metadata', () => {
  const rejectMarket = mutate => {
    const abi = structuredClone(marketAbi);
    mutate(abi.contract.methods);
    assert.throws(() => orderbookSellCalls(policy, {...args, marketAbi: abi}));
    assert.throws(() => orderbookCancelCall(policy, {...args, marketAbi: abi}));
  };
  rejectMarket(methods => methods.push({...methods[0]}));
  rejectMarket(methods => { methods[1].method_id = methods[0].method_id; });
  // A repeated name with a fresh unique nonzero uint32 selector still cannot
  // pass: `call` resolves by name, so two circuits would share one identity.
  for (const name of ['open_sell', 'request_cancel'])
    rejectMarket(methods => methods.push({...methods.find(m => m.name === name), method_id: 0xfffffff0}));
  for (const method_id of [0, -1, 1.5, '100', 1n, 0x100000000])
    rejectMarket(methods => { methods[0].method_id = method_id; });
  for (const [field, value] of [['output_felt_count', 1], ['state_mutability', 'view'], ['input_felt_count', 7]])
    rejectMarket(methods => Object.assign(methods.find(m => m.name === 'open_sell'), {[field]: value}));
  rejectMarket(methods => { methods.find(m => m.name === 'request_cancel').input_felt_count = 1; });
  rejectMarket(methods => { methods.find(m => m.name === 'close_0').output_felt_count = 1; });
  rejectMarket(methods => { methods.find(m => m.name === 'close_1').state_mutability = 'view'; });
  rejectMarket(methods => methods.push({name: 'stream_seal', method_id: 9999, input_felt_count: 0,
    output_felt_count: 0, state_mutability: 'external'}));

  const rejectToken = mutate => {
    const abi = structuredClone(tokenAbi);
    mutate(abi.contract.methods);
    assert.throws(() => orderbookSellCalls(policy, {...args, tokenAbi: abi}));
  };
  rejectToken(methods => methods.push({...methods[0]}));
  rejectToken(methods => { methods.push({name: 'claim', method_id: methods[0].method_id,
    input_felt_count: 1, output_felt_count: 0, state_mutability: 'external'}); });
  // The synthetic token ABI holds only `transfer`, so appending a different
  // name such as `claim` adds a legitimate unique method that must be accepted.
  // Same-name duplicates need the full reviewed token ABI, which already
  // declares both names.
  const fullTokenAbi = readReviewedAbis().admission.token.abi;
  assert.ok(Array.isArray(fullTokenAbi?.contract?.methods) && fullTokenAbi.contract.methods.length > 0,
    'full reviewed token ABI methods required');
  // Meaningful negative: the untouched full fixture passes the production gate.
  orderbookSellCalls(policy, {...args, tokenAbi: structuredClone(fullTokenAbi)});
  for (const name of ['transfer', 'claim']) {
    const original = fullTokenAbi.contract.methods.find(m => m.name === name);
    assert.ok(original, 'reviewed token ABI must declare ' + name);
    const usedIds = new Set(fullTokenAbi.contract.methods.map(m => m.method_id));
    let duplicateId = 1;
    while (usedIds.has(duplicateId)) duplicateId += 1;
    assert.ok(Number.isSafeInteger(duplicateId) && duplicateId > 0 && duplicateId <= 0xffffffff,
      'fresh unique nonzero uint32 selector required');
    const duplicated = structuredClone(fullTokenAbi);
    duplicated.contract.methods.push({...structuredClone(original), method_id: duplicateId});
    assert.equal(new Set(duplicated.contract.methods.map(m => m.method_id)).size,
      duplicated.contract.methods.length, 'duplicate keeps every selector unique');
    assert.throws(() => orderbookSellCalls(policy, {...args, tokenAbi: duplicated}));
  }
  for (const method_id of [0, -1, 1.5, '1', 1n, 0x100000000])
    rejectToken(methods => { methods[0].method_id = method_id; });
  for (const [field, value] of [['output_felt_count', 1], ['state_mutability', 'view'], ['input_felt_count', 2]])
    rejectToken(methods => { methods[0][field] = value; });
});

test('Book client validates the actual returned order/payment stack', () => {
  const calls = orderbookSellCalls(policy, args);
  // Direct validation is equality/bounds only; it does not authenticate policy,
  // code/layout or funds. The ordinary wrapper above applies those gates.
  // The checker returns the very array it was handed, so a clone must come back
  // as that same clone reference while staying structurally equal to the original.
  const candidate = structuredClone(calls);
  assert.notEqual(candidate, calls);
  assert.equal(assertBookSellStack(candidate, args), candidate);
  assert.deepEqual(candidate, calls);
  const substitutions = [
    c => c.push({...c[0]}),
    c => c.pop(),
    c => c.reverse(),
    c => { c[0].contract_id = 1001n; },
    c => { c[0].method_name = 'request_cancel'; },
    c => { c[0].method_id += 1n; },
    c => { c[0].inputs[0] = 101n; },
    c => { c[0].inputs[1] = 1n; },
    c => { c[0].inputs[2] += 1n; },
    c => { c[0].inputs[4] += 1n; },
    c => { c[0].inputs[6] = 0n; },
    c => { c[0].inputs[7] = 0n; },
    c => { c[0].inputs.pop(); },
    c => { c[1].contract_id = 1n; },
    c => { c[1].method_name = 'claim'; },
    c => { c[1].inputs[0] = 101n; },
    c => { c[1].inputs[1] += 1n; },
    c => { c[2].contract_id = 42n; },
    c => { c[2].method_name = 'claim'; },
    c => { c[2].method_id += 1n; },
    c => { c[2].inputs[0] = 101n; },
    c => { c[2].inputs[1] += 1n; },
    c => { c[2].inputs.pop(); },
  ];
  for (const substitute of substitutions) {
    const changed = structuredClone(calls);
    substitute(changed);
    assert.notDeepEqual(changed, calls);
    assert.throws(() => assertBookSellStack(changed, args));
  }
  assert.deepEqual(orderbookSellCalls(policy, args), calls);
});

test('Book stack validator refuses wrong scalar bounds directly', () => {
  const calls = orderbookSellCalls(policy, args);
  const badScalar = (index, value) => {
    const changed = structuredClone(calls);
    changed[index].inputs[value.index] = value.scalar;
    assert.throws(() => assertBookSellStack(changed, args));
  };
  for (const value of [{index: 2, scalar: 1n << 62n}, {index: 3, scalar: -1n},
    {index: 4, scalar: 1n << 62n}, {index: 5, scalar: 1.5}])
    badScalar(0, value);
  for (const value of [{index: 1, scalar: 1n << 62n}, {index: 2, scalar: -1n}])
    badScalar(2, value);
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

test('Book funding preserves account IDs even when their numbers equal contract IDs', () => {
  for (const vaultId of [args.marketId, BigInt(config.assetA), BigInt(config.assetB)]) {
    const calls = orderbookSellCalls(policy, {...args, vaultId});
    assert.equal(calls[0].inputs[0], vaultId);
    assert.equal(calls[1].inputs[0], vaultId);
    assert.equal(calls[2].inputs[0], vaultId);
    assert.deepEqual(calls.map(c => c.contract_id), [args.marketId, 0n, BigInt(config.assetA)]);
    // Cancellation is reviewed against the complete ordinary market interface;
    // a minimal request_cancel-only ABI is not a legal market ABI. tokenAbi is
    // deliberately omitted here because a flag request pays no tokens.
    const cancelAbi = structuredClone(marketAbi);
    const {tokenAbi: unusedTokenAbi, ...cancelArgs} = args;
    const cancel = orderbookCancelCall(policy, {...cancelArgs, marketAbi: cancelAbi, vaultId});
    assert.equal(cancel.method_name, 'request_cancel');
    assert.equal(cancel.contract_id, args.marketId);
    assert.equal(cancel.method_id, BigInt(cancelAbi.contract.methods.find(m => m.name === 'request_cancel').method_id));
    assert.deepEqual(cancel.inputs, []);
  }
});
