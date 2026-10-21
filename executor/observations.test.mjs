import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observationJson,saveObservation} from './observations.mjs';
import {losslessJson} from '../amm/u124/client.mjs';
test('observation fractions and exact integer strings do not weaken transaction serialization',()=>{
 assert.deepEqual(JSON.parse(observationJson({load:[1.25,0.5],fee:9007199254740993n})),{load:[1.25,0.5],fee:'9007199254740993'});
 assert.throws(()=>losslessJson({load:1.25}));
 for(const value of [NaN,Infinity,9007199254740992,undefined,()=>{},Symbol('x')]) assert.throws(()=>observationJson({value}));
});
test('observation reports preserve original artifacts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'psy-observation-'));try{const path=join(dir,'report.json');saveObservation(path,{ratio:1.25});assert.throws(()=>saveObservation(path,{ratio:2}));assert.equal(JSON.parse(readFileSync(path)).ratio,1.25);}finally{rmSync(dir,{recursive:true});}
});
