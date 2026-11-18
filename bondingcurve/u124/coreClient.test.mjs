import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeAmount, FEE_ESCROW} from '../../amm/u124/client.mjs';
import {CURVE_CORE_CLIENT_STATUS, curveLimitOrderCalls, curveCancelCall,
  curveRecoveryEnrollmentCall, curveActivationFundingCalls,
  curveInventoryFundingCalls, curveGraduationFundingCalls} from './client.mjs';
// The legacy barrel keeps exactly its original public API. The new stack
// validator is imported from its own module instead of widening that barrel.
import {assertCurveLimitOrderStack} from './coreClient.mjs';
import {CORE_DEPENDENCY_KEY_PROFILE} from '../../executor/coreDependencyPolicy.mjs';

// Minimal synthetic ABIs test call construction only, without compiled fixtures,
// state proofs, a wallet, a network provider or a financial execution path.
// The selector/output/mutability metadata below is a synthetic shape pin, not
// evidence taken from a compiled artifact.
// Limitation: this file covers call construction and rejection paths only. It
// establishes no full-UPS execution, live-chain acceptance or external review
// sign-off, so the production acceptance flags must stay false.
const abi = methods => ({contract: {methods: methods.map(([name, count], i) =>
  ({name, method_id: 100 + i, input_felt_count: count, output_felt_count: 0,
    state_mutability: 'external'}))}});
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
    assert.equal(calls.length, 3, 'exact three-call limit order stack');
    assert.equal(calls[0].method_id, buy ? 100n : 101n);
    assert.equal(calls[2].method_id, 100n);
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

test('Curve separates account identity from contract numeric identity', () => {
  for (const vaultId of [args.marketId, BigInt(config.assetA), BigInt(config.assetB)]) {
    const calls = curveLimitOrderCalls(policy, {...args, buy: true, vaultId});
    assert.equal(calls[0].inputs[0], vaultId);
    assert.equal(calls[1].inputs[0], vaultId);
    assert.equal(calls[2].inputs[0], vaultId);
    assert.equal(curveCancelCall(policy, {...args, vaultId}).method_name, 'request_cancel');
  }
  for (const vaultId of [BigInt(config.issuer), BigInt(config.target)])
    assert.throws(() => curveLimitOrderCalls(policy, {...args, buy: true, vaultId}));
});

const helpers = [curveLimitOrderCalls, curveCancelCall, curveRecoveryEnrollmentCall,
  curveActivationFundingCalls, curveInventoryFundingCalls, curveGraduationFundingCalls];

// Synthetic canonical roots only. These pins are shape fixtures, not fetched
// deployment identities, and they establish no on-chain contract binding.
const dependency = (contractId, stateTreeHeight) => ({contractId, deployer: contractId === 0 ? 0 : 5,
  codeRoot: '1'.repeat(64), layoutRoot: '2'.repeat(64), functionTreeRoot: '3'.repeat(64),
  stateTreeHeight, layoutFieldCount: 4, layoutSlotCount: 8});
const bindings = [dependency(0, 32), dependency(60, 31), dependency(61, 31), dependency(1000, 31)];
const boundPolicy = {...policy, key_profile: CORE_DEPENDENCY_KEY_PROFILE, dependency_bindings: bindings};

test('dependency-bound Curve policy stays pinned to the compiled market and asset set', () => {
  for (const helper of helpers) assert.doesNotThrow(() => helper(boundPolicy, {...args, buy: true}));
  const substituted = bindings.map(b => b.contractId === 61 ? {...b, contractId: 62} : b);
  const zeroRoot = bindings.map(b => b.contractId === 60 ? {...b, codeRoot: '0'.repeat(64)} : b);
  const nonCanonical = bindings.map(b => b.contractId === 60 ? {...b, layoutRoot: 'f'.repeat(64)} : b);
  const wrongHeight = bindings.map(b => b.contractId === 0 ? {...b, stateTreeHeight: 31} : b);
  for (const changed of [
    {...boundPolicy, dependency_bindings: bindings.slice(1)},
    {...boundPolicy, dependency_bindings: substituted},
    {...boundPolicy, dependency_bindings: zeroRoot},
    {...boundPolicy, dependency_bindings: nonCanonical},
    {...boundPolicy, dependency_bindings: wrongHeight},
    {...boundPolicy, dependency_bindings: undefined},
    {key_profile: undefined, ...policy, dependency_bindings: bindings},
  ]) for (const helper of helpers) assert.throws(() => helper(changed, {...args, buy: true}));
});

