// Real durable journals and service lifecycle; explicit mock proof/RPC below.
// These are transport safety regressions, not cryptographic/network evidence.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';import {homedir} from 'node:os';
import {runCompositionService,serviceSettings} from './service.mjs';
import {ProofSessionReadUnavailable,proofReadEvidence} from './proofReadRecovery.mjs';
import {ExecutionJournal} from '../executor/journal.mjs';
import {COMPOSITION_SDK} from './contract/runtimePolicy.mjs';
async function fixture(){
 const parent=join(homedir(),'.cache/psy-composition-service-tests');await mkdir(parent,{recursive:true});
 const root=await mkdtemp(join(parent,'case-')),options={runtimeDirectory:root,network:'sepolia',vaultId:123,
   fingerprint:'b'.repeat(64),walletSha256:'a'.repeat(64),sdkManifestHash:COMPOSITION_SDK};
 const state={builds:0,closes:0,proofs:0,sends:0,receipts:0,phase:0,waits:0};
 const intentId='c'.repeat(64),task={intentId,operation:'fund',validUntilCheckpoint:'164'};
 const receipt={status:'included',userId:123,contentHash:'d'.repeat(64),checkpoint:101};
 const journal=new ExecutionJournal({directory:root,...options});
 const make=()=>{state.builds++;return {model:{intent:{id:intentId}},
   scan:async()=>state.phase===99?{action:null,reason:'controller-terminal-owner-claim-required',checkpoint:101}:{action:task,checkpoint:100},
   quote:async t=>t,isCurrent:async()=>true,validateProof:async()=>true,
   prove:async()=>{state.proofs++;return{mock:true};},submit:async()=>{state.sends++;return{};},
   reconcile:async()=>{state.receipts++;state.phase=99;return receipt;},close:async()=>{state.closes++;}};};
 const events=[],args={adapterFactory:make,onStatus:e=>events.push(e),wait:async()=>{state.waits++;assert.ok(state.waits<20,'no endless mock loop');},
   settings:{intervalMs:1,maxBackoffMs:16},claimBuilder:async()=>({status:'owner-outboxes-claimed',intentId,sourceCheckpoint:101})};
 const readError=async()=>{
  const dir=join(root,'failed-'+state.builds+'-'+state.proofs);await mkdir(dir);
  const endpoint='https://realm1-stg.psy-protocol.xyz',failure={ok:false,phase:'start-compact-session',reason:'Connection error to '+endpoint+': unavailable',broadcastMayHaveBeenAttempted:false,automaticRetry:false};
  await writeFile(join(dir,'failure.json'),JSON.stringify(failure));
  const cause=Object.assign(Error('sealed response'),{residentRejection:{phase:failure.phase,error:failure.reason}});
  return new ProofSessionReadUnavailable({...await proofReadEvidence(dir,cause.residentRejection,[endpoint]),
    intentId,driverSha256:options.walletSha256,sdkManifestHash:COMPOSITION_SDK,action:'prove'},cause);
 };
 return {root,options,state,task,receipt,journal,intentId,make,args,events,readError,
   cleanup:()=>rm(root,{recursive:true,force:true})};
}
test('service closes failed proof child before reconstruction, reconciles, proves fresh and completes',async()=>{
 const x=await fixture();try{
  x.args.adapterFactory=()=>{if(x.state.builds===1)assert.equal(x.state.closes,1);const a=x.make();if(x.state.builds===1)a.prove=async()=>{x.state.proofs++;throw await x.readError();};return a;};
  const result=await runCompositionService(x.options,x.args);assert.equal(result.status,'completed');
  assert.equal(x.state.builds,2);assert.equal(x.state.closes,2);assert.equal(x.state.proofs,2);assert.equal(x.state.sends,1);
  const rows=await x.journal.records();assert.equal(rows.filter(r=>r.status==='session-restart-reserved').length,1);
  assert.equal(rows.filter(r=>r.status==='broadcast-intent').length,1);assert.equal((await x.journal.unresolved()).length,0);
 }finally{await x.cleanup();}
});
test('unknown broadcast is reconciled by original identity without another quote/proof/send',async()=>{
 const x=await fixture();try{
  x.args.adapterFactory=()=>{const a=x.make();a.reconcile=async record=>{assert.equal(record.task.intentId,x.intentId);x.state.receipts++;if(x.state.receipts<3)return{status:'unresolved'};x.state.phase=99;return x.receipt;};return a;};
  assert.equal((await runCompositionService(x.options,x.args)).status,'completed');
  assert.equal(x.state.builds,1);assert.equal(x.state.proofs,1);assert.equal(x.state.sends,1);
 }finally{await x.cleanup();}
});
test('session restart allowance survives a service process restart and exhausted budget never broadcasts',async()=>{
 const x=await fixture();try{
  x.args.settings.maxSessionRestarts=1;x.args.adapterFactory=()=>{const a=x.make();a.prove=async()=>{x.state.proofs++;throw await x.readError();};return a;};
  assert.equal((await runCompositionService(x.options,{...x.args,mode:'once'})).status,'session-restart-reserved');
  assert.equal((await runCompositionService(x.options,x.args)).status,'recovery-budget-exhausted');
  assert.equal(x.state.builds,2);assert.equal(x.state.sends,0);
  assert.equal((await x.journal.records()).filter(r=>r.status==='session-restart-reserved').length,1);
 }finally{await x.cleanup();}
});
test('unclassified SDK/key errors and unconfirmed child exit halt without reconstruction',async()=>{
 for(const unconfirmed of [false,true]){const x=await fixture();try{
  x.args.adapterFactory=()=>{const a=x.make();a.prove=async()=>{x.state.proofs++;if(unconfirmed)throw await x.readError();throw Error('code/layout/key mismatch');};if(unconfirmed)a.close=async()=>{throw Error('child exit unconfirmed');};return a;};
  await assert.rejects(()=>runCompositionService(x.options,x.args),unconfirmed?/exit unconfirmed/:/key mismatch/);
  assert.equal(x.state.builds,1);assert.equal(x.state.sends,0);
 }finally{await x.cleanup();}}
});
test('ordinary owner claim request preserves U124 numeric bytes and service never signs it',async()=>{
 const x=await fixture(),stop=new AbortController();try{
  x.state.phase=99;x.args.claimBuilder=async()=>({status:'owner-signature-required',intentId:x.intentId,input:{amount:(1n<<62n)+17n},pending:[{amount:1n}]});
  x.args.onStatus=e=>{x.events.push(e);if(e.status==='owner-claim-required')stop.abort();};
  await runCompositionService(x.options,{...x.args,signal:stop.signal});
  const e=x.events.find(e=>e.status==='owner-claim-required');assert.match(await readFile(e.requestPath,'utf8'),/4611686018427387921/);
  assert.equal(x.state.proofs+x.state.sends,0);
 }finally{await x.cleanup();}
});
test('service settings reject unbounded retry and unknown options',()=>{
 for(const x of [{maxSessionRestarts:1000},{intervalMs:0},{maxReadFailures:0},{automaticResubmit:true},{prewarmResources:'yes'}])assert.throws(()=>serviceSettings(x));
});
test('explicit service prewarm occurs once before financial work; default stays disabled',async()=>{
 for(const enabled of[false,true]){const x=await fixture();let warms=0;try{
  x.args.settings.prewarmResources=enabled;x.args.adapterFactory=()=>{const a=x.make();a.warm=async()=>{warms++;assert.equal(x.state.proofs+x.state.sends,0);return{residentStartup:{ready:true}};};return a;};
  assert.equal((await runCompositionService(x.options,x.args)).status,'completed');assert.equal(warms,enabled?1:0);assert.equal(x.state.sends,1);
 }finally{await x.cleanup();}}
});
test('reconcile-only service does not build optional proof resources',async()=>{
 const x=await fixture();try{x.args.settings.prewarmResources=true;x.args.adapterFactory=()=>{const a=x.make();a.warm=async()=>assert.fail('reconcile-only must not warm');return a;};assert.equal((await runCompositionService(x.options,{...x.args,mode:'reconcile'})).status,'reconciled');assert.equal(x.state.proofs+x.state.sends,0);}finally{await x.cleanup();}
});
test('failed explicit prewarm halts without a financial request or silent fallback',async()=>{
 const x=await fixture();try{x.args.settings.prewarmResources=true;x.args.adapterFactory=()=>{const a=x.make();a.warm=async()=>{throw Error('pinned resource changed');};return a;};await assert.rejects(runCompositionService(x.options,x.args),/pinned resource changed/);assert.equal(x.state.proofs+x.state.sends,0);assert.equal(x.state.closes,1);}finally{await x.cleanup();}
});
test('unresolved original broadcast skips prewarm and all replacement financial work',async()=>{
 const x=await fixture();try{const pending=x.make();pending.reconcile=async()=>({status:'unresolved'});await x.journal.execute({task:x.task,...pending});await pending.close();const proofs=x.state.proofs,sends=x.state.sends;
  x.args.settings.prewarmResources=true;x.args.adapterFactory=()=>{const a=x.make();a.warm=async()=>assert.fail('unknown original must be reconciled first');a.reconcile=async()=>({status:'unresolved'});return a;};
  assert.equal((await runCompositionService(x.options,{...x.args,mode:'once'})).status,'unresolved');assert.ok(x.events.some(e=>e.status==='resource-warmup-skipped'));assert.equal(x.state.proofs,proofs);assert.equal(x.state.sends,sends);
 }finally{await x.cleanup();}
});
