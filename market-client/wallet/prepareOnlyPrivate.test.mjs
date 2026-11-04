// SDK-shaped job orchestration tests only. No prover, signer or transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOnlyMarketJobs} from './prepareOnly.mjs';
function fixture(){
 const calls=[];const job=(type,data={})=>JSON.stringify({type,data});
 const provider={
  prepareTraceProofSchedule:async()=>({}),
  getTraceProofJobStepIndices:async()=>({external_step_indices:[0,1,2],cfc_step_indices:[3,4]}),
  proveUpsStartJob:async()=>job('ups_start'),proveZkSignJob:async()=>job('zk_sign'),
  proveExternalProofJob:async(envelope,index)=>{calls.push(['external',index]);return job('external_proof',{step_index:index,proof:[1]});},
  proveCfcJobWithScheduleStep:async(account,envelope,schedule,index)=>{calls.push(['cfc',index]);return job('cfc_step',{step_index:index});},
  proveEndcapJobFromOutputJsons:async(account,envelope,schedule,outputs)=>{calls.push(['endcap']);assert.equal(outputs.length,7);return job('end_cap',{tx_hash:'end',proof:[1]});},
  signAndSubmit:()=>{throw Error('Submit forbidden');},
 };
 return{calls,provider,run:(options={})=>prepareOnlyMarketJobs({provider,account:'account',envelope:{tx_hash:'end'},parse:JSON.parse,expectedStepCount:2,externalPrefixLength:3,collectPublicProofs:true,...options})};
}
test('explicit compact prefix uses actual external job signature and preserves complete job outputs',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.publicProofOutputs.length,7);
 assert.deepEqual(f.calls,[['external',0],['external',1],['external',2],['cfc',3],['cfc',4],['endcap']]);
});
for(const mode of ['default','size','late','duplicate','extra-cfc','wrong-output'])test('refuses unreviewed external schedule '+mode,async()=>{
 const f=fixture();let options={};
 if(mode==='default')options.externalPrefixLength=0;
 if(mode==='size')options.externalPrefixLength=4;
 if(mode==='late')f.provider.getTraceProofJobStepIndices=async()=>({external_step_indices:[1,2,3],cfc_step_indices:[0,4]});
 if(mode==='duplicate')f.provider.getTraceProofJobStepIndices=async()=>({external_step_indices:[0,0,2],cfc_step_indices:[3,4]});
 if(mode==='extra-cfc')options.expectedStepCount=3;
 if(mode==='wrong-output')f.provider.proveExternalProofJob=async()=>JSON.stringify({type:'external_proof',data:{step_index:9}});
 await assert.rejects(f.run(options));assert.ok(!f.calls.some(c=>c[0]==='endcap'));
});