test('substituted, duplicated or traversal-shaped ordinary ABIs are rejected', () => {
  const duplicate = abi([['open_limit_buy', 7], ['open_limit_sell', 7], ['request_cancel', 0],
    ['request_recovery', 1], ['request_cancel', 0]]);
  const missing = abi([['open_limit_buy', 7], ['open_limit_sell', 7], ['request_cancel', 0]]);
  const wrongArity = abi([['open_limit_buy', 7], ['open_limit_sell', 7], ['request_cancel', 1], ['request_recovery', 1]]);
  const traversal = abi([['open_limit_buy', 7], ['open_limit_sell', 7], ['request_cancel', 0],
    ['request_recovery', 1], ['stream_scan', 0]]);
  for (const marketAbi of [duplicate, missing, wrongArity, traversal, undefined])
    for (const helper of [curveLimitOrderCalls, curveCancelCall, curveRecoveryEnrollmentCall])
      assert.throws(() => helper(policy, {...args, buy: true, marketAbi}));
  for (const changedToken of [abi([['transfer', 2]]), abi([['transfer', 3], ['transfer', 3]]), undefined])
    for (const helper of [curveLimitOrderCalls, curveActivationFundingCalls, curveInventoryFundingCalls])
      assert.throws(() => helper(policy, {...args, buy: true, tokenAbi: changedToken}));
});

test('cancellation and recovery enrollment carry no payment authority', () => {
  const cancel = curveCancelCall(policy, args);
  assert.ok(!Array.isArray(cancel));
  assert.deepEqual(cancel, {contract_id: 1000n, method_id: 102n, method_name: 'request_cancel', inputs: []});
  const enrollment = curveRecoveryEnrollmentCall(policy, args);
  assert.ok(!Array.isArray(enrollment));
  assert.equal(enrollment.contract_id, 1000n);
  assert.equal(enrollment.method_name, 'request_recovery');
  assert.deepEqual(enrollment.inputs, [100n]);
  assert.ok(!enrollment.inputs.includes(FEE_ESCROW));
});

test('graduation target accounts and contract identities are separate namespaces', () => {
  const feeOnly = [{contract_id: 0n, method_name: 'transfer', inputs: [100n, FEE_ESCROW]}];
  // A target ACCOUNT numbered like the market CONTRACT is valid and still
  // funds only the fixed Native fee escrow.
  assert.deepEqual(curveGraduationFundingCalls({...policy, market_id: config.target},
    {...args, marketId: BigInt(config.target)}), feeOnly);
  for (const target of [config.assetA, config.assetB]) {
    const changedConfig = {...config, target};
    assert.deepEqual(curveGraduationFundingCalls({...policy, config: changedConfig},
      {...args, config: changedConfig}), feeOnly);
  }
  // Same-namespace contract collisions remain forbidden.
  for (const marketId of [config.assetA, config.assetB])
    assert.throws(() => curveGraduationFundingCalls({...policy, market_id: marketId},
      {...args, marketId: BigInt(marketId)}));
  const aliased = {...config, assetB: config.assetA};
  assert.throws(() => curveGraduationFundingCalls({...policy, config: aliased},
    {...args, config: aliased}));
  // Issuer and graduation target share the ACCOUNT namespace, so they must
  // differ from each other too, not only from the caller vault.
  for (const change of [{issuer: config.target}, {target: config.issuer}]) {
    const collided = {...config, ...change};
    assert.throws(() => curveGraduationFundingCalls({...policy, config: collided},
      {...args, config: collided}));
  }
  assert.deepEqual(curveGraduationFundingCalls(boundPolicy, args), feeOnly);
});

