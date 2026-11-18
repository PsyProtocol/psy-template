// Normal selected-order AMM route. No admission epoch or account-universe scan.
import assert from 'node:assert/strict';
import {scanBatch} from '../batching/v2/reader.mjs';
import {compactRequest} from '../batching/admission/reader.mjs';
import {losslessJson, parseLosslessJson} from '../amm/u124/client.mjs';
import {assertCoreRoute} from './coreMarketProfiles.mjs';

const CHECKPOINT_DOMAIN = 2n ** 32n;
// The approved window is derived from the witness mode, so a task kind and its
// mode must agree before any window is trusted.
const CORE_WITNESS_MODES = new Map([['batch_commit', 1n], ['batch_settle', 2n],
  ['batch_expire', 3n], ['batch_maintenance', 4n]]);

export function checkCoreSourceCheckpoint(task, core) {
  assert.ok(Number.isSafeInteger(task.minimumSourceCheckpoint) && task.minimumSourceCheckpoint > 0);
  assert.equal(typeof task.validUntilCheckpoint, 'string', 'canonical decimal checkpoint window required');
  // A uint32 checkpoint needs at most ten decimal digits. Refuse oversized
  // encodings before any BigInt parsing work is spent on them.
  assert.ok(task.validUntilCheckpoint.length <= 10, 'core window exceeds the checkpoint domain');
  assert.match(task.validUntilCheckpoint, /^[1-9][0-9]*$/, 'canonical decimal checkpoint window required');
  const until = BigInt(task.validUntilCheckpoint);
  assert.ok(until < CHECKPOINT_DOMAIN, 'core window exceeds the checkpoint domain');
  assert.ok(until >= BigInt(task.minimumSourceCheckpoint), 'core window precedes the approved state observation');
  assert.equal(typeof core?.checkpoint_id, 'bigint', 'lossless verified proof metadata required');
  assert.ok(core.checkpoint_id >= BigInt(task.minimumSourceCheckpoint), 'core proof predates approved state observation');
  assert.ok(core.checkpoint_id <= until, 'core proof exceeds approved window');
}

export async function scanCoreAmm(options, state, files) {
  assert.equal(options.kind, 'amm');
  return scanCoreMarket(options, state, files);
}

export async function scanCoreMarket(options, state, files) {
  assertCoreRoute(options);
  assert.equal(files.policy.version, 2);
  assert.equal(files.policy.market, options.kind);
  assert.equal(files.policy.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(files.policy.whole_market_completeness, false);
  assert.equal(files.policy.qualified_randomness, false);
  const result = await scanBatch(options, async () => state, files);
  const scope = {type: 'explicit-selected-orders-v1', globalCompleteness: false,
    discovery: 'explicit user hints; committed members are authoritative after freezing', proofVerified: false};
  if (!result.action) return {...result, scope};
  // The scan's own checkpoint is the approved observation. Re-reading the head
  // here could move forward or back and bind the window to state the selected
  // or frozen members were never read from.
  const checkpoint = result.checkpoint;
  assert.ok(Number.isSafeInteger(checkpoint) && checkpoint > 0 && checkpoint < 2 ** 32,
    'lossless core observation checkpoint required');
  const fields = parseLosslessJson(result.action.submission).software_defined_call.inputs;
  assert.ok(Array.isArray(fields) && fields.length > 0 && fields.every(v => typeof v === 'bigint'),
    'lossless core witness fields required');
  const mode = CORE_WITNESS_MODES.get(result.action.kind);
  assert.ok(mode !== undefined && fields[0] === mode, 'core task kind and witness mode differ');
  let until = checkpoint + 64;
  if (mode === 1n) until = Number(fields[3]);
  if (mode === 2n) {
    const offset = files.abi.contract.state.find(f => f.name === 'batch_expiry')?.offset;
    assert.ok(Number.isSafeInteger(offset));
    const expiry = await state.slot(options.vaultId, options.contractId, offset);
    assert.equal(typeof expiry, 'bigint', 'lossless frozen batch expiry required');
    // Bound the read value itself first: converting an out-of-domain expiry to
    // Number and then clamping would silently discard the corruption.
    assert.ok(expiry >= 0n && expiry < CHECKPOINT_DOMAIN, 'frozen batch expiry outside the checkpoint domain');
    until = Math.min(until, Number(expiry));
  }
  assert.ok(Number.isSafeInteger(until) && until >= checkpoint && until < 2 ** 32);
  return {...result, scope, action: {...result.action, profile: 'compact-v1',
    minimumSourceCheckpoint: checkpoint, validUntilCheckpoint: String(until),
    submission: losslessJson(compactRequest(files.policy, fields))}};
}
