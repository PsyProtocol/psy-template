import {mkdir,open,readFile,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export class StaleTask extends Error {constructor(message){super(message);this.name='StaleTask';}}
async function durable(path,data){const f=await open(path,'wx',0o600);try{await f.writeFile(JSON.stringify(data,null,2)+'\n');await f.sync();}finally{await f.close();}}
async function entries(dir){return (await readdir(dir)).filter(x=>/^\d+-.*\.json$/.test(x)).sort();}
export class ExecutionJournal {
 constructor({directory,network,vaultId,fingerprint}){
  if(!directory||!network||!Number.isInteger(vaultId)||vaultId<1||!(/^[0-9a-f]{64}$/i.test(fingerprint)))throw Error('explicit network, vault and fingerprint required');
  this.scope={network,vaultId,fingerprint};this.directory=join(directory,sha({network,vaultId}));
 }
 async locked(fn){
  await mkdir(this.directory,{recursive:true,mode:0o700});
  const path=join(this.directory,'executor.lock');let lock;
  try{lock=await open(path,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('another executor or interrupted process owns this vault; inspect executor.lock');throw e;}
  try{await lock.writeFile(JSON.stringify({pid:process.pid,scope:this.scope,at:new Date().toISOString()}));await lock.sync();return await fn();}
  finally{await lock.close();await unlink(path);}
 }
 async records(){return Promise.all((await entries(this.directory)).map(async name=>JSON.parse(await readFile(join(this.directory,name),'utf8'))));}
 async append(event){const names=await entries(this.directory);const n=names.length;await durable(join(this.directory,String(n).padStart(8,'0')+'-'+event.status+'.json'),{...event,scope:this.scope,at:new Date().toISOString()});}
 async unresolved(){const records=await this.records(), attempts=new Map();for(const r of records){if(r.status==='broadcast-intent')attempts.set(r.taskId,r);if(r.status==='included')attempts.delete(r.taskId);}return [...attempts.values()];}
 async reconcile(readReceipt){return this.locked(async()=>{const pending=await this.unresolved(),records=await this.records(),out=[];for(const attempt of pending){const outcome=records.findLast(x=>x.taskId===attempt.taskId&&x.status==='broadcast-result')?.outcome;const result=await readReceipt({...attempt,outcome});if(result?.status==='included'){if(result.userId!==this.scope.vaultId||!result.contentHash||!result.checkpoint)throw Error('receipt identity missing');await this.append({status:'included',taskId:attempt.taskId,result});}out.push({taskId:attempt.taskId,result});}return out;});}
 async execute({task,prove,isCurrent,submit,reconcile}){
  return this.locked(async()=>{
   const pending=await this.unresolved();if(pending.length)throw Error('unresolved broadcast blocks this vault; reconcile before retrying');
   const taskId=sha({scope:this.scope,task});
   if((await this.records()).some(x=>x.taskId===taskId&&x.status==='included'))return {status:'already-included',taskId};
   if(!await isCurrent(task))throw new StaleTask('task state changed before proof');
   await this.append({status:'planned',taskId,task});
   const cached=(await this.records()).findLast(x=>x.taskId===taskId&&x.status==='proved');
   const proof=cached?.proof??await prove(task);
   if(!cached)await this.append({status:'proved',taskId,proof});
   if(!await isCurrent(task))throw new StaleTask('task state changed during proof');
   await this.append({status:'broadcast-intent',taskId,task});
   let outcome;try{outcome=await submit(task,proof);}catch(e){outcome={error:e.message};}
   await this.append({status:'broadcast-result',taskId,outcome});
   const result=await reconcile({taskId,task,outcome,scope:this.scope});
   if(result?.status==='included'){
    if(result.userId!==this.scope.vaultId||!result.contentHash||!result.checkpoint)throw Error('receipt identity missing');
    await this.append({status:'included',taskId,result});
   }
   return {taskId,...result,status:result?.status==='included'?'included':'unresolved'};
  });
 }
}
