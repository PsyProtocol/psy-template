// Host-only policy/ABI doubles. No selector, bytecode, key, complete UPS,
// dependency trust, browser, wallet approval or network claim follows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {call as genericCall, FEE_ESCROW} from '../../amm/u124/client.mjs';
import {generateIdentityBuyCandidate, FROZEN_CAPACITY} from './identity-buy-candidate.mjs';
import {identityBuyReviewIdentityV1, prepareIdentityBuyV1, assertPreparedIdentityBuyV1,
  NFT_IDENTITY_CLIENT_PROFILE, NFT_IDENTITY_PENDING_GATES, NFT_IDENTITY_DATA_LIMITS} from './identityClientV1.mjs';

const MAX_FELT = 18446744069414584320n;
const abi = (name, selector, inputs) => ({contract: {methods: [{name, method_id: selector,
  input_felt_count: inputs, output_felt_count: 0, state_mutability: 'external'}]}});
function fixture() {
  const config = {nftId: 61, tokenId: 56, networkMagic: '1384803358401154921', ordering: 'deterministic'};
  const bindings = [0, 56, 61, 1000].map(contractId => ({contractId, deployer: contractId === 0 ? 0 : 300,
    codeRoot: '11'.repeat(32), layoutRoot: '22'.repeat(32), functionTreeRoot: '33'.repeat(32),
    stateTreeHeight: contractId === 0 ? 32 : contractId === 61 ? 30 : 31, layoutFieldCount: 20, layoutSlotCount: 200}));
  const policy = {version: 2, market: 'nftmarket', market_id: 1000, vault_id: 100, config,
    identity_buy_profile: 'selected-nft-identity-buy-v1', source_sha256: generateIdentityBuyCandidate(config).manifest.sourceSha256,
    execution_scope: 'explicit-selected-orders-v1', whole_market_completeness: false, qualified_randomness: false,
    collection_initialization: 'explicit-account-version-v1', sdk_commit: FROZEN_CAPACITY.sdkCommit,
    client_commit: FROZEN_CAPACITY.clientCommit, native_protocol: 'mainnet-beta-20261027',
    chain_root_at1: 'ab'.repeat(32), chain_instance: 'HOST-ONLY-UNTRUSTED-CHAIN-DOUBLE',
    key_profile: 'selected-dependency-bound-v1', dependency_bindings: bindings};
  const reviewed = {policy, component: structuredClone(bindings[3]),
    marketAbi: abi('open_buy_identity_v1', 1234567894, 17), // Synthetic, not a compiled selector.
    collectionAbi: abi('prepare_account', 1475740684, 0),
    paymentAbi: abi('transfer', 188091294, 3), nativeAbi: abi('transfer', 2789897329, 2)};
  // Tests generate pins from doubles; real callers must review independently.
  const pins = identityBuyReviewIdentityV1(reviewed);
  const request = {signingBuyerId: 201n, approved: {actor: 201n, pool: 100n, seller: 200n,
    listingNonce: 9n, price: (1n << 124n) - 1n, deadline: 200n, nonce: 1n, collectionId: 61n,
    recipient: 201n, tokenId: [MAX_FELT, 1n << 62n, 3n, 4n], metadataHash: [0n, MAX_FELT, 0n, 8n]}};
  return {reviewed, pins, request};
}
const prepare = f => prepareIdentityBuyV1(f.reviewed, f.pins, f.request);
const repin = f => {f.pins = identityBuyReviewIdentityV1(f.reviewed); return f;};

test('HOST ONLY: exact 17 full-field words preserve prepare/open/fee/payment order', () => {
  const f = fixture(), p = prepare(f), limb = (1n << 62n) - 1n;
  assert.equal(p.profile, NFT_IDENTITY_CLIENT_PROFILE);
  assert.deepEqual(p.contract_calls.map(c => [c.contract_id, c.method_name, c.method_id]), [
    [61n, 'prepare_account', 1475740684n], [1000n, 'open_buy_identity_v1', 1234567894n],
    [0n, 'transfer', 2789897329n], [56n, 'transfer', 188091294n]]);
  assert.deepEqual(p.contract_calls[1].inputs, [100n, 200n, 9n, limb, limb, 200n, 1n,
    61n, 201n, ...f.request.approved.tokenId, ...f.request.approved.metadataHash]);
  assert.deepEqual(p.contract_calls[2].inputs, [100n, FEE_ESCROW]);
  assert.deepEqual(p.contract_calls[3].inputs, [100n, limb, limb]);
  assert.equal(p.contract_calls[1].inputs.length, 17);
  assert.equal(p.network.chainInstance, f.reviewed.policy.chain_instance);
  assert.deepEqual({...p.reviewIdentity}, {...f.pins});
  assert.deepEqual({...p.component}, f.reviewed.component);
});

