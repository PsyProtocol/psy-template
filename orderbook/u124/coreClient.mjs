// Ordinary wallet calls for a fresh selected-order Book candidate. These checks
// bind call construction; actual code/layout, state and wallet approval remain
// the responsibility of the formal driver and ordinary wallet.
import assert from 'node:assert/strict';
import {call, encodeAmount, integer, user, FEE_ESCROW} from '../../amm/u124/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';
import {assertDeterministicOrdering} from '../../batching/random-order/sourceGate.mjs';

const release = sdkRelease('sdk-audit-20261102-v1');

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

// Whole amount and whole minimum are U124 values; no quote or partial fill is
// inferred here. Both receiving FT accounts must be prepared before proving.
export function orderbookSellCalls(policy, args) {
  reviewedBook(policy, args);
  const {marketId, marketAbi, tokenAbi, vaultId, config, side, amount, minimum, deadline, nonce} = args;
  integer(side, 1n); integer(deadline, (1n << 32n) - 1n); integer(nonce, (1n << 62n) - 1n);
  assert.ok(deadline > 0n, 'positive deadline required');
  assert.ok(nonce > 0n && amount > 0n && minimum > 0n, 'positive whole order required');
  const encodedAmount = encodeAmount(amount), encodedMinimum = encodeAmount(minimum);
  return [
    call(marketId, marketAbi, 'open_sell', [vaultId, side, encodedAmount, encodedMinimum, deadline, nonce]),
    {contract_id: 0n, method_name: 'transfer', inputs: [vaultId, FEE_ESCROW]},
    call(BigInt(side === 0n ? config.assetA : config.assetB), tokenAbi, 'transfer', [vaultId, encodedAmount]),
  ];
}

// A cancellation request changes the ordinary owner's order flag. Settlement
// refunds the authenticated frozen funding; this call does not pay a refund.
export function orderbookCancelCall(policy, args) {
  reviewedBook(policy, args);
  return call(args.marketId, args.marketAbi, 'request_cancel');
}
