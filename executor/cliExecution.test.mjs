import test from 'node:test';import assert from 'node:assert/strict';import{selectedCliTask}from'./acceptance/cliExecution.mjs';
const task={kind:'batch_maintenance',maintenanceOperation:'start_epoch',submission:'fixed complete calls',validUntilCheckpoint:'100'};
const rows=(t=task)=>[{status:'planned',taskId:'id',task:t},{status:'broadcast-intent',taskId:'id'}];
test('production CLI action binds exact semantic task and its fresh window',()=>assert.equal(selectedCliTask(rows({...task,validUntilCheckpoint:'102'}),task).taskId,'id'));
test('CLI cannot substitute calls or weaken the window',()=>{assert.throws(()=>selectedCliTask(rows({...task,submission:'other'}),task));assert.throws(()=>selectedCliTask(rows({...task,validUntilCheckpoint:'99'}),task));});
test('CLI incomplete or multiple planning fails closed',()=>{assert.throws(()=>selectedCliTask(rows().slice(0,1),task));assert.throws(()=>selectedCliTask([...rows(),rows()[0]],task));});
import{assertSameAction}from'./taskIntent.mjs';
test('intent pin rejects idle, changed epochs and absent windows before proving',()=>{assert.throws(()=>assertSameAction(null,task));assert.throws(()=>assertSameAction({...task,epoch:2},task));assert.throws(()=>assertSameAction({...task,validUntilCheckpoint:undefined},task));});
