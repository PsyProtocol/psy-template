// Formal service + actual loopback coordinator and shared filesystem. Proofs
// and chain are explicit stubs; this does not claim two physical hosts.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {homedir} from 'node:os';
import {startCoordinationServer} from '../executor/coordination/server.mjs';
import {createCoordinatedJournal} from '../executor/coordination/client.mjs';
import {ExecutionJournal} from '../executor/journal.mjs';
import {runCompositionService} from './service.mjs';import {encodeDocument} from './codec.mjs';
import {COMPOSITION_SDK} from './contract/runtimePolicy.mjs';
test('formal service coordinator route excludes a contender and persists one exact financial attempt',async()=>{
 const parent=join(homedir(),'.cache/psy-composition-service-tests');await mkdir(parent,{recursive:true});
 const root=await mkdtemp(join(parent,'coordinated-')),runtimeDirectory=join(root,'artifacts');await mkdir(runtimeDirectory);
 const authToken='explicit-unit-credential-'.repeat(3),intentId='a'.repeat(64);
 const scope={network:'sepolia',domainHash:'b'.repeat(64),sdkManifestHash:COMPOSITION_SDK,vaultId:123,
  fingerprint:'c'.repeat(64),publicKeyHash:'d'.repeat(64),intentId,registryHash:'e'.repeat(64),
  walletSha256:'f'.repeat(64),artifactRoot:runtimeDirectory};
 const server=await startCoordinationServer({directory:join(root,'authority'),authToken,scopes:[scope]});
 const options={...scope,runtimeDirectory,intent:join(root,'intent.json'),plan:join(root,'plan.json'),
  coordinator:{endpoint:server.url,authTokenFile:join(root,'credential')}};
 await writeFile(options.intent,encodeDocument({id:intentId,terms:{domainHash:scope.domainHash}}));
 await writeFile(options.plan,encodeDocument({registryHash:scope.registryHash}));await writeFile(options.coordinator.authTokenFile,authToken);
 let release,ready,phase=0,proofs=0,sends=0;
 const held=new Promise(r=>release=r),started=new Promise(r=>ready=r),task={operation:'fund',intentId};
 const adapterFactory=async()=>({model:{intent:{id:intentId}},close:async()=>{},quote:async t=>t,
  scan:async()=>phase===99?{checkpoint:100,action:null,reason:'controller-terminal-owner-claim-required'}:{checkpoint:99,action:task},
  isCurrent:async()=>true,prove:async()=>{proofs++;ready();await held;return{mock:true};},
  prepareSubmission:async(_t,p)=>({...p,submissionDirectory:join(runtimeDirectory,'composition/send-unit')}),
  submit:async()=>{sends++;return{};},reconcile:async()=>{phase=99;return{status:'included',userId:123,contentHash:'1'.repeat(64),checkpoint:100};}});
 const api={adapterFactory,wait:async()=>{},claimBuilder:async()=>({status:'owner-outboxes-claimed',intentId,sourceCheckpoint:100})};
 let first;
 try{
  first=runCompositionService(options,api);await started;
  const second=await runCompositionService(options,{...api,mode:'once'});assert.equal(second.status,'busy');
  release();assert.equal((await first).status,'completed');
  assert.equal(proofs,1);assert.equal(sends,1);
  const journal=await createCoordinatedJournal(options);assert.equal((await journal.records()).filter(r=>r.status==='broadcast-intent').length,1);
  // Explicitly refuse adopting a different existing LOCAL financial history.
  const local=new ExecutionJournal({directory:runtimeDirectory,network:scope.network,vaultId:123,fingerprint:scope.fingerprint});
  await local.locked(()=>local.append({status:'planned',taskId:'local-original'}));
  await assert.rejects(()=>createCoordinatedJournal(options),/reviewed migration/);
 }finally{release();await first?.catch(()=>{});await server.close();await rm(root,{recursive:true,force:true});}
});
