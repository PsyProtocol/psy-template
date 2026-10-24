import test from'node:test';import assert from'node:assert/strict';import{proposeIntakeWindow}from'./intakeWindow.mjs';
const fixture=()=>({checkpoint:1000,queueEpoch:3,queuePhase:3,batchPhase:3,batchReady:1,members:[{owner:1092800,nonce:'1'}],observedCycleCheckpoints:50,observedMembers:1,intentExpiry:2000n});
test('observed fifty-checkpoint cycle selects ninety-six with explicit setup and safety budget',()=>{const x=fixture(),r=proposeIntakeWindow(x);assert.equal(r.lead,96);assert.deepEqual(r.plan,{version:1,epoch:4,cutoff:1096,members:x.members});assert.equal(r.memberCapacity,4);assert.notEqual(r.plan.members[0],x.members[0]);});
test('cannot alter opened or frozen queues, exceed capacity/window, drop members or overrun expiry',()=>{
 for(const patch of[{observedMembers:4},{queuePhase:1},{queuePhase:2},{batchPhase:1},{batchReady:0},{observedCycleCheckpoints:100},{intentExpiry:1095n},{checkpoint:2**32-64},{members:Array.from({length:5},(_,i)=>({owner:i+1,nonce:'1'}))},{members:[{owner:1,nonce:'1'},{owner:1,nonce:'2'}]}])assert.throws(()=>proposeIntakeWindow({...fixture(),...patch}));
});