test('HOST ONLY: dependency doubles and boolean evidence cannot open purchase writes', () => {
  const f = fixture();
  f.reviewed.policy.fullUpsVerified = true; f.reviewed.policy.liveAccepted = true;
  f.reviewed.policy.dependencyBindingsInCircuit = true;
  const p = prepare(repin(f));
  for (const field of ['unsigned', 'prepareOnly', 'sourceOnly', 'newContractRequired', 'newKeyRequired']) assert.equal(p[field], true);
  for (const field of ['nftPurchaseWritesEnabled', 'compiled', 'vmVerified', 'dependencyTrustVerified',
    'sdKeyProofVerified', 'fullUpsVerified', 'liveAccepted', 'wholeMarketCompleteness', 'qualifiedRandomness']) assert.equal(p[field], false);
  assert.deepEqual(p.requiredGates, NFT_IDENTITY_PENDING_GATES); assert.equal(p.financialOperations, 0);
  assert.equal(Object.isFrozen(p), true); assert.equal(Object.isFrozen(p.contract_calls[1].inputs), true);
});

test('HOST ONLY: exact independent pins reject policy, component and every ABI substitution', () => {
  for (const field of ['policy', 'component', 'marketAbi', 'collectionAbi', 'paymentAbi', 'nativeAbi']) {
    const f = fixture(); f.reviewed[field].unexpected = true;
    assert.throws(() => prepare(f), /supplied review identity changed/);
  }
  for (const field of Object.keys(fixture().pins)) {
    const f = fixture(); f.pins = {...f.pins, [field]: 'ff'.repeat(32)};
    assert.throws(() => prepare(f), /supplied review identity changed/);
  }
  const f = fixture(); assert.throws(() => prepareIdentityBuyV1(f.reviewed, {}, f.request), /exact independently supplied/);
});

test('HOST ONLY: name match cannot admit legacy, malformed or ambiguous candidate ABI', () => {
  for (const change of [m => m.name = 'open_buy', m => m.method_id = 2946376578,
    m => m.method_id = '1234567894', m => m.method_id = 0, m => m.method_id = 2 ** 32,
    m => m.input_felt_count = 7, m => m.output_felt_count = 1, m => m.state_mutability = 'view']) {
    const f = fixture(); change(f.reviewed.marketAbi.contract.methods[0]);
    assert.throws(() => prepare(repin(f)));
  }
  for (const duplicate of [{name: 'open_buy_identity_v1', method_id: 99}, {name: 'another', method_id: 1234567894}, {name: 'open_buy', method_id: 2946376578}]) {
    const f = fixture(); f.reviewed.marketAbi.contract.methods.push({...f.reviewed.marketAbi.contract.methods[0], ...duplicate});
    assert.throws(() => prepare(repin(f)));
  }
});

test('HOST ONLY: prepare/payment/Native method identities are exact, even after repinning doubles', () => {
  for (const field of ['collectionAbi', 'paymentAbi', 'nativeAbi']) {
    const f = fixture(); f.reviewed[field].contract.methods[0].method_id++;
    assert.throws(() => prepare(repin(f)), /selector/);
  }
});

test('HOST ONLY: source, SDK, selected policy, collection bootstrap and dependency leaves stay bound', () => {
  for (const change of [p => p.source_sha256 = 'ab'.repeat(32), p => p.sdk_commit = 'old',
    p => p.client_commit = 'old', p => p.identity_buy_profile = 'legacy', p => p.native_protocol = 'legacy-v1',
    p => p.collection_initialization = 'legacy-acknowledgement-v1', p => p.chain_instance = '',
    p => p.chain_root_at1 = '0'.repeat(64), p => p.whole_market_completeness = true,
    p => p.qualified_randomness = true, p => p.key_profile = 'legacy',
    p => p.config.ordering = 'random', p => p.dependency_bindings.pop(),
    p => p.dependency_bindings[2].stateTreeHeight = 31,
    p => p.dependency_bindings[1].codeRoot = 'ff'.repeat(32), p => p.market_id = p.config.nftId]) {
    const f = fixture(); change(f.reviewed.policy); assert.throws(() => prepare(repin(f)));
  }
  const f = fixture(); f.reviewed.component.codeRoot = '44'.repeat(32);
  assert.throws(() => prepare(repin(f)), /full market dependency leaf/);
});

