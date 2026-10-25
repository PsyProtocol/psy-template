// Manual, versioned continuation only; never the clean paired orchestrator.
import assert from 'node:assert/strict';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {run} from '../../batching/admission/liveSupport.mjs';
import {saveObservation} from '../observations.mjs';
import {freezeAppModules} from './sourceClosure.mjs';
const[base,original,generation]=process.argv.slice(2);assert.ok(original);assert.match(generation,/^v[1-9][0-9]*$/);
freezeAppModules(fileURLToPath(import.meta.url),base,'pre-epoch-resume-parent-'+generation);
const startedAt=new Date().toISOString(),start=performance.now();let ok=false;
try{
 await run(process.execPath,['executor/acceptance/runRpcOrdinaryComparison.mjs',base,original,'baseline'],join(base,'baseline-read-recovery-parent-'+generation+'.log'),{
  PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2',PSY_RESOURCE_COMPARISON:'1',PSY_FIXED_VERIFIER_COMPARISON:'1',PSY_ORDINARY_RELEASE_FILE:'RELEASE.json',PSY_PROVER_RESOURCE_METRICS:'1',PSY_RPC_COMPARISON_SOURCE_LABEL:'baseline-read-recovery-'+generation,PSY_PRE_EPOCH_READ_RECOVERY:'pre-epoch-read-recovery-'+generation
 });
 await run(process.execPath,['executor/acceptance/auditRpcOrdinaryComparison.mjs',base,'baseline',original,join(base,'baseline-audit-v1')],join(base,'baseline-audit-v1.log'),{RAYON_NUM_THREADS:'2'});
 ok=true;console.log('original baseline fill and 17 UPS accounting closed; excluded from clean performance pair');
}finally{
 saveObservation(join(base,'public/BASELINE-READ-RECOVERY-OUTCOME-'+generation+'.json'),{startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start,ok,cleanPerformancePairEligible:false,noAutomaticFinancialRetry:true});
}
