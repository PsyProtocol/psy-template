// Ordinary wallet calls for a fresh selected-order Curve candidate. This is a
// host-side call builder, not deployment, key, receipt or live authorization.
import assert from 'node:assert/strict';
import {call, decodeAmount, encodeAmount, integer, user, FEE_ESCROW} from '../../amm/u124/client.mjs';
import {validateConfig} from '../../amm/u124/build.mjs';
import {activationFunding, curveLimitCalls, recoveryEnrollment} from '../../batching/v2/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';
import {requireCoreDependencyPolicy} from '../../executor/coreDependencyPolicy.mjs';

const release = sdkRelease('sdk-audit-20261102-v1');
export const CURVE_CORE_CLIENT_STATUS = Object.freeze({
  executionScope: 'explicit-selected-orders-v1',
  formalExecutorIntegrated: false,
  currentChainAccepted: false,
});

const MAX_U124 = (1n << 124n) - 1n;
// The ordinary client only ever uses these selected-order Curve methods.
const CURVE_ORDINARY_METHODS = [['open_limit_buy', 7], ['open_limit_sell', 7],
  ['request_cancel', 0], ['request_recovery', 1]];

// `call` resolves a method by name, so a duplicated or traversal-shaped ABI
// could silently select a different circuit. Pin the ordinary ABI shape here:
// unique names AND unique canonical nonzero uint32 selectors, so two names can
// never share one circuit identity.
function reviewedMethodSelectors(methods, label) {
  assert.equal(new Set(methods.map(m => m.name)).size, methods.length, 'unique ' + label + ' methods');
  const ids = methods.map(m => m.method_id);
  for (const id of ids)
    assert.ok(Number.isSafeInteger(id) && id > 0 && id <= 0xffffffff,
      'canonical nonzero uint32 method id required: ' + label);
  assert.equal(new Set(ids).size, ids.length, 'unique ' + label + ' method ids');
}

// Only external, zero-output circuits are ordinary wallet operations. These are
// the same pins the build side applies; a view or returning variant is refused.
function reviewedExternalMethod(methods, name, arity) {
  const method = methods.find(m => m.name === name);
  assert.equal(method?.input_felt_count, arity, 'method input limbs ' + name);
  assert.equal(method?.output_felt_count, 0, 'method output limbs ' + name);
  assert.equal(method?.state_mutability, 'external', 'method mutability ' + name);
}

function reviewedMarketAbi(abi) {
  const methods = abi?.contract?.methods;
  assert.ok(Array.isArray(methods) && methods.length > 0, 'Curve market ABI required');
  reviewedMethodSelectors(methods, 'Curve market');
  assert.ok(!methods.some(m => /stream|admission|source|scan/.test(m.name)), 'selected-order Curve ABI only');
  for (const [name, arity] of CURVE_ORDINARY_METHODS) reviewedExternalMethod(methods, name, arity);
}

function reviewedTokenAbi(abi) {
  const methods = abi?.contract?.methods;
  assert.ok(Array.isArray(methods) && methods.length > 0, 'U124 token ABI required');
  reviewedMethodSelectors(methods, 'U124 token');
  reviewedExternalMethod(methods, 'transfer', 3);
}

function reviewedCurve(policy, {marketId, vaultId, config}) {
  assert.equal(policy.version, 2, 'selected-order batch policy required');
  assert.equal(policy.market, 'bondingcurve');
  assert.equal(policy.execution_scope, CURVE_CORE_CLIENT_STATUS.executionScope);
  assert.equal(policy.whole_market_completeness, false);
  assert.equal(policy.qualified_randomness, false);
  assert.equal(policy.native_protocol, PROFILE, 'current Native ABI required');
  assert.equal(policy.sdk_commit, release.sdkCommit);
  assert.equal(policy.client_commit, release.clientCommit);
  assert.match(policy.chain_root_at1 ?? '', /^[a-f0-9]{64}$/);
  assert.notEqual(policy.chain_root_at1, '0'.repeat(64));
  validateConfig(config);
  assert.equal(config.networkMagic, '1384803358401154921', 'selected network domain');
  assert.ok(!config.bootstrap, 'AMM bootstrap requires separate acceptance');
  assert.deepEqual(config, policy.config, 'exact compiled Curve configuration required');
  user(marketId); user(vaultId);
  assert.ok(marketId >= 5n, 'market contract identity');
  assert.equal(marketId, BigInt(policy.market_id));
  assert.ok(![config.assetA, config.assetB].some(id => BigInt(id) === marketId), 'market and asset must differ');
  assert.ok(![config.issuer, config.target].some(id => BigInt(id) === vaultId), 'distinct Curve vault, issuer and graduation target');
  // Issuer, target and vault are ACCOUNT identities; the market and the two
  // reserve assets are CONTRACT identities. The namespaces are independent, so
  // a graduation target account may share a number with a contract without
  // routing reserves into it. Only same-namespace identities must differ.
  assert.notEqual(BigInt(config.issuer), BigInt(config.target), 'distinct issuer and graduation target accounts');
  assert.notEqual(config.assetA, config.assetB, 'distinct reserve asset contracts');
  // A dependency-bound policy stays bound to this exact market and asset set.
  // Unbound review policies are still accepted; no binding is fabricated here.
  if (policy.key_profile !== undefined || policy.dependency_bindings !== undefined)
    requireCoreDependencyPolicy(policy);
}

