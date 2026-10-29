// Persistence/coordination doubles only. Native Merkle/CFC/UPS evidence is separate.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{prepareRandomSourceStream,validateRandomStreamPlan}from'./randomSourceStream.mjs';
import{losslessJson}from'../amm/u124/client.mjs';import{sha256}from'./requestBinding.mjs';
const H=[1n,2n,3n,4n],EMPTY=[5n,6n,7n,8n];
function data(){const scope=Array(41).fill(1n);scope[0]=3n;scope[1]=1384803358401154921n;scope[3]=1000n;scope[4]=100n;scope[5]=1n;scope[6]=100n;scope[7]=356n;scope[8]=5n;
 const plan={profile:'source-covered-producer-random-stream-v1',authenticatedSeedRelativeToHistory:true,canSign:false,canBroadcast:false,fullUpsVerified:false,qualifiedRandomness:false,finalityVerified:false,causalSealBeforeReleaseAuthenticated:false,producerInfluence:true,sourceCheckpoint:100n,drawCheckpoint:101n,members:5n,sourcePages:2n,accounts:5n,scope,seed:[51n,62n,73n,84n],sourceSetRoot:H,orderedRoot:EMPTY};
 const source=[{scope,facts:[H],before:{accounts:0n},after:{accounts:4n,order_count:4n,orders:EMPTY,users:EMPTY},rows:Array(4).fill({})}];source.push({scope,facts:[H],before:source[0].after,after:{accounts:5n,order_count:5n,orders:H,users:H},rows:[{}]});
 const queue=Array.from({length:5},(_,i)=>({index:BigInt(i),member:{owner:BigInt(204-i),nonce:1n,terms:H}}));let state={cursor:0n,seen:H,ordered:H,last:Array(7).fill(0n)},pages=[];
 for(const start of [0,4]){const after={cursor:BigInt(Math.min(5,start+4)),seen:EMPTY,ordered:EMPTY,last:Array(7).fill(BigInt(start+1))};pages.push({before:state,after,page:{seed:plan.seed,refund_only:false,rows:queue.slice(start,start+4).map(r=>({origin:r,append:{index:r.index}}))}});state=after;}
 return {plan,source,pages,queue};}
