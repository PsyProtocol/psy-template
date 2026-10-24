// Acceptance-only matched preparation pair. Baseline proofs are NEVER sent.
// The optimized exact task proceeds through the normal journal/driver. This
// compares preparation + full UPS work, not two independent confirmations.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {saveObservation} from '../../executor/observations.mjs';
import {parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
import {residentProver} from '../../executor/residentProver.mjs';
import {publicState} from '../../executor/publicState.mjs';
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
export function assertSamePreparation(b,a){
 for(const p of[b,a]){assert.equal(p.fullUpsVerified,true);assert.equal(p.exactStackAndSessionVerified,true);assert.equal(p.broadcast,false);}
 assert.equal(a.fee,b.fee);assert.equal(a.actualCalls,b.actualCalls);assert.equal(a.callsSha256,b.callsSha256);
 assert.equal(a.core.new_user_leaf.nonce,b.core.new_user_leaf.nonce);assert.equal(a.core.state_transition.start_user_leaf_hash,b.core.state_transition.start_user_leaf_hash);
 assert.equal(a.core.new_user_leaf.user_state_tree_root,b.core.new_user_leaf.user_state_tree_root);assert.deepEqual(a.core.stats,b.core.stats);
}
export async function preparationPair(options,{baselineSource,baselineManifest,outputDirectory},resources){
 const manifest=JSON.parse(readFileSync(baselineManifest,'utf8'));
 assert.equal(manifest.commit,'efe3c9fad1605f23a8177ec3d0ea71826badb9cd');
 for(const [file,sha]of Object.entries(manifest.files))assert.equal(digest(join(baselineSource,file)),sha,'frozen baseline changed');
 assert.ok(!existsSync(join(outputDirectory,'COMPLETE.json')));mkdirSync(outputDirectory,{recursive:true});
 const imports=[join(baselineSource,'composition/adapter.mjs'),resolve('composition/adapter.mjs')];
 const variants=['baseline','optimized'],adapters={},observations=[],pending=new Map();let sharedResident,sharedBinding,sequence=0;
 const write=(phase,value)=>saveObservation(join(outputDirectory,phase+'-'+randomUUID()+'.json'),value);
 try{
  for(let i=0;i<2;i++){
   const variant=variants[i],reads=[],residentJobs=[];let firstJob=true;
   const {createCompositionAdapter}=await import(pathToFileURL(imports[i]));
   const startedAt=new Date().toISOString(),t=performance.now();
   const adapter=await createCompositionAdapter(options,{...resources,
    readState:file=>publicState(file,{observeRead:event=>{reads.push(event);}}),
    residentFactory:(...args)=>{const binding=losslessJson(args);if(sharedBinding)assert.equal(binding,sharedBinding,'only exact driver/policy/network/environment shares a resident');else sharedBinding=binding;const resident=sharedResident??=residentProver(...args);return{...resident,close:async()=>{},...Object.fromEntries(['quote','prove'].map(method=>[method,async args=>{
     const before=performance.now(),at=new Date().toISOString();let failed=true;
     try{const result=await resident[method](args);failed=false;residentJobs.push({method,startedAt:at,wallMilliseconds:performance.now()-before,firstJob,residentStartup:result.residentStartup??null,failed});firstJob=false;return result;}
     finally{if(failed)residentJobs.push({method,startedAt:at,wallMilliseconds:performance.now()-before,firstJob,failed});}
    }]))};}});
   const startup={variant,startedAt,wallMilliseconds:performance.now()-t,reads:reads.splice(0)};write('startup',startup);
   adapters[variant]={adapter,reads,residentJobs};
  }
  const measure=async(variant,method,args)=>{
   const v=adapters[variant],readsAt=v.reads.length,jobsAt=v.residentJobs.length,start=performance.now(),startedAt=new Date().toISOString(),rssBefore=process.memoryUsage().rss;
   let failed=true;try{const value=await v.adapter[method](...args);failed=false;return value;}
   finally{const row={variant,method,operation:args[0]?.operation??null,startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start,failed,parentRssBeforeBytes:rssBefore,parentRssAfterBytes:process.memoryUsage().rss,memoryScope:'parent endpoints only; child sampled independently',reads:v.reads.slice(readsAt),residentJobs:v.residentJobs.slice(jobsAt)};observations.push(row);write(method,row);}
  };
  const optimized=adapters.optimized.adapter;
  return{...optimized,...Object.fromEntries(['scan','isCurrent','validateProof','submit','reconcile','snapshot','validateFeePreparation'].filter(method=>typeof optimized[method]==='function').map(method=>[method,(...args)=>measure('optimized',method,args)])),
   quote:async proposal=>{
    // Both paths receive the SAME exact request/window and independently run
    // all fresh registry/state checks. ABBA ordering reduces but cannot remove
    // circuit/cache/chain-time bias; first cold sample remains separate.
    const order=[['baseline','optimized'],['optimized','baseline'],['optimized','baseline'],['baseline','optimized']][sequence++%4],tasks={};for(const variant of order)tasks[variant]=await measure(variant,'quote',[proposal]);
    assert.equal(losslessJson(tasks.baseline),losslessJson(tasks.optimized),'fee/calls/window must agree before any proof');pending.set(tasks.optimized.submission,{order});return tasks.optimized;
   },
   prove:async task=>{
    const order=pending.get(task.submission)?.order??['baseline','optimized'],proofs={};for(const variant of order)proofs[variant]=await measure(variant,'prove',[task]);const before=proofs.baseline,after=proofs.optimized;
    const b=exact(join(before.preparedDirectory,'preflight.json')),a=exact(join(after.preparedDirectory,'preflight.json'));
    assertSamePreparation(b,a);
    write('full-ups-pair',{operation:task.operation,order,sharedPinnedResident:true,freshSessionPerJob:true,baseline:before,optimized:after,baselineTimings:b.timingsMilliseconds,optimizedTimings:a.timingsMilliseconds,fee:a.fee,actualCalls:a.actualCalls,sourceCheckpoints:[b.core.checkpoint_id,a.core.checkpoint_id],sameStartingLeaf:true,sameEndState:true,baselineSubmitted:false,optimizedMaySubmitOnlyThroughNormalJournal:true,chainTps:null});return after;
   },
   close:async()=>{for(const v of Object.values(adapters))await v.adapter.close();await sharedResident?.close();write('closed',{at:new Date().toISOString(),samples:observations.length,baselineBroadcasts:0,chainTps:null,scope:'same-host ABBA-order paired advisory preparation/full UPS with one exact pinned resident and fresh sessions; only optimized original is submitted; no before/after confirmation speedup established'});}
  };
 }catch(error){for(const v of Object.values(adapters))await v.adapter.close();await sharedResident?.close();throw error;}
}
