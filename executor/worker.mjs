import {StaleTask,VaultBusy,UnresolvedBroadcast} from './journal.mjs';
import {ReadUnavailable} from './readRetry.mjs';

export class ExecutionStopped extends Error {constructor(){super('queued execution stopped');this.name='ExecutionStopped';}}
export class ExecutionLimiter {
 constructor(limit){if(!Number.isInteger(limit)||limit<1)throw Error('positive concurrency required');this.limit=limit;this.active=0;this.queue=[];}
 async run(fn,{signal}={}){
  await new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(new ExecutionStopped());return;}
   if(this.active<this.limit){this.active++;resolve();return;}
   const entry={start:()=>{signal?.removeEventListener('abort',cancel);resolve();}};
   const cancel=()=>{const index=this.queue.indexOf(entry);if(index<0)return;this.queue.splice(index,1);signal?.removeEventListener('abort',cancel);reject(new ExecutionStopped());};
   this.queue.push(entry);signal?.addEventListener('abort',cancel,{once:true});
  });
  // Cancellation removes waiting work only. An executing UPS finishes normally.
  try{return await fn();}finally{const next=this.queue.shift();if(next)next.start();else this.active--;}
 }
}
export async function executeCycle({adapter,journal,limiter=new ExecutionLimiter(1),signal,onPhase=async()=>{}}){
  if(signal?.aborted)return {status:'stopped'};
  await onPhase({status:'reconciling'});
  const recovered=await journal.reconcile(adapter.reconcile);
  // Preserve confirmations even if the next read or proof fails this cycle.
  if(recovered.some(x=>x.result?.status==='included'))await onPhase({status:'reconciling',recovered});
  const pending=await journal.unresolved();
  if(signal?.aborted)return {status:'stopped',recovered};
  if(pending.length)return {status:'unresolved',tasks:pending.map(x=>x.taskId),recovered};
  await onPhase({status:'scanning'});
  const state=await adapter.scan();
  if(signal?.aborted)return {status:'stopped',recovered};
  if(!state.action)return {status:'idle',checkpoint:state.checkpoint,recovered,...(state.reason?{reason:state.reason}:{}),...(state.fundingRequest?{fundingRequest:state.fundingRequest}:{})};
  await onPhase({status:'queued',observedCheckpoint:state.checkpoint,taskKind:state.action.kind});
  try{return await limiter.run(async()=>{
    if(signal?.aborted)return {status:'stopped',recovered};
    await onPhase({status:'executing',observedCheckpoint:state.checkpoint,taskKind:state.action.kind});
    return {...await journal.execute({task:state.action,...adapter}),observedCheckpoint:state.checkpoint,recovered};
  },{signal});}catch(error){if(error instanceof ExecutionStopped)return {status:'stopped',recovered};throw error;}
}
export function executionExitCode(result){return ['included','already-included','idle','stopped','scan'].includes(result?.status)?0:1;}
export function classifyError(error){
 if(error instanceof ReadUnavailable)return 'read-unavailable';
 if(error instanceof StaleTask)return 'stale';
 if(error instanceof VaultBusy)return 'busy';
 if(error instanceof UnresolvedBroadcast)return 'unresolved';
 return 'halted';
}
export function pause(ms,signal){return new Promise(resolve=>{
 if(signal?.aborted){resolve();return;}
 const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();};
 const timer=setTimeout(finish,ms);signal?.addEventListener('abort',finish,{once:true});
 });}
export async function watchWorker({options,createAdapter,createJournal,limiter,signal,onStatus=()=>{},
 maxBackoffMs=300000,wait=pause,users=async()=>options.users}){
 let adapter,journal,failures=0;
 while(!signal?.aborted){
  let delay=options.intervalMs??10000;
  try{
   const nextUsers=await users();
   // The adapter's scanner sees newly enrolled users without rebuilding the
   // registered circuit. User IDs are scan hints, not spending authorization.
   options.users=nextUsers;
   if(!adapter){adapter=await createAdapter(options);journal=createJournal(options);}
   const result=await executeCycle({adapter,journal,limiter,signal,onPhase:onStatus});
   failures=0;await onStatus(result);
   if(result.status==='not-submitted'){await adapter?.close?.();return;}
  }catch(error){
   const status=classifyError(error);failures++;
   delay=Math.min(maxBackoffMs,delay*2**Math.min(failures,10));
   await onStatus({status,message:error.message,tasks:error.tasks,failures,retryInMs:status==='halted'?null:delay});
   if(status==='halted'){await adapter?.close?.();return;}
  }
  await wait(delay,signal);
 }
 await adapter?.close?.();await onStatus({status:'stopped'});
}
