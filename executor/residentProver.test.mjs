import test from 'node:test';import assert from 'node:assert/strict';import{EventEmitter}from'node:events';import{PassThrough,Writable}from'node:stream';
import{residentProver}from'./residentProver.mjs';
function fixture(behavior){let builds=0,requests=0,child;const spawnProcess=()=>{builds++;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('exit',1));child.stdin=new Writable({write(b,_e,done){requests++;behavior(child,JSON.parse(String(b)),requests);done();},final(done){queueMicrotask(()=>child.emit('exit',0));done();}});queueMicrotask(()=>child.stdout.write('PSY_COMPACT_SERVER '+JSON.stringify({ready:true,keyConstructionMs:1,sessionConstructionMs:50})+'\n'));return child;};return{prover:residentProver('sealed','policy','config',{spawnProcess,timeout:500}),get builds(){return builds;},get requests(){return requests;}};}
const args=out=>['preflight','policy','config','calls','guard',out];
test('resource warmup waits for ready, submits no job, and shares the subsequent proof child',async()=>{
 const x=fixture((c,j)=>queueMicrotask(()=>c.stdout.write('PSY_COMPACT_SERVER '+JSON.stringify({id:j.id,ok:true})+'\n')));
 try{const warm=await x.prover.warm();assert.equal(warm.residentStartup.sessionConstructionMs,50);assert.equal(x.requests,0);assert.equal(x.builds,1);await x.prover.prove(args('after-warm'));assert.equal(x.requests,1);assert.equal(x.builds,1);await x.prover.warm();assert.equal(x.requests,1);}finally{await x.prover.close();}
 await assert.rejects(x.prover.warm(),/closed/);
});
test('warmup excludes overlapping proof jobs and child exit never triggers restart',async()=>{
 let child,builds=0,requests=0;
 const p=residentProver('sealed','policy','config',{spawnProcess:()=>{builds++;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(_b,_e,done){requests++;done();}});child.kill=()=>{queueMicrotask(()=>child.emit('exit',1));return true;};return child;}});
 const warming=p.warm();await assert.rejects(p.prove(args('overlap')),/already running/);await assert.rejects(p.warm(),/already running/);child.emit('exit',1);await assert.rejects(warming,/exited/);await assert.rejects(p.warm(),/closed/);assert.equal(builds,1);assert.equal(requests,0);await p.close();
});
test('one pinned proof child serves sequential requests and reports warm circuit startup',async()=>{const x=fixture((c,j)=>queueMicrotask(()=>c.stdout.write('PSY_COMPACT_SERVER '+JSON.stringify({id:j.id,ok:true})+'\n')));try{for(const out of ['one','two']){const r=await x.prover.prove(args(out));assert.equal(r.residentStartup.sessionConstructionMs,50);}assert.equal(x.builds,1);assert.equal(x.requests,2);}finally{await x.prover.close();}await assert.rejects(()=>x.prover.prove(args('three')),/closed/);});
test('resident never accepts submit, changed policy, changed config or overlapping requests',async()=>{const x=fixture(()=>{});try{await assert.rejects(()=>x.prover.prove(['submit',...args('bad').slice(1)]),/only pinned/);await assert.rejects(()=>x.prover.prove(['preflight','other',...args('bad').slice(2)]),/only pinned/);const pending=x.prover.prove(args('one'));await assert.rejects(()=>x.prover.prove(args('two')),/already running/);await x.prover.close();await assert.rejects(()=>pending,/closed/);}finally{await x.prover.close();}});
test('unmatched response or child exit fails without automatic restart',async()=>{for(const mismatch of [true,false]){const x=fixture((c,j)=>queueMicrotask(()=>mismatch?c.stdout.write('PSY_COMPACT_SERVER '+JSON.stringify({id:j.id+'x',ok:true})+'\n'):c.emit('exit',1)));await assert.rejects(()=>x.prover.prove(args('one')),mismatch?/identity mismatch/:/exited/);await assert.rejects(()=>x.prover.prove(args('two')),/closed/);assert.equal(x.builds,1);await x.prover.close();}});
test('close waits for actual process exit, escalates a stuck child, and never restarts it',async()=>{
 for(const stuck of [false,true]){
  const signals=[];let child;const p=residentProver('sealed','policy','config',{stopTimeout:5,spawnProcess:()=>{
   child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=s=>{signals.push(s);if(!stuck&&s==='SIGTERM')queueMicrotask(()=>child.emit('exit',null,s));return true;};
   child.stdin=new Writable({write(b,_e,done){const j=JSON.parse(String(b));queueMicrotask(()=>child.stdout.write('PSY_COMPACT_SERVER '+JSON.stringify({id:j.id,ok:true})+'\n'));done();}});
   return child;
  }});
  await p.prove(args('one'));
  if(stuck){await assert.rejects(p.close(),/exit unconfirmed/);assert.deepEqual(signals,['SIGTERM','SIGKILL']);}
  else{await p.close();assert.deepEqual(signals,['SIGTERM']);}
  await assert.rejects(()=>p.prove(args('two')),/closed/);
 }
});
test('non-authorizing quote and full preflight share one child; actions remain distinct',async()=>{const actions=[];const x=fixture((c,j)=>{actions.push(j.action??'preflight');queueMicrotask(()=>c.stdout.write('PSY_COMPACT_SERVER '+JSON.stringify({id:j.id,ok:true})+'\n'));});try{await x.prover.quote(['quote',...args('quote-out').slice(1)]);await x.prover.prove(args('proof-out'));assert.deepEqual(actions,['quote','preflight']);assert.equal(x.builds,1);await assert.rejects(()=>x.prover.quote(args('bad')),/only pinned/);await assert.rejects(()=>x.prover.prove(['quote',...args('bad').slice(1)]),/only pinned/);}finally{await x.prover.close();}});
