// Self-contained host regression for the approved core checkpoint window.
// Only the real reader predicate runs: no compiler artifact, SDK, RPC, native
// proof, signature or broadcast participates, and nothing here is a full UPS,
// deployed identity or settlement acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCoreSourceCheckpoint} from './coreAmmReader.mjs';

const DOMAIN = 2 ** 32;
const task = (patch = {}) => ({minimumSourceCheckpoint: 100, validUntilCheckpoint: '164', ...patch});

test('a canonical window accepts exactly its inclusive approved interval', () => {
  const t = task();
  for (const checkpoint_id of [100n, 133n, 164n]) checkCoreSourceCheckpoint(t, {checkpoint_id});
  assert.throws(() => checkCoreSourceCheckpoint(t, {checkpoint_id: 99n}), /predates approved state observation/);
  assert.throws(() => checkCoreSourceCheckpoint(t, {checkpoint_id: 165n}), /exceeds approved window/);
  checkCoreSourceCheckpoint(task({minimumSourceCheckpoint: 164}), {checkpoint_id: 164n});
});

test('the window stops at the last uint32 checkpoint and never admits the domain', () => {
  const t = task({minimumSourceCheckpoint: 1, validUntilCheckpoint: String(DOMAIN - 1)});
  checkCoreSourceCheckpoint(t, {checkpoint_id: 1n});
  checkCoreSourceCheckpoint(t, {checkpoint_id: BigInt(DOMAIN - 1)});
  assert.throws(() => checkCoreSourceCheckpoint(t, {checkpoint_id: BigInt(DOMAIN)}), /exceeds approved window/);
  for (const validUntilCheckpoint of [String(DOMAIN), String(DOMAIN + 1), '9999999999', '18446744073709551615'])
    assert.throws(() => checkCoreSourceCheckpoint(task({validUntilCheckpoint}), {checkpoint_id: 100n}), /checkpoint domain/);
});

test('oversized decimal encodings are refused before any BigInt parsing', () => {
  for (const validUntilCheckpoint of ['1'.repeat(11), '9'.repeat(64), '1' + '0'.repeat(5000), '0'.repeat(1000) + '164'])
    assert.throws(() => checkCoreSourceCheckpoint(task({validUntilCheckpoint}), {checkpoint_id: 100n}), /checkpoint domain/);
});

test('the window may not precede or invert the approved state observation', () => {
  for (const patch of [{validUntilCheckpoint: '99'}, {minimumSourceCheckpoint: 165}, {minimumSourceCheckpoint: DOMAIN}])
    assert.throws(() => checkCoreSourceCheckpoint(task(patch), {checkpoint_id: 100n}), /precedes the approved state observation/);
});

test('only lossless BigInt proof metadata can satisfy a window', () => {
  const t = task();
  for (const checkpoint_id of [undefined, null, 164, 164.0, '164', '0xa4', true, NaN, Object(164n)])
    assert.throws(() => checkCoreSourceCheckpoint(t, {checkpoint_id}), /lossless verified proof metadata/);
  for (const core of [undefined, null, {}, 'core', 164n])
    assert.throws(() => checkCoreSourceCheckpoint(t, core), /lossless verified proof metadata/);
});

test('non-canonical window encodings stay refused', () => {
  for (const validUntilCheckpoint of [164, '0xa4', ' 164', '164 ', '+164', '0164', '1e2', '164.0', '-164', '0', '', undefined, null, {}])
    assert.throws(() => checkCoreSourceCheckpoint(task({validUntilCheckpoint}), {checkpoint_id: 164n}));
});

test('unsafe, zero and non-numeric observation minimums are refused', () => {
  for (const minimumSourceCheckpoint of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '100', 100n, undefined, null])
    assert.throws(() => checkCoreSourceCheckpoint(task({minimumSourceCheckpoint}), {checkpoint_id: 164n}));
});

test('a stale proof from before the approved observation is never accepted', () => {
  const t = task({minimumSourceCheckpoint: 101, validUntilCheckpoint: '165'});
  for (const checkpoint_id of [1n, 99n, 100n])
    assert.throws(() => checkCoreSourceCheckpoint(t, {checkpoint_id}), /predates approved state observation/);
  checkCoreSourceCheckpoint(t, {checkpoint_id: 101n});
});

test('the predicate does not rewrite the emitted task or the proof metadata', () => {
  const t = Object.freeze(task()), core = Object.freeze({checkpoint_id: 164n}), before = structuredClone(t);
  checkCoreSourceCheckpoint(t, core);
  assert.deepEqual(t, before);
});
