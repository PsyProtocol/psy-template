// Operator-owned candidate diagnostics only; no RPC, signer, proof or payment.
import assert from 'node:assert/strict';
import {open} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {RandomRequestJournal} from '../batching/random-order/requestJournal.mjs';
import {publishFile} from './durableFile.mjs';
async function readPublicJson(path,limit){
 const file=await open(path,'r');const chunks=[];let total=0;
 try{while(total<=limit){const part=Buffer.alloc(Math.min(65536,limit+1-total));const {bytesRead}=await file.read(part,0,part.length,null);if(!bytesRead)break;total+=bytesRead;assert.ok(total<=limit,'public file size limit');chunks.push(part.subarray(0,bytesRead));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 finally{await file.close();}
}
export async function runRandomCandidate(args){
 assert.ok(Array.isArray(args));const [action,directory,candidatePath,reportPath,value]=args;
 assert.ok(['freeze','inspect','observe','timeout','recovery-plan'].includes(action),'candidate diagnostic action required');
 assert.equal(args.length,['observe','timeout'].includes(action)?5:4,'ACTION DIRECTORY CANDIDATE_JSON FRESH_REPORT [EVIDENCE_JSON_OR_CHECKPOINT]');
 const candidate=await readPublicJson(candidatePath,16384),journal=new RandomRequestJournal({directory,candidate});
 // Reserve the fresh result before any journal mutation. The separate immutable
 // intent identifies an interrupted command even if the result remains empty.
 const output=await open(reportPath,'wx',0o600);let started=false,report;
 try{
  await publishFile(reportPath+'.intent.json',JSON.stringify({schema:1,kind:'random-candidate-command-intent',action,requestSha256:journal.requestSha256,financialOperations:0,proofsGenerated:0},null,2)+'\n');
  started=true;
  if(action==='freeze')report=await journal.freeze();
  if(action==='inspect')report=await journal.inspect();
  if(action==='observe')report=await journal.observe(await readPublicJson(value,6100000));
  if(action==='timeout')report=await journal.observeTimeout(value);
  if(action==='recovery-plan')report=await journal.recoveryPlan();
  await output.writeFile(JSON.stringify({...report,financialOperations:0,proofsGenerated:0},null,2)+'\n');await output.sync();return report;
 }catch(cause){
  if(!started)throw cause;
  const retained=cause.retainedRequestSha256??report?.requestSha256??null;const error=Error('Candidate command/report incomplete; reconcile original request '+(retained??'from the retained journal')+' (requested '+journal.requestSha256+'); retain intent and journal, never choose a replacement: '+cause.message,{cause});error.code='RANDOM_CANDIDATE_RECONCILE_REQUIRED';error.requestedRequestSha256=journal.requestSha256;error.retainedRequestSha256=retained;throw error;
 }finally{await output.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runRandomCandidate(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
