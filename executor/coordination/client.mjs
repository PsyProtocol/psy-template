// Shared authoritative journal, plus immutable artifacts mounted at the SAME
// absolute artifactRoot on every worker. Never silently falls back to local IO.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {ExecutionJournal,VaultBusy} from '../journal.mjs';
import {publishFile} from '../durableFile.mjs';
import {decodeDocument} from '../../composition/codec.mjs';
import {coordinationScope} from './scope.mjs';
import {retryRead} from '../readRetry.mjs';
export class CoordinationLeaseLost extends Error {}
export class CoordinationWriteUnknown extends Error {}
export class CoordinatedJournal extends ExecutionJournal {
  constructor({scope,endpoint,authToken,fetchImpl=fetch}) {
    const bound=coordinationScope(scope);
    super({directory:scope.artifactRoot,network:scope.network,vaultId:scope.vaultId,fingerprint:scope.fingerprint});
    const u=new URL(endpoint);
    assert.ok(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)),
      'remote coordinator requires TLS');
    assert.equal(u.username+u.password+u.search+u.hash,'');assert.equal(u.pathname,'/');
    assert.ok(typeof authToken==='string'&&authToken.length>=32);
    this.bound=bound;this.endpoint=u.origin;this.fetchImpl=fetchImpl;this.lease=null;
    Object.defineProperty(this,'authToken',{value:authToken,enumerable:false});
  }
  async request(operation,body) {
    const perform=async()=>{
    const response=await this.fetchImpl(this.endpoint+'/v1/'+operation,{method:'POST',
      headers:{authorization:'Bearer '+this.authToken,'content-type':'application/json'},
      body:JSON.stringify({scope:this.bound.scope,...body}),signal:AbortSignal.timeout(15000)});
    const text=await response.text();assert.ok(Buffer.byteLength(text)<=16*1024*1024,'coordinator response limit');
    const value=JSON.parse(text);
    if(response.status>=500)throw Object.assign(Error('coordination service unavailable'),{status:response.status});
    if(response.status===409){if(value.error==='vault-busy')throw new VaultBusy('coordinator lease is owned');throw new CoordinationLeaseLost('coordinator fence rejected operation');}
    assert.equal(response.ok,true,'coordinator request rejected');assert.equal(value.ok,true);
    assert.equal(value.key,this.bound.key,'coordinator scope changed');return value;
    };
    return operation==='records'?retryRead(perform):perform();
  }
  async records() {
    const rows=[];let revision;
    do{
      const page=await this.request('records',{cursor:rows.length,...(revision===undefined?{}:{revision})});
      assert.ok(Number.isSafeInteger(page.revision)&&page.revision>=0&&page.revision<=100000);
      if(revision===undefined)revision=page.revision;assert.equal(page.revision,revision);
      assert.equal(page.cursor,rows.length);assert.ok(Array.isArray(page.records)&&page.records.length<=256);
      assert.ok(page.records.length>0||rows.length===revision,'coordinator pagination stalled');
      for(const row of page.records)assert.deepEqual(row.scope,this.scope,'financial journal scope changed');
      rows.push(...page.records);assert.ok(rows.length<=revision);
    }while(rows.length<revision);
    return rows;
  }
  async assertLease() {
    if(!this.lease)throw new CoordinationLeaseLost('no coordinator execution lease');
    const token=this.lease;
    await this.request('renew',token);
    if(this.lease!==token)throw new CoordinationLeaseLost('execution lease changed');
  }
  async locked(fn) {
    if(this.lease)throw new VaultBusy('this journal already has an executing lease');
    const owner=randomUUID(),grant=await this.request('acquire',{owner});
    assert.equal(grant.owner,owner);assert.match(grant.token,/^[0-9a-f-]{36}$/);
    assert.ok(Number.isSafeInteger(grant.leaseMs)&&grant.leaseMs>=1000&&grant.leaseMs<=180000);
    const lease={owner,token:grant.token};this.lease=lease;
    let lost,renewing=false;
    const timer=setInterval(async()=>{if(renewing)return;renewing=true;
      try{await this.assertLease();}catch(e){lost=e;}finally{renewing=false;}
    },Math.floor(grant.leaseMs/3));timer.unref();
    try{const result=await fn();if(lost)throw lost;return result;}
    finally{clearInterval(timer);this.lease=null;
      // A lost release response cannot erase a newer lease. The server fences
      // exact owner/token; its expiry is the availability fallback.
      await this.request('release',lease).catch(()=>{});
    }
  }
  async append(event) {
    await this.assertLease();
    const eventId=randomUUID();
    try{await this.request('append',{...this.lease,eventId,event});}
    catch(error){
      if(error instanceof CoordinationLeaseLost)throw error;
      // Reconcile the exact append identity with a READ, never retry the POST.
      const existing=(await this.records()).find(r=>r.eventId===eventId);
      if(existing){const {scope:_s,at:_a,eventId:_id,...actual}=existing;assert.deepEqual(actual,event);return;}
      throw new CoordinationWriteUnknown('original coordinator append outcome unknown; no financial driver replacement',{cause:error});
    }
  }
  async execute(args) {
    return super.execute({...args,submit:async(task,proof)=>{
      try{await this.assertLease();}
      catch(error){
        // This wrapper has not invoked the financial driver. Only an absent
        // fresh submission directory can receive this positive no-send fact.
        const out=proof.submissionDirectory;
        assert.ok(typeof out==='string'&&resolve(out).startsWith(resolve(this.bound.scope.artifactRoot)+'/composition/'));
        await mkdir(out);
        await publishFile(join(out,'failure.json'),JSON.stringify({ok:false,
          phase:'coordinator-before-driver',broadcastMayHaveBeenAttempted:false,
          automaticRetry:false,driverNotInvoked:true,reason:'execution lease unavailable before invoking financial driver'})+'\n');
        throw error;
      }
      return args.submit(task,proof);
    }});
  }
}
export async function createCoordinatedJournal(options) {
  const c=options.coordinator;assert.deepEqual(Object.keys(c).sort(),['authTokenFile','endpoint'].sort());
  const local=new ExecutionJournal({directory:options.runtimeDirectory,network:options.network,vaultId:options.vaultId,fingerprint:options.fingerprint});
  let existing=[];try{existing=await local.records();}catch(e){if(e.code!=='ENOENT')throw e;}
  assert.equal(existing.length,0,'existing local journal needs reviewed migration; no silent switch');
  const intent=decodeDocument(await readFile(options.intent,'utf8')),plan=decodeDocument(await readFile(options.plan,'utf8'));
  const scope={network:options.network,domainHash:intent.terms.domainHash,sdkManifestHash:options.sdkManifestHash,
    vaultId:options.vaultId,fingerprint:options.fingerprint,publicKeyHash:options.publicKeyHash,
    intentId:intent.id,registryHash:plan.registryHash,walletSha256:options.walletSha256,artifactRoot:options.runtimeDirectory};
  return new CoordinatedJournal({scope,endpoint:c.endpoint,authToken:(await readFile(c.authTokenFile,'utf8')).trim()});
}