const nativeFunding = vaultId => ({contract_id: 0n, method_name: 'transfer', inputs: [vaultId, FEE_ESCROW]});

// Funding helpers may only spend the caller vault into the fixed Native fee
// escrow or the two compiled reserve assets. They never authorize a refund, a
// market payout or a transfer to the issuer or graduation target.
function assertFundingScope(calls, {vaultId, config}) {
  assert.ok(Array.isArray(calls) && calls.length > 0, 'funding calls required');
  assert.deepEqual(calls[0], nativeFunding(vaultId), 'fixed Native fee funding first');
  const assets = [BigInt(config.assetA), BigInt(config.assetB)];
  for (const c of calls.slice(1)) {
    assert.ok(assets.includes(c.contract_id), 'funding reaches only compiled reserve assets');
    assert.equal(c.method_name, 'transfer');
    assert.equal(c.inputs.length, 3, 'complete U124 transfer limbs');
    assert.equal(c.inputs[0], vaultId, 'funding spends only the caller vault');
    integer(decodeAmount(c.inputs.slice(1)), MAX_U124);
  }
}

// Cancellation and recovery enrollment are single market requests. Pin the
// exact method and arguments so no fee or token payment can ride along.
function assertMarketRequest(built, {marketId, marketAbi}, name, inputs) {
  assert.ok(built && typeof built === 'object' && !Array.isArray(built), 'single market request required');
  assert.equal(built.contract_id, marketId);
  assert.equal(built.method_name, name);
  assert.equal(built.method_id, BigInt(marketAbi.contract.methods.find(m => m.name === name).method_id));
  assert.deepEqual(built.inputs, inputs);
  return built;
}

// Both amount limbs must be present, scalar-bounded and decode to the exact
// approved U124 value; a truncated or padded pair is never accepted.
function boundedAmount(limbs) {
  assert.equal(limbs.length, 2, 'complete U124 amount limbs');
  for (const limb of limbs) integer(limb, (1n << 62n) - 1n);
  return integer(decodeAmount(limbs), MAX_U124);
}

// Shared semantic bounds for the approved limit parameters. The policy entry
// point and the public stack validator both apply them, so a direct caller
// cannot smuggle in a non-boolean side, an out-of-range lot count, deadline or
// nonce, or an amount that would overflow the complete U124 encoding.
function reviewedLimitParameters({config, buy, lots, quoteLimit, deadline, nonce}) {
  assert.equal(typeof buy, 'boolean', 'explicit buy/sell side required');
  integer(lots, BigInt(config.cap));
  integer(quoteLimit, MAX_U124);
  assert.ok(lots > 0n && quoteLimit > 0n, 'positive lots and quote limit required');
  // A sell delivers lots * unit of assetA; keep that a complete bounded U124.
  if (!buy) integer(lots * BigInt(config.unit), MAX_U124);
  integer(deadline, (1n << 32n) - 1n);
  integer(nonce, (1n << 62n) - 1n);
  assert.ok(deadline > 0n && nonce > 0n, 'positive deadline and nonce required');
}

