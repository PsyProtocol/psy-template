// Explicit ABI/observation doubles: these tests do not prove state or accept a
// selected NFT key, actual wallet approval, complete UPS or network operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nftCoreListingPlan, nftCoreBuyPlan, nftCoreCancelPlan, nftCoreClaimPlan, nftCorePayoutPlan} from './coreClient.mjs';
import {FEE_ESCROW, losslessJson, parseLosslessJson, decodeAmount} from '../amm/u124/client.mjs';
import {sdkRelease} from '../executor/sdkProfiles.mjs';
const abi = methods => ({contract: {methods: Object.entries(methods).map(([name, input_felt_count], i) =>
  ({name, input_felt_count, output_felt_count: 0, state_mutability: 'external', method_id: name === 'prepare_account' ? 1475740684 : i + 1}))}});
const release = sdkRelease('sdk-audit-20261102-v1'), price = (1n << 100n) + 17n;
function fixture() {
  const config = {nftId: 41, tokenId: 42, networkMagic: '1384803358401154921'};
  const policy = {version: 2, market: 'nftmarket', market_id: 1000, config,
    execution_scope: 'explicit-selected-orders-v1', whole_market_completeness: false, qualified_randomness: false,
    native_protocol: 'mainnet-beta-20261027', collection_initialization: 'explicit-account-version-v1',
    sdk_commit: release.sdkCommit, client_commit: release.clientCommit, chain_root_at1: 'ab'.repeat(32)};
  const context = {policy, config, marketId: 1000n, vaultId: 100n, actorId: 201n,
    marketAbi: abi({open_listing: 6, open_buy: 7, request_cancel: 0}),
    nftAbi: abi({prepare_account: 0, acknowledge: 1, transfer: 2, claim: 2}), tokenAbi: abi({transfer: 3, claim: 1})};
  const expectedNft = {collectionId: 41n, tokenId: [18446744069414584320n, 2n, 3n, 4n], metadataHash: [0n, 6n, 7n, 8n]};
  const owned = {...expectedNft, ownerId: 201n, checkpoint: 100n, slot: 7n, active: 1n, sentToVault: 5n, claimedByVault: 5n};
  const listing = {...expectedNft, ownerId: 200n, checkpoint: 100n, marketId: 1000n, vaultId: 100n,
    paymentTokenId: 42n, nonce: 9n, kind: 1n, cancelled: 0n, consumed: 8n, deadline: 200n,
    price, nftSequence: 3n, nftSent: 4n, nftClaimed: 3n, feeDelta: FEE_ESCROW};
  const delivery = {collectionId: 41n, ownerId: 201n, checkpoint: 100n,
    sent: 3n, claimed: 1n, sentToVault: 0n, claimedByVault: 0n, ownedCount: 100n};
  const buy = {sellerId: 200n, listing, delivery, expectedNft, price, listingNonce: 9n, deadline: 200n, nonce: 1n};
  return {context, expectedNft, owned, listing, delivery, buy};
}
test('listing preserves original ACK/open/fee/NFT-transfer order and full U124 terms', () => {
  const f = fixture(), p = nftCoreListingPlan(f.context, {owned: f.owned, expectedNft: f.expectedNft, price, deadline: 200n, nonce: 1n});
  assert.deepEqual(p.contract_calls.map(c => [c.contract_id, c.method_name]), [[41n, 'acknowledge'], [1000n, 'open_listing'], [0n, 'transfer'], [41n, 'transfer']]);
  assert.deepEqual(p.contract_calls[1].inputs.slice(0, 2), [100n, 7n]);
  assert.equal(decodeAmount(p.contract_calls[1].inputs.slice(2, 4)), price);
  assert.deepEqual(p.contract_calls[3].inputs, [7n, 100n]);
  assert.deepEqual(p.expectedNft, f.expectedNft); assert.equal(p.sourceIdentityCheckRequired, true);
  assert.equal(p.unsigned, true); assert.equal(p.fullUpsVerified, false); assert.equal(p.liveAccepted, false);
});
test('buy prepares collection account and binds exact seller/listing/price without selecting a winner', () => {
  const f = fixture(), p = nftCoreBuyPlan(f.context, f.buy);
  assert.deepEqual(p.contract_calls.map(c => c.method_name), ['prepare_account', 'open_buy', 'transfer', 'transfer']);
  assert.deepEqual(p.contract_calls[1].inputs.slice(0, 3), [100n, 200n, 9n]);
  assert.equal(decodeAmount(p.contract_calls[1].inputs.slice(3, 5)), price);
  assert.equal(decodeAmount(p.contract_calls[3].inputs.slice(1)), price);
  assert.deepEqual(p.contract_calls[2], {contract_id: 0n, method_name: 'transfer', inputs: [100n, FEE_ESCROW]});
  assert.equal(p.globalOrderCompleteness, false);
  const parsed = parseLosslessJson(losslessJson({policy: f.context.policy, config: f.context.config}));
  assert.deepEqual(nftCoreBuyPlan({...f.context, ...parsed}, f.buy), p);
  assert.ok(!p.contract_calls.some(c => ['settle_sale', 'refund_buy', 'refund_listing'].includes(c.method_name)));
});
test('all NFT identity words and collection substitution are rejected before construction', () => {
  for (const field of ['tokenId', 'metadataHash']) for (let i = 0; i < 4; i++) {
    const f = fixture(), changed = {...f.listing, [field]: [...f.listing[field]]}; changed[field][i] ^= 1n;
    assert.throws(() => nftCoreBuyPlan(f.context, {...f.buy, listing: changed}));
    const owned = {...f.owned, [field]: changed[field]};
    assert.throws(() => nftCoreListingPlan(f.context, {owned, expectedNft: f.expectedNft, price, deadline: 200n, nonce: 1n}));
  }
  for (const tokenId of [[0n, 0n, 0n, 0n], [18446744069414584321n, 0n, 0n, 0n], [1, 2n, 3n, 4n]]) {
    const f = fixture(); assert.throws(() => nftCoreBuyPlan(f.context, {...f.buy, expectedNft: {...f.expectedNft, tokenId}}));
  }
  const f = fixture(); assert.throws(() => nftCoreBuyPlan(f.context, {...f.buy, expectedNft: {...f.expectedNft, collectionId: 99n}}));
});
test('buyer rejects stale or substituted listings, funding drift and delivery backpressure', () => {
  const f = fixture();
  for (const change of [{ownerId: 202n}, {collectionId: 99n}, {paymentTokenId: 99n}, {marketId: 1001n}, {vaultId: 101n},
    {nonce: 10n}, {kind: 2n}, {cancelled: 1n}, {consumed: 9n}, {deadline: 99n}, {price: price + 1n},
    {nftSent: 5n}, {nftClaimed: 4n}, {feeDelta: FEE_ESCROW + 1n}])
    assert.throws(() => nftCoreBuyPlan(f.context, {...f.buy, listing: {...f.listing, ...change}}));
  for (const change of [{checkpoint: 101n}, {sent: 5n}, {claimed: 4n}, {sentToVault: 1n}, {ownedCount: 128n}])
    assert.throws(() => nftCoreBuyPlan(f.context, {...f.buy, delivery: {...f.delivery, ...change}}));
  for (const change of [{sellerId: 201n}, {sellerId: 100n}, {listingNonce: 0n}, {nonce: 0n}, {deadline: 0n}, {deadline: 99n},
    {deadline: 1n << 32n}, {price: 0n}, {price: 1n << 124n}, {price: Number(price)}])
    assert.throws(() => nftCoreBuyPlan(f.context, {...f.buy, ...change}));
});
test('listing rejects invalid slot, empty ownership, stale terms and unresolved prior deposits', () => {
  const f = fixture(), terms = {owned: f.owned, expectedNft: f.expectedNft, price, deadline: 200n, nonce: 1n};
  for (const change of [{slot: 128n}, {slot: -1n}, {active: 0n}, {ownerId: 200n}, {sentToVault: 6n}, {checkpoint: 0n}])
    assert.throws(() => nftCoreListingPlan(f.context, {...terms, owned: {...f.owned, ...change}}));
  for (const change of [{nonce: 0n}, {nonce: 1n << 62n}, {deadline: 1n << 32n}, {deadline: 99n}, {price: 0n}])
    assert.throws(() => nftCoreListingPlan(f.context, {...terms, ...change}));
});
test('claim binds next FIFO identity, original vault and empty destination; cancellation only requests', () => {
  const f = fixture(), pending = {...f.expectedNft, ownerId: 201n, checkpoint: 100n, senderId: 100n, sent: 5n, claimed: 3n, sequence: 4n};
  const destination = {collectionId: 41n, ownerId: 201n, checkpoint: 100n, slot: 12n, active: 0n};
  const terms = {pending, destination, expectedNft: f.expectedNft};
  assert.deepEqual(nftCoreClaimPlan(f.context, terms).contract_calls[0].inputs, [12n, 100n]);
  for (const change of [{senderId: 200n}, {sequence: 5n}, {sent: 3n}, {sent: 8n}, {checkpoint: 101n}])
    assert.throws(() => nftCoreClaimPlan(f.context, {...terms, pending: {...pending, ...change}}));
  assert.throws(() => nftCoreClaimPlan(f.context, {...terms, destination: {...destination, active: 1n}}));
  const cancel = nftCoreCancelPlan(f.context); assert.equal(cancel.contract_calls.length, 1);
  assert.equal(cancel.contract_calls[0].method_name, 'request_cancel'); assert.equal(cancel.liveAccepted, false);
});
test('actual cumulative payout claims retain high-limb observations and never authorize a transfer', () => {
  const f = fixture(), p = nftCorePayoutPlan(f.context, {checkpoint: 100n, paymentClaimable: price, nativeClaimable: FEE_ESCROW});
  assert.equal(p.observedPaymentDelta, price);
  assert.deepEqual(p.contract_calls.map(c => [c.contract_id, c.method_name, c.inputs]), [[42n, 'claim', [100n]], [0n, 'claim', [100n]]]);
  assert.equal(p.sourceClaimDeltaCheckRequired, true);
  for (const change of [{paymentClaimable: -1n}, {paymentClaimable: 1n << 124n}, {nativeClaimable: 1n << 62n}, {checkpoint: 0n}])
    assert.throws(() => nftCorePayoutPlan(f.context, {checkpoint: 100n, ...change}));
  assert.throws(() => nftCorePayoutPlan(f.context, {checkpoint: 100n}));
});
test('legacy and v21 keys cannot be relabelled as an accepted selected-order instance', () => {
  const f = fixture();
  for (const patch of [{version: 21}, {market: 'amm'}, {execution_scope: 'source-covered'}, {whole_market_completeness: true},
    {qualified_randomness: true}, {sdk_commit: 'old'}, {client_commit: 'old'}, {native_protocol: 'legacy-v1'},
    {collection_initialization: 'legacy-acknowledgement-v1'}, {chain_root_at1: '0'.repeat(64)}])
    assert.throws(() => nftCoreBuyPlan({...f.context, policy: {...f.context.policy, ...patch}}, f.buy));
  for (const patch of [{marketId: 1001n}, {actorId: 100n}, {config: {...f.context.config, nftId: 42}},
    {nftAbi: abi({acknowledge: 1})}])
    assert.throws(() => nftCoreBuyPlan({...f.context, ...patch}, f.buy));
});
test('NFT plans bind exact deterministic config and canonical domain in both inputs', () => {
  const f = fixture(), withConfigs = (actual, declared) => ({...f.context, config: actual,
    policy: {...f.context.policy, config: declared}});
  for (const change of [{ordering: 'random'}, {seed: '1'}, {randomSource: 'checkpoint'}, {unusedMetadata: true},
    {networkMagic: '1'}, {networkMagic: 1384803358401154921n}, {networkMagic: undefined}]) {
    const changed = {...f.context.config, ...change};
    for (const c of [withConfigs(changed, changed), withConfigs(changed, f.context.config), withConfigs(f.context.config, changed)]) {
      assert.throws(() => nftCoreBuyPlan(c, f.buy));
      assert.throws(() => nftCoreCancelPlan(c));
    }
  }
  for (const change of [{nftId: 99}, {tokenId: 99}, {ordering: 'deterministic'}]) {
    const changed = {...f.context.config, ...change};
    assert.throws(() => nftCoreBuyPlan(withConfigs(changed, f.context.config), f.buy));
    assert.throws(() => nftCoreBuyPlan(withConfigs(f.context.config, changed), f.buy));
  }
  const deterministic = {...f.context.config, ordering: 'deterministic'}, c = withConfigs(deterministic, deterministic);
  assert.deepEqual(nftCoreBuyPlan(c, f.buy), nftCoreBuyPlan(f.context, f.buy));
  assert.deepEqual(nftCoreBuyPlan({...c, policy: parseLosslessJson(losslessJson(c.policy))}, f.buy), nftCoreBuyPlan(f.context, f.buy));
});
