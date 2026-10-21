import assert from 'node:assert/strict';
// Explicit operator command. A task file is only a selector of an existing
// durable proof; it never introduces a new task or establishes non-submission.
export async function resumeKnownTask({task,adapter,journal}){
 const records=await journal.records(),text=JSON.stringify(task),planned=records.filter(r=>r.status==='planned'&&JSON.stringify(r.task)===text);
 assert.ok(planned.length,'resume requires exact previously planned task');const id=planned.at(-1).taskId;
 assert.ok(records.some(r=>r.taskId===id&&r.status==='proved'),'resume requires previously saved proof');
 const recovered=await journal.reconcile(adapter.reconcile);
 const pending=await journal.unresolved();assert.equal(pending.length,0,'unknown transmission blocks explicit resume; reconcile first');
 return{...await journal.execute({task,...adapter,prove:async()=>{throw Error('saved proof cannot be safely reused; explicit resume never re-proves');}}),recovered,explicitResume:true};
}
