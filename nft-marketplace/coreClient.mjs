// Unsigned selected-order NFT plans. Observations are caller supplied; only
// the actual ordinary proof, registered key and formal Executor establish them.
import assert from 'node:assert/strict';
import {call, integer, user, encodeAmount, FEE_ESCROW} from '../amm/u124/client.mjs';
import {nftListingCalls, nftBuyCalls} from '../batching/v2/client.mjs';
import {NFT_INITIALIZATION} from '../batching/checkpoint-stream/nft-bootstrap-policy.mjs';
import {PROFILE} from '../batching/mainnet-beta/native.mjs';
import {sdkRelease} from '../executor/sdkProfiles.mjs';
import {assertDeterministicOrdering} from '../batching/random-order/sourceGate.mjs';

const LIMB = (1n << 62n) - 1n, CHECKPOINT = (1n << 32n) - 1n;
const FELT = 18446744069414584320n, release = sdkRelease('sdk-audit-20261102-v1');
function positive(n, max) { integer(n, max); assert.ok(n > 0n, 'positive bounded BigInt required'); }
function words(value, token = false) {
  assert.ok(Array.isArray(value) && value.length === 4, 'four canonical NFT words required');
  value.forEach(n => integer(n, FELT));
  if (token) assert.ok(value.some(n => n > 0n), 'nonzero NFT identifier required');
}
function checked(c) {
  const p = c.policy;
  assert.equal(BigInt(p.version), 2n); assert.equal(p.market, 'nftmarket');
  assert.equal(p.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(p.whole_market_completeness, false); assert.equal(p.qualified_randomness, false);
  assert.equal(p.native_protocol, PROFILE); assert.equal(p.sdk_commit, release.sdkCommit);
  assert.equal(p.client_commit, release.clientCommit);
  assert.equal(p.collection_initialization, NFT_INITIALIZATION, 'explicit new collection required');
  assert.match(p.chain_root_at1 ?? '', /^[a-f0-9]{64}$/); assert.notEqual(p.chain_root_at1, '0'.repeat(64));
  for (const n of [c.marketId, c.vaultId, c.actorId]) user(n);
  assert.ok(c.marketId >= 5n); assert.notEqual(c.actorId, c.vaultId);
  assert.equal(c.marketId, BigInt(p.market_id));
  for (const config of [c.config, p.config]) {
    assertDeterministicOrdering(config);
    for (const name of Object.keys(config)) assert.ok(['nftId', 'tokenId', 'networkMagic', 'ordering'].includes(name), 'unsupported selected NFT configuration ' + name);
    assert.equal(config.networkMagic, '1384803358401154921', 'fixed selected network domain');
  }
  assert.deepEqual(Object.keys(c.config).sort(), Object.keys(p.config).sort(), 'exact selected NFT config fields');
  assert.equal(c.config.ordering, p.config.ordering, 'exact deterministic ordering configuration');
  for (const name of ['nftId', 'tokenId']) {
    const id = BigInt(c.config[name]); user(id); assert.ok(id >= 5n);
    assert.notEqual(id, c.marketId); assert.equal(id, BigInt(p.config[name]));
  }
  assert.notEqual(BigInt(c.config.nftId), BigInt(c.config.tokenId));
  const prepare = c.nftAbi.contract.methods.find(m => m.name === 'prepare_account');
  assert.equal(prepare?.method_id, 1475740684); assert.equal(prepare.input_felt_count, 0);
  assert.equal(prepare.output_felt_count, 0); assert.equal(prepare.state_mutability, 'external');
  return c;
}
function observation(c, o, owner) {
  positive(o.checkpoint, CHECKPOINT); assert.equal(o.collectionId, BigInt(c.config.nftId));
  assert.equal(o.ownerId, owner);
}
function identity(c, actual, expected) {
  assert.equal(expected.collectionId, BigInt(c.config.nftId));
  words(actual.tokenId, true); words(actual.metadataHash);
  words(expected.tokenId, true); words(expected.metadataHash);
  assert.deepEqual(actual.tokenId, expected.tokenId, 'NFT identifier changed');
  assert.deepEqual(actual.metadataHash, expected.metadataHash, 'NFT metadata changed');
  return {collectionId: expected.collectionId, tokenId: [...expected.tokenId], metadataHash: [...expected.metadataHash]};
}
function terms(end, nonce, checkpoint) {
  positive(end, CHECKPOINT); positive(nonce, LIMB);
  assert.ok(end >= checkpoint, 'order already expired at observation');
}
function plan(kind, c, checkpoint, contract_calls, extra = {}) {
  return {kind, actorId: c.actorId, observedCheckpoint: checkpoint, contract_calls,
    unsigned: true, fullUpsVerified: false, liveAccepted: false,
    scope: 'explicit-selected-orders-v1', globalOrderCompleteness: false, ...extra};
}
const args = c => ({marketId: c.marketId, marketAbi: c.marketAbi, config: c.config,
  nftAbi: c.nftAbi, tokenAbi: c.tokenAbi, vaultId: c.vaultId, nativeProtocol: PROFILE});

export function nftCoreListingPlan(context, {owned, expectedNft, price, deadline, nonce}) {
  const c = checked(context); observation(c, owned, c.actorId); terms(deadline, nonce, owned.checkpoint);
  integer(owned.slot, 127n); assert.equal(owned.active, 1n);
  integer(owned.sentToVault, LIMB); integer(owned.claimedByVault, LIMB);
  assert.equal(owned.sentToVault, owned.claimedByVault, 'previous NFT deposit pending');
  assert.ok(owned.sentToVault < LIMB, 'NFT deposit nonce exhausted');
  const expected = identity(c, owned, expectedNft); positive(price, (1n << 124n) - 1n);
  return plan('nft-list', c, owned.checkpoint,
    nftListingCalls({...args(c), slot: owned.slot, price, deadline, nonce}),
    {expectedNft: expected, sourceIdentityCheckRequired: true});
}

export function nftCoreBuyPlan(context, {sellerId, listing, delivery, expectedNft, price, listingNonce, deadline, nonce}) {
  const c = checked(context); user(sellerId); assert.notEqual(sellerId, c.actorId); assert.notEqual(sellerId, c.vaultId);
  observation(c, listing, sellerId); observation(c, delivery, c.actorId);
  assert.equal(listing.checkpoint, delivery.checkpoint, 'mixed observation checkpoints');
  terms(deadline, nonce, listing.checkpoint); positive(listingNonce, LIMB);
  positive(price, (1n << 124n) - 1n); assert.equal(listing.price, price);
  assert.equal(listing.marketId, c.marketId); assert.equal(listing.vaultId, c.vaultId);
  assert.equal(listing.paymentTokenId, BigInt(c.config.tokenId));
  assert.equal(listing.nonce, listingNonce); assert.equal(listing.kind, 1n); assert.equal(listing.cancelled, 0n);
  integer(listing.consumed, LIMB); assert.ok(listing.consumed < listingNonce, 'listing already consumed');
  positive(listing.deadline, CHECKPOINT); assert.ok(listing.deadline >= listing.checkpoint, 'listing expired');
  for (const n of [listing.nftSequence, listing.nftSent, listing.nftClaimed]) integer(n, LIMB);
  assert.equal(listing.nftSent, listing.nftSequence + 1n); assert.equal(listing.nftClaimed, listing.nftSequence);
  assert.equal(listing.feeDelta, FEE_ESCROW, 'listing fee escrow not exact');
  const expected = identity(c, listing, expectedNft);
  for (const n of [delivery.sent, delivery.claimed, delivery.sentToVault, delivery.claimedByVault]) integer(n, LIMB);
  assert.equal(delivery.sentToVault, delivery.claimedByVault, 'buyer has previous NFT deposit pending');
  assert.ok(delivery.claimed <= delivery.sent && delivery.sent - delivery.claimed < 4n, 'NFT delivery backlog full');
  integer(delivery.ownedCount, 127n);
  return plan('nft-buy', c, listing.checkpoint,
    nftBuyCalls({...args(c), seller: sellerId, listingNonce, price, deadline, nonce, collectionInitialization: NFT_INITIALIZATION}),
    {expectedNft: expected, listingNonce, price, sourceIdentityCheckRequired: true});
}

// This changes the owner's cancellation flag. It does not choose a winner,
// execute a refund or reverse an already confirmed vault outcome.
export function nftCoreCancelPlan(context) {
  const c = checked(context);
  return plan('nft-cancel-request', c, null, [call(c.marketId, c.marketAbi, 'request_cancel')]);
}

export function nftCoreClaimPlan(context, {pending, destination, expectedNft}) {
  const c = checked(context); observation(c, pending, c.actorId); observation(c, destination, c.actorId);
  assert.equal(pending.checkpoint, destination.checkpoint, 'mixed observation checkpoints');
  assert.equal(pending.senderId, c.vaultId); integer(destination.slot, 127n); assert.equal(destination.active, 0n);
  integer(pending.sent, LIMB); integer(pending.claimed, LIMB);
  assert.ok(pending.sent > pending.claimed && pending.sent - pending.claimed <= 4n);
  assert.equal(pending.sequence, pending.claimed + 1n, 'claim must be the next FIFO delivery');
  const expected = identity(c, pending, expectedNft);
  return plan('nft-claim', c, pending.checkpoint,
    [call(BigInt(c.config.nftId), c.nftAbi, 'claim', [destination.slot, c.vaultId])],
    {expectedNft: expected, sequence: pending.sequence, sourceIdentityCheckRequired: true});
}

export function nftCorePayoutPlan(context, {checkpoint, paymentClaimable = 0n, nativeClaimable = 0n}) {
  const c = checked(context); positive(checkpoint, CHECKPOINT);
  encodeAmount(paymentClaimable); integer(nativeClaimable, LIMB);
  assert.ok(paymentClaimable > 0n || nativeClaimable > 0n, 'no observed payout');
  const calls = [];
  if (paymentClaimable > 0n) calls.push(call(BigInt(c.config.tokenId), c.tokenAbi, 'claim', [c.vaultId]));
  if (nativeClaimable > 0n) calls.push({contract_id: 0n, method_name: 'claim', inputs: [c.vaultId]});
  return plan('nft-payout-claim', c, checkpoint, calls, {observedPaymentDelta: paymentClaimable,
    observedNativeDelta: nativeClaimable, sourceClaimDeltaCheckRequired: true});
}
