// Constructive model of the inspected read/set/read protocol. This is NOT
// execution of Node, its full planner, Redis, or the running remote service.
import test from 'node:test';import assert from 'node:assert/strict';
test('read-set-read checks alone permit proof/update version mismatch after the last check',()=>{
 const state={status:0,proof:null,updates:null,queue:[]},trace=[];
 const vacant=who=>{assert.equal(state.status,0);trace.push(who+':precheck');};
 const acquire=who=>{state.status=who;assert.equal(state.status,who);trace.push(who+':set/read');};
 const proof=who=>{state.proof=who;assert.equal(state.status,who);trace.push(who+':proof/final-read');};
 vacant('A');vacant('B');acquire('A');proof('A');acquire('B');proof('B');
 state.updates='A';state.queue.push({expectedVersion:'A',endLeaf:'A'});
 // Regular planner's data-header/version check would match A here, while
 // the common proof job slot has already been overwritten by B.
 assert.equal(state.queue[0].expectedVersion,state.updates);assert.notEqual(state.proof,state.queue[0].endLeaf);
 state.updates='B';state.queue.push({expectedVersion:'B',endLeaf:'B'});
 assert.equal(state.queue.length,2);assert.deepEqual(trace,['A:precheck','B:precheck','A:set/read','A:proof/final-read','B:set/read','B:proof/final-read']);
});
