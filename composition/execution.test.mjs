import test from 'node:test';import assert from 'node:assert/strict';
import {executionFixture} from './executionFixtures.mjs';import {scanComposition,bindAction,withActionFee} from './execution.mjs';
import {parseLosslessJson} from '../amm/u124/client.mjs';import {encodeDocument,decodeDocument} from './codec.mjs';
const F=1000100000n;
test('typed intent/plan documents retain metadata, exact U124 limbs and reject ambiguous unsafe numbers',()=>{
 const f=executionFixture(),round=decodeDocument(encodeDocument(f.model.intent));assert.deepEqual(round,f.model.intent);assert.equal(typeof round.terms.version,'number');assert.equal(typeof round.terms.input.amount,'bigint');
 assert.throws(()=>decodeDocument('{"x":9007199254740993}'));for(const text of ['{"$u":"01"}','{"$u":"1","extra":0}','{"$u":"-1"}','{"owner":1,"owner":2}','{"n":1e0}'])assert.throws(()=>decodeDocument(text));
});
test('funding and each hop derive exact canonical double-Felt action; Outbox alone never starts hop two',async()=>{
 const f=executionFixture();let r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'fund');bindAction(f.model,r.action);
 f.funded();r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'open-1');const order=parseLosslessJson(r.action.submission).contract_calls.find(c=>c.method_name==='open_swap');assert.deepEqual([...order.inputs],[300n,0n,17n,1n,...[f.model.plan.steps[0].output%(1n<<62n),f.model.plan.steps[0].output/(1n<<62n)],500n,1n]);
 f.field(100,'phase',3);f.field(100,'order_nonce',1);for(const[n,v]of Object.entries({kind:1,pool:300,nonce:1,side:0}))f.field(100,n,v,0,1000);f.field(300,'queue_phase',1,0,1000);f.field(300,'queue_epoch',2,0,1000);f.field(300,'queue_cutoff',120,0,1000);
 r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'consent-1');f.field(100,'consent_sent',1);r=await scanComposition(f.model,f.state);assert.equal(r.action,null);assert.equal(r.reason,'awaiting-base-market-executor');
 f.field(300,'consumed',1,100,1000);f.put(300,43,33554453+4*100,23n);r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'success-1');assert.equal(parseLosslessJson(r.action.terms).amount,23n);assert.ok(!r.action.operation.startsWith('open-2'));
 // Only included controller collection advances phase 4; quotes/outboxes do not.
 f.field(100,'phase',4);f.wide(100,'middle',23n);r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'open-2');assert.equal(parseLosslessJson(r.action.terms).amount,23n);
});
test('cancelled consent stays locked even before admission until terminal/new epoch; recovery returns current asset',async()=>{
 const f=executionFixture();f.funded();f.field(100,'phase',3);f.field(100,'order_nonce',1);f.field(200,'request_cancelled',1);
 for(const[n,v]of Object.entries({kind:1,pool:300,nonce:1,side:0,admission_epoch:2,admission_nonce:1}))f.field(100,n,v,0,1000);f.field(300,'queue_epoch',2,0,1000);f.field(300,'queue_phase',1,0,1000);
 let r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'cancel-1');f.field(100,'cancel_sent',1);r=await scanComposition(f.model,f.state);assert.equal(r.action,null);assert.equal(r.reason,'accepted-order-awaiting-market-terminal');
 f.field(300,'queue_phase',3,0,1000);r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'recover-1');
 f.field(100,'phase',4);f.wide(100,'middle',99n);r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'return-middle');assert.equal(parseLosslessJson(r.action.terms).amount,99n);
 const corrected=withActionFee(f.model,r.action,1000009000n);bindAction(f.model,corrected);assert.equal(parseLosslessJson(corrected.terms).nativeRefund,19n*F-1000009000n);
});
test('wrong request key, signed amounts, controller owner and unexpected native residue fail closed',async()=>{
 for(const mutate of [f=>f.field(200,'request_key',0,0),f=>f.wide(200,'request_input',2n),f=>f.field(200,'request_budget',21n*F)]){const f=executionFixture();mutate(f);await assert.rejects(scanComposition(f.model,f.state));}
 for(const mutate of [f=>f.field(100,'owner',201),f=>f.put(100,0,0,1)]){const f=executionFixture();f.funded();mutate(f);await assert.rejects(scanComposition(f.model,f.state));}
 const f=executionFixture();const task=(await scanComposition(f.model,f.state)).action;
 for(const mutate of [t=>t.intentId='b'.repeat(64),t=>t.registryHash='b'.repeat(64),t=>t.submission=t.submission.replace('begin_funding','forbidden'),t=>t.terms='{"owner":201}']){const bad=structuredClone(task);mutate(bad);assert.throws(()=>bindAction(f.model,bad));}
});
test('second-hop failure returns the claimed intermediate asset, never pretends to undo hop one',async()=>{
 const f=executionFixture();f.funded();f.field(100,'phase',5);f.field(100,'order_nonce',1);f.wide(100,'middle',77n);f.put(100,42,0,0);f.put(100,42,1,0);
 for(const[n,v]of Object.entries({kind:1,pool:400,nonce:1,side:1}))f.field(100,n,v,0,1001);
 f.field(400,'consumed',1,100,1001);f.put(400,43,33554453+4*100,77);f.put(400,0,3+2*100,1000100000n);
 let r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'refund-2');assert.equal(parseLosslessJson(r.action.terms).amount,77n);
 // Only the separate confirmed claim/record transition can propose return.
 f.field(100,'phase',7);f.field(100,'return_asset',43);f.wide(100,'return_amount',77n);f.put(100,43,0,77n);
 r=await scanComposition(f.model,f.state);assert.equal(r.action.operation,'return-middle');assert.equal(parseLosslessJson(r.action.terms).amount,77n);assert.ok(!r.atomic);
});
