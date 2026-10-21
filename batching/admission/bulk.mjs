// Explicit new-key variant. Never alter the legacy policy or registered key.
import assert from'node:assert/strict';import{witness}from'../v2/policy.mjs';import{compactRequest}from'./reader.mjs';
export const BULK_ADMISSION='admit_entries_4';
export function withBulkAdmission(policy){
 const p=structuredClone(policy);assert.equal(p.version,2);assert.ok(p.operations.every((op,i)=>op.branch===i+1),'canonical operation selectors');assert.ok(!p.operations.some(o=>o.name===BULK_ADMISSION),'bulk operation already present');const single=p.operations.find(o=>o.name==='admit_entry');assert.ok(single?.maintenance);const admit=single.calls.find(c=>c.method_name==='admit_entry');assert.ok(admit&&admit.inputs.length===2);
 const calls=[...single.calls.slice(0,2),...Array.from({length:4},(_,i)=>({...admit,inputs:[{witness:2+2*i},{witness:3+2*i}]}))];assert.deepEqual(calls.slice(0,2).map(c=>c.method_name),['fund_gas','simple_claim']);while(calls.length<9)calls.push(p.noop);
 const op={branch:p.operations.length+1,name:BULK_ADMISSION,maintenance:true,calls};p.operations.push(op);p.branches.push({name:op.name,calls});assert.ok(p.operations.length<=32,'bounded operation selector');return p;
}
export function bulkAdmissionRequest(policy,{payer,members}){
 assert.ok(typeof payer==='bigint'&&payer>0n&&payer<16777216n);assert.ok(Array.isArray(members)&&members.length===4);let previous=0n;
 const exact=v=>{if(typeof v==='number')assert.ok(Number.isSafeInteger(v),'unsafe member integer');else if(typeof v==='string')assert.match(v,/^[1-9][0-9]*$/);else assert.equal(typeof v,'bigint');return BigInt(v);};
 const row=Array(13).fill(0n),op=policy.operations.find(o=>o.name===BULK_ADMISSION&&o.maintenance);assert.ok(op,'explicit bulk policy required');row[0]=BigInt(op.branch);row[1]=payer;
 for(const[i,m]of members.entries()){const owner=exact(m.owner),nonce=exact(m.nonce);assert.ok(owner>previous&&owner<16777216n&&owner!==payer&&nonce>0n&&nonce<2n**62n,'canonical authenticated members');row[2+2*i]=owner;row[3+2*i]=nonce;previous=owner;}
 return compactRequest(policy,witness({mode:4,operations:[row],burn:0n}));
}
