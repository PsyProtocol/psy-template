import test from 'node:test';import assert from 'node:assert/strict';import {unsignedSessionFailure} from './unsignedSessionFailure.mjs';
const make=()=>({failure:{ok:false,automaticRetry:false,broadcastMayHaveBeenAttempted:false,phase:'start-compact-session'},files:['failure.json'],taskId:'original',records:[{taskId:'original',status:'planned',task:{profile:'compact-v1',kind:'batch_maintenance',maintenanceOperation:'admit_entry'}}]});
test('known pre-session failure has no signed request, proof or send intent',()=>{assert.equal(unsignedSessionFailure(make()).maintenanceOperation,'admit_entry');});
test('partial signature, unknown send, completed proof or wrong phase cannot enter empty-epoch recovery',()=>{
 for(const file of ['request.json','preflight.json','intent.json']){const x=make();x.files.push(file);assert.throws(()=>unsignedSessionFailure(x));}
 for(const status of ['proved','broadcast-intent','broadcast-result','included']){const x=make();x.records.push({taskId:'original',status});assert.throws(()=>unsignedSessionFailure(x));}
 for(const patch of [{ok:true},{automaticRetry:true},{broadcastMayHaveBeenAttempted:true},{phase:'broadcast-compact-ups'}]){const x=make();Object.assign(x.failure,patch);assert.throws(()=>unsignedSessionFailure(x));}
 const x=make();x.records[0].task.maintenanceOperation='settle';assert.throws(()=>unsignedSessionFailure(x));
});
