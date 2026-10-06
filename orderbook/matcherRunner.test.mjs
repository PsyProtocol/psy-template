import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRunnerArgs } from './matcherRunner.mjs';

test('runner is read-only by default and supports historical replay', () => {
  const options = parseRunnerArgs(['--users', '329728,1640448', '--checkpoint', '88516']);
  assert.equal(options.execute, false);
  assert.equal(options.executeRefund, false);
  assert.equal(options.fixedCheckpoint, 88516);
  assert.deepEqual(options.users, [329728, 1640448]);
});

test('one-seller expired refund execution cannot use a historical checkpoint or match mode', () => {
  assert.equal(parseRunnerArgs(['--users', '329728', '--execute-refund']).executeRefund, true);
  assert.throws(() => parseRunnerArgs(['--users', '329728', '--execute-refund', '--checkpoint', '88516']), /read-only/);
  assert.throws(() => parseRunnerArgs(['--users', '329728', '--execute-refund', '--execute']), /choose/);
});
