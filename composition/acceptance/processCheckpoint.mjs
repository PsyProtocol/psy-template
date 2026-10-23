// QA process lifecycle checkpoints only. Never restart an unknown financial
// broadcast or infer inclusion from process exit/acknowledgment alone.
import assert from 'node:assert/strict';
import {includedOperation} from './operationRecovery.mjs';
export const PLANNED_RESTART = 73;
export function restartCheckpoint({pid, configSha256, intentId, fund, opened, unresolved, resourceId}) {
  assert.equal(unresolved, 0, 'unknown broadcast forbids a planned restart continuation');
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.match(configSha256, /^[0-9a-f]{64}$/);
  assert.match(resourceId, /^[0-9a-f-]{36}$/);
  for (const [r, operation] of [[fund,'fund'], [opened,'open-1']]) {
    assert.equal(r.result.status, 'included');
    assert.equal(r.task.intentId, intentId);
    assert.equal(r.task.operation, operation);
    assert.equal(r.adapterInstanceId, resourceId, 'warm continuation must be observed, never assumed');
    assert.equal(r.parentPid, pid);
    assert.match(r.taskId, /^[0-9a-f]{64}$/);
  }
  return {status:'included-checkpoint', pid, configSha256, intentId,
    resourceId, fundTaskId:fund.taskId, openTaskId:opened.taskId, unresolved:0,
    scope:'planned real worker exit only after exact fund/open receipts, before any market sponsorship; no financial retry or physical power-loss claim'};
}
export function verifyRestart(point, {exitCode, oldPid, configSha256, records, unresolved}) {
  assert.equal(exitCode, PLANNED_RESTART, 'other failures never trigger a supervisor retry');
  assert.equal(point.status, 'included-checkpoint');
  assert.equal(point.pid, oldPid, 'checkpoint must belong to the exact exited worker');
  assert.equal(point.configSha256, configSha256, 'route identity changed across worker exit');
  assert.equal(point.unresolved, 0);
  assert.equal(unresolved, 0, 'unresolved original broadcast forbids another worker');
  for (const [op, id] of [['fund',point.fundTaskId], ['open-1',point.openTaskId]]) {
    const original = includedOperation(records, point.intentId, op);
    assert.ok(original, 'original included identity missing');
    assert.equal(original.taskId, id);
    assert.equal(original.result.status, 'included');
  }
}