// The limit path is the only helper returning another module's call stack, so
// validate the ACTUAL stack: exactly three calls in the reviewed order, with
// the approved side, recipient and complete U124 amount, and nothing appended.
// Policy authentication stays with reviewedCurve/reviewedMarketAbi/reviewedTokenAbi
// in curveLimitOrderCalls. This predicate re-checks the approved parameter bounds
// for direct callers; matching a stack authorizes no funds by itself.
// Boundary: Native fee funding intentionally carries method_name 'transfer'
// without method_id, exactly as batching/v2/client.mjs emits it; the ordinary
// wallet resolves the real Native method before proving. No Native ABI argument
// is required or invented here, and this is not a Native selector proof.
export function assertCurveLimitOrderStack(calls, args) {
  const {marketId, vaultId, config, marketAbi, tokenAbi, buy, lots, quoteLimit, deadline, nonce} = args;
  reviewedLimitParameters(args);
  assert.ok(Array.isArray(calls) && calls.length === 3, 'exact three-call limit order stack required');
  const [order, fee, payment] = calls;
  const name = buy ? 'open_limit_buy' : 'open_limit_sell';
  assert.equal(order.contract_id, marketId, 'limit order targets the reviewed market only');
  assert.equal(order.method_name, name, 'reviewed limit side');
  assert.equal(order.method_id, BigInt(marketAbi.contract.methods.find(m => m.name === name).method_id),
    'reviewed limit method id');
  assert.equal(order.inputs.length, 7, 'complete limit order inputs');
  assert.deepEqual(order.inputs.slice(0, 3), [vaultId, lots, 0n], 'approved vault, lots and no stale sold_lots quote');
  assert.equal(boundedAmount(order.inputs.slice(3, 5)), quoteLimit, 'approved quote limit');
  assert.deepEqual(order.inputs.slice(5), [deadline, nonce], 'approved deadline and nonce');
  assert.deepEqual(fee, nativeFunding(vaultId), 'fixed Native fee funding second');
  assert.equal(payment.contract_id, BigInt(buy ? config.assetB : config.assetA), 'side-dependent reserve asset');
  assert.equal(payment.method_name, 'transfer');
  assert.equal(payment.method_id, BigInt(tokenAbi.contract.methods.find(m => m.name === 'transfer').method_id),
    'reviewed U124 transfer method id');
  assert.equal(payment.inputs.length, 3, 'complete U124 transfer limbs');
  assert.equal(payment.inputs[0], vaultId, 'limit funding spends only the caller vault');
  assert.equal(boundedAmount(payment.inputs.slice(1)), buy ? quoteLimit : lots * BigInt(config.unit),
    'exact approved U124 contribution');
  return calls;
}

// Shared encoders already enforce BigInt U124 amounts and 62-bit scalar inputs.
// Add the narrower contract deadline and nonzero nonce checks before proving.
export function curveLimitOrderCalls(policy, args) {
  reviewedCurve(policy, args);
  reviewedMarketAbi(args.marketAbi);
  reviewedTokenAbi(args.tokenAbi);
  reviewedLimitParameters(args);
  return assertCurveLimitOrderStack(curveLimitCalls({...args, nativeProtocol: PROFILE}), args);
}

// Cancellation requests and recovery enrollment authorize no refund payment.
// The vault must still process the authenticated original funding and order.
export function curveCancelCall(policy, args) {
  reviewedCurve(policy, args);
  reviewedMarketAbi(args.marketAbi);
  return assertMarketRequest(call(args.marketId, args.marketAbi, 'request_cancel'), args, 'request_cancel', []);
}

export function curveRecoveryEnrollmentCall(policy, args) {
  reviewedCurve(policy, args);
  reviewedMarketAbi(args.marketAbi);
  const built = recoveryEnrollment({marketId: args.marketId, abi: args.marketAbi, vaultId: args.vaultId});
  return assertMarketRequest(built, args, 'request_recovery', [args.vaultId]);
}

// Bootstrap seeds are returned by activation. They are separate from the
// issuer's later fixed inventory contribution and initialization fee.
export function curveActivationFundingCalls(policy, args) {
  reviewedCurve(policy, args);
  reviewedTokenAbi(args.tokenAbi);
  const calls = activationFunding({market: 'bondingcurve', config: args.config,
    tokenAbi: args.tokenAbi, vaultId: args.vaultId, nativeProtocol: PROFILE});
  assertFundingScope(calls, args);
  return calls;
}

export function curveInventoryFundingCalls(policy, args) {
  reviewedCurve(policy, args);
  user(args.issuerId);
  assert.equal(args.issuerId, BigInt(args.config.issuer), 'exact compiled inventory issuer');
  reviewedTokenAbi(args.tokenAbi);
  // Checked BigInt arithmetic: the fixed inventory contribution must stay a
  // complete U124 amount instead of overflowing into a truncated payment.
  const amount = BigInt(args.config.unit) * (BigInt(args.config.cap) + BigInt(args.config.liquidity));
  integer(amount, MAX_U124);
  const calls = [nativeFunding(args.vaultId),
    call(BigInt(args.config.assetA), args.tokenAbi, 'transfer', [args.vaultId, encodeAmount(amount)])];
  assertFundingScope(calls, args);
  return calls;
}

// Graduation retains its compile-time recipient and original reserve/inventory
// rules. This only funds the issuer fee; it does not build a vault handoff.
export function curveGraduationFundingCalls(policy, args) {
  reviewedCurve(policy, args);
  user(args.issuerId);
  assert.equal(args.issuerId, BigInt(args.config.issuer), 'exact compiled graduation issuer');
  const calls = [nativeFunding(args.vaultId)];
  assertFundingScope(calls, args);
  return calls;
}
