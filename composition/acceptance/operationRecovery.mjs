// Recover only an exact included operation in the same committed intent. This
// is journal bookkeeping, not a substitute for adapter receipt verification.
import assert from'node:assert/strict';
export function includedOperation(records,intentId,operation){const broadcasts=new Map(records.filter(r=>r.status==='broadcast-intent'&&r.task?.intentId===intentId&&r.task?.operation===operation).map(r=>[r.taskId,r]));const matches=records.filter(r=>r.status==='included'&&broadcasts.has(r.taskId));assert.ok(new Set(matches.map(r=>r.taskId)).size<=1,'multiple included identities for one composition operation require review');const row=matches.at(-1);return row?{...row,task:broadcasts.get(row.taskId).task}:null;}
