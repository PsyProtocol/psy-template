import test from 'node:test';import assert from 'node:assert/strict';
import {ExecutionLimiter,ExecutionStopped,executeCycle,watchWorker,pause,executionExitCode} from './worker.mjs';
import {ReadUnavailable} from './readRetry.mjs';
import {runService} from './service.mjs';
const emptyJournal={reconcile:async()=>[],unresolved:async()=>[],execute:async()=>({status:'included'})};
test('unresolved broadcasts block scanning, proof and submission',async()=>{
 const result=await executeCycle({journal:{...emptyJournal,unresolved:async()=>[{taskId:'lost'}]},adapter:{scan:async()=>assert.fail('must not scan')}});
 assert.equal(result.status,'unresolved');assert.deepEqual(result.tasks,['lost']);
});
test('different vaults share bounded execution slots and stopped queued tasks never execute',async()=>{
 const limiter=new ExecutionLimiter(1),stop=new AbortController();let release,executed=0;
 const held=limiter.run(()=>new Promise(r=>release=r));while(!release)await Promise.resolve();
 const next=executeCycle({limiter,signal:stop.signal,journal:{...emptyJournal,execute:async()=>executed++},adapter:{scan:async()=>({checkpoint:1,action:{kind:'swap'}})}});
 await new Promise(r=>setImmediate(r));stop.abort();release();await held;
 assert.equal((await next).status,'stopped');assert.equal(executed,0);
});
test('queued cancellation completes before an active proof, preserves FIFO slots, and does not cancel active work',async()=>{
 const limiter=new ExecutionLimiter(1),stop=new AbortController();let release;const order=[];
 const active=limiter.run(()=>new Promise(r=>release=r),{signal:stop.signal});while(!release)await Promise.resolve();
 const pending=executeCycle({limiter,signal:stop.signal,journal:{...emptyJournal,execute:async()=>assert.fail('cancelled')},adapter:{scan:async()=>({action:{kind:'swap'}})}});
 await new Promise(r=>setImmediate(r));
 const next=limiter.run(async()=>order.push(1)),last=limiter.run(async()=>order.push(2));
 stop.abort();assert.equal((await pending).status,'stopped');assert.equal(limiter.active,1);assert.equal(limiter.queue.length,2);
 assert.deepEqual(order,[]);release();await Promise.all([active,next,last]);assert.deepEqual(order,[1,2]);assert.equal(limiter.active,0);
 await assert.rejects(limiter.run(()=>assert.fail('already stopped'),{signal:stop.signal}),ExecutionStopped);
 assert.equal(limiter.active,0);
});
test('a stop during reconciliation prevents a new scan while preserving recovered receipts',async()=>{
 const stop=new AbortController(),recovered=[{taskId:'old',result:{status:'included'}}];
 const result=await executeCycle({signal:stop.signal,journal:{...emptyJournal,reconcile:async()=>{stop.abort();return recovered;}},adapter:{scan:async()=>assert.fail('stopped')}});
 assert.equal(result.status,'stopped');assert.deepEqual(result.recovered,recovered);
});
test('transient startup reads retry with bounded backoff and stop interrupts waiting',async()=>{
 const stop=new AbortController(),delays=[];let attempts=0;
 await watchWorker({options:{users:[111],intervalMs:1000},signal:stop.signal,maxBackoffMs:3000,
  createAdapter:async()=>{if(++attempts<3)throw new ReadUnavailable('rpc down');return {scan:async()=>({checkpoint:7,action:null})};},
  createJournal:()=>emptyJournal,wait:async ms=>delays.push(ms),onStatus:x=>{if(x.status==='idle')stop.abort();}});
 assert.equal(attempts,3);assert.deepEqual(delays,[2000,3000,1000]);
 const other=new AbortController();const waiting=pause(60000,other.signal);other.abort();await waiting;
});
test('updated user hints are reloaded without replacing the public policy adapter',async()=>{
 const stop=new AbortController(),seen=[];let enrolled=0,factories=0;
 await watchWorker({options:{intervalMs:1000},signal:stop.signal,users:async()=>[++enrolled],wait:async()=>{},
  createAdapter:async options=>{factories++;return {scan:async()=>{seen.push([...options.users]);return {action:null};}};},
  createJournal:()=>emptyJournal,onStatus:x=>{if(x.status==='idle'&&seen.length===2)stop.abort();}});
 assert.deepEqual(seen,[[1],[2]]);assert.equal(factories,1);
});
test('fatal identity failure halts one vault while another keeps scanning',async()=>{
 const stop=new AbortController(),snapshots=[];
 const config={vaults:[{kind:'amm',vaultId:1,network:'test',users:[],intervalMs:1000},{kind:'bondingcurve',vaultId:2,network:'test',users:[],intervalMs:1000}],maxConcurrentExecutions:1,maxBackoffMs:2000};
 const result=await runService(config,{signal:stop.signal,emit:()=>{},statusSink:async x=>snapshots.push(x),
  adapterFactory:async o=>{if(o.vaultId===1)throw Error('fingerprint mismatch');return {scan:async()=>({checkpoint:9,action:null})};},
  journalFactory:()=>emptyJournal,wait:async()=>stop.abort()});
 assert.equal(result.vaults[0].status,'halted');assert.equal(result.vaults[1].status,'stopped');
 assert.ok(snapshots.some(x=>x.vaults.some(v=>v.status==='idle')));
});
test('service scan mode never opens journal or invokes mutation callbacks',async()=>{
 const result=await runService({vaults:[{kind:'orderbook',network:'test',vaultId:1,users:[]}],maxConcurrentExecutions:1},
  {mode:'scan',emit:()=>{},statusSink:async()=>{},journalFactory:()=>assert.fail('read-only'),adapterFactory:async()=>({scan:async()=>({action:{kind:'match'}}),submit:async()=>assert.fail('read-only')})});
 assert.equal(result.vaults[0].status,'scan');
});
test('service preserves market identity and actual included checkpoint separately from scan checkpoint',async()=>{
 const vaults=['amm','orderbook','bondingcurve'].map((kind,i)=>({kind,network:'test',vaultId:i+1,users:[]}));
 const result=await runService({vaults,maxConcurrentExecutions:2},{mode:'once',emit:()=>{},statusSink:async()=>{},
  adapterFactory:async()=>({scan:async()=>({checkpoint:90,action:{kind:'settle'}})}),
  journalFactory:()=>({...emptyJournal,execute:async()=>({status:'included',checkpoint:100})})});
 assert.deepEqual(result.vaults.map(x=>x.kind),['amm','orderbook','bondingcurve']);
 for(const v of result.vaults){assert.equal(v.checkpoint,100);assert.equal(v.observedCheckpoint,90);assert.equal(v.included,1);}
});
test('later idle scans and shutdown preserve the last inclusion while reporting the new observed checkpoint',async()=>{
 const stop=new AbortController(),snapshots=[];let scans=0;
 const result=await runService({vaults:[{kind:'amm',network:'test',vaultId:1,users:[],intervalMs:1000}],maxConcurrentExecutions:1},
  {signal:stop.signal,emit:()=>{},statusSink:async x=>snapshots.push(x),wait:async()=>{},
   adapterFactory:async()=>({scan:async()=>++scans===1?{checkpoint:90,action:{kind:'swap'}}:{checkpoint:120,action:null}}),
   journalFactory:()=>({...emptyJournal,execute:async()=>({status:'included',checkpoint:100,taskId:'swap',contentHash:'a'.repeat(64)}),
    reconcile:async()=>{if(scans===2)stop.abort();return [];}})});
 const status=result.vaults[0];assert.equal(status.status,'stopped');assert.equal(status.checkpoint,100);
 assert.equal(status.observedCheckpoint,120);assert.equal(status.lastIncluded.taskId,'swap');assert.equal(status.included,1);
 assert.equal(status.lastOutcome.status,'idle');assert.ok(snapshots.some(x=>x.vaults[0].status==='idle'));
});
test('shutdown preserves unresolved evidence and recovered inclusion metadata without counting it twice',async()=>{
 const stop=new AbortController();
 const result=await runService({vaults:[{kind:'orderbook',network:'test',vaultId:1,users:[],intervalMs:1000}],maxConcurrentExecutions:1},
  {signal:stop.signal,emit:()=>{},statusSink:async()=>{},wait:async()=>stop.abort(),
   adapterFactory:async()=>({scan:async()=>assert.fail('pending')}),
   journalFactory:()=>({...emptyJournal,reconcile:async()=>[{taskId:'old',result:{status:'included',checkpoint:200,contentHash:'b'.repeat(64)}}],unresolved:async()=>[{taskId:'pending'}]})});
 const status=result.vaults[0];assert.equal(status.status,'stopped');assert.equal(status.included,1);assert.equal(status.checkpoint,200);
 assert.equal(status.lastIncluded.taskId,'old');assert.equal(status.lastOutcome.status,'unresolved');assert.deepEqual(status.lastOutcome.tasks,['pending']);
});
test('a scan failure after receipt recovery keeps the confirmed count and checkpoint visible',async()=>{
 const result=await runService({vaults:[{kind:'amm',network:'test',vaultId:1,users:[]}],maxConcurrentExecutions:1},
  {mode:'once',emit:()=>{},statusSink:async()=>{},
   adapterFactory:async()=>({scan:async()=>{throw new ReadUnavailable('scan unavailable');}}),
   journalFactory:()=>({...emptyJournal,reconcile:async()=>[{taskId:'confirmed',result:{status:'included',checkpoint:300,contentHash:'c'.repeat(64)}}]})});
 const status=result.vaults[0];assert.equal(status.status,'read-unavailable');assert.equal(status.included,1);
 assert.equal(status.checkpoint,300);assert.equal(status.lastIncluded.taskId,'confirmed');assert.equal(status.lastOutcome.message,'scan unavailable');
});
test('missing fee sponsorship remains visible and never invokes financial execution',async()=>{
 const fundingRequest={payer:300,vault:100,purpose:2,amount:'1000100000'};
 const result=await executeCycle({journal:{...emptyJournal,execute:async()=>assert.fail('must not fund automatically')},adapter:{scan:async()=>({checkpoint:120,action:null,reason:'admission-gas-sponsorship-required',fundingRequest})}});
 assert.equal(result.status,'idle');assert.equal(result.reason,'admission-gas-sponsorship-required');assert.deepEqual(result.fundingRequest,fundingRequest);
});
test('service closes proof-only resources in scan, once and failed once modes',async()=>{
 for(const mode of ['scan','once','failed-once']){let closed=0;
  const result=await runService({vaults:[{kind:'amm',network:'test',vaultId:1,users:[]}],maxConcurrentExecutions:1},{mode:mode==='scan'?'scan':'once',emit:()=>{},statusSink:async()=>{},journalFactory:()=>emptyJournal,adapterFactory:async()=>({scan:async()=>{if(mode==='failed-once')throw Error('probe failure');return{checkpoint:1,action:null};},close:async()=>closed++})});
  assert.equal(closed,1);assert.equal(result.vaults[0].status,mode==='failed-once'?'halted':mode==='scan'?'scan':'idle');
 }
});

test('known no-send stops watcher without another financial cycle and failures exit nonzero',async()=>{let executes=0,closed=0;const statuses=[];await watchWorker({options:{users:[],intervalMs:1000},createAdapter:async()=>({scan:async()=>({action:{kind:'x'}}),close:async()=>closed++}),createJournal:()=>({...emptyJournal,execute:async()=>{executes++;return{status:'not-submitted',reason:'explicit driver no-send'}}}),onStatus:r=>statuses.push(r.status),wait:async()=>assert.fail('must not retry')});assert.equal(executes,1);assert.equal(closed,1);assert.equal(statuses.at(-1),'not-submitted');for(const status of ['not-submitted','unresolved','halted','busy','stale'])assert.equal(executionExitCode({status}),1);for(const status of ['included','already-included','idle'])assert.equal(executionExitCode({status}),0);});
