// Closed, actually filled route only. Phase-paired performance is not a claim
// of matched network confirmations or chain TPS. Raw originals remain intact.
import assert from 'node:assert/strict';
import{readFileSync,readdirSync,existsSync}from'node:fs';
import{join}from'node:path';
import{saveObservation}from'../../executor/observations.mjs';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
import{sha256}from'../../executor/requestBinding.mjs';
import{ExecutionJournal}from'../../executor/journal.mjs';
import{controllerDirectory}from'./controllerDirectory.mjs';
const[base,out]=process.argv.slice(2),home=join(controllerDirectory(base),'success'),exact=p=>parseLosslessJson(readFileSync(p,'utf8')),observation=p=>JSON.parse(readFileSync(p,'utf8'));
const done=exact(join(home,'public/LIVE-ROUTE-COMPLETE-v1.json'));assert.equal(done.marketFills,2n);assert.equal(done.ordinaryOwnerClaimIncluded,true);assert.equal(done.controllerPhase,99n);
const o=observation(join(home,'route/executor.json')),journal=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint}),rows=await journal.records();assert.equal((await journal.unresolved()).length,0);
const broadcasts=rows.filter(r=>r.status==='broadcast-intent'),included=rows.filter(r=>r.status==='included');assert.equal(broadcasts.length,included.length);assert.equal(new Set(broadcasts.map(r=>r.taskId)).size,broadcasts.length);
const pairDir=join(base,'paired-preparation'),items=readdirSync(pairDir).filter(n=>n.endsWith('.json')).map(n=>({file:join(pairDir,n),value:observation(join(pairDir,n))}));
const phases=items.filter(r=>r.value.method),pairs=items.filter(r=>r.file.includes('/full-ups-pair-'));
const summarizeReads=reads=>({attempts:reads.length,failed:reads.filter(r=>r.failed).length,byMethod:Object.fromEntries([...new Set(reads.map(r=>r.method))].sort().map(method=>[method,reads.filter(r=>r.method===method).length])),rpcAndParseMilliseconds:reads.reduce((n,r)=>n+(r.rpcAndParseMilliseconds??0),0),queuedMilliseconds:reads.reduce((n,r)=>n+(r.queueMilliseconds??0),0)});
const operations=pairs.map(({file,value:p})=>{
 const task=broadcasts.find(r=>r.task.operation===p.operation);assert.ok(task,'pair must correspond to one actually submitted task');const receipt=included.find(r=>r.taskId===task.taskId);assert.ok(receipt);
 assert.equal(receipt.result.receipt.data.status,'included');const full=exact(join(task.proof.preparedDirectory,'preflight.json'));assert.equal(task.proof.manifestSha256,p.optimized.manifestSha256);assert.equal(BigInt(receipt.result.receipt.data.result.fees_collected),full.fee);
 const samples={};for(const variant of['baseline','optimized']){
  const q=phases.filter(r=>r.value.operation===p.operation&&r.value.variant===variant&&r.value.method==='quote'),proof=phases.filter(r=>r.value.operation===p.operation&&r.value.variant===variant&&r.value.method==='prove');assert.equal(q.length,1);assert.equal(proof.length,1);assert.equal(q[0].value.failed,false);assert.equal(proof[0].value.failed,false);
  const quote=q[0].value,prove=proof[0].value,jobs=quote.residentJobs;
  samples[variant]={quoteMilliseconds:quote.wallMilliseconds,feeTraceJobs:jobs.length,feeTraceMilliseconds:jobs.reduce((s,r)=>s+r.wallMilliseconds,0),coldResidentStart:jobs.some(r=>r.residentStartup),proveMilliseconds:prove.wallMilliseconds,preparationAndProofMilliseconds:quote.wallMilliseconds+prove.wallMilliseconds,quoteReads:summarizeReads(quote.reads),proveReads:summarizeReads(prove.reads),parentRssEndpointsBytes:[quote.parentRssBeforeBytes,quote.parentRssAfterBytes,prove.parentRssBeforeBytes,prove.parentRssAfterBytes],fullUpsTimingsMilliseconds:p[variant+'Timings']};
 }
 return{operation:p.operation,order:p.order,source:file,samples,feeAtomicUnits:full.fee,actualCalls:full.actualCalls,sameCallsStartNonceEndStateAndFees:true,sourceCheckpoints:p.sourceCheckpoints,optimizedContentHash:receipt.result.contentHash,optimizedIncludedCheckpoint:receipt.result.checkpoint,baselineSubmitted:false};
});
assert.equal(operations.length,included.length);
const warm=operations.filter(r=>!r.samples.baseline.coldResidentStart&&!r.samples.optimized.coldResidentStart);
const sum=(sample,key)=>warm.reduce((n,r)=>n+r.samples[sample][key],0);
const ordinary=['owner-fund-v1','owner-claim-v1'].map(label=>{const path=join(home,'attempts',label),timing=observation(join(path,'timing.json')),r=exact(join(path,'included.json'));return{label,processThroughAckMilliseconds:timing.wallMilliseconds,ackToIndexedCommonObservedMilliseconds:Date.parse(r.checkedAt)-Date.parse(timing.finishedAt),feeAtomicUnits:r.receipt.data.result.fees_collected,contentHash:r.contentHash,checkpoint:r.checkpoint,scope:'actual ordinary cold process, confirmation separately observed; includes read/prove/verify/HTTP, not pure RPC transport'};});
const submissionPhases=phases.filter(r=>r.value.variant==='optimized'&&r.value.method==='submit').map(r=>({file:r.file,...r.value,reads:summarizeReads(r.value.reads)}));
const allFees=included.reduce((n,r)=>n+BigInt(r.result.receipt.data.result.fees_collected),0n);assert.equal(allFees,done.nativeAccounting.controllerReceiptBurn);
const resourceFile=join(base,'performance-resources-v1-SUMMARY.json');
saveObservation(out,{schema:1,at:new Date().toISOString(),marketFills:done.marketFills,ordinaryOwnerClaimIncluded:true,operations,warmSummary:{operations:warm.length,baselineQuoteMilliseconds:sum('baseline','quoteMilliseconds'),optimizedQuoteMilliseconds:sum('optimized','quoteMilliseconds'),baselinePreparationAndProofMilliseconds:sum('baseline','preparationAndProofMilliseconds'),optimizedPreparationAndProofMilliseconds:sum('optimized','preparationAndProofMilliseconds')},ordinary,submissionPhases,startups:items.filter(r=>r.file.includes('/startup-')),resources:existsSync(resourceFile)?observation(resourceFile):null,controllerReceiptBurn:allFees,completed:done,comparison:{sameMachine:true,rayonThreads:2,sameSdkAndBinary:true,sameExactCallsNonceStartingLeafEndStateAndFee:true,oneExactPinnedResidentFreshSessionPerJob:true,order:'ABBA across operations',baselineProofsNeverBroadcast:true,baselineNetworkConfirmation:null,optimizedNetworkConfirmation:'actual exact original receipts and common checkpoint; see phase/ordinary records',memory:'parent endpoints plus 2s proof process sampling; no per-stage true peak',envelope:'actual route contains deliberate baseline preparation/proofs and source verification; not normal optimized latency',coldBinaryBuild:null,stateRpcScope:'JS public reads only; child SDK reads included in resident wall and not separately instrumented',chainTps:null,endToEndConfirmationSpeedup:null,productionReady:false}});
console.log('matched preparation report closed',operations.length,'operations, 2 real fills');
