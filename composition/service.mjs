// Persistent service for the dedicated financial adapter. Each new process
// rechecks source/SDK/key identities. It never holds an ordinary owner's key.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createCompositionAdapter} from './adapter.mjs';
import {selectCompositionAction} from './selection.mjs';
import {prepareOwnerClaim} from './client.mjs';
import {ProofSessionReadUnavailable,proofReadEvidence} from './proofReadRecovery.mjs';
import {ExecutionJournal,StaleTask,VaultBusy,UnresolvedBroadcast} from '../executor/journal.mjs';
import {ReadUnavailable} from '../executor/readRetry.mjs';
import {executeCycle,pause} from '../executor/worker.mjs';
import {COMPOSITION_SDK} from './contract/runtimePolicy.mjs';
import {losslessJson} from '../amm/u124/client.mjs';
import {sha256} from '../executor/requestBinding.mjs';
import {publishFile} from '../executor/durableFile.mjs';
import {assertDurableRuntimeDirectory} from '../executor/runtimeStorage.mjs';
import {createCompositionBuildResources} from './buildResources.mjs';
import {createCoordinatedJournal} from '../executor/coordination/client.mjs';

const makeLocalJournal=o=>new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,
  vaultId:o.vaultId,fingerprint:o.fingerprint});
const makeJournal=o=>o.coordinator?createCoordinatedJournal(o):makeLocalJournal(o);
export function serviceSettings(input={}) {
  assert.ok(Object.keys(input).every(k=>['intervalMs','maxBackoffMs','maxSessionRestarts','maxReadFailures'].includes(k)));
  const settings={intervalMs:10000,maxBackoffMs:300000,maxSessionRestarts:3,maxReadFailures:5,...input};
  for(const [key,min,max] of [['intervalMs',1,300000],['maxBackoffMs',1,3600000],
    ['maxSessionRestarts',0,10],['maxReadFailures',1,100]])
    assert.ok(Number.isSafeInteger(settings[key])&&settings[key]>=min&&settings[key]<=max,key);
  assert.ok(settings.maxBackoffMs>=settings.intervalMs);
  return settings;
}
export async function compositionCycle(adapter,journal,{signal}={}) {
  if(signal?.aborted)return {status:'stopped'};
  await journal.reconcile(adapter.reconcile);
  const selected=await selectCompositionAction(adapter,journal);
  if(selected.status!=='selected')return selected;
  const checkpoint=selected.checkpoint??(await adapter.scan()).checkpoint;
  return executeCycle({adapter:{...adapter,scan:async()=>({action:selected.task,checkpoint})},journal,signal});
}
export async function runCompositionService(options,{mode='watch',signal,
  adapterFactory,journalFactory=makeJournal,
  claimBuilder=prepareOwnerClaim,wait=pause,onStatus=()=>{},settings:input}={}) {
  assert.ok(['once','watch','reconcile'].includes(mode));
  assert.equal(options.sdkManifestHash,COMPOSITION_SDK);
  assertDurableRuntimeDirectory(options.runtimeDirectory);
  const settings=serviceSettings(input),runId=randomUUID(),journal=await journalFactory(options);
  const events=makeLocalJournal({...options,runtimeDirectory:join(options.runtimeDirectory,'composition-service',runId)});
  let adapter,failures=0,last={status:'starting'};
  const emit=async event=>{
    last={...event,runId};
    const observation=JSON.parse(JSON.stringify(event,(_k,v)=>typeof v==='bigint'?v.toString():v));
    await events.locked(()=>events.append({status:'service-state',state:event.status,event:observation,
      sdkManifestHash:options.sdkManifestHash,walletSha256:options.walletSha256}));
    await onStatus(last);
  };
  const resources=createCompositionBuildResources({observe:event=>emit({status:'source-verification',...event})});
  const create=adapterFactory??(o=>createCompositionAdapter(o,resources));
  try {
    await emit({status:'starting',settings});
    do {
      if(signal?.aborted){await emit({status:'stopped'});break;}
      try {
        if(!adapter){
          await emit({status:'creating-adapter'});
          adapter=await create(options);
          await emit({status:'adapter-ready',intentId:adapter.model.intent.id});
        }
        const result=mode==='reconcile'?{status:'reconciled',recovered:await journal.reconcile(adapter.reconcile)}:
          await compositionCycle(adapter,journal,{signal});
        failures=0;
        if(result.status==='idle'&&result.reason==='controller-terminal-owner-claim-required') {
          const claim=await claimBuilder(adapter);
          assert.equal(claim.intentId,adapter.model.intent.id);
          if(claim.status==='owner-outboxes-claimed') {
            await emit({status:'completed',intentId:claim.intentId,checkpoint:claim.sourceCheckpoint,
              scope:'terminal controller and observed owner cursors; full receipt/accounting acceptance separate'});
            break;
          }
          assert.equal(claim.status,'owner-signature-required');
          const requestBytes=losslessJson(claim.input)+'\n',requestSha256=sha256(requestBytes);
          const requestPath=join(events.directory,'owner-claim-'+requestSha256+'.json');
          try{await publishFile(requestPath,requestBytes);}catch(e){if(e.code!=='EEXIST')throw e;}
          const {input:unsigned,...observation}=claim;
          await emit({status:'owner-claim-required',claim:observation,requestPath,requestSha256});
        } else await emit(result);
        if(mode!=='watch'||['not-submitted','stopped'].includes(result.status))break;
        await wait(settings.intervalMs,signal);
      } catch(error) {
        if(error instanceof ProofSessionReadUnavailable) {
          assert.ok(adapter,'session recovery requires an established pinned adapter');
          const e=error.evidence;
          assert.equal(e.intentId,adapter.model.intent.id);
          assert.equal(e.driverSha256,options.walletSha256);
          assert.equal(e.sdkManifestHash,options.sdkManifestHash);
          const checked=await proofReadEvidence(e.directory,{phase:e.phase,error:error.cause.residentRejection.error},[e.endpoint]);
          assert.equal(checked.failureSha256,e.failureSha256);
          const reservation=await journal.locked(async()=>{
            const pending=await journal.unresolved();
            if(pending.length)return {status:'unresolved',tasks:pending.map(r=>r.taskId)};
            const old=(await journal.records()).filter(r=>r.status==='session-restart-reserved');
            assert.ok(old.every(r=>r.intentId===e.intentId&&r.sdkManifestHash===options.sdkManifestHash&&r.walletSha256===options.walletSha256),
              'recovery history identity changed');
            if(old.length>=settings.maxSessionRestarts)return {status:'recovery-budget-exhausted'};
            const count=old.length+1;
            await journal.append({status:'session-restart-reserved',intentId:e.intentId,
              sdkManifestHash:options.sdkManifestHash,walletSha256:options.walletSha256,
              count,evidence:e,runId});
            return {status:'session-restart-reserved',count,evidence:e};
          });
          await emit(reservation);
          // Wait for the old proof child to exit. Failure to confirm exit is fatal.
          await adapter.close();adapter=null;
          await emit({status:'adapter-closed'});
          if(reservation.status!=='session-restart-reserved'||mode!=='watch'){
            await emit(reservation);break;
          }
          await wait(Math.min(settings.maxBackoffMs,settings.intervalMs*2**reservation.count),signal);
          continue; // New adapter, exact old journal reconciliation, fresh witnesses.
        }
        if(error instanceof ReadUnavailable||error instanceof StaleTask||error instanceof VaultBusy||error instanceof UnresolvedBroadcast) {
          failures++;
          const status=error instanceof ReadUnavailable?'read-unavailable':error instanceof StaleTask?'stale':
            error instanceof VaultBusy?'busy':'unresolved';
          const delay=Math.min(settings.maxBackoffMs,settings.intervalMs*2**Math.min(failures,10));
          await emit({status,message:error.message,failures,retryInMs:delay});
          if(mode!=='watch'||failures>=settings.maxReadFailures)break;
          await wait(delay,signal);continue;
        }
        await emit({status:'halted',message:error.message});
        throw error;
      }
    } while(!signal?.aborted);
    if(signal?.aborted&&!['completed','halted','stopped'].includes(last.status))await emit({status:'stopped'});
    return {...last,eventDirectory:events.directory};
  } finally {await adapter?.close();}
}