test('funding and sell inventory stay complete bounded U124 contributions', () => {
  for (const calls of [curveActivationFundingCalls(policy, args), curveInventoryFundingCalls(policy, args),
    curveGraduationFundingCalls(policy, args)]) {
    assert.deepEqual(calls[0], {contract_id: 0n, method_name: 'transfer', inputs: [100n, FEE_ESCROW]});
    for (const c of calls.slice(1)) {
      assert.ok([60n, 61n].includes(c.contract_id));
      assert.equal(c.inputs[0], 100n);
      assert.equal(c.inputs.length, 3);
    }
  }
  // 12 * 2^120 inventory and 10 * 2^120 sell inventory are still complete U124
  // amounts, so they must be accepted with both limbs intact.
  const wide = {...config, unit: String(1n << 120n)}, widePolicy = {...policy, config: wide};
  assert.equal(decodeAmount(curveInventoryFundingCalls(widePolicy, {...args, config: wide})[1].inputs.slice(1)),
    12n * BigInt(wide.unit));
  assert.doesNotThrow(() => curveLimitOrderCalls(widePolicy, {...args, config: wide, buy: false,
    lots: 10n, quoteLimit: (1n << 124n) - 1n}));
  // 12 * 2^121 and 10 * 2^121 exceed U124 and must never be truncated.
  const over = {...config, unit: String(1n << 121n)}, overPolicy = {...policy, config: over};
  assert.throws(() => curveInventoryFundingCalls(overPolicy, {...args, config: over}));
  assert.throws(() => curveLimitOrderCalls(overPolicy, {...args, config: over, buy: false, lots: 10n}));
  assert.doesNotThrow(() => curveLimitOrderCalls(policy, {...args, buy: true, quoteLimit: (1n << 124n) - 1n}));
});

test('ordinary market and FT transfer methods pin external zero-output canonical selectors', () => {
  const patch = (base, name, change) => ({contract: {methods: base.contract.methods.map(m =>
    m.name === name ? {...m, ...change} : m)}});
  const sharedId = base => ({contract: {methods: base.contract.methods.map((m, i) =>
    i === 1 ? {...m, method_id: base.contract.methods[0].method_id} : m)}});
  const marketHelpers = [curveLimitOrderCalls, curveCancelCall, curveRecoveryEnrollmentCall];
  const tokenHelpers = [curveLimitOrderCalls, curveActivationFundingCalls, curveInventoryFundingCalls];
  for (const change of [{output_felt_count: 1}, {output_felt_count: undefined},
    {state_mutability: 'view'}, {state_mutability: undefined},
    {method_id: 0}, {method_id: -1}, {method_id: 2 ** 32}, {method_id: 100.5},
    {method_id: '100'}, {method_id: undefined}]) {
    for (const name of ['open_limit_buy', 'open_limit_sell', 'request_cancel', 'request_recovery'])
      for (const helper of marketHelpers)
        assert.throws(() => helper(policy, {...args, buy: true, marketAbi: patch(marketAbi, name, change)}));
    for (const helper of tokenHelpers)
      assert.throws(() => helper(policy, {...args, buy: true, tokenAbi: patch(tokenAbi, 'transfer', change)}));
  }
  // Unique names are not enough: two names may not resolve to one circuit id.
  for (const helper of marketHelpers)
    assert.throws(() => helper(policy, {...args, buy: true, marketAbi: sharedId(marketAbi)}));
  const tokenSharedId = {contract: {methods: [{...tokenAbi.contract.methods[0]},
    {...tokenAbi.contract.methods[0], name: 'claim', input_felt_count: 1}]}};
  for (const helper of tokenHelpers)
    assert.throws(() => helper(policy, {...args, buy: true, tokenAbi: tokenSharedId}));
  for (const helper of marketHelpers) assert.doesNotThrow(() => helper(policy, {...args, buy: true}));
});

