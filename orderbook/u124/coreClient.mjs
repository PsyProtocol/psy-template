// Ordinary wallet calls for a fresh selected-order Book candidate. These checks
// bind call construction; actual code/layout, state and wallet approval remain
// the responsibility of the formal driver and ordinary wallet.
import assert from 'node:assert/strict';
import {call, decodeAmount, encodeAmount, integer, user, FEE_ESCROW} from '../../amm/u124/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';
import {assertDeterministicOrdering} from '../../batching/random-order/sourceGate.mjs';

const release = sdkRelease('sdk-audit-20261102-v1');
const MAX_U124 = (1n << 124n) - 1n;
const BOOK_ORDINARY_METHODS = [['open_sell', 8], ['close_0', 0], ['close_1', 0], ['request_cancel', 0]];

// `call` resolves methods by name. Unique canonical nonzero uint32 selectors
// prevent two names from silently sharing one circuit identity.
function reviewedMethodSelectors(methods, label) {
  assert.ok(Array.isArray(methods) && methods.length > 0, label + ' ABI methods required');
  assert.equal(new Set(methods.map(m => m.name)).size, methods.length, 'unique ' + label + ' methods');
  const ids = methods.map(m => m.method_id);
  for (const id of ids)
    assert.ok(Number.isSafeInteger(id) && id > 0 && id <= 0xffffffff,
      'canonical nonzero uint32 method id required: ' + label);
  assert.equal(new Set(ids).size, ids.length, 'unique ' + label + ' method ids');
}

function reviewedExternalMethod(methods, name, arity) {
  const method = methods.find(m => m.name === name);
  assert.equal(method?.input_felt_count, arity, 'method input limbs ' + name);
  assert.equal(method?.output_felt_count, 0, 'method output limbs ' + name);
  assert.equal(method?.state_mutability, 'external', 'method mutability ' + name);
}

function reviewedMarketAbi(abi) {
  const methods = abi?.contract?.methods;
  reviewedMethodSelectors(methods, 'Book market');
  assert.ok(!methods.some(m => /stream|admission|source|scan/.test(m.name)), 'selected-order Book ABI only');
  for (const [name, arity] of BOOK_ORDINARY_METHODS) reviewedExternalMethod(methods, name, arity);
}

function reviewedTokenAbi(abi) {
  const methods = abi?.contract?.methods;
  reviewedMethodSelectors(methods, 'U124 token');
  reviewedExternalMethod(methods, 'transfer', 3);
}

