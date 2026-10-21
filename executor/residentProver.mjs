// Proof-only child, one pinned policy/config. It never submits transactions.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export function residentProver(binary,policy,config,{env,timeout=900000,spawnProcess=spawn}={}){
 let child,pending,buffer='',startup='',ready,stopped=false;
 const fail=error=>{if(pending){clearTimeout(pending.timer);const p=pending;pending=null;error.stdout=p.stdout;error.stderr=p.stderr;p.reject(error);}else startup+=error.message+'\n';};
 const start=()=>{
  if(stopped)throw Error('resident prover is closed; explicit restart required');
  if(child)return;
  child=spawnProcess(binary,['serve-preflight',policy,config],{env,stdio:['pipe','pipe','pipe']});
  child.on('error',e=>{stopped=true;fail(e);});
  child.on('exit',(code,signal)=>{stopped=true;fail(Error(`resident proof child exited ${code??signal}; no automatic retry`));});
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
    if(r.ok)p.resolve({stdout:p.stdout,stderr:p.stderr,residentStartup:ready});else{const e=Error(`resident proof rejected at ${r.phase}: ${r.error}`);e.stdout=p.stdout;e.stderr=p.stderr;p.reject(e);}
   }
  });
 };
 return {
  prove:async(args)=>{
   if(args.length!==6||args[0]!=='preflight'||args[1]!==policy||args[2]!==config)throw Error('resident accepts only pinned preflight requests');
   if(pending)throw Error('resident proof already running');start();
   return new Promise((resolve,reject)=>{const id=randomUUID();pending={id,resolve,reject,stdout:startup,stderr:'',timer:setTimeout(()=>{stopped=true;child.kill('SIGTERM');fail(Error('resident proof timed out; no automatic retry'));},timeout)};startup='';
    child.stdin.write(JSON.stringify({id,calls:args[3],guard:args[4],out:args[5]})+'\n');
   });
  },
  close:async()=>{stopped=true;if(child){child.stdin.end();if(pending){child.kill('SIGTERM');fail(Error('resident closed while proof was running'));}}}
 };
}
