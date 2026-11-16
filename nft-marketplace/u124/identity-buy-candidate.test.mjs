// Host source/encoding regressions only; no compiler, VM, proof or network use.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateBatch, methodSpans} from '../../batching/v2/generate.mjs';
import {generateIdentityBuyCandidate, transformIdentityBuySource, identityBuyInputs,
  NFT_IDENTITY_BUY_METHOD, FROZEN_CAPACITY} from './identity-buy-candidate.mjs';

const config = {nftId: 61, tokenId: 56, networkMagic: '1384803358401154921', ordering: 'deterministic'};
const approved = () => ({actor: 201n, pool: 100n, seller: 200n, listingNonce: 1n,
  price: (1n << 62n) + 17n, deadline: 100n, nonce: 2n, collectionId: 61n, recipient: 201n,
  tokenId: [1n, 2n, 3n, 18446744069414584320n], metadataHash: [0n, 4n, 5n, 6n]});

test('HOST ONLY: candidate removes unbound buy and changes only its exact method envelope', () => {
  const base = generateBatch('nftmarket', config), {source, manifest} = generateIdentityBuyCandidate(config);
  const original = methodSpans(base), changed = methodSpans(source);
  assert.equal(changed.length, original.length); assert.ok(!changed.some(m => m.name === 'open_buy'));
  for (const m of original.filter(m => m.name !== 'open_buy')) {
    const n = changed.find(n => n.name === m.name); assert.ok(n);
    assert.equal(source.slice(n.start, n.end), base.slice(m.start, m.end), m.name);
  }
  const old = original.find(m => m.name === 'open_buy'), next = changed.find(m => m.name === NFT_IDENTITY_BUY_METHOD);
  const checksStart = next.body.indexOf('// Bind the approved identity');
  const checksEnd = next.body.indexOf('self.kind = 2;', checksStart);
  assert.ok(checksStart > 0 && checksEnd > checksStart);
  assert.equal(next.body.slice(0, checksStart) + next.body.slice(checksEnd), old.body);
  assert.equal(source.slice(0, next.start), base.slice(0, old.start));
  assert.equal(source.slice(next.end), base.slice(old.end));
  assert.equal(manifest.inputFeltCount, 17); assert.equal(manifest.newContractRequired, true);
  assert.equal(manifest.newKeyRequired, true); assert.equal(manifest.legacyBuyEntryRetained, false);
  for (const key of ['compiled', 'vmVerified', 'sdKeyProofVerified', 'fullUpsVerified', 'liveAccepted']) assert.equal(manifest[key], false);
});

