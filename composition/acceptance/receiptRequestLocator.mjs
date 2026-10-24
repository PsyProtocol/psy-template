// Resolve report aliases to the original journal request. Never create or send
// a replacement request while independently checking historical receipts.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, realpathSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {parseLosslessJson} from '../../amm/u124/client.mjs';

const exact = p => parseLosslessJson(readFileSync(p, 'utf8'));
export function insideCase(base, path) {
  const root = realpathSync(base), target = realpathSync(path);
  assert.ok(target.startsWith(root+'/'), 'original request must stay in case');
  return target;
}
export function indexBroadcastIntents(base) {
  const index = new Map();
  function walk(dir) {
    for (const entry of readdirSync(dir, {withFileTypes:true})) {
      if (['.secrets','drivers'].includes(entry.name)) continue;
      assert.ok(!entry.isSymbolicLink(), 'receipt journal refuses symlinks');
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^\d+-broadcast-intent\.json$/.test(entry.name)) {
        const record = exact(path);
        assert.ok(typeof record.taskId === 'string' && record.taskId.length > 0);
        const candidates = index.get(record.taskId) ?? [];
        candidates.push({path, record});
        index.set(record.taskId, candidates);
      }
    }
  }
  walk(resolve(base));
  return index;
}
export function originalReceiptRequest(base, source, record, userId, index) {
  insideCase(base, source);
  if (record.preflight) return insideCase(base, join(dirname(source),'request.json'));
  assert.ok(typeof record.taskId === 'string');
  assert.ok(record.status === 'included' || record.result?.status === 'included',
    'only included journal or formal result can identify a request');
  const matches = index.get(record.taskId) ?? [];
  assert.equal(matches.length, 1, 'exactly one original broadcast intent required');
  const broadcast = matches[0].record;
  assert.equal(broadcast.status, 'broadcast-intent');
  if (record.task) assert.deepEqual(broadcast.task, record.task, 'full task binding');
  else {
    assert.equal(record.status, 'included', 'formal aliases require full task');
    assert.equal(realpathSync(dirname(matches[0].path)), realpathSync(dirname(source)),
      'legacy included receipt must share the original journal');
  }
  assert.equal(broadcast.scope?.vaultId, userId, 'original proof payer binding');
  assert.ok(broadcast.proof?.preparedDirectory);
  return insideCase(base, join(String(broadcast.proof.preparedDirectory),'request.json'));
}
