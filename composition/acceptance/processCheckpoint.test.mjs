import test from 'node:test';import assert from 'node:assert/strict';
import {restartCheckpoint, verifyRestart, PLANNED_RESTART} from './processCheckpoint.mjs';
const hash='a'.repeat(64), id='12345678-1234-1234-1234-123456789abc';
function example() {
 const row=(op, taskId)=>({result:{status:'included'},parentPid:8,adapterInstanceId:id,
   taskId,task:{operation:op,intentId:'intent'}});
 const fund=row('fund','1'.repeat(64)),opened=row('open-1','2'.repeat(64));
 const point=restartCheckpoint({pid:8,configSha256:hash,intentId:'intent',fund,opened,unresolved:0,resourceId:id});
 const records=[fund,opened].flatMap(r=>[{status:'broadcast-intent',taskId:r.taskId,task:r.task},
   {status:'included',taskId:r.taskId,result:r.result}]);
 return {point,records,fund,opened};
}
test('only a known included exact worker checkpoint permits one lifecycle continuation',()=>{
 const {point,records}=example(),args={exitCode:PLANNED_RESTART,oldPid:8,configSha256:hash,records,unresolved:0};
 verifyRestart(point,args);
 for(const patch of [{exitCode:1},{oldPid:9},{configSha256:'b'.repeat(64)},{unresolved:1},{records:records.slice(0,2)}]) {
   assert.throws(()=>verifyRestart(point,{...args,...patch}));
 }
});
test('unknown funding, another intent, resource or process cannot become a restart checkpoint',()=>{
 const {fund,opened}=example(),args={pid:8,configSha256:hash,intentId:'intent',fund,opened,unresolved:0,resourceId:id};
 for(const patch of [{unresolved:1},{opened:{...opened,result:{status:'unresolved'}}},
   {opened:{...opened,adapterInstanceId:'other'}},{opened:{...opened,parentPid:9}},
   {opened:{...opened,task:{...opened.task,intentId:'other'}}}]) {
   assert.throws(()=>restartCheckpoint({...args,...patch}));
 }
});