function reviewedBook(policy, {marketId, vaultId, config}) {
  assert.equal(BigInt(policy.version), 2n, 'selected-order batch policy required');
  assert.equal(policy.market, 'orderbook');
  assert.equal(policy.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(policy.whole_market_completeness, false);
  assert.equal(policy.qualified_randomness, false);
  assert.equal(policy.native_protocol, PROFILE, 'current Native ABI required');
  assert.equal(policy.sdk_commit, release.sdkCommit);
  assert.equal(policy.client_commit, release.clientCommit);
  for (const c of [config, policy.config]) {
    assertDeterministicOrdering(c);
    for (const name of Object.keys(c)) assert.ok(['assetA', 'assetB', 'networkMagic', 'ordering'].includes(name), 'unsupported Book configuration ' + name);
    assert.equal(c.networkMagic, '1384803358401154921', 'fixed selected network domain');
  }
  assert.deepEqual(Object.keys(config).sort(), Object.keys(policy.config).sort(), 'exact Book config fields');
  assert.equal(config.ordering, policy.config.ordering, 'exact deterministic ordering configuration');
  assert.match(policy.chain_root_at1 ?? '', /^[a-f0-9]{64}$/);
  assert.notEqual(policy.chain_root_at1, '0'.repeat(64));
  user(marketId); user(vaultId);
  assert.ok(marketId >= 5n, 'market contract identity');
  assert.equal(marketId, BigInt(policy.market_id));
  for (const name of ['assetA', 'assetB']) {
    const asset = BigInt(config[name]);
    assert.ok(asset >= 5n && asset < (1n << 24n), 'U124 asset identity');
    assert.notEqual(asset, marketId, 'market and asset must differ');
    assert.equal(asset, BigInt(policy.config[name]), 'policy asset binding');
  }
  assert.notEqual(BigInt(config.assetA), BigInt(config.assetB));
}

function boundedAmount(limbs) {
  assert.equal(limbs.length, 2, 'complete U124 amount limbs');
  for (const limb of limbs) integer(limb, (1n << 62n) - 1n);
  return integer(decodeAmount(limbs), MAX_U124);
}

function reviewedOrderParameters({side, amount, minimum, deadline, nonce}) {
  integer(side, 1n);
  integer(amount, MAX_U124); integer(minimum, MAX_U124);
  integer(deadline, (1n << 32n) - 1n); integer(nonce, (1n << 62n) - 1n);
  assert.ok(deadline > 0n, 'positive deadline required');
  assert.ok(nonce > 0n && amount > 0n && minimum > 0n, 'positive whole order required');
}

// Validate the actual returned stack, not just the builder's intended inputs.
// This pure validator checks equality/bounds only and DOES NOT authenticate
// policy, code/layout or funds. The ordinary wrapper still performs full
// reviewedBook/ABI gates before calling it.
// Native fee funding intentionally carries method_name without method_id, exactly
// as the shared batching client emits it; the wallet resolves Native before proving.
export function assertBookSellStack(calls, args) {
  const {marketId, marketAbi, tokenAbi, vaultId, config, side, amount, minimum, deadline, nonce} = args;
  reviewedOrderParameters(args);
  assert.ok(Array.isArray(calls) && calls.length === 3, 'exact three-call Book order stack required');
  const [order, fee, payment] = calls;
  assert.equal(order.contract_id, marketId, 'Book order targets the reviewed market only');
  assert.equal(order.method_name, 'open_sell', 'reviewed Book order method');
  assert.equal(order.method_id, BigInt(marketAbi.contract.methods.find(m => m.name === 'open_sell').method_id),
    'reviewed Book order method id');
  assert.equal(order.inputs.length, 8, 'complete Book order inputs');
  assert.deepEqual(order.inputs.slice(0, 2), [vaultId, side], 'approved vault and side');
  assert.equal(boundedAmount(order.inputs.slice(2, 4)), amount, 'approved whole amount');
  assert.equal(boundedAmount(order.inputs.slice(4, 6)), minimum, 'approved whole minimum');
  assert.deepEqual(order.inputs.slice(6), [deadline, nonce], 'approved deadline and nonce');
  assert.deepEqual(fee, {contract_id: 0n, method_name: 'transfer', inputs: [vaultId, FEE_ESCROW]},
    'fixed Native fee funding second');
  assert.equal(payment.contract_id, BigInt(side === 0n ? config.assetA : config.assetB),
    'side-dependent reserve asset');
  assert.equal(payment.method_name, 'transfer');
  assert.equal(payment.method_id, BigInt(tokenAbi.contract.methods.find(m => m.name === 'transfer').method_id),
    'reviewed U124 transfer method id');
  assert.equal(payment.inputs.length, 3, 'complete U124 transfer limbs');
  assert.equal(payment.inputs[0], vaultId, 'order funding spends only the caller vault');
  assert.equal(boundedAmount(payment.inputs.slice(1)), amount, 'exact approved U124 contribution');
  return calls;
}

// Whole amount and whole minimum are U124 values; no quote or partial fill is
// inferred here. Both receiving FT accounts must be prepared before proving.
export function orderbookSellCalls(policy, args) {
  reviewedBook(policy, args);
  reviewedMarketAbi(args.marketAbi);
  reviewedTokenAbi(args.tokenAbi);
  reviewedOrderParameters(args);
  const {marketId, marketAbi, tokenAbi, vaultId, config, side, amount, minimum, deadline, nonce} = args;
  const encodedAmount = encodeAmount(amount), encodedMinimum = encodeAmount(minimum);
  return assertBookSellStack([
    call(marketId, marketAbi, 'open_sell', [vaultId, side, encodedAmount, encodedMinimum, deadline, nonce]),
    {contract_id: 0n, method_name: 'transfer', inputs: [vaultId, FEE_ESCROW]},
    call(BigInt(side === 0n ? config.assetA : config.assetB), tokenAbi, 'transfer', [vaultId, encodedAmount]),
  ], args);
}

// A cancellation request changes the ordinary owner's order flag. Settlement
// refunds the authenticated frozen funding; this call does not pay a refund.
export function orderbookCancelCall(policy, args) {
  reviewedBook(policy, args);
  reviewedMarketAbi(args.marketAbi);
  const built = call(args.marketId, args.marketAbi, 'request_cancel');
  assert.ok(built && typeof built === 'object' && !Array.isArray(built), 'single market request required');
  assert.equal(built.contract_id, args.marketId);
  assert.equal(built.method_name, 'request_cancel');
  assert.equal(built.method_id, BigInt(args.marketAbi.contract.methods.find(m => m.name === 'request_cancel').method_id));
  assert.deepEqual(built.inputs, []);
  return built;
}
