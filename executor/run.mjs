#!/usr/bin/env node
import {ExecutionJournal} from './journal.mjs';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {loadOptions,currentUsers} from './config.mjs';
import {executeCycle,watchWorker} from './worker.mjs';
const [path,mode='scan']=process.argv.slice(2);
if(!path||!['scan','once','watch','reconcile'].includes(mode))throw Error('usage: node executor/run.mjs config.json [scan|once|watch|reconcile]');
const options=await loadOptions(path),stop=new AbortController();
const makeJournal=o=>new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
const show=x=>console.log(JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v));
process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
if(mode==='watch'){
 await watchWorker({options,createAdapter:createPublicWalletAdapter,createJournal:makeJournal,signal:stop.signal,
  users:()=>currentUsers(options),onStatus:result=>{if(!['scanning','reconciling','idle','queued','executing'].includes(result.status))show(result);if(result.status==='halted')process.exitCode=1;}});
}else{
 options.users=await currentUsers(options);const adapter=await createPublicWalletAdapter(options);
 try{if(mode==='scan')show(await adapter.scan());
 else if(mode==='reconcile')show(await makeJournal(options).reconcile(adapter.reconcile));
 else show(await executeCycle({adapter,journal:makeJournal(options),signal:stop.signal}));}finally{await adapter.close?.();}
}
