// Live read-only ABBA after financial workloads have stopped. It supplements
// real-fill timings; it is not confirmation latency, proving or chain TPS.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hostname} from 'node:os';
import {receiptReader} from '../chainReceipts.mjs';
import {ordinaryPreflight} from '../../batching/admission/ordinaryReport.mjs';
import {saveObservation} from '../observations.mjs';
import {sha256} from '../requestBinding.mjs';
const [base,attempt,flavour='history']=process.argv.slice(2);assert.ok(base&&attempt);assert.ok(['history','current'].includes(flavour));
const p=ordinaryPreflight(readFileSync(join(attempt,'preflight.json'),'utf8'));
const baseline=(await import(pathToFileURL(join(base,'baseline-source/executor/chainReceipts.mjs')).href)).receiptReader;
const rows=[];
for(const mode of ['baseline','candidate','candidate','baseline']){
 const reads=[];let active=0,peak=0;const fetched=[];
 const fetchImpl=async(url,options)=>{
  const start=performance.now();active++;peak=Math.max(peak,active);let status=null,failed=true;
  try{const r=await fetch(url,options);status=r.status;const raw=await r.text();failed=!r.ok;fetched.push({url:new URL(url).pathname+(new URL(url).search||''),method:options?.method??'GET',requestSha256:options?.body?sha256(options.body):null,responseSha256:sha256(raw)});return{ok:r.ok,status:r.status,json:async()=>JSON.parse(raw)};}
  finally{active--;reads.push({method:options?.body?JSON.parse(options.body).method:new URL(url).pathname,status,failed,milliseconds:performance.now()-start});}
 };
 const start=performance.now(),startedAt=new Date().toISOString();
 // Include all retained historical candidates identically in each run. No
 // source-bound or safety checks are bypassed for a submitted transaction.
 const result=await(await(mode==='baseline'?baseline:receiptReader)(join(base,'public/rpc.json'),{fetchImpl}))({userId:p.userId,endUserLeafHash:p.endUserLeafHash,minCheckpoint:flavour==='current'?p.minCheckpoint:0});
 assert.equal(result.status,'included');
 rows.push({mode,startedAt,finishedAt:new Date().toISOString(),milliseconds:performance.now()-start,peakFetches:peak,physicalAttempts:reads.length,reads,fetched,result});
 saveObservation(join(base,'public','receipt-'+flavour+'-abba-'+rows.length+'.json'),rows.at(-1));
}
for(const row of rows)assert.deepEqual(row.result,rows[0].result,'same exact actual historical receipt');
saveObservation(join(base,'public','receipt-'+flavour+'-abba-COMPLETE.json'),{at:new Date().toISOString(),host:hostname(),attempt,flavour,minCheckpoint:flavour==='current'?p.minCheckpoint:0,preflightSha256:sha256(readFileSync(join(attempt,'preflight.json'))),rows,scope:'same actual included end leaf, live historical leaf and indexed receipt requests, serial/parallel/parallel/serial; no mutation, no proof, no chain-confirmation or steady-state throughput claim'});
