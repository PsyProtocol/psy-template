import test from 'node:test';import assert from 'node:assert/strict';import {unsignedSessionFailure,unsignedPartialSettlementFailure} from './unsignedSessionFailure.mjs';
const make=()=>({failure:{ok:false,automaticRetry:false,broadcastMayHaveBeenAttempted:false,phase:'start-compact-session'},files:['failure.json'],taskId:'original',records:[{taskId:'original',status:'planned',task:{profile:'compact-v1',kind:'batch_maintenance',maintenanceOperation:'admit_entry'}}]});
test('known pre-session failure has no signed request, proof or send intent',()=>{assert.equal(unsignedSessionFailure(make()).maintenanceOperation,'admit_entry');});
test('partial signature, unknown send, completed proof or wrong phase cannot enter empty-epoch recovery',()=>{
 for(const file of ['request.json','preflight.json','intent.json']){const x=make();x.files.push(file);assert.throws(()=>unsignedSessionFailure(x));}
 for(const status of ['proved','broadcast-intent','broadcast-result','included']){const x=make();x.records.push({taskId:'original',status});assert.throws(()=>unsignedSessionFailure(x));}
 for(const patch of [{ok:true},{automaticRetry:true},{broadcastMayHaveBeenAttempted:true},{phase:'broadcast-compact-ups'}]){const x=make();Object.assign(x.failure,patch);assert.throws(()=>unsignedSessionFailure(x));}
 const x=make();x.records[0].task.maintenanceOperation='settle';assert.throws(()=>unsignedSessionFailure(x));
});
test('manual partial settlement EOF recovery binds pure-prover producer and rejects a complete proof or any send',()=>{
 const make=()=>{const x={failure:{ok:false,automaticRetry:false,broadcastMayHaveBeenAttempted:false,phase:'prove-compact-calls',reason:'Failed to parse JSON response: EOF while parsing a value at line 1 column 0'},files:['failure.json'],taskId:'settle',records:[{status:'planned',taskId:'settle',task:{profile:'compact-v1',kind:'batch_settle'}}],producer:{driverSha256:'driver',taskSha256:'task',policySha256:'policy',rpcConfigSha256:'network'}};x.expected={...x.producer};return x;};
 assert.equal(unsignedPartialSettlementFailure(make()).kind,'batch_settle');
 for(const file of ['request.json','prepared.json','preflight.json','intent.json']){const x=make();x.files.push(file);assert.throws(()=>unsignedPartialSettlementFailure(x));}
 for(const key of ['driverSha256','taskSha256','policySha256','rpcConfigSha256']){const x=make();x.producer[key]='different';assert.throws(()=>unsignedPartialSettlementFailure(x));}
 for(const status of ['proved','broadcast-intent','broadcast-result','included']){const x=make();x.records.push({status,taskId:'settle'});assert.throws(()=>unsignedPartialSettlementFailure(x));}
 for(const patch of [{broadcastMayHaveBeenAttempted:true},{phase:'start-compact-session'},{reason:'execution failed'},{reason:'HTTP 401'},{automaticRetry:true}]){const x=make();Object.assign(x.failure,patch);assert.throws(()=>unsignedPartialSettlementFailure(x));}
 const x=make();x.records[0].task.kind='batch_commit';assert.throws(()=>unsignedPartialSettlementFailure(x));
});
