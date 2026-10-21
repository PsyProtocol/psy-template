import test from 'node:test';import assert from 'node:assert/strict';
import {runRecoveryRounds} from './recoveryRounds.mjs';
test('restarting after completed early rounds still executes the unreturned NFT before completion',async()=>{
 const history=new Set([0,1,2]),seen=[];let returned=false;
 await runRecoveryRounds({maxRounds:6,scanRound:async round=>{seen.push(round);return {work:history.has(round)||returned?[]:['return-original-nft']};},executeRound:async(batch,round)=>{assert.equal(round,3);assert.deepEqual(batch.work,['return-original-nft']);returned=true;},isComplete:()=>returned});
 assert.deepEqual(seen,[0,1,2,3,4]);assert.equal(returned,true);
 await runRecoveryRounds({maxRounds:1,scanRound:async()=>({work:[]}),executeRound:async()=>assert.fail('must not repeat a completed return'),isComplete:()=>returned});
});
test('unknown execution and exhausted nonterminal rounds cannot authorize claims',async()=>{
 let calls=0;await assert.rejects(()=>runRecoveryRounds({maxRounds:4,scanRound:async()=>({work:['pending']}),executeRound:async()=>{calls++;throw Error('unknown send');},isComplete:()=>false}),/unknown send/);assert.equal(calls,1);
 await assert.rejects(()=>runRecoveryRounds({maxRounds:2,scanRound:async()=>({work:[]}),executeRound:async()=>assert.fail(),isComplete:()=>false}),/bound exhausted/);
});
