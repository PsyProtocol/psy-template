import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeScopedCandidate, authorizeScopedRandomBatch} from './scope.mjs';
const h = n => BigInt(n).toString(16).padStart(64, '0');
const base = () => ({version: 1, networkMagic: '1384803358401154921', market: 'amm', marketId: '1000', vaultId: '100', epoch: '1', cutoff: '100', sealByCheckpoint: '110', drawCheckpoint: '120', round: '3', settleUntil: '150', recoveryAt: '160', maxFee: '2000200000', sourceId: h(1), chainRootAt1: h(2), codeRoot: h(3), layoutRoot: h(4), functionRoot: h(5), keyFingerprint: h(6), publicKeyHash: h(7), queueRoot: h(8), batchRoot: h(9), members: [{owner: '200', nonce: '1', termsRoot: h(10)}]});
const input = () => ({version: 2, candidate: base(), chainInstanceId: 'ff'.repeat(32), sourceDefinitionSha256: h(2), sourceKeyEpoch: '1', finalityDefinitionSha256: h(3), finalityKeyEpoch: '2', releasePolicySha256: h(4), requestNonce: '3'});
test('full byte identities use eight u32 words without reduction or limb loss', () => {
  const x = input(), encoded = encodeScopedCandidate(x);
  assert.equal(encoded.fields.length, 74); assert.equal(encoded.scopeFields.length, 36);
  assert.deepEqual(encoded.scopeFields.slice(1, 9), Array(8).fill('4294967295'));
  for (const key of ['chainInstanceId', 'sourceDefinitionSha256', 'finalityDefinitionSha256', 'releasePolicySha256']) {
    for (let i = 0; i < 64; i++) {
      const changed = {...x, [key]: x[key].slice(0, i) + (x[key][i] === 'a' ? 'b' : 'a') + x[key].slice(i + 1)};
      assert.notDeepEqual(encodeScopedCandidate(changed).scopeFields, encoded.scopeFields);
    }
  }
  x.candidate.members[0].nonce = '9'; assert.equal(encoded.fields[51], '1');
  assert.throws(() => { encoded.scopeFields[1] = '1'; });
});
test('version, unknown fields, canonical epochs and digest boundaries reject', () => {
  const x = input();
  for (const patch of [{version: 1}, {requestNonce: '0'}, {sourceKeyEpoch: '01'}, {finalityKeyEpoch: String(1n << 62n)}, {chainInstanceId: h(0)}, {releasePolicySha256: 'AA'.repeat(32)}, {verified: true}, {verifierUrl: 'https://untrusted.invalid/'}]) assert.throws(() => encodeScopedCandidate({...x, ...patch}));
  for (const key of Object.keys(x)) { const changed = {...x}; delete changed[key]; assert.throws(() => encodeScopedCandidate(changed)); }
});
test('a scoped candidate cannot authorize any chosen seed, provider or finality claim', () => {
  for (const market of ['amm', 'bondingcurve']) {
    const x = input(); x.candidate.market = market;
    assert.throws(() => authorizeScopedRandomBatch(x), e => e.code === 'RANDOM_SOURCE_UNAVAILABLE');
  }
  for (const key of ['seed', 'beaconProof', 'finalityProof', 'causalReleaseProof', 'qualifiedSource']) assert.throws(() => encodeScopedCandidate({...input(), [key]: h(1)}));
});
