// Pure, unsigned acceptance planning for a NEW selected-order Book instance.
// This module performs no I/O, registration, RPC, proving, signing or broadcast.
// Host reconstruction is not authenticated state or complete UPS verification.
import assert from 'node:assert/strict';
import {call, encodeAmount, integer, user, FEE_ESCROW} from '../../amm/u124/client.mjs';
import {orderbookSellCalls, orderbookCancelCall} from '../../orderbook/u124/coreClient.mjs';
import {makeCoreBookPolicy} from '../../orderbook/u124/core-build.mjs';
import {bindCoreDependencies, requireCoreDependencyPolicy} from '../coreDependencyPolicy.mjs';
import {activationFunding, sponsorCalls} from '../../batching/v2/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {validateU124TokenAbi} from '../u124Abi.mjs';

export const CORE_BOOK_UNIT = 10n ** 18n;
const hash = value => {assert.match(value ?? '', /^[a-f0-9]{64}$/); assert.notEqual(value, '0'.repeat(64));};
const same = (a, b) => assert.equal(BigInt(a), BigInt(b));
function checked(c) {
  requireCoreDependencyPolicy(c.policy);
  assert.equal(c.policy.market, 'orderbook');
  assert.equal(c.profile, 'book-core-dependency-bound-v1');
  assert.equal(c.policy.native_protocol, PROFILE);
  for (const value of [c.marketId, c.vault.userId, c.seller.userId, c.buyer.userId, c.sponsor.userId]) user(value);
  assert.ok(c.marketId >= 5n);
  assert.equal(new Set([c.vault.userId, c.seller.userId, c.buyer.userId, c.sponsor.userId]).size, 4,
    'vault, both trading roles and sponsor must be distinct accounts');
  for (const role of ['vault', 'seller', 'buyer', 'sponsor']) hash(c[role].publicKeyHash);
  assert.equal(new Set(['vault', 'seller', 'buyer', 'sponsor'].map(role => c[role].publicKeyHash)).size, 4,
    'distinct account IDs must not alias a signing identity');
  hash(c.vault.fingerprint);
  assert.equal(c.vault.keyProfile, c.policy.key_profile);
  same(c.marketId, c.policy.market_id);
  assert.equal(c.config.ordering ?? 'deterministic', 'deterministic');
  assert.ok(Array.isArray(c.assets) && c.assets.length === 2, 'two reviewed QA assets required');
  for (const [index, name] of ['assetA', 'assetB'].entries()) {
    const asset = c.assets[index];
    assert.equal(asset.contractId, c.config[name]);
    assert.equal(asset.decimals, 18, 'this one-unit acceptance plan requires verified 18-decimal assets');
    assert.equal(asset.kind, 'qa-ft', 'test PSY or existing pUSDT must not be relabelled QA FT');
    const pin = c.policy.dependency_bindings.find(row => row.contractId === asset.contractId);
    assert.ok(pin); same(asset.issuerId, pin.deployer);
  }
  validateU124TokenAbi(c.tokenBAbi);
  for (const name of ['claim', 'transfer']) assert.deepEqual(
    c.tokenBAbi.contract.methods.find(method => method.name === name),
    c.tokenAbi.contract.methods.find(method => method.name === name), 'same reviewed QA token call interface');
  // Reuse the EXACT canonical factory, including ABI selectors, state heights,
  // release/domain and full typed dependency pins; ABI-name similarity is insufficient.
  const base = makeCoreBookPolicy(Number(c.marketId), c.config,
    {state_tree_height: 31, abi: c.marketAbi}, {abi: c.tokenAbi}, c.policy.chain_root_at1);
  assert.deepEqual(c.policy, bindCoreDependencies(base, c.policy.dependency_bindings), 'exact canonical Book policy required');
  return c;
}
function ordinary(c, label, actor, calls, extra = {}) {
  assert.ok(calls.length > 0 && calls.length <= 8);
  assert.ok(!calls.some(row => row.contract_id === 0n && /burn/.test(row.method_name)), 'wallet adds the actual fee');
  return {label, kind: 'ordinary', actorId: actor.userId, publicKeyHash: actor.publicKeyHash,
    contract_calls: calls, ...extra};
}
const assetCall = (c, side, name, args) => call(BigInt(c.config[side ? 'assetB' : 'assetA']), c.tokenAbi, name, args);
const bookCall = (c, name) => call(c.marketId, c.marketAbi, name);
const nativeClaim = c => ({contract_id: 0n, method_name: 'claim', inputs: [c.vault.userId]});
function open(c, actor, side, minimum, nonce, deadline, label) {
  return ordinary(c, label, actor, orderbookSellCalls(c.policy, {marketId: c.marketId,
    marketAbi: c.marketAbi, tokenAbi: c.tokenAbi, vaultId: c.vault.userId, config: c.config,
    side, amount: CORE_BOOK_UNIT, minimum, deadline, nonce}), {orderNonce: nonce});
}
function sponsor(c, label, nonce) {
  return ordinary(c, label, c.sponsor, sponsorCalls({marketId: c.marketId, abi: c.marketAbi,
    vaultId: c.vault.userId, nonce, purpose: 1n, amount: 2n * FEE_ESCROW, nativeProtocol: PROFILE}),
  {sponsorshipNonce: nonce, purpose: 1n});
}
function formal(c, label, action, selectedOwners, outcome) {
  return {label, kind: 'formal-core', actorId: c.vault.userId, publicKeyHash: c.vault.publicKeyHash,
    fingerprint: c.vault.fingerprint, expectedAction: action, selectedOwners: [...selectedOwners],
    expectedOutcome: outcome, reconstructFromAuthenticatedCurrentState: true,
    // Calls/witnesses must come from the existing formal reader/driver, not this plan.
    requireFullUps: true, requireExactStackAndSession: true, requireDependencyOpening: true};
}

