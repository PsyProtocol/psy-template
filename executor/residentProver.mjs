// Proof-only child, one pinned policy/config. It never submits transactions.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export function residentProver(binary,policy,config,{env,timeout=900000,stopTimeout=5000,spawnProcess=spawn}={}){
 if(!Number.isSafeInteger(stopTimeout)||stopTimeout<1||stopTimeout>10000)throw Error('invalid resident stop timeout');
 let child,pending,buffer='',startup='',ready,stopped=false,exited=false,exitPromise,closing;
 const fail=error=>{if(pending){clearTimeout(pending.timer);const p=pending;pending=null;error.stdout=p.stdout;error.stderr=p.stderr;p.reject(error);}else startup+=error.message+'\n';};
 const start=()=>{
  if(stopped)throw Error('resident prover is closed; explicit restart required');
  if(child)return;
  child=spawnProcess(binary,['serve-preflight',policy,config],{env,stdio:['pipe','pipe','pipe']});
  let ended;exitPromise=new Promise(resolve=>{ended=resolve;});
  child.on('error',e=>{stopped=true;exited=true;ended();fail(e);});
  child.on('exit',(code,signal)=>{stopped=true;exited=true;ended();fail(Error(`resident proof child exited ${code??signal}; no automatic retry`));});
  child.stdin.on('error',e=>{stopped=true;fail(e);});
  child.stderr.on('data',chunk=>{if(pending)pending.stderr+=String(chunk);else startup+=String(chunk);});
  child.stdout.on('data',chunk=>{
   const text=String(chunk);if(pending)pending.stdout+=text;else startup+=text;
   buffer+=text;
   if(buffer.length>2000000){stopped=true;child.kill('SIGTERM');fail(Error('resident output exceeded protocol limit'));return;}
   for(let i;(i=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.startsWith('PSY_COMPACT_SERVER '))continue;
    let r;try{r=JSON.parse(line.slice(19));}catch{stopped=true;child.kill('SIGTERM');fail(Error('invalid resident response'));return;}
    if(r.ready){ready=r;continue;}
    if(!pending||r.id!==pending.id){stopped=true;child.kill('SIGTERM');fail(Error('resident request identity mismatch'));return;}
    const p=pending;pending=null;clearTimeout(p.timer);
    if(r.ok)p.resolve({stdout:p.stdout,stderr:p.stderr,residentStartup:ready});else{const e=Error(`resident proof rejected at ${r.phase}: ${r.error}`);e.residentRejection=Object.freeze({phase:r.phase,error:r.error});e.stdout=p.stdout;e.stderr=p.stderr;p.reject(e);}
   }
  });
 };
 const request=async(action,args)=>{
   if(args.length!==6||args[0]!==action||args[1]!==policy||args[2]!==config)throw Error('resident accepts only pinned preflight/quote requests');
   if(pending)throw Error('resident proof already running');start();
   return new Promise((resolve,reject)=>{const id=randomUUID();pending={id,resolve,reject,stdout:startup,stderr:'',timer:setTimeout(()=>{stopped=true;child.kill('SIGTERM');fail(Error('resident proof timed out; no automatic retry'));},timeout)};startup='';
    child.stdin.write(JSON.stringify({id,calls:args[3],guard:args[4],out:args[5],...(action==='quote'?{action}: {})})+'\n');
   });
  };
 return {
  prove:args=>request('preflight',args),
  quote:args=>request('quote',args),
  close:async()=>{
   if(closing)return closing;
   stopped=true;if(!child||exited)return;
   closing=(async()=>{
    child.stdin.end();if(pending){child.kill('SIGTERM');fail(Error('resident closed while proof was running'));}
    const waitExit=()=>new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),stopTimeout);exitPromise.then(()=>{clearTimeout(timer);resolve(true);});});
    if(await waitExit())return;
    child.kill('SIGTERM');if(await waitExit())return;
    child.kill('SIGKILL');if(await waitExit())return;
    throw Error('resident child exit unconfirmed; do not start a replacement proof process');
   })();
   return closing;
  }
 };
}
