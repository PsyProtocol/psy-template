#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {ExecutionJournal,StaleTask} from './journal.mjs';import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {ReadUnavailable} from './readRetry.mjs';
const args=process.argv.slice(2),path=args[0],mode=args[1]??'scan';
if(!path||!['scan','once','watch','reconcile'].includes(mode))throw Error('usage: node executor/run.mjs config.json [scan|once|watch|reconcile]');
const options=JSON.parse(await readFile(path,'utf8')),adapter=await createPublicWalletAdapter(options),journal=new ExecutionJournal({directory:options.runtimeDirectory,network:options.network,vaultId:options.vaultId,fingerprint:options.fingerprint});
const show=x=>console.log(JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v));
let stopped=false;process.once('SIGINT',()=>stopped=true);process.once('SIGTERM',()=>stopped=true);
if(mode==='reconcile'){show(await journal.reconcile(adapter.reconcile));process.exit(0);}
do {
 try {
 if(mode!=='scan'){
  const reconciled=await journal.reconcile(adapter.reconcile);
  for(const {taskId,result} of reconciled)if(result.status==='included')
   show({taskId,status:'included',userId:result.userId,checkpoint:result.checkpoint,contentHash:result.contentHash});
 }
 const pending=mode==='scan'?[]:await journal.unresolved();
 if(pending.length){if(mode==='once')show({status:'unresolved',tasks:pending.map(x=>x.taskId)});}
 else {
  const state=await adapter.scan();
  if(mode==='scan')show(state);
  else if(state.action)show(await journal.execute({task:state.action,...adapter}));
  else if(mode==='once')show({status:'idle',checkpoint:state.checkpoint});
 }
 }catch(error){if(mode!=='watch'||!(error instanceof ReadUnavailable||error instanceof StaleTask))throw error;show({status:error instanceof StaleTask?'stale':'read-unavailable',message:error.message});}
 if(mode==='watch'&&!stopped)await new Promise(r=>setTimeout(r,Math.max(1000,options.intervalMs??10000)));
}while(mode==='watch'&&!stopped);