test('HOST ONLY: recipient, collection, signer, vault and canonical approval constraints reject substitutions', () => {
  for (const changes of [{actor: 202n}, {pool: 101n}, {recipient: 202n}, {collectionId: 62n},
    {seller: 201n}, {seller: 100n}, {listingNonce: 0n}, {nonce: 1n << 62n}, {deadline: 1n << 32n},
    {price: 0n}, {price: 1n << 124n}, {tokenId: [0n, 0n, 0n, 0n]}, {metadataHash: [MAX_FELT + 1n, 0n, 0n, 0n]}]) {
    const f = fixture(); Object.assign(f.request.approved, changes); assert.throws(() => prepare(f));
  }
  const f = fixture(); f.request.signingBuyerId = 201; assert.throws(() => prepare(f));
});

test('HOST ONLY: persisted approval rejects every calldata word mutation and detached funding stack', () => {
  const f = fixture(), p = prepare(f);
  for (let i = 0; i < 17; i++) {
    const changed = structuredClone(p); changed.contract_calls[1].inputs[i] ^= 1n;
    assert.throws(() => assertPreparedIdentityBuyV1(f.reviewed, f.pins, f.request, changed), /stack or approval changed/);
  }
  for (const change of [p => p.contract_calls.pop(), p => p.contract_calls.reverse(),
    p => p.contract_calls[0].contract_id = 62n, p => p.contract_calls[1].method_id++,
    p => p.contract_calls[2].inputs[1]++, p => p.contract_calls[3].inputs[2]--,
    p => p.signingBuyerId++, p => p.network.chainInstance = 'substitute', p => p.nftPurchaseWritesEnabled = true]) {
    const changed = structuredClone(p); change(changed);
    assert.throws(() => assertPreparedIdentityBuyV1(f.reviewed, f.pins, f.request, changed));
  }
  assert.deepEqual(assertPreparedIdentityBuyV1(f.reviewed, f.pins, f.request, structuredClone(p)), p);
});

test('HOST ONLY: approval changes in seller, listing, amount, deadlines, nonce or identity invalidate prior preparation', () => {
  for (const field of ['seller', 'listingNonce', 'price', 'deadline', 'nonce']) {
    const f = fixture(), p = prepare(f); f.request.approved[field]--;
    assert.throws(() => assertPreparedIdentityBuyV1(f.reviewed, f.pins, f.request, p));
  }
  for (const field of ['tokenId', 'metadataHash']) for (let i = 0; i < 4; i++) {
    const f = fixture(), p = prepare(f); f.request.approved[field][i] ^= 1n;
    assert.throws(() => assertPreparedIdentityBuyV1(f.reviewed, f.pins, f.request, p));
  }
});

test('HOST ONLY: prepared identities are detached frozen snapshots, unaffected by later caller mutation', () => {
  const f = fixture(), p = prepare(f), old = p.approved.tokenId[0];
  f.request.approved.tokenId[0] = 1n; f.request.approved.price = 1n;
  f.reviewed.policy.config.nftId = 62; f.reviewed.component.codeRoot = '44'.repeat(32);
  assert.equal(p.approved.tokenId[0], old); assert.equal(p.contract_calls[1].inputs[9], old);
  assert.equal(p.component.codeRoot, '11'.repeat(32));
  assert.throws(() => p.approved.tokenId[0] = 0n, TypeError);
});

test('HOST ONLY: Proxy and accessor boundaries reject without invoking executable inputs', () => {
  let calls = 0;
  const handler = {get() {calls++; throw Error('Proxy get');}, ownKeys() {calls++; throw Error('Proxy keys');},
    getOwnPropertyDescriptor() {calls++; throw Error('Proxy descriptor');}};
  for (const field of ['reviewed', 'pins', 'request']) {
    const f = fixture(); f[field] = new Proxy(f[field], handler); assert.throws(() => prepare(f));
  }
  for (const mutate of [f => f.reviewed.policy = new Proxy(f.reviewed.policy, handler),
    f => f.request.approved.tokenId = new Proxy(f.request.approved.tokenId, handler),
    f => Object.defineProperty(f.request.approved, 'price', {enumerable: true, get() {calls++; return 1n;}}),
    f => Object.defineProperty(f.reviewed.policy.config, 'nftId', {enumerable: true, get() {calls++; return 61;}}),
    f => Object.defineProperty(f.request.approved.tokenId, '0', {enumerable: true, get() {calls++; return 1n;}})]) {
    const f = fixture(); mutate(f); assert.throws(() => prepare(f));
  }
  assert.equal(calls, 0);
});