test('the returned limit stack is pinned against call, parameter, recipient and amount substitution', () => {
  const at = (inputs, index, value) => inputs.map((v, i) => i === index ? value : v);
  const substitutions = [
    calls => [...calls, calls[1]],
    calls => calls.slice(0, 2),
    calls => [calls[1], calls[0], calls[2]],
    calls => [{...calls[0], contract_id: 1001n}, calls[1], calls[2]],
    calls => [{...calls[0], method_id: 999n}, calls[1], calls[2]],
    calls => [{...calls[0], inputs: at(calls[0].inputs, 0, BigInt(config.issuer))}, calls[1], calls[2]],
    calls => [{...calls[0], inputs: at(calls[0].inputs, 1, calls[0].inputs[1] + 1n)}, calls[1], calls[2]],
    calls => [{...calls[0], inputs: at(calls[0].inputs, 2, 1n)}, calls[1], calls[2]],
    calls => [{...calls[0], inputs: at(calls[0].inputs, 3, calls[0].inputs[3] + 1n)}, calls[1], calls[2]],
    calls => [{...calls[0], inputs: at(calls[0].inputs, 5, calls[0].inputs[5] + 1n)}, calls[1], calls[2]],
    calls => [{...calls[0], inputs: at(calls[0].inputs, 6, calls[0].inputs[6] + 1n)}, calls[1], calls[2]],
    calls => [{...calls[0], inputs: calls[0].inputs.slice(0, 6)}, calls[1], calls[2]],
    calls => [calls[0], {...calls[1], contract_id: BigInt(config.assetA)}, calls[2]],
    calls => [calls[0], {...calls[1], inputs: [BigInt(config.issuer), FEE_ESCROW]}, calls[2]],
    calls => [calls[0], {...calls[1], inputs: [args.vaultId, FEE_ESCROW + 1n]}, calls[2]],
    calls => [calls[0], calls[1], {...calls[2], contract_id: BigInt(config.issuer)}],
    calls => [calls[0], calls[1], {...calls[2], contract_id: BigInt(config.target)}],
    calls => [calls[0], calls[1], {...calls[2], method_id: 999n}],
    calls => [calls[0], calls[1], {...calls[2], method_name: 'claim'}],
    calls => [calls[0], calls[1], {...calls[2], inputs: at(calls[2].inputs, 0, BigInt(config.target))}],
    calls => [calls[0], calls[1], {...calls[2], inputs: at(calls[2].inputs, 1, calls[2].inputs[1] + 1n)}],
    calls => [calls[0], calls[1], {...calls[2], inputs: at(calls[2].inputs, 2, 0n)}],
    calls => [calls[0], calls[1], {...calls[2], inputs: calls[2].inputs.slice(0, 2)}],
  ];
  for (const buy of [true, false]) {
    const approved = {...args, buy};
    const calls = curveLimitOrderCalls(policy, approved);
    assert.deepEqual(assertCurveLimitOrderStack(calls, approved), calls);
    // The opposite side's method or reserve asset must not pass for this side.
    assert.throws(() => assertCurveLimitOrderStack(
      [{...calls[0], method_name: buy ? 'open_limit_sell' : 'open_limit_buy'}, calls[1], calls[2]], approved));
    assert.throws(() => assertCurveLimitOrderStack(
      [calls[0], calls[1], {...calls[2], contract_id: BigInt(buy ? config.assetA : config.assetB)}], approved));
    for (const substitute of substitutions)
      assert.throws(() => assertCurveLimitOrderStack(substitute(calls), approved));
    // The same stack must not satisfy substituted approval parameters.
    for (const change of [{lots: 3n}, {quoteLimit: args.quoteLimit + 1n}, {vaultId: 101n},
      {deadline: 201n}, {nonce: 2n}])
      assert.throws(() => assertCurveLimitOrderStack(calls, {...approved, ...change}));
  }
});

test('the public stack validator re-checks approval bounds for direct callers', () => {
  for (const buy of [true, false]) {
    const approved = {...args, buy};
    const calls = curveLimitOrderCalls(policy, approved);
    assert.deepEqual(assertCurveLimitOrderStack(calls, approved), calls);
    for (const change of [
      {buy: 1}, {buy: 'buy'}, {buy: undefined},
      {lots: 0n}, {lots: 11n}, {lots: -1n}, {lots: 2},
      {quoteLimit: 0n}, {quoteLimit: 1n << 124n}, {quoteLimit: 17},
      {deadline: 0n}, {deadline: -1n}, {deadline: 1n << 32n}, {deadline: 200},
      {nonce: 0n}, {nonce: 1n << 62n}, {nonce: 1},
    ]) assert.throws(() => assertCurveLimitOrderStack(calls, {...approved, ...change}));
    // Valid parameters authorize nothing: the exact three-call stack is still required.
    assert.throws(() => assertCurveLimitOrderStack([], approved));
    assert.throws(() => assertCurveLimitOrderStack(calls.slice(0, 2), approved));
  }
  // Account and contract numbers stay independent namespaces for direct callers too.
  for (const vaultId of [args.marketId, BigInt(config.assetA), BigInt(config.assetB)]) {
    const shared = {...args, buy: true, vaultId};
    const stack = curveLimitOrderCalls(policy, shared);
    assert.deepEqual(assertCurveLimitOrderStack(stack, shared), stack);
  }
});

test('the public stack validator refuses an overflowing sell contribution', () => {
  const wide = {...config, unit: String(1n << 120n)};
  const approved = {...args, buy: false, lots: 10n, config: wide};
  const calls = curveLimitOrderCalls({...policy, config: wide}, approved);
  assert.deepEqual(assertCurveLimitOrderStack(calls, approved), calls);
  const over = {...config, unit: String(1n << 121n)};
  assert.throws(() => assertCurveLimitOrderStack(calls, {...approved, config: over}));
  assert.throws(() => assertCurveLimitOrderStack(calls, {...approved, lots: 11n}));
});
