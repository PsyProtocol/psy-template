#!/usr/bin/env node
import{readFile}from'node:fs/promises';
import{assertSameAction}from'./taskIntent.mjs';
import{resumeKnownTask}from'./resume.mjs';
import {ExecutionJournal} from './journal.mjs';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {loadOptions,currentUsers} from './config.mjs';
import {executeCycle,watchWorker,executionExitCode} from './worker.mjs';
import {assertDurableRuntimeDirectory} from './runtimeStorage.mjs';
import {residentScope} from './residentScope.mjs';
const [path,mode='scan',flag,expectedPath]=process.argv.slice(2);
if(flag!==undefined&&(!((mode==='once'&&flag==='--expected-task')||(mode==='resume'&&flag==='--task'))||!expectedPath||process.argv.length!==6))throw Error('expected intent requires once --expected-task file.json or resume --task file.json');
const expected=expectedPath?JSON.parse(await readFile(expectedPath,'utf8')):null;
if(mode==='resume'&&!expectedPath)throw Error('resume requires --task previously-planned-task.json');
if(expectedPath&&(!expected||typeof expected!=='object'||Array.isArray(expected)))throw Error('expected task must be an object');
if(!path||!['scan','once','watch','reconcile','resume'].includes(mode))throw Error('usage: node executor/run.mjs config.json [scan|once|watch|reconcile|resume --task file.json]');
const options=await loadOptions(path),stop=new AbortController();
if(['once','watch','resume'].includes(mode))assertDurableRuntimeDirectory(options.runtimeDirectory);
const makeJournal=o=>new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
const show=x=>console.log(JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v));
const showExecution=x=>{show(x);process.exitCode=executionExitCode(x);};
process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
const proofResources=residentScope(),createAdapter=o=>createPublicWalletAdapter(o,{residentScope:proofResources});
try{
if(mode==='watch'){
 await watchWorker({options,createAdapter,createJournal:makeJournal,signal:stop.signal,
  users:()=>currentUsers(options),onStatus:result=>{if(!['scanning','reconciling','idle','queued','executing'].includes(result.status))show(result);if(['halted','not-submitted'].includes(result.status))process.exitCode=1;}});
}else{
 options.users=await currentUsers(options);const adapter=await createAdapter(options);
 if(expected&&mode==='once'){const scan=adapter.scan;adapter.scan=async()=>{const state=await scan();assertSameAction(state.action,expected);return state;};}
 try{if(mode==='scan')show(await adapter.scan());
 else if(mode==='resume')showExecution(await resumeKnownTask({task:expected,adapter,journal:makeJournal(options)}));
 else if(mode==='reconcile')show(await makeJournal(options).reconcile(adapter.reconcile));
 else showExecution(await executeCycle({adapter,journal:makeJournal(options),signal:stop.signal}));}finally{await adapter.close?.();}
}
}finally{await proofResources.close();}
