import {mkdir,open,readFile,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {publishFile} from './durableFile.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export class StaleTask extends Error {constructor(message){super(message);this.name='StaleTask';}}
export class VaultBusy extends Error {constructor(message){super(message);this.name='VaultBusy';}}
export class UnresolvedBroadcast extends Error {constructor(tasks){super('unresolved broadcast blocks this vault; reconcile before retrying');this.name='UnresolvedBroadcast';this.tasks=tasks;}}
async function durable(path,data){
 await publishFile(path,JSON.stringify(data,null,2)+'\n');
}
async function entries(dir){
 const names=(await readdir(dir)).filter(x=>/^\d+-.*\.json$/.test(x)).sort();
 for(let i=0;i<names.length;i++)if(names[i].split('-')[0]!==String(i).padStart(8,'0'))throw Error('journal sequence missing or duplicated; operator inspection required');
 return names;
}
// Shared across vaults, so simultaneous recovery does not exhaust descriptors.
let readers=0;const waitingReaders=[];
async function readRecord(path){
 await new Promise(resolve=>{if(readers<32){readers++;resolve();}else waitingReaders.push(resolve);});
 try{return JSON.parse(await readFile(path,'utf8'));}
 finally{const next=waitingReaders.shift();if(next)next();else readers--;}
}
function pendingFrom(records){const attempts=new Map();for(const r of records){if(r.status==='broadcast-intent')attempts.set(r.taskId,r);if(r.status==='included'||r.status==='not-submitted')attempts.delete(r.taskId);}return [...attempts.values()];}
export class ExecutionJournal {
 constructor({directory,network,vaultId,fingerprint}){
  if(!directory||!network||!Number.isInteger(vaultId)||vaultId<1||!(/^[0-9a-f]{64}$/i.test(fingerprint)))throw Error('explicit network, vault and fingerprint required');
  this.scope={network,vaultId,fingerprint};this.directory=join(directory,sha({network,vaultId}));
 }
 async locked(fn){
  await mkdir(this.directory,{recursive:true,mode:0o700});
  const path=join(this.directory,'executor.lock'),gatePath=join(this.directory,'executor.acquire');let lock,gate;
  // All new acquirers pass through this short gate, so two crash recoverers
  // cannot unlink a newly acquired vault lock. A crash inside the gate fails
  // closed; that gate requires operator inspection.
  try{gate=await open(gatePath,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new VaultBusy('vault acquisition in progress or interrupted; inspect executor.acquire');throw e;}
  try{
   await gate.writeFile(JSON.stringify({pid:process.pid,host:hostname()}));await gate.sync();
   try{lock=await open(path,'wx',0o600);}catch(e){
    if(e.code!=='EEXIST')throw e;
    let owner;try{owner=JSON.parse(await readFile(path,'utf8'));}catch{throw new VaultBusy('unreadable executor.lock; operator inspection required');}
    let dead=false;if(owner.host===hostname()&&Number.isSafeInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')dead=true;}}
    if(!dead)throw new VaultBusy('another executor or interrupted process owns this vault; inspect executor.lock');
    await unlink(path);lock=await open(path,'wx',0o600);
   }
   await lock.writeFile(JSON.stringify({pid:process.pid,host:hostname(),scope:this.scope,at:new Date().toISOString()}));await lock.sync();
  }catch(e){if(lock){await lock.close();await unlink(path);}throw e;}
  finally{await gate.close();await unlink(gatePath);}
  try{return await fn();}
  finally{await lock.close();await unlink(path);}
 }
 async records(){const names=await entries(this.directory),records=[];
  for(let i=0;i<names.length;i+=32){
   const batch=await Promise.allSettled(names.slice(i,i+32).map(name=>readRecord(join(this.directory,name))));
   const failed=batch.find(x=>x.status==='rejected');if(failed)throw failed.reason;
   records.push(...batch.map(x=>x.value));
  }
  for(const r of records)if(JSON.stringify(r.scope)!==JSON.stringify(this.scope))throw Error('journal scope changed; reconcile original policy before changing runtime');
  return records;}
 async append(event){const names=await entries(this.directory);const n=names.length;await durable(join(this.directory,String(n).padStart(8,'0')+'-'+event.status+'.json'),{...event,scope:this.scope,at:new Date().toISOString()});}
 async unresolved(){return pendingFrom(await this.records());}
 async reconcile(readReceipt){return this.locked(async()=>{
  const records=await this.records(),pending=pendingFrom(records),out=[];
  for(const attempt of pending){
   const outcome=records.slice(records.indexOf(attempt)+1).findLast(x=>x.taskId===attempt.taskId&&x.status==='broadcast-result')?.outcome;
   if(outcome?.submissionStatus==='not-submitted'){
    await this.append({status:'not-submitted',taskId:attempt.taskId,reason:outcome.reason});out.push({taskId:attempt.taskId,result:{status:'not-submitted'}});continue;
   }
   const result=await readReceipt({...attempt,outcome});
   if(result?.status==='included'){
    if(result.userId!==this.scope.vaultId||!result.contentHash||!result.checkpoint)throw Error('receipt identity missing');
    await this.append({status:'included',taskId:attempt.taskId,result});
   }
   if(result?.status==='not-submitted')await this.append({status:'not-submitted',taskId:attempt.taskId,reason:result.reason,source:result.source,submissionLog:result.submissionLog});
   out.push({taskId:attempt.taskId,result});
  }
  return out;
 });}
 async execute({task,prove,validateProof,isCurrent,prepareSubmission,submit,reconcile}){
  return this.locked(async()=>{
   const records=await this.records(),pending=pendingFrom(records);if(pending.length)throw new UnresolvedBroadcast(pending.map(x=>x.taskId));
   const taskId=sha({scope:this.scope,task});
   if(records.some(x=>x.taskId===taskId&&x.status==='included'))return {status:'already-included',taskId};
   if(!await isCurrent(task))throw new StaleTask('task state changed before proof');
   await this.append({status:'planned',taskId,task});
   let cached=records.findLast(x=>x.taskId===taskId&&x.status==='proved');
   if(cached&&validateProof&&!await validateProof(task,cached.proof))cached=null;
   const proof=cached?.proof??await prove(task);
   if(!cached)await this.append({status:'proved',taskId,proof});
   if(!await isCurrent(task))throw new StaleTask('task state changed during proof');
   const prepared=prepareSubmission?await prepareSubmission(task,proof):proof;
   await this.append({status:'broadcast-intent',taskId,task,proof:prepared});
   let outcome;try{outcome=await submit(task,prepared);}catch(e){outcome={error:e.message};}
   await this.append({status:'broadcast-result',taskId,outcome});
   if(outcome?.submissionStatus==='not-submitted'){
    await this.append({status:'not-submitted',taskId,reason:outcome.reason});
    return {status:'not-submitted',taskId,reason:outcome.reason};
   }
   const result=await reconcile({taskId,task,proof:prepared,outcome,scope:this.scope});
   if(result?.status==='included'){
    if(result.userId!==this.scope.vaultId||!result.contentHash||!result.checkpoint)throw Error('receipt identity missing');
    await this.append({status:'included',taskId,result});
   }
   return {taskId,...result,status:result?.status==='included'?'included':'unresolved'};
  });
 }
}
