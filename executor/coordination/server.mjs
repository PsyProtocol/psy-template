// Separate app-side coordination authority. No chain access, signing key or
// contract update. Bind loopback; remote clients require a TLS reverse proxy.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {ExecutionJournal} from '../journal.mjs';
import {coordinationScope} from './scope.mjs';
import {assertDurableRuntimeDirectory} from '../runtimeStorage.mjs';
const digest=x=>createHash('sha256').update(x).digest();
const error=(status,message)=>Object.assign(Error(message),{status});
export async function startCoordinationServer({directory,authToken,scopes,port=0,leaseMs=30000,
  maxRecords=10000,clock=Date.now}) {
  assert.ok(typeof authToken==='string'&&authToken.length>=32,'strong explicit coordinator credential');
  assertDurableRuntimeDirectory(directory);
  assert.ok(Number.isSafeInteger(leaseMs)&&leaseMs>=1000&&leaseMs<=180000);
  assert.ok(Number.isSafeInteger(maxRecords)&&maxRecords>=1&&maxRecords<=100000);
  const approved=new Map(scopes.map(s=>{const {scope,key}=coordinationScope(s);return[key,scope];}));
  assert.equal(approved.size,scopes.length);assert.ok(approved.size>0);
  const leases=new Map(),chains=new Map();
  const serialize=(key,fn)=>{
    const task=(chains.get(key)??Promise.resolve()).then(fn);
    const drain=task.then(()=>{},()=>{});chains.set(key,drain);
    return task.finally(()=>{if(chains.get(key)===drain)chains.delete(key);});
  };
  const journals=new Map([...approved].map(([key,s])=>[key,new ExecutionJournal({directory:join(directory,key),
    network:s.network,vaultId:s.vaultId,fingerprint:s.fingerprint})]));
  for(const journal of journals.values())await mkdir(journal.directory,{recursive:true,mode:0o700});
  const valid=(key,body)=>{
    const current=leases.get(key);
    if(!current||current.token!==body.token||current.owner!==body.owner||current.until<=clock())
      throw error(409,'lease-lost');
    return current;
  };
  const tokenHash=digest(authToken),server=createServer(async(req,res)=>{
    try{
      if(req.method!=='POST')throw error(405,'POST required');
      const supplied=String(req.headers.authorization??'');
      if(!supplied.startsWith('Bearer ')||!timingSafeEqual(digest(supplied.slice(7)),tokenHash))throw error(401,'unauthorized');
      let bytes=0,text='';for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw error(413,'body limit');text+=chunk;}
      const body=JSON.parse(text),{key,scope}=coordinationScope(body.scope);
      assert.deepEqual(scope,approved.get(key),'scope is not approved');
      const journal=journals.get(key),operation=req.url;
      const result=await serialize(key,async()=>{
        if(operation==='/v1/acquire'){
          assert.match(body.owner,/^[0-9a-f-]{36}$/);const old=leases.get(key);
          if(old&&old.until>clock()&&old.owner!==body.owner)throw error(409,'vault-busy');
          const next=old&&old.until>clock()?old:{owner:body.owner,token:randomUUID(),until:0};
          next.until=clock()+leaseMs;leases.set(key,next);return{...next,leaseMs};
        }
        if(operation==='/v1/renew'){const active=valid(key,body);active.until=clock()+leaseMs;return{...active,leaseMs};}
        if(operation==='/v1/release'){valid(key,body);leases.delete(key);return{released:true};}
        if(operation==='/v1/records'){
          const records=await journal.records(),revision=body.revision??records.length,cursor=body.cursor??0;
          assert.ok(Number.isSafeInteger(revision)&&revision>=0&&revision<=records.length);
          assert.ok(Number.isSafeInteger(cursor)&&cursor>=0&&cursor<=revision);
          return{revision,cursor,records:records.slice(cursor,Math.min(cursor+256,revision))};
        }
        if(operation==='/v1/append'){
          valid(key,body);assert.match(body.eventId,/^[0-9a-f-]{36}$/);
          const event=body.event;assert.ok(event&&typeof event==='object'&&!Array.isArray(event));
          assert.ok(!['scope','at','eventId'].some(k=>Object.hasOwn(event,k)),'reserved record metadata');
          assert.ok(['planned','proved','broadcast-intent','broadcast-result','included','not-submitted','session-restart-reserved'].includes(event.status));
          return journal.locked(async()=>{
            const rows=await journal.records();valid(key,body);
            const known=rows.find(r=>r.eventId===body.eventId);
            if(known){const {scope:_s,at:_a,eventId:_id,...prior}=known;assert.deepEqual(prior,event);return{revision:rows.length,eventId:body.eventId};}
            if(rows.length>=maxRecords)throw error(507,'reviewed journal capacity reached');
            const pending=await journal.unresolved();
            if(event.status==='broadcast-intent'&&pending.length)throw error(409,'original-broadcast-unresolved');
            if(['broadcast-result','included','not-submitted'].includes(event.status))
              assert.ok(pending.some(r=>r.taskId===event.taskId),'only original pending identity may be closed');
            if(event.status==='included'){
              assert.equal(event.result?.status,'included');assert.equal(event.result.userId,scope.vaultId);
              assert.match(event.result.contentHash,/^[0-9a-f]{64}$/);
              assert.ok(Number.isSafeInteger(event.result.checkpoint)&&event.result.checkpoint>0);
            }
            if(event.status==='session-restart-reserved'){
              assert.equal(pending.length,0);const prior=rows.filter(r=>r.status==='session-restart-reserved');
              assert.ok(prior.length<3,'coordinator lifetime recovery cap');assert.equal(event.count,prior.length+1);
              assert.equal(event.intentId,scope.intentId);assert.equal(event.sdkManifestHash,scope.sdkManifestHash);
              assert.equal(event.walletSha256,scope.walletSha256);
            }
            await journal.append({...event,eventId:body.eventId});
            return{revision:rows.length+1,eventId:body.eventId};
          });
        }
        throw error(404,'unknown operation');
      });
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,key,...result}));
    }catch(e){res.writeHead(e.status??400,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:e.status?e.message:'invalid coordination request'}));}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  // Single writer authority per root. A second server cannot serve the same
  // ledger concurrently; interrupted short acquisition gates fail closed.
  const rootLock=new ExecutionJournal({directory:join(directory,'authority'),network:'coordinator-v1',vaultId:1,fingerprint:'f'.repeat(64)});
  let ready,failed;const listening=new Promise((a,b)=>{ready=a;failed=b;});
  let finish;const closed=new Promise(r=>{finish=r;});
  const lifetime=rootLock.locked(async()=>{
    server.once('error',failed);await new Promise((a,b)=>{server.listen(port,'127.0.0.1',a);server.once('error',b);});
    ready();await closed;
  });lifetime.catch(failed);await listening;
  return {url:'http://127.0.0.1:'+server.address().port,
    close:async()=>{await new Promise((a,b)=>server.close(e=>e?b(e):a()));finish();await lifetime;}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const config=JSON.parse(await readFile(process.argv[2],'utf8'));
 assert.deepEqual(Object.keys(config).sort(),['authTokenFile','directory','port','scopes'].sort());
 const authToken=(await readFile(config.authTokenFile,'utf8')).trim();
 const server=await startCoordinationServer({...config,authToken});
 console.log(JSON.stringify({service:'composition-coordinator',url:server.url,scopeCount:config.scopes.length,
  scope:'app-side ledger only; remote TLS/shared artifact storage and two-host acceptance are separate gates'}));
 let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{if(closing)return;closing=true;await server.close();});
}
