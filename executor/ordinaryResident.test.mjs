import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {ordinaryResident} from './ordinaryResident.mjs';
import {sha256} from './requestBinding.mjs';
async function fixture(fn,{wrongIdentity=false,wrongResponse=false,reject=false,hold=false,withReceipts=false}={}) {
 const dir=await mkdtemp(join(tmpdir(),'ordinary-resource-')),paths={};
 for(const k of ['binary','config','dependencies','secret','sdkManifest']){paths[k]=join(dir,k);await writeFile(paths[k],k);}
 if(withReceipts)await writeFile(paths.config,JSON.stringify({defaultNetwork:'test',networks:{test:{api_services_url:['https://services.test'],users_per_realm:1000,realm_configs:[{id:0,rpc_url:['https://realm.test']}]}}}));
 await writeFile(join(dir,'input'),'input');
 const publicKeyHash='a'.repeat(64);let builds=0,jobs=0,child;
 const spawnProcess=()=>{
  builds++;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('exit',1));
  child.stdin=new Writable({write(data,_e,done){jobs++;const j=JSON.parse(String(data));if(!hold)setImmediate(async()=>{
   if(j.action==='call'){
    await mkdir(j.out);const end='f'.repeat(64),core={checkpoint_id:3,new_user_leaf:{public_key:publicKeyHash,user_id:123,nonce:1},state_transition:{end_user_leaf_hash:end}};
    for(const [name,value]of Object.entries({'preflight.json':{fullUpsVerified:true,userId:123,endUserLeafHash:end,core,inputSha256:sha256('input')},'request.json':{user_ec_input:{core}},'intent.json':{userId:123,nonce:1,endUserLeafHash:end}}))await writeFile(join(j.out,name),JSON.stringify(value));
   }
   child.stdout.write('PSY_ORDINARY_SERVER '+JSON.stringify({id:wrongResponse?j.id+'x':j.id,ok:!reject,phase:'test',reasonCode:reject?'REJECTED':null})+'\n');
  });done();},final(done){queueMicrotask(()=>child.emit('exit',0));done();}});
  queueMicrotask(()=>child.stdout.write('PSY_ORDINARY_SERVER '+JSON.stringify({ready:true,publicKeyHash:wrongIdentity?'b'.repeat(64):publicKeyHash,sessionConstructionMs:42})+'\n'));return child;
 };
 const worker=await ordinaryResident({...paths,binarySha256:sha256('binary'),sdkSha256:sha256('sdkManifest'),publicKeyHash,spawnProcess,timeout:500});
 let index=0;const run=(action='preflight')=>{const n=index++;return worker.run({action,input:join(dir,'input'),out:join(dir,n===0?'out':'out-'+n),log:join(dir,'job-'+n+'.log')});};
 try{await fn({worker,paths,dir,run,get builds(){return builds;},get jobs(){return jobs;}});}finally{await worker.close();await rm(dir,{recursive:true,force:true});}
}
test('sequential ordinary jobs reuse one pinned process, without reusing a request',()=>fixture(async x=>{
 const first=await x.run();assert.equal(first.coldStart,true);assert.equal(first.sessionConstructionMillisecondsCharged,42);const r=await x.run();assert.equal(r.coldStart,false);assert.equal(r.sessionConstructionMillisecondsCharged,0);assert.equal(r.residentStartup.sessionConstructionMs,42);assert.equal(x.builds,1);assert.equal(x.jobs,2);
 const cold=(await readFile(join(x.dir,'job-0.log.lifecycle.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),warm=(await readFile(join(x.dir,'job-1.log.lifecycle.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.ok(cold.find(r=>r.event==='ready').sessionConstructionMilliseconds===42);assert.ok(cold.find(r=>r.event==='spawned'));assert.equal(warm.some(r=>r.event==='spawned'),false);assert.ok(cold.at(-1).ok&&warm.at(-1).ok);for(let i=1;i<cold.length;i++)assert.ok(cold[i].elapsedMilliseconds>=cold[i-1].elapsedMilliseconds);
}));
test('changed executable/network/dependencies/SDK/signer stop before another job',async()=>{
 for(const field of ['binary','config','dependencies','sdkManifest','secret'])await fixture(async x=>{
  await x.run();await writeFile(x.paths[field],'changed');await assert.rejects(x.run(),/changed/);assert.equal(x.jobs,1);await assert.rejects(x.run(),/unavailable/);
 });
});
test('concurrent requests are rejected even while binding files are being checked',()=>fixture(async x=>{
 const first=x.run();await assert.rejects(x.run(),/one active/);await first;assert.equal(x.jobs,1);
}));
test('ACK never releases the financial gate; a missing exact preflight stays unresolved',()=>fixture(async x=>{
 await x.run('call');await assert.rejects(x.run(),/original result/);await rm(join(x.dir,'out/preflight.json'));await assert.rejects(x.worker.reconcile(),/ENOENT/);await assert.rejects(x.run(),/original result/);assert.equal(x.jobs,1);
}));
test('tampered request, signer, input or end leaf cannot release an ACK gate',async()=>{
 for(const field of ['request','signer','input','end'])await fixture(async x=>{
  await x.run('call');const file=join(x.dir,'out',field==='request'?'request.json':field==='end'?'intent.json':'preflight.json'),v=JSON.parse(await readFile(file,'utf8'));
  if(field==='request')v.user_ec_input.core.new_user_leaf.nonce=999;
  if(field==='signer')v.core.new_user_leaf.public_key='b'.repeat(64);
  if(field==='input')v.inputSha256='b'.repeat(64);
  if(field==='end')v.endUserLeafHash='b'.repeat(64);
  await writeFile(file,JSON.stringify(v));await assert.rejects(x.worker.reconcile());await assert.rejects(x.run(),/original result/);assert.equal(x.jobs,1);
 });
});
test('only exact historical state plus an included indexed receipt release the next job',t=>fixture(async x=>{
 const hash='c'.repeat(64);let pending=true;
 t.mock.method(globalThis,'fetch',async(url,options)=>({ok:true,json:async()=>{
  if(options?.method==='POST')return{result:'f'.repeat(64)};
  if(url.includes('/get/user/transactions'))return{success:true,data:{user_id:123,has_next:false,items:[{tx_type:'user_endcap',owner_user_id:123,included_checkpoint_id:4,content_hash:hash}]}};
  return{success:true,data:{status:pending?'pending':'included',owner_user_id:123,included_checkpoint_id:4,content_hash:hash}};
 }}));
 await x.run('call');assert.equal((await x.worker.reconcile()).status,'unresolved');await assert.rejects(x.run(),/original result/);
 pending=false;assert.equal((await x.worker.reconcile()).status,'included');await x.run();assert.equal(x.jobs,2);assert.equal(x.builds,1);
},{withReceipts:true}));
test('concurrent exact reconciliations share one read flight and cannot release the next transaction',t=>fixture(async x=>{
 const hash='c'.repeat(64);let release,listings=0;const wait=new Promise(r=>{release=r;});
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url.includes('/get/user/transactions')){listings++;await wait;return{ok:true,json:async()=>({success:true,data:{user_id:123,has_next:false,items:[{tx_type:'user_endcap',owner_user_id:123,included_checkpoint_id:4,content_hash:hash}]}})};}
  return{ok:true,json:async()=>options?.method==='POST'?{result:'f'.repeat(64)}:{success:true,data:{status:'included',owner_user_id:123,included_checkpoint_id:4,content_hash:hash}}};
 });
 await x.run('call');const a=x.worker.reconcile(),b=x.worker.reconcile();release();const first=await a;assert.equal(first.status,'included');first.receipt.data.owner_user_id=999;
 await x.run('call');const second=await b;assert.equal(second.status,'included');assert.equal(second.receipt.data.owner_user_id,123,'each observer receives its own receipt object');await assert.rejects(x.run(),/original result/);assert.equal(listings,1);assert.equal(x.jobs,2);
},{withReceipts:true}));
test('wrong signer, mismatched response and rejection poison the process without automatic retry',async()=>{
 for(const options of [{wrongIdentity:true},{wrongResponse:true},{reject:true}])await fixture(async x=>{
  await assert.rejects(x.run());await assert.rejects(x.run(),/unavailable/);assert.equal(x.builds,1);if(options.wrongIdentity)assert.equal(x.jobs,0,'no task is sent before the signer readiness check');
  const trace=(await readFile(join(x.dir,'job-0.log.lifecycle.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(trace.at(-1).event,'finished');assert.equal(trace.at(-1).ok,false);
 },options);
});
test('stalled proof is stopped and cannot trigger another send',()=>fixture(async x=>{
 await assert.rejects(x.run('call'),/deadline/);await assert.rejects(x.run(),/unavailable/);assert.equal(x.jobs,1);
},{hold:true}));
