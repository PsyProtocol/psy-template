// Synthetic public-structure fixtures only, never proof acceptance.
import test from 'node:test';import assert from 'node:assert/strict';
import {auditMinimumRow} from './audit-minimum-evidence.mjs';
function row(){const scope=Array(41).fill(0n);scope[3]=1000n;scope[6]=100n;scope[8]=5n;const seed=[1n,2n,3n,4n],key=[11n,22n,33n,44n],fields=Array(80).fill(0n);fields[0]=7n;fields[73]=1000001000n;
 const state=n=>({built:BigInt(n),extracted:0n,queue:[5n,6n,7n,8n]});let before=state(0);const rows=Array.from({length:4},(_,i)=>{const after=state(i+1),r={scope,seed,extract:false,before,after};before=after;return r;});
 const plan={fields,registered_key:key,source:{scope},minimum:{seed,refund_only:false,current:rows[0].before,rows}},call=(method_name,inputs)=>({contract_id:1000n,method_name,inputs});
 const session={stack:Array(40).fill({}),actualCalls:[call('begin_order_page',[0n,0n,0n,0n,101n,...seed]),call('advance_minimum_stream',[...Array(8).fill(0n),4n,0n,5n,6n,7n,8n,0n]),call('account_executor_fee',[fields[73],...key]),{contract_id:0n,method_name:'burn',inputs:[fields[73]]}]};return {plan,session};}
test('audit binds the exact public minimum continuation and fee call',()=>{
 const d=row();assert.equal(auditMinimumRow(d.plan,d.session),true);
 for(const mutate of [d=>d.plan.minimum.rows[1].before={built:0n},d=>d.plan.minimum.rows[2].seed=[4n,3n,2n,1n],d=>d.plan.minimum.rows[0].extract=true,d=>d.session.actualCalls[1].inputs[8]=5n,d=>d.session.actualCalls[0].inputs[4]=102n,d=>d.plan.minimum.rows.pop(),d=>d.session.actualCalls.at(-2).inputs[0]+=1000n,d=>d.session.actualCalls.at(-2).contract_id=1001n]){const x=structuredClone(row());mutate(x);assert.throws(()=>auditMinimumRow(x.plan,x.session));}
});
test('grant claim and account use the same declared owner, key and fee',()=>{
 const {plan,session}=row();plan.fields[0]=13n;plan.fields[21]=1n;plan.fields[22]=100000000000n;plan.fields[23]=1n;plan.minimum=null;
 session.actualCalls[0]={contract_id:1000n,method_name:'apply_fee_grant',inputs:[plan.fields[21],plan.fields[22],...plan.registered_key,600n,1n]};session.actualCalls[1]={contract_id:0n,method_name:'claim',inputs:[600n]};assert.equal(auditMinimumRow(plan,session),true);
 for(const mutate of [s=>s.actualCalls[1].inputs[0]=601n,s=>s.actualCalls[0].inputs[7]=0n,s=>s.actualCalls[0].inputs[2]=1n]){const copy=structuredClone(session);mutate(copy);assert.throws(()=>auditMinimumRow(plan,copy));}
});
