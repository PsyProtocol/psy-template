import assert from 'node:assert/strict';
// Restrict only this operation's retry. Later commit/settlement must still be
// able to generate their own fresh proofs and prepare their own submissions.
export function exactOperationReuse(adapter,task,proof){
 const original=structuredClone(task),pinned=structuredClone(proof),prove=adapter.prove,prepare=adapter.prepareSubmission;
 const sameOperation=next=>next.kind===original.kind&&next.maintenanceOperation===original.maintenanceOperation;
 adapter.prove=async next=>{if(sameOperation(next))throw Error('exact operation proof no longer reusable; no implicit reproof');return prove(next);};
 adapter.prepareSubmission=async(next,p)=>{
  if(sameOperation(next)){assert.deepEqual(next,original);assert.equal(p.manifestSha256,pinned.manifestSha256);assert.equal(p.preparedDirectory,pinned.preparedDirectory);assert.equal(p.driverSha256,pinned.driverSha256);}
  return prepare(next,p);
 };
}
