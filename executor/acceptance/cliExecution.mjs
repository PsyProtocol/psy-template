import assert from 'node:assert/strict';
import{assertSameAction}from'../taskIntent.mjs';
// A separately launched production CLI must execute exactly the reviewed action.
// Its fresh scan may choose a newer local send window, never different calls.
export function selectedCliTask(records,expected){
 const plans=records.filter(x=>x.status==='planned');assert.equal(plans.length,1,'CLI must plan exactly one task');
 assertSameAction(plans[0].task,expected);
 assert.ok(records.some(x=>x.status==='broadcast-intent'&&x.taskId===plans[0].taskId),'CLI did not reach durable broadcast intent');
 assert.ok(records.filter(x=>x.status==='planned'||x.status==='proved'||x.status==='broadcast-intent').every(x=>x.taskId===plans[0].taskId),'CLI planned unrelated task');
 return plans[0];
}
