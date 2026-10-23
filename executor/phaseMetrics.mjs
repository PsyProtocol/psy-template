// Optional observations, never proof inputs. Raw calls, witnesses and arbitrary
// exception messages are deliberately absent. Telemetry failure must not turn
// an acknowledged submit into an unrecorded business retry.
import{mkdir}from'node:fs/promises';import{join}from'node:path';import{randomUUID}from'node:crypto';
import{publishFile}from'./durableFile.mjs';import{observationJson}from'./observations.mjs';
const phases=['scan','reconcile','isCurrent','validateProof','prove','prepareSubmission','submit'];
export function instrumentAdapter(adapter,{scope,sink,clock=()=>performance.now(),memory=()=>process.memoryUsage(),now=()=>new Date().toISOString()}={}){
 const result={...adapter};let metricFailures=0;
 Object.defineProperty(result,'metricFailures',{get:()=>metricFailures});
 for(const phase of phases){if(typeof adapter[phase]!=='function')continue;result[phase]=async(...args)=>{
  const startedAt=now(),start=clock(),before=memory();let value,failed=false;
  try{value=await adapter[phase](...args);return value;}
  catch(error){failed=true;throw error;}
  finally{
   // Do not throw over a financial result or its original error. Missing metrics
   // are counted; observers cannot invent zero-duration successful samples.
   try{const after=memory();await sink({schema:1,scope,phase,startedAt,finishedAt:now(),wallMilliseconds:clock()-start,failed,
    parentRssBeforeBytes:before.rss,parentRssAfterBytes:after.rss,parentHeapUsedBeforeBytes:before.heapUsed,parentHeapUsedAfterBytes:after.heapUsed,
    memoryScope:'Node parent endpoints only; not child proof memory or peak RSS',
    phaseScope:phase==='prove'?'complete adapter proving path including fresh state/identity checks; detailed circuit/call/end-cap timings remain in preflight':phase==='submit'?'saved-proof verification, fresh identity/dependency/state checks and acknowledgement; excludes proving and confirmation':phase==='reconcile'?'receipt/index/common-state observation; not server finality latency':'adapter operation wall; do not add overlapping operations as elapsed wall'});}
   catch{metricFailures++;}
  }
 };}
 return result;
}
export function withPhaseMetrics(options,adapter){
 if(!options.performanceMetrics)return adapter;
 const scope={network:options.network,vaultId:options.vaultId,marketId:options.contractId,fingerprint:options.fingerprint,codeRoot:options.codeRoot,layoutRoot:options.layoutRoot,walletSha256:options.walletSha256};
 const dir=join(options.runtimeDirectory,'performance',options.network,String(options.vaultId));
 return instrumentAdapter(adapter,{scope,sink:async record=>{await mkdir(dir,{recursive:true,mode:0o700});await publishFile(join(dir,randomUUID()+'.json'),observationJson(record)+'\n');}});
}
