// Read-only recovery of a preserved journal. Never calls prove or submit.
import assert from'node:assert/strict';import{mkdirSync}from'node:fs';import{join}from'node:path';import{fileURLToPath}from'node:url';import{loadOptions}from'../config.mjs';import{createPublicWalletAdapter}from'../publicWalletAdapter.mjs';import{ExecutionJournal}from'../journal.mjs';import{ReadUnavailable}from'../readRetry.mjs';import{saveObservation}from'../observations.mjs';import{freezeAppModules}from'./sourceClosure.mjs';
const[base,optionsFile,out]=process.argv.slice(2);assert.ok(out);mkdirSync(out);freezeAppModules(fileURLToPath(import.meta.url),base,'read-only-reconciliation-v1');
const o=await loadOptions(optionsFile),adapter=await createPublicWalletAdapter(o),journal=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint}),original=await journal.unresolved();assert.equal(original.length,1,'review exactly one preserved pending operation');
try{
 for(let i=0;i<12;i++){
  try{await journal.reconcile(adapter.reconcile);}catch(e){if(!(e instanceof ReadUnavailable))throw e;saveObservation(join(out,'read-unavailable-'+i+'.json'),{at:new Date().toISOString(),name:e.name,status:e.cause?.status??null,scope:'bounded public read failed; no submission, verdict or replacement'});}
  const pending=await journal.unresolved();if(pending.length===0){const records=await journal.records(),result=records.findLast(r=>r.taskId===original[0].taskId&&r.status==='included');assert.ok(result,'only exact inclusion closes this recovery');saveObservation(join(out,'COMPLETE.json'),{at:new Date().toISOString(),originalTaskId:original[0].taskId,result,proveCalled:false,submitCalled:false,originalTransactionReconciled:true});console.log('original exact UPS included; no proof or submission repeated');break;}
  if(i===11)throw Error('original still unresolved; retain original intent');await new Promise(r=>setTimeout(r,10000));
 }
}finally{await adapter.close?.();}