test('HOST ONLY: sparse/inherited words, custom iterators, symbols, cycles and class instances fail closed', () => {
  for (const mutate of [a => delete a.tokenId[1], a => a.metadataHash = new Array(4),
    a => {delete a.tokenId[1]; const proto = Object.create(Array.prototype); proto[1] = 2n; Object.setPrototypeOf(a.tokenId, proto);},
    a => Object.defineProperty(a.tokenId, Symbol.iterator, {value: function* () {throw Error('iterator executed');}}),
    a => a.tokenId[3] = '4', a => a.tokenId[3] = MAX_FELT + 1n,
    a => a.extra = a, a => Object.setPrototypeOf(a, new class Approval {}())]) {
    const f = fixture(); mutate(f.request.approved); assert.throws(() => prepare(f));
  }
});

test('HOST ONLY: pin identity is order-stable, type-sensitive and rejects executable data', () => {
  const f = fixture(), reversed = Object.fromEntries(Object.entries(f.reviewed).reverse());
  assert.deepEqual(identityBuyReviewIdentityV1(reversed), f.pins);
  const changed = structuredClone(f.reviewed); changed.policy.market_id = 1000n;
  assert.notEqual(identityBuyReviewIdentityV1(changed).policySha256, f.pins.policySha256);
  let calls = 0; f.reviewed.policy.toJSON = () => {calls++; return {};};
  assert.throws(() => identityBuyReviewIdentityV1(f.reviewed)); assert.equal(calls, 0);
});

test('HOST ONLY: full-field route never weakens generic 62-bit calldata constraints', () => {
  const f = fixture(), inputs = prepare(f).contract_calls[1].inputs;
  assert.throws(() => genericCall(1000n, f.reviewed.marketAbi, 'open_buy_identity_v1', inputs), /bounded BigInt/);
  assert.ok(inputs[9] > (1n << 62n) - 1n);
});

test('HOST ONLY: huge sparse arrays fail before index allocation or accessor traversal', () => {
  let getterCalls = 0;
  for (const length of [NFT_IDENTITY_DATA_LIMITS.maxArrayLength + 1, 0xffffffff]) {
    const f = fixture(), huge = new Array(length);
    Object.defineProperty(huge, '0', {enumerable: true, get() {getterCalls++; return 1n;}});
    f.request.approved.tokenId = huge;
    const start = performance.now();
    assert.throws(() => prepare(f), /plain data array length limit exceeded/);
    assert.ok(performance.now() - start < 2000, 'bounded sparse-array rejection must finish promptly');
  }
  assert.equal(getterCalls, 0);
});

test('HOST ONLY: deeply nested plain data fails at the explicit depth bound without stack overflow', () => {
  const f = fixture(), nested = {}; let cursor = nested;
  for (let i = 0; i < 10000; i++) {cursor.next = {}; cursor = cursor.next;}
  f.reviewed.policy.deep = nested;
  const start = performance.now();
  assert.throws(() => identityBuyReviewIdentityV1(f.reviewed), /plain data depth limit exceeded/);
  assert.ok(performance.now() - start < 2000, 'bounded depth rejection must finish promptly');
});

test('HOST ONLY: oversized own-key sets reject before reading any property descriptors', () => {
  const f = fixture(), wide = {}; let getterCalls = 0;
  for (let i = 0; i <= NFT_IDENTITY_DATA_LIMITS.maxOwnKeys; i++)
    Object.defineProperty(wide, String(i), {enumerable: true, get() {getterCalls++; return 0;}});
  f.reviewed.policy.wide = wide;
  assert.throws(() => identityBuyReviewIdentityV1(f.reviewed), /plain data own-key count limit exceeded/);
  assert.equal(getterCalls, 0);
});

test('HOST ONLY: aggregate structural budget counts repeated aliases before their copies can expand', () => {
  const f = fixture(), branch = Object.fromEntries(Array.from({length: 100}, (_, i) => [String(i), 0]));
  // This shallow graph obeys each per-container limit; repeatedly copying the
  // same branch must still consume the aggregate node/property budget.
  f.reviewed.policy.wide = Array.from({length: 1000}, () => branch);
  const start = performance.now();
  assert.throws(() => identityBuyReviewIdentityV1(f.reviewed), /plain data aggregate traversal limit exceeded/);
  assert.ok(performance.now() - start < 2000, 'bounded aggregate rejection must finish promptly');
  assert.equal(Object.isFrozen(NFT_IDENTITY_DATA_LIMITS), true);
});
