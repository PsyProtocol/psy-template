import test from 'node:test';
import assert from 'node:assert/strict';
import {checkpointHeads} from './checkpointHeads.mjs';
import {ReadUnavailable} from './readRetry.mjs';
const realms=[{rpc_url:['r0']},{rpc_url:['r1']}];
test('exhausted head transport discards siblings and drains before fresh whole-set read',async()=>{
 let active=0,firstFinished=false;const calls=[],events=[];
 const heads=await checkpointHeads(realms,async(url,method,params)=>{
  assert.equal(method,'psy_get_latest_l2_block_state');assert.deepEqual(params,{});
  calls.push(url);const n=calls.filter(x=>x===url).length;active++;
  try{if(n===2)assert.equal(firstFinished,true);if(n===1&&url==='r0')throw new ReadUnavailable('bounded timeout');await new Promise(r=>setTimeout(r,5));if(n===1)firstFinished=true;return{checkpoint_id:n===1?10:20};}
  finally{active--;}
 },{onRecovery:r=>{assert.equal(active,0);events.push(r);}});
 assert.deepEqual(heads,[{checkpoint_id:20},{checkpoint_id:20}]);assert.equal(calls.length,4);assert.equal(events.length,1);assert.equal(active,0);
});
test('persistent outage is bounded to two head sets and no logical/auth/decode failure retries',async()=>{
 let calls=0;await assert.rejects(checkpointHeads(realms,async()=>{calls++;throw new ReadUnavailable('timeout');}),ReadUnavailable);assert.equal(calls,4);
 for(const error of [Error('identity mismatch'),new SyntaxError('malformed JSON'),Object.assign(Error('denied'),{status:403})]){
  calls=0;await assert.rejects(checkpointHeads(realms,async()=>{calls++;throw error;}),e=>e===error);assert.equal(calls,2);
 }
});
test('normal reads are not repeated and failed telemetry cannot change successful recovery',async()=>{
 let calls=0;assert.equal((await checkpointHeads(realms,async()=>{calls++;return{checkpoint_id:1};})).length,2);assert.equal(calls,2);
 calls=0;const heads=await checkpointHeads(realms,async()=>{if(++calls<=2)throw new ReadUnavailable('timeout');return{checkpoint_id:2};},{onRecovery:()=>{throw Error('disk full');}});assert.equal(calls,4);assert.deepEqual(heads,[{checkpoint_id:2},{checkpoint_id:2}]);
});
