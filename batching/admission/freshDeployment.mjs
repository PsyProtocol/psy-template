import assert from 'node:assert/strict';
const bounded=(n,max,label)=>{assert.ok(typeof n==='bigint'||Number.isSafeInteger(n),'unsafe '+label);const x=BigInt(n);assert.ok(x>=0n&&x<max,'invalid '+label);return x;};
// Content hashes need not uniquely identify a repeated deployment occurrence.
// Metadata equality alone cannot turn a historical receipt into a new deploy.
export function freshDeploymentReceipt(before,data){
 const checkpoint=bounded(before.checkpoint_id,2n**32n,'before checkpoint'),next=bounded(before.next_contract_id,2n**24n,'next contract ID'),included=bounded(data.included_checkpoint_id,2n**32n,'included checkpoint'),id=bounded(data.result.contract_id,2n**24n,'deployed contract ID');
 assert.ok(next>=5n&&id>=next,'historical deployment ID precedes this attempt allocation floor');
 assert.ok(included>checkpoint,'historical deployment receipt predates this attempt');
 return Number(id);
}