test('HOST ONLY: all approved identity words are compared with authenticated seller fields before writes', () => {
  const {source} = generateIdentityBuyCandidate(config);
  const buy = methodSpans(source).find(m => m.name === NFT_IDENTITY_BUY_METHOD);
  assert.match(buy.signature, /collection_id: Felt, recipient: Felt, expected_token_id: Hash, expected_metadata_hash: Hash/);
  assert.match(buy.body, /require\(collection_id == 61,/);
  assert.match(buy.body, /require\(recipient == ctx.user_id,/);
  const firstWrite = buy.body.indexOf('self.kind = 2;');
  for (let i = 0; i < 4; i++) {
    for (const [field, local, expected] of [['token_id', 'token', 'expected_token_id'], ['metadata_hash', 'metadata', 'expected_metadata_hash']]) {
      const read = `let identity_buy_${local}_${i} = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).${field}_${i};`;
      const compare = `require(identity_buy_${local}_${i} == ${expected}[${i}],`;
      assert.ok(buy.body.indexOf(read) >= 0 && buy.body.indexOf(read) < firstWrite);
      assert.ok(buy.body.indexOf(compare) >= 0 && buy.body.indexOf(compare) < firstWrite);
    }
  }
  assert.ok(!buy.body.slice(firstWrite).includes('ctx.users['));
  assert.equal((buy.body.match(/identity_buy_\w+_\d.*\.to_bits/g) ?? []).length, 0);
});

test('HOST ONLY: altered, duplicate, already-transformed or wrong-configuration sources fail closed', () => {
  const base = generateBatch('nftmarket', config);
  assert.throws(() => transformIdentityBuySource(base.replace('listing unavailable', 'ignored listing'), config));
  assert.throws(() => transformIdentityBuySource(base + base, config));
  assert.throws(() => transformIdentityBuySource(generateIdentityBuyCandidate(config).source, config));
  assert.throws(() => transformIdentityBuySource(base, {...config, nftId: 62}));
  for (const bad of [{...config, seed: '1'}, {...config, ordering: 'random'}, {...config, nftId: 56}, {...config, networkMagic: '1'}])
    assert.throws(() => generateIdentityBuyCandidate(bad));
});

test('HOST ONLY: full U124 and canonical four-word identities survive the exact 17-word encoding', () => {
  const a = approved(), words = identityBuyInputs(config, a);
  assert.equal(words.length, 17); assert.deepEqual(words.slice(0, 9), [100n, 200n, 1n, 17n, 1n, 100n, 2n, 61n, 201n]);
  assert.deepEqual(words.slice(9), [...a.tokenId, ...a.metadataHash]);
  const max = identityBuyInputs(config, {...a, price: (1n << 124n) - 1n});
  assert.equal(max[3], (1n << 62n) - 1n); assert.equal(max[4], (1n << 62n) - 1n);
  assert.equal(FROZEN_CAPACITY.calldataWords, 128); assert.ok(words.length <= 128);
  assert.equal(FROZEN_CAPACITY.sdkCommit, '01b8f2b0a077367a7b9879baba1a72aea8ab5510');
});

test('HOST ONLY: malformed, ambiguous, redirected and out-of-range approvals are rejected', () => {
  const a = approved();
  for (const change of [{recipient: 202n}, {collectionId: 62n}, {seller: a.actor}, {pool: a.actor}, {price: 0n},
    {price: 1n << 124n}, {price: 1}, {nonce: 1n << 62n}, {deadline: 1n << 32n},
    {tokenId: [0n, 0n, 0n, 0n]}, {tokenId: [1n, 2n, 3n]},
    {metadataHash: [0n, 0n, 0n, 18446744069414584321n]}, {metadataHash: [0n, 0n, 0n, -1n]}, {extra: true}])
    assert.throws(() => identityBuyInputs(config, {...a, ...change}));
});

test('HOST ONLY: sparse, inherited, wrong-length and noncanonical identity words fail closed', () => {
  const inherited = [1n, 2n, 3n, 4n];
  delete inherited[2];
  const prototype = Object.create(Array.prototype);
  Object.defineProperty(prototype, '2', {value: 3n});
  Object.setPrototypeOf(inherited, prototype);
  assert.equal(inherited[2], 3n); assert.equal(Object.hasOwn(inherited, 2), false);
  const holes = [new Array(4), [1n, , , ,], [0n, 0n, 0n, ,], inherited];
  for (const field of ['tokenId', 'metadataHash']) {
    for (const words of [...holes, [], [1n, 2n, 3n], [1n, 2n, 3n, 4n, 5n],
      [1n, 2n, 3n, undefined], [1n, 2n, 3n, null], [1n, 2n, 3n, 4],
      [1n, 2n, 3n, '4'], [1n, 2n, 3n, -1n], [1n, 2n, 3n, 18446744069414584321n]])
      assert.throws(() => identityBuyInputs(config, {...approved(), [field]: words}), field);
  }
});

test('HOST ONLY: identity snapshots ignore custom iterators and reject accessor words without executing getters', () => {
  for (const field of ['tokenId', 'metadataHash']) {
    const a = approved(), exact = [...a[field]];
    let iteratorCalls = 0;
    Object.defineProperty(a[field], Symbol.iterator, {value: function* () {
      iteratorCalls++; yield -1n; yield undefined; yield 5; yield 18446744069414584321n;
    }});
    const words = identityBuyInputs(config, a);
    assert.equal(iteratorCalls, 0);
    assert.deepEqual(words.slice(field === 'tokenId' ? 9 : 13, field === 'tokenId' ? 13 : 17), exact);
    for (let index = 0; index < 4; index++) {
      const changed = approved(); let getterCalls = 0;
      Object.defineProperty(changed[field], index, {get() {getterCalls++; return getterCalls === 1 ? 1n : -1n;}});
      assert.throws(() => identityBuyInputs(config, changed), /own data words/);
      assert.equal(getterCalls, 0);
    }
  }
});

test('HOST ONLY: approval fields are own data snapshots, not changing getters', () => {
  for (const field of Object.keys(approved())) {
    const a = approved(); let reads = 0;
    Object.defineProperty(a, field, {enumerable: true, get() {reads++; return approved()[field];}});
    assert.throws(() => identityBuyInputs(config, a), /own data properties/);
    assert.equal(reads, 0);
  }
});

test('HOST ONLY: Proxy config, approval and identity arrays are rejected without invoking traps', () => {
  let traps = 0;
  const handler = {get() {traps++; throw Error('must not read Proxy');},
    ownKeys() {traps++; throw Error('must not enumerate Proxy');},
    getOwnPropertyDescriptor() {traps++; throw Error('must not inspect Proxy');}};
  assert.throws(() => identityBuyInputs(new Proxy(config, handler), approved()));
  assert.throws(() => identityBuyInputs(config, new Proxy(approved(), handler)));
  for (const field of ['tokenId', 'metadataHash']) {
    const a = approved(); a[field] = new Proxy(a[field], handler);
    assert.throws(() => identityBuyInputs(config, a));
  }
  assert.equal(traps, 0);
});
