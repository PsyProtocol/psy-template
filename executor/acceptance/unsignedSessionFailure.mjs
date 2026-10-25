import assert from 'node:assert/strict';
export function unsignedSessionFailure({failure,files,records,taskId}){
 assert.deepEqual([...files].sort(),['failure.json'],'partial signed/proof material needs separate review');
 assert.equal(failure.ok,false);assert.equal(failure.automaticRetry,false);assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.phase,'start-compact-session');
 const planned=records.findLast(r=>r.taskId===taskId&&r.status==='planned');assert.ok(planned);
 assert.equal(planned.task.profile,'compact-v1');assert.equal(planned.task.kind,'batch_maintenance');assert.equal(planned.task.maintenanceOperation,'admit_entry');
 assert.ok(!records.some(r=>r.taskId===taskId&&['proved','broadcast-intent','broadcast-result','included'].includes(r.status)),'original must be wholly unbroadcast');
 return planned.task;
}
