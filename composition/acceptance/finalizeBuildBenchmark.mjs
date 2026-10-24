// Finalize completed immutable trials after an observation-serialization failure.
// Reads existing rows; never repeats measurements, signs or broadcasts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {hostname,totalmem,cpus} from 'node:os';
import {sha256} from '../../executor/requestBinding.mjs';
import {saveObservation} from '../../executor/observations.mjs';
const [directory,config,planFile,failedLog]=process.argv.slice(2),out=resolve(directory);
const plan=JSON.parse(readFileSync(planFile)),original=readFileSync(config),options=JSON.parse(original);
assert.equal(plan.configurationSha256,sha256(original));
const names=['prime-cold','baseline-1','reuse-1','reuse-2','baseline-2'];
const sources=[],rows=names.map(name=>{
 const path=join(out,name+'.json'),bytes=readFileSync(path),row=JSON.parse(bytes);
 sources.push({path:name+'.json',sha256:sha256(bytes)});assert.equal(row.name,name);
 assert.ok(Number.isSafeInteger(row.wallMilliseconds)&&row.wallMilliseconds>0);
 assert.equal(row.warm,!name.startsWith('baseline'));
 assert.equal(row.sourceChecks.length,3);
 if(name.startsWith('reuse'))assert.ok(row.sourceChecks.every(c=>c.cacheHit===true));
 return row;
});
assert.ok(rows.every(row=>row.identity===rows[0].identity));
const log=readFileSync(failedLog);assert.match(log.toString(),/losslessJson/);
const old=rows.filter(r=>r.name.startsWith('baseline')),next=rows.filter(r=>r.name.startsWith('reuse'));
const median=a=>(a[0].wallMilliseconds+a[1].wallMilliseconds)/2;
saveObservation(join(out,'SUMMARY.json'),{
 finalizedAt:new Date().toISOString(),host:hostname(),platform:process.platform,arch:process.arch,
 memoryBytes:totalmem(),logicalCpus:cpus().length,originalConfigSha256:sha256(original),identity:rows[0].identity,
 sdkManifestHash:options.sdkManifestHash,driverSha256:options.walletSha256,
 order:'prime, baseline, reuse, reuse, baseline',rows,sources,
 baselineMedianMilliseconds:median(old),reuseMedianMilliseconds:median(next),observedRebuildRatio:median(old)/median(next),
 nonoverlappingRanges:Math.max(...next.map(r=>r.wallMilliseconds))<Math.min(...old.map(r=>r.wallMilliseconds)),
 failedOriginalLogSha256:sha256(log),planSha256:sha256(readFileSync(planFile)),
 repair:'Only missing observational summary regenerated from original completed rows; original timings and failed log preserved.',
 broadcast:false,actualMarketFills:0,fees:0,transactionProofMilliseconds:null,chainTps:null,
 scope:'Two repetitions each; same immutable financial profile and fresh metadata checks. Compiled-source verification reuse during adapter reconstruction only. No transaction-proof reuse or settlement speedup measurement. Host details observed at finalization; RSS is sampled, not full peak.'
});