export function buildCoreBookAcceptancePlan(context, {deadline}) {
  const c = checked(context);
  integer(deadline, (1n << 32n) - 1n); assert.ok(deadline > 0n, 'explicit reviewed deadline required');
  const owners = [c.seller.userId, c.buyer.userId].sort((a, b) => a < b ? -1 : 1);
  const stages = [];
  const add = stage => stages.push({...stage, dependsOnConfirmed: stages.length ? stages.at(-1).label : null,
    unsigned: true, proofVerified: false, liveAccepted: false,
    requireFreshAccountNonceAndState: true, requireExactSingleSendAndRecovery: true});
  add(ordinary(c, 'book-activation-fund-v1', c.seller, activationFunding({market: 'orderbook',
    config: c.config, tokenAbi: c.tokenAbi, vaultId: c.vault.userId, nativeProtocol: PROFILE})));
  add(formal(c, 'book-activate-v1', 'batch_maintenance', [], {operation: 'activate_batch_vault', payer: c.seller.userId}));
  add(ordinary(c, 'book-activation-return-claim-v1', c.seller,
    [assetCall(c, 0, 'claim', [c.vault.userId]), assetCall(c, 1, 'claim', [c.vault.userId])],
    {expectedQaDeltas: [1n, 1n]}));
  add(open(c, c.seller, 0n, CORE_BOOK_UNIT, 1n, deadline, 'book-match-seller-open-v1'));
  add(open(c, c.buyer, 1n, CORE_BOOK_UNIT, 1n, deadline, 'book-match-buyer-open-v1'));
  add(sponsor(c, 'book-match-sponsor-v1', 1n));
  add(formal(c, 'book-match-commit-v1', 'batch_commit', owners, {orderNonces: [1n, 1n]}));
  add(formal(c, 'book-match-settle-v1', 'batch_settle', owners,
    {matches: [{seller: c.seller.userId, buyer: c.buyer.userId, a: CORE_BOOK_UNIT, b: CORE_BOOK_UNIT, sellerNonce: 1n, buyerNonce: 1n}], refunds: []}));
  add(ordinary(c, 'book-match-seller-claim-close-v1', c.seller,
    [assetCall(c, 1, 'claim', [c.vault.userId]), bookCall(c, 'close_0')], {expectedQaDeltas: [0n, CORE_BOOK_UNIT]}));
  // Existing match policy returns the second member's Native escrow. Claim it
  // explicitly; neither ACK nor FT receipt alone closes the asset audit.
  add(ordinary(c, 'book-match-buyer-claim-close-v1', c.buyer,
    [assetCall(c, 0, 'claim', [c.vault.userId]), nativeClaim(c), bookCall(c, 'close_1')],
    {expectedQaDeltas: [CORE_BOOK_UNIT, 0n], expectedNativeOutboxDelta: FEE_ESCROW}));
  add(open(c, c.seller, 0n, 2n * CORE_BOOK_UNIT, 2n, deadline, 'book-mismatch-seller-open-v1'));
  add(open(c, c.buyer, 1n, CORE_BOOK_UNIT, 2n, deadline, 'book-mismatch-buyer-open-v1'));
  add(sponsor(c, 'book-mismatch-sponsor-v1', 2n));
  add(formal(c, 'book-mismatch-commit-v1', 'batch_commit', owners, {orderNonces: [2n, 2n]}));
  add(formal(c, 'book-mismatch-carry-v1', 'batch_settle', owners, {matches: [], refunds: [], legallyRetained: [...owners]}));
  for (const [role, side] of [['seller', 0n], ['buyer', 1n]]) add(ordinary(c, `book-${role}-cancel-v1`, c[role],
    [orderbookCancelCall(c.policy, {marketId: c.marketId, marketAbi: c.marketAbi,
      vaultId: c.vault.userId, config: c.config})], {orderNonce: 2n, side}));
  add(sponsor(c, 'book-refund-sponsor-v1', 3n));
  add(formal(c, 'book-refund-commit-v1', 'batch_commit', owners, {orderNonces: [2n, 2n], cancelled: true}));
  add(formal(c, 'book-refund-settle-v1', 'batch_settle', owners,
    {matches: [], refunds: [{owner: c.seller.userId, a: CORE_BOOK_UNIT, b: 0n, native: FEE_ESCROW, nonce: 2n},
      {owner: c.buyer.userId, a: 0n, b: CORE_BOOK_UNIT, native: FEE_ESCROW, nonce: 2n}]}));
  for (const [role, side] of [['seller', 0n], ['buyer', 1n]]) add(ordinary(c, `book-${role}-refund-claim-close-v1`, c[role],
    [assetCall(c, side, 'claim', [c.vault.userId]), nativeClaim(c), bookCall(c, `close_${side}`)],
    {expectedQaDeltas: side ? [0n, CORE_BOOK_UNIT] : [CORE_BOOK_UNIT, 0n], expectedNativeOutboxDelta: FEE_ESCROW}));
  assert.equal(stages.length, 22);
  return {schema: 1, kind: 'unsigned-selected-book-acceptance-plan-v1', profile: c.profile,
    chainRootAt1: c.policy.chain_root_at1, policy: structuredClone(c.policy), marketId: c.marketId,
    vault: {...c.vault}, assets: c.assets.map(row => ({...row})), deadline,
    amount: {baseUnits: CORE_BOOK_UNIT, limbs: encodeAmount(CORE_BOOK_UNIT), decimals: 18},
    policyCapacity: {members: 4, matchedPairs: 2}, plannedCapacity: {members: 2, matchedPairs: 1},
    scope: 'Price/time priority within the frozen selected set only; no global completeness or account scan.',
    prerequisites: ['Fresh Book/key/vault registration and complete UPS gates',
      'Both trading roles have prepared QA A/B accounts, one-unit inputs and separate Native fee balances',
      'A separately registered, non-alias sponsor has Native funding and explicit fee approval',
      'Root declares instance count, fee budget, deadlines and stop rules before execution'],
    unsigned: true, fullUpsVerified: false, registeredKeyVerified: false, liveAccepted: false,
    executionAuthorized: false, requiresBudgetDeclaration: true,
    recoveryRules: {unknownBroadcast: 'reconcile original exact identity only; stop unresolved',
      staleUnsignedPlan: 'stop for explicit review; never silently renew or replace',
      claims: 'require actual cumulative Outbox deltas and zero residual before final acceptance'},
    requiredUps: {ordinary: 15, formal: 7, total: 22}, stages};
}
