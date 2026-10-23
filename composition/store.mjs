// Durable local observation snapshots. Reuses Executor's fenced same-host file
// lock; this is NOT cross-machine coordination or on-chain intent authorization.
import assert from'node:assert/strict';import{mkdir,readdir,readFile}from'node:fs/promises';import{join}from'node:path';
import{ExecutionJournal}from'../executor/journal.mjs';import{publishFile}from'../executor/durableFile.mjs';import{commitment}from'./intent.mjs';
const encode=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?{$u:x.toString()}:x,null,2)+'\n';
const decode=text=>JSON.parse(text,(_k,x)=>{if(x&&typeof x==='object'&&Object.hasOwn(x,'$u')){assert.deepEqual(Object.keys(x),['$u']);assert.equal(typeof x.$u,'string');assert.match(x.$u,/^(0|[1-9]\d*)$/);return BigInt(x.$u);}return x;});
export class CompositionStore{
 constructor({directory,domainHash,vaultId,fingerprint}){assert.match(domainHash,/^[0-9a-f]{64}$/);this.domainHash=domainHash;this.vaultId=BigInt(vaultId);this.fingerprint=fingerprint;this.lock=new ExecutionJournal({directory,network:'composition-'+domainHash,vaultId:Number(vaultId),fingerprint});this.dir=join(this.lock.directory,'workflow');}
 async records(){
  await mkdir(this.dir,{recursive:true,mode:0o700});const files=(await readdir(this.dir)).filter(n=>n.endsWith('.json')).sort();let previous='0'.repeat(64);const records=[];
  for(const [i,f]of files.entries()){
   assert.equal(f,String(i).padStart(8,'0')+'-state.json','workflow sequence gap or unknown file');const r=decode(await readFile(join(this.dir,f),'utf8'));assert.equal(r.previous,previous);assert.equal(r.state.revision,i);assert.equal(r.state.intent.terms.domainHash,this.domainHash);assert.equal(r.state.intent.terms.execution.vaultId,this.vaultId);assert.equal(r.state.intent.terms.execution.fingerprint,this.fingerprint);
   assert.equal(r.hash,commitment('psy-composition-state-record-v1',{previous,state:r.state}),'workflow snapshot changed');previous=r.hash;records.push(r);
  }return records;
 }
 async initialize(state){return this.lock.locked(async()=>{assert.equal(state.revision,0);const records=await this.records();if(records.length){assert.equal(records[0].state.intent.id,state.intent.id,'one active intent per v1 store');assert.deepEqual(records[0].state,state,'initial plan changed');return records.at(-1).state;}return this.#append(state,'0'.repeat(64));});}
 async #append(state,previous){assert.equal(state.intent.terms.domainHash,this.domainHash);assert.equal(state.intent.terms.execution.vaultId,this.vaultId);assert.equal(state.intent.terms.execution.fingerprint,this.fingerprint);const r={previous,state,hash:commitment('psy-composition-state-record-v1',{previous,state})};await publishFile(join(this.dir,String(state.revision).padStart(8,'0')+'-state.json'),encode(r));return state;}
 async transition(expectedRevision,reduce){return this.lock.locked(async()=>{const rows=await this.records();assert.ok(rows.length,'initialize first');const previous=rows.at(-1);assert.equal(previous.state.revision,expectedRevision,'concurrent state changed');const state=reduce(structuredClone(previous.state));assert.ok(!state?.then,'pure synchronous state reduction required');assert.equal(state.revision,expectedRevision+1);assert.equal(state.intent.id,previous.state.intent.id,'intent replacement');assert.equal(state.planHash,previous.state.planHash,'plan replacement');return this.#append(state,previous.hash);});}
 async latest(){return(await this.records()).at(-1)?.state??null;}
}
