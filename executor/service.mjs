#!/usr/bin/env node
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadService,currentUsers} from './config.mjs';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {ExecutionJournal} from './journal.mjs';
import {ExecutionLimiter,executeCycle,watchWorker,classifyError} from './worker.mjs';

const stringify=x=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v);
const makeJournal=options=>new ExecutionJournal({directory:options.runtimeDirectory,network:options.network,vaultId:options.vaultId,fingerprint:options.fingerprint});
export async function runService(config,{mode='watch',signal,adapterFactory=createPublicWalletAdapter,
 journalFactory=makeJournal,emit=x=>console.log(stringify(x)),statusSink,wait}={}){
 if(!['scan','once','watch'].includes(mode))throw Error('invalid service mode');
 const controller=new AbortController(),stop=()=>controller.abort();signal?.addEventListener('abort',stop,{once:true});
 if(signal?.aborted)controller.abort();
 const limiter=new ExecutionLimiter(config.maxConcurrentExecutions);
 const statuses=new Map(),startedAt=new Date().toISOString();let writes=Promise.resolve();
 const snapshot=()=>({service:'psy-executor',pid:process.pid,mode,startedAt,updatedAt:new Date().toISOString(),vaults:[...statuses.values()]});
 const persist=async()=>{
  const data=snapshot();
  if(statusSink){await statusSink(data);return;}
  if(!config.statusFile)return;
  await mkdir(dirname(config.statusFile),{recursive:true,mode:0o700});
  const temporary=config.statusFile+'.'+process.pid+'.tmp';
  await writeFile(temporary,stringify(data)+'\n',{mode:0o600});await rename(temporary,config.statusFile);
 };
 const heartbeat=mode==='watch'&&config.statusFile?setInterval(()=>{
  writes=writes.then(persist);writes.catch(()=>controller.abort());
 },10000):null;
 heartbeat?.unref();
 const jobs=config.vaults.map(async original=>{
  const options={...original},id=`${options.network}:${options.vaultId}`;
  let lastLogged;const includedTasks=new Set();
  statuses.set(id,{id,name:options.name??`${options.kind}-${options.vaultId}`,kind:options.kind,contractId:options.contractId,
    vaultId:options.vaultId,status:'starting',included:0,cycles:0});
  const update=async event=>{
   const previous=statuses.get(id),recovered=(event.recovered??[]).filter(x=>x.result?.status==='included');
   const confirmations=recovered.map(x=>({...x.result,taskId:x.taskId}));
   if(event.status==='included')confirmations.push(event);
   let included=0;
   for(const confirmation of confirmations){
    if(confirmation.taskId&&includedTasks.has(confirmation.taskId))continue;
    if(confirmation.taskId)includedTasks.add(confirmation.taskId);included++;
   }
   const {checkpoint,...fields}=event;
   const current={...previous,...fields,updatedAt:new Date().toISOString(),included:previous.included+included,
     cycles:previous.cycles+(['idle','included','unresolved','already-included'].includes(event.status)?1:0)};
   if(checkpoint!==undefined&&event.status!=='included')current.observedCheckpoint=checkpoint;
   if(event.status==='scan'&&event.state?.checkpoint!==undefined)current.observedCheckpoint=event.state.checkpoint;
   for(const receipt of confirmations)if(Number.isSafeInteger(receipt.checkpoint)&&receipt.checkpoint>0&&
     (!current.lastIncluded||receipt.checkpoint>=current.lastIncluded.checkpoint)){
    current.checkpoint=receipt.checkpoint;
    current.lastIncluded={taskId:receipt.taskId,checkpoint:receipt.checkpoint,contentHash:receipt.contentHash,endUserLeafHash:receipt.endUserLeafHash};
   }
   if(event.message)current.lastError=event.message;
   if(['queued','executing','included','already-included','idle'].includes(event.status)){if(!event.fundingRequest)delete current.fundingRequest;if(!event.reason)delete current.reason;}
   if(['idle','included','already-included'].includes(event.status)){delete current.tasks;delete current.message;delete current.retryInMs;delete current.failures;}
   if(!['reconciling','scanning','queued','executing','stopped'].includes(event.status))current.lastOutcome=event;
   statuses.set(id,current);
   if(!['reconciling','scanning'].includes(event.status)&&(event.status!==lastLogged||event.status==='included'||event.recovered?.some(x=>x.result.status==='included')||event.message)){
    emit({service:'psy-executor',id,time:current.updatedAt,...event});lastLogged=event.status;
   }
   writes=writes.then(persist);await writes;
  };
  if(mode==='watch')await watchWorker({options,createAdapter:adapterFactory,createJournal:journalFactory,limiter,
    signal:controller.signal,onStatus:update,maxBackoffMs:config.maxBackoffMs,wait,users:()=>currentUsers(options)});
  else{
   try{
    options.users=await currentUsers(options);const adapter=await adapterFactory(options);
    try{if(mode==='scan')await update({status:'scan',state:await adapter.scan()});
    else await update(await executeCycle({adapter,journal:journalFactory(options),limiter,signal:controller.signal,onPhase:update}));}finally{await adapter.close?.();}
   }catch(error){await update({status:classifyError(error),message:error.message});}
  }
 });
 try{
  const results=await Promise.allSettled(jobs.map(job=>job.catch(error=>{controller.abort();throw error;})));
  const failed=results.find(x=>x.status==='rejected');if(failed)throw failed.reason;
  await writes;return snapshot();
 }finally{clearInterval(heartbeat);controller.abort();signal?.removeEventListener('abort',stop);}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file,mode='scan']=process.argv.slice(2);
 if(!file||!['scan','once','watch','status'].includes(mode))throw Error('usage: node executor/service.mjs service.json [scan|once|watch|status]');
 const config=await loadService(file);
 if(mode==='status'){
  if(!config.statusFile)throw Error('statusFile is not configured');
  console.log(await readFile(config.statusFile,'utf8'));
 }else{
  const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
  const result=await runService(config,{mode,signal:stop.signal});
  if(result.vaults.some(x=>['halted','unresolved','read-unavailable','busy','stale'].includes(x.status)))process.exitCode=1;
 }
}
