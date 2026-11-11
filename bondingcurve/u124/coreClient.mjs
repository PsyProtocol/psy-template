// Ordinary wallet calls for a fresh selected-order Curve candidate. This is a
// host-side call builder, not deployment, key, receipt or live authorization.
import assert from 'node:assert/strict';
import {call, encodeAmount, integer, user, FEE_ESCROW} from '../../amm/u124/client.mjs';
import {validateConfig} from '../../amm/u124/build.mjs';
import {activationFunding, curveLimitCalls, recoveryEnrollment} from '../../batching/v2/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';

const release = sdkRelease('sdk-audit-20261102-v1');
export const CURVE_CORE_CLIENT_STATUS = Object.freeze({
  executionScope: 'explicit-selected-orders-v1',
  formalExecutorIntegrated: false,
  currentChainAccepted: false,
});

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
}

const nativeFunding = vaultId => ({contract_id: 0n, method_name: 'transfer', inputs: [vaultId, FEE_ESCROW]});

// Shared encoders already enforce BigInt U124 amounts and 62-bit scalar inputs.
// Add the narrower contract deadline and nonzero nonce checks before proving.
export function curveLimitOrderCalls(policy, args) {
  reviewedCurve(policy, args);
  integer(args.deadline, (1n << 32n) - 1n);
  integer(args.nonce, (1n << 62n) - 1n);
  assert.ok(args.deadline > 0n && args.nonce > 0n, 'positive deadline and nonce required');
  return curveLimitCalls({...args, nativeProtocol: PROFILE});
}

// Cancellation requests and recovery enrollment authorize no refund payment.
// The vault must still process the authenticated original funding and order.
export function curveCancelCall(policy, args) {
  reviewedCurve(policy, args);
  return call(args.marketId, args.marketAbi, 'request_cancel');
}

export function curveRecoveryEnrollmentCall(policy, args) {
  reviewedCurve(policy, args);
  return recoveryEnrollment({marketId: args.marketId, abi: args.marketAbi, vaultId: args.vaultId});
}

// Bootstrap seeds are returned by activation. They are separate from the
// issuer's later fixed inventory contribution and initialization fee.
export function curveActivationFundingCalls(policy, args) {
  reviewedCurve(policy, args);
  return activationFunding({market: 'bondingcurve', config: args.config,
    tokenAbi: args.tokenAbi, vaultId: args.vaultId, nativeProtocol: PROFILE});
}

export function curveInventoryFundingCalls(policy, args) {
  reviewedCurve(policy, args);
  user(args.issuerId);
  assert.equal(args.issuerId, BigInt(args.config.issuer), 'exact compiled inventory issuer');
  const amount = BigInt(args.config.unit) * BigInt(args.config.cap + args.config.liquidity);
  return [nativeFunding(args.vaultId),
    call(BigInt(args.config.assetA), args.tokenAbi, 'transfer', [args.vaultId, encodeAmount(amount)])];
}

// Graduation retains its compile-time recipient and original reserve/inventory
// rules. This only funds the issuer fee; it does not build a vault handoff.
export function curveGraduationFundingCalls(policy, args) {
  reviewedCurve(policy, args);
  user(args.issuerId);
  assert.equal(args.issuerId, BigInt(args.config.issuer), 'exact compiled graduation issuer');
  return [nativeFunding(args.vaultId)];
}
