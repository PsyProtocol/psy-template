import assert from 'node:assert/strict';import {join} from 'node:path';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {read} from '../../batching/admission/liveSupport.mjs';import {saveObservation} from '../observations.mjs';import {analyzeProofCosts} from './proofCostAnalysis.mjs';
const [base,out]=process.argv.slice(2),comparison=read(join(base,'COMPARISON.json')),reports={};
assert.deepEqual(comparison.comparisons.map(r=>r.market).sort(),['amm','bondingcurve','nftmarket','orderbook']);
for(const row of comparison.comparisons){reports[row.market]={};for(const profile of ['fixed40','compact-v1']){
 const dir=join(base,row.market+'-'+profile),file=join(dir,row.market+'.json'),observation=read(join(dir,'OBSERVATION.json'));
 assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),observation.reportSha256,'original measured report changed');assert.equal(observation.market,row.market);assert.equal(observation.profile,profile);reports[row.market][profile]=read(file);
}}
saveObservation(out,{...analyzeProofCosts(comparison,reports),generatedAt:new Date().toISOString(),comparisonSha256:createHash('sha256').update(readFileSync(join(base,'COMPARISON.json'))).digest('hex')});
