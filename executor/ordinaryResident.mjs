// Explicit lifetime for one ordinary signer. No automatic proof, send or
// process retry. The owner must reconcile the exact saved request after error.
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {sha256} from './requestBinding.mjs';
import {ordinaryPreflight} from '../batching/admission/ordinaryReport.mjs';
import {receiptReader} from './chainReceipts.mjs';
import {parseLosslessJson} from '../amm/u124/client.mjs';
export async function ordinaryResident({binary,binarySha256,config,dependencies,secret,publicKeyHash,sdkManifest,sdkSha256,env,spawnProcess=spawn,timeout=900000}) {
 assert.match(publicKeyHash,/^[0-9a-f]{64}$/);assert.match(sdkSha256,/^[0-9a-f]{64}$/);
 const paths=[binary,config,dependencies,sdkManifest],digests=await Promise.all(paths.map(async p=>sha256(await readFile(p))));
 assert.equal(digests[0],binarySha256);assert.equal(digests[3],sdkSha256);
 // The secret digest stays in memory; it is never logged or put in a manifest.
 const secretDigest=sha256(await readFile(secret));
 const check=async()=>{for(let i=0;i<paths.length;i++)assert.equal(sha256(await readFile(paths[i])),digests[i],'ordinary resident binding changed');assert.equal(sha256(await readFile(secret)),secretDigest,'ordinary signer file changed');};
 const exactIdentity=async gate=>{
  const raw=await Promise.all(['preflight.json','request.json','intent.json'].map(p=>readFile(gate.out+'/'+p,'utf8')));
  const p=ordinaryPreflight(raw[0]),request=parseLosslessJson(raw[1]),intent=parseLosslessJson(raw[2]);
  assert.equal(p.preflight.inputSha256,gate.inputSha256,'ordinary exact input changed');assert.equal(p.preflight.core.new_user_leaf.public_key,publicKeyHash,'ordinary receipt belongs to another signer');
  assert.deepEqual(request.user_ec_input.core,p.preflight.core,'ordinary saved request/core mismatch');assert.equal(intent.endUserLeafHash,p.endUserLeafHash);assert.equal(intent.userId,BigInt(p.userId));assert.equal(intent.nonce,p.preflight.core.new_user_leaf.nonce);
  const identity={userId:p.userId,endUserLeafHash:p.endUserLeafHash,minCheckpoint:p.minCheckpoint,files:raw.map(sha256)};
  if(gate.identity)assert.deepEqual(identity,gate.identity,'ordinary exact proof/request identity changed');else gate.identity=identity;
  return identity;
 };
 let active=false;env=Object.freeze({...env});
 let child,pending,buffer='',startup='',ready,poisoned=false,closed=false,exitPromise,ended=false,closing,unconfirmed;
 const fail=error=>{poisoned=true;if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(error);}};
 const start=()=>{
  child=spawnProcess(binary,['serve-ordinary',config,secret,dependencies],{env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
  let exit;exitPromise=new Promise(r=>{exit=r;});
  child.once('error',e=>{ended=true;exit();fail(e);});child.once('exit',(code,signal)=>{ended=true;exit();fail(Error(`ordinary worker exited ${code??signal}; reconcile original request`));});
  child.stdin.on('error',fail);
  child.stderr.on('data',data=>{if(pending)pending.log+=data;else startup+=data;});
  child.stdout.on('data',data=>{
   if(pending)pending.log+=data;else startup+=data;buffer+=data;
   if(buffer.length>2000000){fail(Error('ordinary worker protocol bound'));child.kill('SIGTERM');return;}
   for(let i;(i=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.startsWith('PSY_ORDINARY_SERVER '))continue;
    let response;try{response=JSON.parse(line.slice(20));}catch{fail(Error('ordinary worker invalid response'));child.kill('SIGTERM');return;}
    if(response.ready){if(ready||response.publicKeyHash!==publicKeyHash){fail(Error('ordinary worker identity mismatch'));child.kill('SIGTERM');return;}ready=response;if(pending)child.stdin.write(pending.request);continue;}
    if(!ready||!pending||response.id!==pending.id){fail(Error('ordinary worker request mismatch'));child.kill('SIGTERM');return;}
    const p=pending;pending=null;clearTimeout(p.timer);
    if(response.ok)p.resolve(response);else{poisoned=true;p.reject(Error(`ordinary worker stopped at ${response.phase}: ${response.reasonCode}; reconcile original request`));}
   }
  });
 };
 return {
  run:async({action='call',input,out,log})=>{
   assert.ok(['call','preflight'].includes(action));assert.ok(!closed&&!poisoned,'ordinary resident unavailable; explicit reconciliation/restart required');assert.ok(!unconfirmed,'ordinary original result must be reconciled before another job');assert.equal(active,false,'one active ordinary transaction per signer');
   // Occupy the lease before asynchronous identity checks: concurrent callers
   // cannot both pass the one-signer gate.
   active=true;const coldStart=!child,startedAt=new Date().toISOString(),before=performance.now();let file,entry;
   try{
    await check();assert.ok(!closed&&!poisoned,'ordinary resident stopped during binding checks');file=await open(log,'wx',0o600);
    const inputSha256=sha256(await readFile(input));
    if(action==='call')unconfirmed={out,inputSha256};
    const result=await new Promise((resolve,reject)=>{
     const id=randomUUID();entry={id,resolve,reject,log:startup,request:JSON.stringify({id,action,input,inputSha256,out})+'\n',timer:setTimeout(()=>{fail(Error('ordinary worker deadline; reconcile original request'));child?.kill('SIGTERM');},timeout)};startup='';pending=entry;
     if(!child)start();else if(ready)child.stdin.write(entry.request);
    });
    if(action==='call')await exactIdentity(unconfirmed);
    return {startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:Math.round(performance.now()-before),coldStart,sessionConstructionMillisecondsCharged:coldStart?ready.sessionConstructionMs:0,residentStartup:ready,response:result};
   }catch(error){poisoned=true;throw error;}
   finally{if(entry&&file)await file.writeFile(entry.log);await file?.close();active=false;}
  },
  reconcile:async()=>{
   assert.ok(!active,'cannot reconcile an active ordinary job');
   if(!unconfirmed)return {status:'none'};
   await check();
   const {userId,endUserLeafHash,minCheckpoint}=await exactIdentity(unconfirmed);
   const result=await(await receiptReader(config))({userId,endUserLeafHash,minCheckpoint});
   if(result.status==='included')unconfirmed=undefined;
   return result;
  },
  close:async()=>{
   if(closing)return closing;closed=true;
   if(!child||ended)return;
   closing=(async()=>{child.stdin.end();if(pending){fail(Error('ordinary worker closed while active; reconcile original request'));child.kill('SIGTERM');}
    const wait=()=>new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),5000);exitPromise.then(()=>{clearTimeout(timer);resolve(true);});});
    if(await wait())return;child.kill('SIGTERM');if(await wait())return;child.kill('SIGKILL');if(await wait())return;throw Error('ordinary worker exit unconfirmed');
   })();return closing;
  }
 };
}
