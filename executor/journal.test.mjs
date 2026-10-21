import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,mkdir,writeFile,unlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';import {ExecutionJournal,StaleTask} from './journal.mjs';
const receipt={status:'included',userId:123,contentHash:'a'.repeat(64),checkpoint:456};
async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'psy-executor-'));try{const make=()=>new ExecutionJournal({directory,network:'staging',vaultId:123,fingerprint:'b'.repeat(64)});await fn(make);}finally{await rm(directory,{recursive:true,force:true});}}
test('two operators serialize the same vault',()=>fixture(async make=>{let release;const held=make().locked(()=>new Promise(r=>release=r));while(!release)await new Promise(r=>setTimeout(r,1));await assert.rejects(make().locked(async()=>{}),/owns this vault/);release();await held;}));
test('included receipt prevents replay; a broadcast error can still be included',()=>fixture(async make=>{let count=0;const args={task:{nonce:1},prove:async()=>({}),isCurrent:async()=>true,submit:async()=>{count++;throw Error('deterministic leaf returned after response loss');},reconcile:async()=>receipt};assert.equal((await make().execute(args)).status,'included');assert.equal((await make().execute(args)).status,'already-included');assert.equal(count,1);}));
test('unknown broadcast blocks all following mutations until exact receipt recovery',()=>fixture(async make=>{const args={task:{nonce:1},prove:async()=>({}),isCurrent:async()=>true,submit:async()=>{throw Error('connection lost');},reconcile:async()=>({status:'unresolved'})};assert.equal((await make().execute(args)).status,'unresolved');await assert.rejects(make().execute({...args,task:{nonce:2}}),/unresolved broadcast/);await make().reconcile(async()=>receipt);assert.equal((await make().execute(args)).status,'already-included');}));
test('stale task after proving never reaches a broadcast intent',()=>fixture(async make=>{let checks=0;await assert.rejects(make().execute({task:{nonce:1},prove:async()=>({}),isCurrent:async()=>++checks===1,submit:async()=>{throw Error('must not execute');},reconcile:async()=>receipt}),StaleTask);assert.deepEqual(await make().unresolved(),[]);}));
test('restart after a failed pre-submit read reuses preflight and broadcasts once',()=>fixture(async make=>{let proofCount=0,submitCount=0,reads=0;
 const args={task:{nonce:1},prove:async()=>{proofCount++;return {file:'public-calls.json'};},isCurrent:async()=>{if(++reads===2)throw new TypeError('read unavailable');return true;},submit:async()=>{submitCount++;return {};},reconcile:async()=>receipt};
 await assert.rejects(make().execute(args),/read unavailable/);assert.deepEqual(await make().unresolved(),[]);
 assert.equal((await make().execute(args)).status,'included');assert.equal(proofCount,1);assert.equal(submitCount,1);
}));
test('a real process exit inside the vault lock is recovered by the next executor',()=>fixture(async make=>{
 const j=make(),module=new URL('./journal.mjs',import.meta.url).href;
 const script=`import {ExecutionJournal} from ${JSON.stringify(module)};const j=new ExecutionJournal(${JSON.stringify({directory:join(j.directory,'..'),...j.scope})});await j.locked(()=>process.exit(7));`;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:'pipe'});
 let stderr='';child.stderr.on('data',x=>stderr+=x);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,7,stderr);
 let called=0;await make().locked(async()=>called++);assert.equal(called,1);
}));
test('changed policy cannot consume another fingerprint journal or bypass an unresolved broadcast',()=>fixture(async make=>{
 const j=make();await j.execute({task:{nonce:1},prove:async()=>({}),isCurrent:async()=>true,submit:async()=>({}),reconcile:async()=>({status:'unresolved'})});
 const other=new ExecutionJournal({directory:join(j.directory,'..'),...j.scope,fingerprint:'c'.repeat(64)});
 await assert.rejects(other.reconcile(async()=>receipt),/scope changed/);
}));
test('missing cached preflight is regenerated before broadcast intent',()=>fixture(async make=>{
 let proofs=0,reads=0,submits=0;
 const args={task:{nonce:1},prove:async()=>({file:'calls-'+ ++proofs}),validateProof:async()=>false,
  isCurrent:async()=>{if(++reads===2)throw Error('temporary read');return true;},submit:async()=>{submits++;return {};},reconcile:async()=>receipt};
 await assert.rejects(make().execute(args),/temporary read/);
 assert.equal((await make().execute(args)).status,'included');assert.equal(proofs,2);assert.equal(submits,1);
}));
test('concurrent journal readers never observe a partially written event',()=>fixture(async make=>{
 const j=make();let ready,done=false;const started=new Promise(r=>ready=r);
 const writing=j.locked(async()=>{ready();await j.append({status:'planned',taskId:'large',task:{data:'x'.repeat(2000000)}});done=true;});
 await started;
 while(!done){const rows=await j.records();assert.ok(rows.every(x=>x.status==='planned'));}
 await writing;assert.equal((await j.records()).length,1);
}));
test('three vault histories with 3000 records recover under a real 64-descriptor process limit',()=>fixture(async make=>{
 const base=join(make().directory,'..'),configs=[123,124,125].map(vaultId=>({directory:base,network:'staging',vaultId,fingerprint:'b'.repeat(64)}));
 for(const config of configs){
  const j=new ExecutionJournal(config);await mkdir(j.directory,{recursive:true});
  for(let start=0;start<1000;start+=32)await Promise.all(Array.from({length:Math.min(32,1000-start)},(_,offset)=>{
   const n=start+offset,status=n===999?'broadcast-intent':'planned';
   return writeFile(join(j.directory,String(n).padStart(8,'0')+'-'+status+'.json'),JSON.stringify({scope:j.scope,status,taskId:'task-'+n,task:{nonce:n}}));
  }));
 }
 const module=new URL('./journal.mjs',import.meta.url).href;
 const script=`import assert from 'node:assert/strict';import {ExecutionJournal} from ${JSON.stringify(module)};
 const journals=${JSON.stringify(configs)}.map(x=>new ExecutionJournal(x));
 await Promise.all(journals.map(async j=>{const rows=await j.records();assert.equal(rows.length,1000);assert.equal(rows[999].taskId,'task-999');
 const pending=await j.unresolved();assert.equal(pending.length,1);assert.equal(pending[0].task.nonce,999);
 await assert.rejects(j.execute({task:{nonce:1001},prove:()=>assert.fail('pending broadcast')}),/unresolved broadcast/);
 }));console.log('3000 ordered records and all pending broadcasts preserved');`;
 const child=spawn('/bin/sh',['-c','ulimit -n 64; exec "$@"','journal-stress',process.execPath,'--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});
 let output='',error='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>error+=x);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 assert.equal(code,0,error);assert.match(output,/3000 ordered records/);
}));
test('a missing or duplicated journal sequence blocks proving and append instead of reusing an event number',()=>fixture(async make=>{
 const j=make();await j.locked(async()=>{await j.append({status:'planned',taskId:'first'});await j.append({status:'proved',taskId:'first',proof:{}});});
 await unlink(join(j.directory,'00000000-planned.json'));
 await assert.rejects(j.execute({task:{nonce:2},prove:()=>assert.fail('broken history')}),/sequence/);
 await assert.rejects(j.locked(()=>j.append({status:'planned',taskId:'new'})),/sequence/);
 await writeFile(join(j.directory,'00000000-planned.json'),JSON.stringify({scope:j.scope,status:'planned'}));
 await writeFile(join(j.directory,'00000000-included.json'),JSON.stringify({scope:j.scope,status:'included'}));
 await assert.rejects(j.records(),/sequence/);
}));

test('explicit driver no-send found during immediate reconciliation is durably terminal',()=>fixture(async make=>{let proofs=0,sends=0;const args={task:{nonce:1},prove:async()=>{proofs++;return{}},isCurrent:async()=>true,submit:async()=>{sends++;return{}},reconcile:async()=>({status:'not-submitted',source:'explicit-driver-rejection',reason:'pre-send read'})};const r=await make().execute(args);assert.equal(r.status,'not-submitted');assert.equal(r.operatorReviewRequired,true);assert.equal((await make().unresolved()).length,0);assert.equal((await make().records()).at(-1).status,'not-submitted');assert.equal(proofs,1);assert.equal(sends,1);}));

test('failed read-only preparation keeps the durable full proof for explicit resume',()=>fixture(async make=>{let proofs=0,preparations=0,sends=0;const args={task:{nonce:1},prove:async()=>{proofs++;return{manifest:'saved'}},validateProof:async()=>true,isCurrent:async()=>true,prepareSubmission:async(_t,p)=>{if(++preparations===1)throw Error('read-only calibration failed');return p},submit:async()=>{sends++;return{}},reconcile:async()=>receipt};await assert.rejects(()=>make().execute(args),/calibration failed/);assert.equal((await make().records()).filter(x=>x.status==='proved').length,1);assert.equal((await make().unresolved()).length,0);assert.equal(sends,0);assert.equal((await make().execute(args)).status,'included');assert.equal(proofs,1);assert.equal(sends,1);}));