test('one complete source/seed/permutation spans all pages; substitutions fail',()=>{
 const d=data();assert.equal(validateRandomStreamPlan(d.plan,d.source,d.pages,d.queue).canBroadcast,false);
 for(const change of [d=>d.pages[1].page.seed=[52n,62n,73n,84n],d=>d.pages.pop(),d=>d.pages[1].before={...d.pages[1].before,cursor:0n},d=>d.pages[1].page.rows[0].origin.member=d.queue[0].member,d=>d.source[0].scope=[...d.plan.scope,0n],d=>d.plan.drawCheckpoint=102n,d=>d.plan.fullUpsVerified=true]){const d=data();change(d);assert.throws(()=>validateRandomStreamPlan(d.plan,d.source,d.pages,d.queue));}
});
test('owned native preparation is durable, restarts once, rejects reselection and never enables spending',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'psy-random-source-route-'));try{
  const d=data(),put=(p,v)=>writeFile(p,losslessJson(v)+'\n',{flag:'wx'});const artifact=Buffer.from('{}\n');
  const asset=id=>({id,artifact:id+'.json',artifact_sha256:sha256(artifact)}),cfg={kind:1,market:1000,artifact:'market.json',artifact_sha256:sha256(artifact),assets:[asset(0),asset(42),asset(43)]};
  for(const name of ['market.json','0.json','42.json','43.json'])await writeFile(join(dir,name),artifact);
  const values={review:cfg,snapshot:{fields:[1n,...d.plan.scope.slice(1)]},draw:{coordinationDouble:true},policy:{version:10}};
  const o={historyRoot:'a'.repeat(64),wallet:join(dir,'driver'),walletSha256:sha256('native plan double'),runtimeDirectory:join(dir,'runtime')};await writeFile(o.wallet,'native plan double');
  for(const[n,v]of Object.entries(values)){o[n]=join(dir,n+'.json');await put(o[n],v);o[n+'Sha256']=sha256(await readFile(o[n]));}
  let calls=0;const runNative=async(_bin,args)=>{calls++;await mkdir(args[5]);const plan={...d.plan,historyRoot:o.historyRoot};for(const n of ['review','snapshot','draw','policy'])plan[n+'Sha256']=o[n+'Sha256'];for(const[n,v]of Object.entries({'plan.json':plan,'source-pages.json':d.source,'ordering-pages.json':d.pages,'queue.json':d.queue}))await put(join(args[5],n),v);};
  const a=await prepareRandomSourceStream(o,{runNative});assert.equal((await a.status()).members,5);assert.throws(()=>a.authorizeSettlement(),/cannot enable writes/);
  const b=await prepareRandomSourceStream(o,{runNative});assert.equal(calls,1);assert.equal((await b.status()).canSign,false);
  const race=await Promise.allSettled([prepareRandomSourceStream(o,{runNative}),prepareRandomSourceStream(o,{runNative})]);
  assert.ok(race.some(r=>r.status==='fulfilled'));for(const r of race){if(r.status==='rejected')assert.equal(r.reason.name,'VaultBusy');else assert.equal((await r.value.status()).members,5);}assert.equal(calls,1,'local competitors cannot create a second native plan');
  await assert.rejects(prepareRandomSourceStream({...o,historyRoot:'b'.repeat(64)},{runNative}),/immutable random source input changed/);assert.equal(calls,1);
  await assert.rejects(prepareRandomSourceStream({...o,seed:'chosen'},{runNative}),/no operator seed/);
  const copied=join(a.directory,'input/market.json');await writeFile(copied,'{}\n\n');await assert.rejects(a.status(),/copied reviewed artifact changed/);await writeFile(copied,artifact);
  const p=join(a.directory,'prepared/ordering-pages.json');await writeFile(p,'[]\n');await assert.rejects(a.status(),/prepared plan changed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('interrupted native planning replays exact inputs without overwriting partial output',async()=>{
 for(const corrupt of [false,true]){
  const dir=await mkdtemp(join(tmpdir(),'psy-random-source-crash-'));try{
   const d=data(),artifact=Buffer.from('{}\n'),put=(p,v)=>writeFile(p,losslessJson(v)+'\n',{flag:'wx'});
   const asset=id=>({id,artifact:id+'.json',artifact_sha256:sha256(artifact)}),cfg={kind:1,market:1000,artifact:'market.json',artifact_sha256:sha256(artifact),assets:[asset(0),asset(42),asset(43)]};
   for(const name of ['market.json','0.json','42.json','43.json'])await writeFile(join(dir,name),artifact);
   const o={historyRoot:'a'.repeat(64),wallet:join(dir,'driver'),walletSha256:sha256('native crash double'),runtimeDirectory:join(dir,'runtime')};await writeFile(o.wallet,'native crash double');
   for(const[n,v]of Object.entries({review:cfg,snapshot:{fields:[1n,...d.plan.scope.slice(1)]},draw:{coordinationDouble:true},policy:{version:10}})){o[n]=join(dir,n+'.json');await put(o[n],v);o[n+'Sha256']=sha256(await readFile(o[n]));}
   let calls=0,original,originalBytes;
   const runNative=async(_bin,args)=>{
    calls++;await mkdir(args[5]);const plan={...d.plan,historyRoot:o.historyRoot};for(const n of ['review','snapshot','draw','policy'])plan[n+'Sha256']=o[n+'Sha256'];
    await put(join(args[5],'plan.json'),plan);
    if(calls===1){original=join(args[5],'plan.json');originalBytes=await readFile(original);throw Error('simulated native crash after first public file');}
    for(const[n,v]of Object.entries({'source-pages.json':d.source,'ordering-pages.json':d.pages,'queue.json':d.queue}))await put(join(args[5],n),v);
   };
   await assert.rejects(prepareRandomSourceStream(o,{runNative}),/native crash/);
   if(corrupt){await writeFile(original,'{}\n');await assert.rejects(prepareRandomSourceStream(o,{runNative}),/conflicts with exact replay/);assert.equal(await readFile(original,'utf8'),'{}\n');}
   else{const recovered=await prepareRandomSourceStream(o,{runNative});assert.equal((await recovered.status()).members,5);assert.deepEqual(await readFile(original),originalBytes);await prepareRandomSourceStream(o,{runNative});assert.equal(calls,2);}
  }finally{await rm(dir,{recursive:true,force:true});}
 }
});
