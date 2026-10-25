import assert from 'node:assert/strict';
export function unsignedSessionFailure({failure,files,records,taskId}){
 assert.deepEqual([...files].sort(),['failure.json'],'partial signed/proof material needs separate review');
 assert.equal(failure.ok,false);assert.equal(failure.automaticRetry,false);assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.phase,'start-compact-session');
 const planned=records.findLast(r=>r.taskId===taskId&&r.status==='planned');assert.ok(planned);
 assert.equal(planned.task.profile,'compact-v1');assert.equal(planned.task.kind,'batch_maintenance');assert.equal(planned.task.maintenanceOperation,'admit_entry');
 assert.ok(!records.some(r=>r.taskId===taskId&&['proved','broadcast-intent','broadcast-result','included'].includes(r.status)),'original must be wholly unbroadcast');
 return planned.task;
}
// Separate manual recovery, deliberately NOT the automatic pre-session rule.
// The pinned serve-preflight child can read/prove but has no send action.
export function unsignedPartialSettlementFailure({failure,files,records,taskId,producer,expected}){
 assert.deepEqual([...files].sort(),['failure.json']);assert.equal(failure.ok,false);assert.equal(failure.automaticRetry,false);assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.phase,'prove-compact-calls');
 assert.equal(failure.reason,'Failed to parse JSON response: EOF while parsing a value at line 1 column 0');
 assert.equal(producer.driverSha256,expected.driverSha256);assert.equal(producer.taskSha256,expected.taskSha256);assert.equal(producer.policySha256,expected.policySha256);assert.equal(producer.rpcConfigSha256,expected.rpcConfigSha256);
 const planned=records.findLast(r=>r.taskId===taskId&&r.status==='planned');assert.ok(planned);assert.equal(planned.task.profile,'compact-v1');assert.equal(planned.task.kind,'batch_settle');
 assert.ok(!records.some(r=>r.taskId===taskId&&['proved','broadcast-intent','broadcast-result','included'].includes(r.status)));return planned.task;
}
