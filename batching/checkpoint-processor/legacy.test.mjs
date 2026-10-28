import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {generateBatch} from '../v2/generate.mjs';
const golden=JSON.parse(readFileSync(new URL('./legacy-golden.json',import.meta.url)));
for(const {market,config,sha256} of golden.cases)test(`${market}: ordinary generator remains byte-identical to ${golden.baseCommit}`,()=>{
 assert.equal(createHash('sha256').update(generateBatch(market,config)).digest('hex'),sha256);
 // Processor behavior is not enabled by an untrusted ordinary config flag.
 assert.equal(createHash('sha256').update(generateBatch(market,{...config,checkpointGraph:true})).digest('hex'),sha256);
});
