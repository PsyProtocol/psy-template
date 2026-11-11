import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeAmount, FEE_ESCROW} from '../../amm/u124/client.mjs';
import {CURVE_CORE_CLIENT_STATUS, curveLimitOrderCalls, curveCancelCall,
  curveRecoveryEnrollmentCall, curveActivationFundingCalls,
  curveInventoryFundingCalls, curveGraduationFundingCalls} from './client.mjs';

// Minimal synthetic ABIs test call construction only, without compiled fixtures,
// state proofs, a wallet, a network provider or a financial execution path.
const abi = methods => ({contract: {methods: methods.map(([name, count], i) =>
  ({name, method_id: 100 + i, input_felt_count: count}))}});
const marketAbi = abi([['open_limit_buy', 7], ['open_limit_sell', 7], ['request_cancel', 0], ['request_recovery', 1]]);
const tokenAbi = abi([['transfer', 3]]);
const config = {assetA: 60, assetB: 61, issuer: 5, target: 400, cap: 10, liquidity: 2,
  unit: String(1n << 80n), base: '1000', step: '10', threshold: 8, networkMagic: '1384803358401154921'};
const policy = {version: 2, market: 'bondingcurve', market_id: 1000, config,
  execution_scope: 'explicit-selected-orders-v1', whole_market_completeness: false,
  qualified_randomness: false, native_protocol: 'mainnet-beta-20261027',
  sdk_commit: '01b8f2b0a077367a7b9879baba1a72aea8ab5510',
  client_commit: '7058070057c3242b5d8b29e1a31d498aaa4202c0', chain_root_at1: '1'.repeat(64)};
const args = {marketId: 1000n, vaultId: 100n, issuerId: 5n, config, marketAbi, tokenAbi,
  lots: 2n, quoteLimit: (1n << 90n) + 17n, deadline: 200n, nonce: 1n};

test('current Curve limit client preserves both U124 limbs and ordinary Native ABI', () => {
  for (const buy of [true, false]) {
    const calls = curveLimitOrderCalls(policy, {...args, buy, nativeProtocol: 'legacy-v1'});
    assert.equal(calls[0].method_name, buy ? 'open_limit_buy' : 'open_limit_sell');
    assert.deepEqual(calls[0].inputs.slice(0, 3), [100n, 2n, 0n]);
    assert.equal(decodeAmount(calls[0].inputs.slice(3, 5)), args.quoteLimit);
    assert.deepEqual(calls[0].inputs.slice(5), [200n, 1n]);
    assert.deepEqual(calls[1], {contract_id: 0n, method_name: 'transfer', inputs: [100n, FEE_ESCROW]});
    assert.equal(calls[2].contract_id, buy ? 61n : 60n);
    assert.equal(decodeAmount(calls[2].inputs.slice(1)), buy ? args.quoteLimit : 2n * BigInt(config.unit));
  }
  assert.equal(CURVE_CORE_CLIENT_STATUS.formalExecutorIntegrated, false);
  assert.equal(CURVE_CORE_CLIENT_STATUS.currentChainAccepted, false);
});

test('Curve semantic bounds reject before ordinary calls reach proving', () => {
  for (const change of [
    {buy: 1}, {lots: 0n}, {lots: 11n}, {lots: 2},
    {quoteLimit: 0n}, {quoteLimit: 1n << 124n}, {quoteLimit: 17},
    {deadline: 1n << 32n}, {deadline: -1n}, {deadline: 0n}, {deadline: 200},
    {nonce: 0n}, {nonce: 1n << 62n}, {nonce: 1},
  ]) assert.throws(() => curveLimitOrderCalls(policy, {...args, buy: true, ...change}));
  assert.doesNotThrow(() => curveLimitOrderCalls(policy, {...args, buy: false,
    lots: 10n, quoteLimit: (1n << 124n) - 1n, deadline: (1n << 32n) - 1n, nonce: (1n << 62n) - 1n}));
});

test('every Curve helper requires the exact selected release, scope and compiled configuration', () => {
  const helpers = [curveLimitOrderCalls, curveCancelCall, curveRecoveryEnrollmentCall,
    curveActivationFundingCalls, curveInventoryFundingCalls, curveGraduationFundingCalls];
  for (const mutate of [
    p => p.version = 18, p => p.market = 'amm', p => p.market_id = 1001,
    p => p.execution_scope = 'source-covered-authorized-exit-v1',
    p => p.whole_market_completeness = true, p => p.qualified_randomness = true,
    p => p.native_protocol = 'legacy-v1', p => p.sdk_commit = '2'.repeat(40),
    p => p.client_commit = '2'.repeat(40), p => p.chain_root_at1 = '0'.repeat(64),
    p => p.config.assetA = 62, p => p.config.assetB = 62,
    p => p.config.issuer = 6, p => p.config.target = 401,
    p => p.config.cap = 9, p => p.config.unit = '1',
    p => p.config.base = '1', p => p.config.step = '1', p => p.config.threshold = 7,
  ]) {
    const changed = structuredClone(policy); mutate(changed);
    for (const helper of helpers) assert.throws(() => helper(changed, {...args, buy: true}));
  }
});

test('Curve binding rejects invalid or substituted assets and fixed participant roles', () => {
  for (const change of [{marketId: 60n}, {marketId: 4n}, {marketId: 1000}, {vaultId: 0n},
    {vaultId: 5n}, {vaultId: 400n}, {vaultId: 1n << 24n}]) {
    assert.throws(() => curveCancelCall(policy, {...args, ...change}));
  }
  for (const change of [{assetB: 60}, {issuer: 400}, {target: 5}, {base: 1},
    {unit: String((1n << 124n) - 1n)}, {networkMagic: '1'}]) {
    const changedConfig = {...config, ...change};
    assert.throws(() => curveCancelCall({...policy, config: changedConfig}, {...args, config: changedConfig}));
  }
  for (const helper of [curveInventoryFundingCalls, curveGraduationFundingCalls]) {
    assert.throws(() => helper(policy, {...args, issuerId: 6n}));
    assert.throws(() => helper(policy, {...args, issuerId: 5}));
  }
});

test('activation, issuer inventory and graduation funding remain distinct exact contributions', () => {
  const activation = curveActivationFundingCalls(policy, args);
  assert.deepEqual(activation[0].inputs, [100n, FEE_ESCROW]);
  assert.equal(activation[0].method_name, 'transfer');
  assert.deepEqual(activation.slice(1).map(c => [c.contract_id, ...c.inputs]),
    [[60n, 100n, 1n, 0n], [61n, 100n, 1n, 0n]]);
  const inventory = curveInventoryFundingCalls(policy, args);
  assert.equal(inventory[1].contract_id, 60n);
  assert.equal(decodeAmount(inventory[1].inputs.slice(1)), 12n * BigInt(config.unit));
  assert.deepEqual(curveGraduationFundingCalls(policy, args), [activation[0]]);
  assert.equal(curveCancelCall(policy, args).method_name, 'request_cancel');
  assert.deepEqual(curveRecoveryEnrollmentCall(policy, args).inputs, [100n]);
});
