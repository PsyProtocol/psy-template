import assert from 'node:assert/strict';
import {encodeCandidateStatement} from './statement.mjs';
import {requireQualifiedRandomSource} from './sourceGate.mjs';

const keys = ['version', 'candidate', 'chainInstanceId', 'sourceDefinitionSha256', 'sourceKeyEpoch',
  'finalityDefinitionSha256', 'finalityKeyEpoch', 'releasePolicySha256', 'requestNonce'];
function digest(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^[0-9a-f]{64}$/);
  assert.notEqual(value, '0'.repeat(64), 'nonzero complete-byte identity required');
  return Array.from({length: 8}, (_, i) => BigInt('0x' + value.slice(i * 8, i * 8 + 8)).toString());
}
function scalar(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^[1-9]\d*$/);
  assert.ok(BigInt(value) < (1n << 62n), 'scope scalar exceeds 62 bits');
  return value;
}
export function encodeScopedCandidate(input) {
  assert.ok(input && typeof input === 'object' && !Array.isArray(input));
  assert.deepEqual(Object.keys(input).sort(), [...keys].sort(), 'exact scoped candidate fields required');
  assert.equal(input.version, 2);
  const base = encodeCandidateStatement(input.candidate);
  const scopeFields = ['2', ...digest(input.chainInstanceId), ...digest(input.sourceDefinitionSha256),
    scalar(input.sourceKeyEpoch), ...digest(input.finalityDefinitionSha256), scalar(input.finalityKeyEpoch),
    ...digest(input.releasePolicySha256), scalar(input.requestNonce)];
  assert.equal(scopeFields.length, 36);
  return Object.freeze({schema: 2, fields: base.fields, scopeFields: Object.freeze(scopeFields),
    scope: 'unverified instance/source/release claims; new scoped seal required; no random authorization'});
}
export function authorizeScopedRandomBatch(input) {
  encodeScopedCandidate(input);
  requireQualifiedRandomSource();
}
