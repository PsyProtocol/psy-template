// Matched app-startup experiment, not proving/VM/chain throughput. Fixed source,
// config, driver, machine and ABBA order. Never signs, broadcasts or changes state.
import assert from 'node:assert/strict';import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {createCompositionAdapter} from '../adapter.mjs';
import {createCompositionBuildResources} from '../buildResources.mjs';
import {verifyComponents} from '../components.mjs';import {verifyControllerBuild} from '../controllerBuild.mjs';
import {verifyControllerDeployment} from '../initialDeployment.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {losslessJson} from '../../amm/u124/client.mjs';
import {save} from '../../batching/admission/liveSupport.mjs';
import {saveObservation} from '../../executor/observations.mjs';
import {hostname,totalmem,cpus} from 'node:os';
const [file,destination]=process.argv.slice(2),out=resolve(destination);await mkdir(out,{mode:0o700});
const original=await readFile(file),options=JSON.parse(original);options.runtimeDirectory=join(out,'runtime');
const events=[],rows=[],cached=createCompositionBuildResources({observe:e=>events.push(e)});
const runDriver=promisify(execFile);let identity;
async function trial(name,warm) {
 const start=performance.now(),rssBefore=process.memoryUsage().rss,measurements=[];
 const timed=(kind,fn)=>async(...args)=>{const t=performance.now();const result=await fn(...args);measurements.push({kind,wallMilliseconds:Math.round(performance.now()-t)});return result;};
 const deps=warm?cached:{verifyRouteComponents:timed('components',verifyComponents),
  verifyControllerSource:timed('controller',verifyControllerBuild),verifyInitialDeployment:timed('deployment',verifyControllerDeployment)};
 const offset=events.length,adapter=await createCompositionAdapter(options,{...deps,runDriver});
 try{
  const observed=sha256(losslessJson({intent:adapter.model.intent,policy:adapter.model.policy,plan:adapter.model.plan}));
  if(identity)assert.equal(observed,identity,'experiment identity changed');else identity=observed;
  assert.ok(original.equals(await readFile(file)),'original config changed');
  const row={name,warm,wallMilliseconds:Math.round(performance.now()-start),rssBefore,
    rssAfter:process.memoryUsage().rss,sourceChecks:warm?events.slice(offset):measurements,identity};
  rows.push(row);save(join(out,name+'.json'),row);console.log(name,row.wallMilliseconds);
 }finally{await adapter.close();}
}
await trial('prime-cold',true);
for(const [name,warm] of [['baseline-1',false],['reuse-1',true],['reuse-2',true],['baseline-2',false]])await trial(name,warm);
const old=rows.filter(r=>r.name.startsWith('baseline')),next=rows.filter(r=>r.name.startsWith('reuse'));
assert.ok(next.every(r=>r.sourceChecks.length===3&&r.sourceChecks.every(c=>c.cacheHit)));
const median=a=>{const v=a.map(r=>r.wallMilliseconds).sort((a,b)=>a-b);return(v[0]+v[1])/2;};
saveObservation(join(out,'SUMMARY.json'),{completedAt:new Date().toISOString(),host:hostname(),platform:process.platform,arch:process.arch,
 memoryBytes:totalmem(),logicalCpus:cpus().length,originalConfigSha256:sha256(original),identity,
 sdkManifestHash:options.sdkManifestHash,driverSha256:options.walletSha256,order:'prime, baseline, reuse, reuse, baseline',rows,
 baselineMedianMilliseconds:median(old),reuseMedianMilliseconds:median(next),
 observedRebuildRatio:median(old)/median(next),
 nonoverlappingRanges:Math.max(...next.map(r=>r.wallMilliseconds))<Math.min(...old.map(r=>r.wallMilliseconds)),
 broadcast:false,actualMarketFills:0,fees:0,transactionProofMilliseconds:null,chainTps:null,
 scope:'two repetitions each, same immutable financial profile and fresh live metadata checks; compiled-source verification reuse during adapter reconstruction only; no transaction witness/nonce/proof reuse, end-to-end settlement speedup, full memory peak or production claim'});
