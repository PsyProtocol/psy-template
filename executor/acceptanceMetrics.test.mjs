import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{createHash}from'node:crypto';
import{residentStartupRecords}from'./acceptance/residentCost.mjs';
function fixture(fn){const base=mkdtempSync(join(tmpdir(),'psy-resident-metrics-'));try{
 mkdirSync(join(base,'public'));mkdirSync(join(base,'markets-v1/amm'),{recursive:true});writeFileSync(join(base,'markets-v1/amm/live-registration.json'),JSON.stringify({vaultId:100}));
 const job=(label,submission,ready,failure=false)=>{const task={submission,validUntilCheckpoint:'10'},key=createHash('sha256').update(submission+'\n10').digest('hex'),dir=join(base,'runtime/compact/sepolia/100',key);mkdirSync(dir,{recursive:true});writeFileSync(join(base,'public','maximum-amm-'+label+'-formal-task.json'),JSON.stringify(task));if(ready)writeFileSync(join(dir,label+(failure?'.preflight-failure.log':'.preflight.log')),'PSY_COMPACT_SERVER '+JSON.stringify(ready)+'\nPSY_COMPACT_SERVER {"id":"job","ok":false}\n');};
 fn({base,job});
 }finally{rmSync(base,{recursive:true,force:true});}}
test('cost report counts a restart on a later/failed job and deduplicates task roots',()=>fixture(({base,job})=>{
 job('start','one',{ready:true,keyConstructionMs:10,sessionConstructionMs:50});
 job('start-recovery-alias','one',null);
 job('admit-0','two',{ready:true,keyConstructionMs:20,sessionConstructionMs:60},true);
 const samples=residentStartupRecords(base,'amm');assert.equal(samples.length,2);assert.equal(samples.reduce((sum,r)=>sum+r.keyConstructionMs+r.sessionConstructionMs,0),140);
 assert.ok(samples.some(r=>r.source.endsWith('.preflight-failure.log')));
}));
test('invalid resident timing cannot silently become a cost measurement',()=>fixture(({base,job})=>{
 job('start','one',{ready:true,keyConstructionMs:-1,sessionConstructionMs:50});assert.throws(()=>residentStartupRecords(base,'amm'),/construction timing/);
}));
