// Independent local process, real guarded adapter and original live financial
// journal. Tripwires forbid this QA contender from quoting/proving/submitting;
// it must lose the existing holder's lock before any financial work.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';import {join} from 'node:path';
import {hostname} from 'node:os';
import {loadCompositionConfig} from '../config.mjs';
import {createCompositionAdapter} from '../adapter.mjs';
import {runCompositionService} from '../service.mjs';
import {ExecutionJournal} from '../../executor/journal.mjs';
import {save} from '../../batching/admission/liveSupport.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
const [file,output]=process.argv.slice(2);assert.ok(!existsSync(output));
const o=await loadCompositionConfig(file);assert.equal(o.coordinator,undefined,'same local journal mode as actual live holder');
const adapter=await createCompositionAdapter(o),methods={quote:0,prove:0,submit:0};
try{
 const journal=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
 let holder;
 for(let attempt=0;attempt<180;attempt++){
  if(existsSync(journal.directory)){
   const rows=await journal.records(),lock=join(journal.directory,'executor.lock');
   if(rows.some(r=>r.status==='session-restart-reserved')&&existsSync(lock)){
    holder=JSON.parse(readFileSync(lock));assert.equal(holder.host,hostname());
    assert.notEqual(holder.pid,process.pid);process.kill(holder.pid,0);break;
   }
  }
  await new Promise(r=>setTimeout(r,10000));
 }
 assert.ok(holder,'no active post-rebuild holder observed; do not start financial work');
 const tripwire=Object.fromEntries(Object.keys(methods).map(name=>[name,async()=>{
  methods[name]++;throw Error('QA contender financial tripwire; observed lock window lost');
 }]));
 const result=await runCompositionService(o,{mode:'once',adapterFactory:async()=>({...adapter,...tripwire})});
 assert.equal(result.status,'busy','contender must lose the original financial journal lock');
 assert.ok(Object.values(methods).every(n=>n===0));
 save(output,{checkedAt:new Date().toISOString(),status:result.status,pid:process.pid,holder,
  vaultId:o.vaultId,intentId:adapter.model.intent.id,sdkManifestHash:o.sdkManifestHash,
  configurationSha256:sha256(readFileSync(file)),financialMethodsInvoked:methods,broadcast:false,
  eventDirectory:result.eventDirectory,
  scope:'independent local process; actual guarded startup and live journal; QA tripwires were not invoked. Not two hosts, coordinator-mode financial acceptance or a second payer transaction.'});
 console.log('independent local contender excluded before financial work');
}finally{await adapter.close();}
