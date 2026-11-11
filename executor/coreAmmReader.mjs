// Normal selected-order AMM route. No admission epoch or account-universe scan.
import assert from 'node:assert/strict';
import {scanBatch} from '../batching/v2/reader.mjs';
import {compactRequest} from '../batching/admission/reader.mjs';
import {losslessJson, parseLosslessJson} from '../amm/u124/client.mjs';

export function checkCoreSourceCheckpoint(task, core) {
  assert.ok(Number.isSafeInteger(task.minimumSourceCheckpoint) && task.minimumSourceCheckpoint > 0);
  assert.equal(typeof core.checkpoint_id, 'bigint', 'lossless verified proof metadata required');
  assert.ok(core.checkpoint_id >= BigInt(task.minimumSourceCheckpoint), 'core proof predates approved state observation');
  assert.ok(core.checkpoint_id <= BigInt(task.validUntilCheckpoint), 'core proof exceeds approved window');
}

export async function scanCoreAmm(options, state, files) {
  assert.equal(options.kind, 'amm');
  assert.equal(files.policy.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(files.policy.whole_market_completeness, false);
  assert.equal(files.policy.qualified_randomness, false);
  const result = await scanBatch(options, async () => state, files);
  const scope = {type: 'explicit-selected-orders-v1', globalCompleteness: false,
    discovery: 'explicit user hints; committed members are authoritative after freezing', proofVerified: false};
  if (!result.action) return {...result, scope};
  const fields = parseLosslessJson(result.action.submission).software_defined_call.inputs;
  let until = state.checkpoint + 64;
  if (fields[0] === 1n) until = Number(fields[3]);
  if (fields[0] === 2n) {
    const offset = files.abi.contract.state.find(f => f.name === 'batch_expiry')?.offset;
    assert.ok(Number.isSafeInteger(offset));
    until = Math.min(until, Number(await state.slot(options.vaultId, options.contractId, offset)));
  }
  assert.ok(Number.isSafeInteger(until) && until >= state.checkpoint && until < 2 ** 32);
  return {...result, scope, action: {...result.action, profile: 'compact-v1',
    minimumSourceCheckpoint: state.checkpoint, validUntilCheckpoint: String(until),
    submission: losslessJson(compactRequest(files.policy, fields))}};
}
