// Actual HTTP, durable authoritative journals, explicit mock proof/chain IO.
// Loopback and child processes are NOT two-host/network financial acceptance.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {homedir} from 'node:os';import {randomUUID} from 'node:crypto';
import {startCoordinationServer} from './server.mjs';
import {CoordinatedJournal,CoordinationLeaseLost,CoordinationWriteUnknown} from './client.mjs';
import {VaultBusy,UnresolvedBroadcast} from '../journal.mjs';
import {spawn} from 'node:child_process';
async function fixture(settings={}){
 const parent=join(homedir(),'.cache/psy-coordination-tests');await mkdir(parent,{recursive:true});
 const dir=await mkdtemp(join(parent,'case-')),artifactRoot=join(dir,'artifacts');await mkdir(artifactRoot);
 const scope={network:'sepolia',domainHash:'a'.repeat(64),sdkManifestHash:'b'.repeat(64),vaultId:123,
  fingerprint:'c'.repeat(64),publicKeyHash:'d'.repeat(64),intentId:'e'.repeat(64),registryHash:'f'.repeat(64),
  walletSha256:'1'.repeat(64),artifactRoot};
 const authToken='unit-only-credential-'.repeat(3),serverOptions={directory:join(dir,'authority'),authToken,scopes:[scope],...settings};
 let server=await startCoordinationServer(serverOptions);
 const client=(extra={})=>new CoordinatedJournal({scope,authToken,endpoint:server.url,...extra});
 const restart=async()=>{await server.close();server=await startCoordinationServer(serverOptions);};
 return {dir,scope,authToken,client,restart,get server(){return server;},
  close:async()=>{await server.close();await rm(dir,{recursive:true,force:true});}};
}
test('TLS, credential and exact approved domain/key/artifact scope are mandatory',async()=>{
 const f=await fixture();try{
  assert.throws(()=>f.client({endpoint:'http://public.example'}),/TLS/);
  await assert.rejects(()=>f.client({authToken:'wrong-credential-'.repeat(3)}).records(),/rejected/);
  await assert.rejects(()=>f.client({scope:{...f.scope,domainHash:'2'.repeat(64)}}).records(),/rejected/);
  assert.ok(!JSON.stringify(f.client()).includes(f.authToken),'credential is not enumerable status data');
 }finally{await f.close();}
});
test('second network client is excluded before proving and sees the same durable task ledger',async()=>{
 const f=await fixture();try{
  const a=f.client(),b=f.client();let held,release;
  const ready=new Promise(r=>held=r),finish=new Promise(r=>release=r);
  const first=a.locked(async()=>{await a.append({status:'planned',taskId:'original',task:{nonce:1}});held();await finish;});
  await ready;await assert.rejects(()=>b.locked(()=>assert.fail('busy worker cannot prove')),VaultBusy);
  release();await first;assert.equal((await b.records())[0].taskId,'original');
  await assert.rejects(()=>b.append({status:'planned'}),CoordinationLeaseLost);
 }finally{await f.close();}
});
test('lost append ACK is reconciled by exact append identity without POST retry',async()=>{
 const f=await fixture();try{
  let posts=0,lost=false;
  const a=f.client({fetchImpl:async(url,options)=>{
    const response=await fetch(url,options);
    if(url.endsWith('/append')){posts++;if(!lost){lost=true;throw new TypeError('injected ACK loss after durable append');}}
    return response;
  }});
  await a.locked(()=>a.append({status:'planned',taskId:'once'}));
  assert.equal(posts,1);assert.equal((await a.records()).length,1);
 }finally{await f.close();}
});
test('unknown financial broadcast survives coordinator restart and blocks substitute proof/payment',async()=>{
 const f=await fixture();try{
  const task={operation:'fund',intentId:f.scope.intentId},artifact=join(f.scope.artifactRoot,'original-request.json');
  await writeFile(artifact,'exact mock public proof bytes');let proofs=0,sends=0;
  const args={task,isCurrent:async()=>true,prove:async()=>{proofs++;return{requestPath:artifact};},
   submit:async()=>{sends++;throw Error('injected financial acknowledgement loss');},reconcile:async()=>({status:'unresolved'})};
  // Override the test submission preparation path; production obtains it from
  // the reviewed adapter. Actual driver is not part of this mock chain test.
  args.prepareSubmission=async(_t,p)=>({...p,submissionDirectory:join(f.scope.artifactRoot,'composition/send-original')});
  assert.equal((await f.client().execute(args)).status,'unresolved');
  await f.restart();const b=f.client();
  await assert.rejects(()=>b.execute({...args,task:{...task,operation:'replacement'}}),UnresolvedBroadcast);
  await b.reconcile(async record=>{assert.equal(record.task.operation,'fund');assert.equal(await readFile(record.proof.requestPath,'utf8'),'exact mock public proof bytes');
    return{status:'included',userId:123,contentHash:'3'.repeat(64),checkpoint:100};});
  assert.equal((await b.execute(args)).status,'already-included');assert.equal(proofs,1);assert.equal(sends,1);
 }finally{await f.close();}
});
test('expired owner cannot append or release a newer owner lease',async()=>{
 let now=1000;const f=await fixture({clock:()=>now,leaseMs:1000});try{
  const a=f.client(),b=f.client(),ownerA=randomUUID(),ownerB=randomUUID();
  const old=await a.request('acquire',{owner:ownerA});now+=1001;
  const next=await b.request('acquire',{owner:ownerB});
  await assert.rejects(()=>a.request('append',{owner:ownerA,token:old.token,eventId:randomUUID(),event:{status:'planned'}}),CoordinationLeaseLost);
  await assert.rejects(()=>a.request('release',{owner:ownerA,token:old.token}),CoordinationLeaseLost);
  await b.request('renew',{owner:ownerB,token:next.token});
 }finally{await f.close();}
});
test('fence loss after durable broadcast intent writes positive driver-not-invoked evidence, never sends',async()=>{
 let now=1000;const f=await fixture({clock:()=>now,leaseMs:1000});try{
  const b=f.client();let stolen,sends=0,stole=false;
  const out=join(f.scope.artifactRoot,'composition/send-fenced');await mkdir(join(f.scope.artifactRoot,'composition'));
  const a=f.client({fetchImpl:async(url,options)=>{
    const response=await fetch(url,options),body=JSON.parse(options.body);
    if(!stole&&url.endsWith('/append')&&body.event.status==='broadcast-intent'){
      stole=true;now+=1001;stolen=await b.request('acquire',{owner:randomUUID()});
    }return response;
  }});
  await assert.rejects(()=>a.execute({task:{operation:'fund'},isCurrent:async()=>true,prove:async()=>({mock:true}),
    prepareSubmission:async(_t,p)=>({...p,submissionDirectory:out}),submit:async()=>{sends++;},reconcile:async()=>({status:'unresolved'})}),CoordinationLeaseLost);
  assert.equal(sends,0);const failure=JSON.parse(await readFile(join(out,'failure.json'),'utf8'));
  assert.equal(failure.driverNotInvoked,true);assert.equal(failure.broadcastMayHaveBeenAttempted,false);
  await b.request('release',{owner:stolen.owner,token:stolen.token});
  await b.reconcile(async record=>{assert.equal(record.proof.submissionDirectory,out);return{status:'not-submitted',reason:'verified original no-send evidence'};});
  assert.equal((await b.unresolved()).length,0);
 }finally{await f.close();}
});
test('unknown coordinator append with no read evidence never retries mutation',async()=>{
 const f=await fixture();try{
  let posts=0;const a=f.client({fetchImpl:(url,options)=>{
    if(url.endsWith('/append')){posts++;throw new TypeError('injected connection result unknown');}return fetch(url,options);
  }});
  await assert.rejects(()=>a.locked(()=>a.append({status:'planned'})),CoordinationWriteUnknown);assert.equal(posts,1);
 }finally{await f.close();}
});
test('independent child process crash permits lease takeover of shared pre-broadcast ledger',async()=>{
 const f=await fixture({leaseMs:1000});let holder;
 const module=new URL('./client.mjs',import.meta.url).href;
 const child=role=>{
  const p=spawn(process.execPath,['--input-type=module','-'],{stdio:['pipe','pipe','pipe']});
  const source=`import {CoordinatedJournal} from ${JSON.stringify(module)};
   const j=new CoordinatedJournal(${JSON.stringify({scope:f.scope,endpoint:f.server.url,authToken:f.authToken})});
   if(${JSON.stringify(role)}==='holder')await j.locked(async()=>{
     await j.append({status:'planned',taskId:'original-before-crash'});
     console.log(JSON.stringify({ready:true,pid:process.pid}));await new Promise(()=>setInterval(()=>{},1000));
   });else {
     try{await j.locked(async()=>{
       const rows=await j.records();
       if(!rows.some(r=>r.taskId==='original-before-crash'))throw Error('lost original ledger');
       await j.append({status:'planned',taskId:'successor-before-broadcast'});
       console.log(JSON.stringify({takenOver:true,pid:process.pid}));
     });}catch(e){if(e.name!=='VaultBusy')throw e;console.log(JSON.stringify({busy:true,pid:process.pid}));}
   }`;
  p.stdin.end(source);let output='',errors='';p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>errors+=x);
  const closed=new Promise((a,b)=>{p.once('error',b);p.once('close',(code,signal)=>a({code,signal,output,errors}));});
  return{p,closed,ready:new Promise(a=>p.stdout.once('data',()=>a()))};
 };
 try{
  holder=child('holder');await holder.ready;
  const blocked=await child('contender').closed;assert.equal(blocked.code,0,blocked.errors);assert.equal(JSON.parse(blocked.output).busy,true);
  holder.p.kill('SIGKILL');assert.equal((await holder.closed).signal,'SIGKILL');
  await new Promise(r=>setTimeout(r,1100));
  const successor=await child('successor').closed;assert.equal(successor.code,0,successor.errors);assert.equal(JSON.parse(successor.output).takenOver,true);
  assert.notEqual(JSON.parse(blocked.output).pid,JSON.parse(successor.output).pid);
  assert.deepEqual((await f.client().records()).map(r=>r.taskId),['original-before-crash','successor-before-broadcast']);
 }finally{holder?.p.kill('SIGKILL');await f.close();}
});
