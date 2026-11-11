// Reproduce historical reviewed bytes only; never install them as a live release.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
test('wallet vendor build reproduces all public entry points and exact source bytes',()=>{
 const temp=mkdtempSync(join(tmpdir(),'psy-vendor-unit-'));
 try{
  for(const name of ['first','second']){
   const run=spawnSync(process.execPath,[resolve(import.meta.dirname,'vendor.mjs'),join(temp,name),'market-client/reviewed/mainnet-beta-markets-20261027-v3','market-client/reviewed/mainnet-beta-amm-20261027-v2'],{encoding:'utf8'});
   assert.equal(run.status,0,run.stderr);
   const manifest=JSON.parse(readFileSync(join(temp,name,'SOURCE.json'),'utf8'));
   for(const path of ['market-client/wallet/commitmentCapsule.mjs','market-client/wallet/commitmentReview.mjs','market-client/wallet/commitmentReview.d.mts','market-client/wallet/native/readBinary.mjs'])assert.ok(manifest.files.some(e=>e.file===path),path);
   for(const e of manifest.files){
    const bytes=readFileSync(join(temp,name,e.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),e.sha256);
    assert.deepEqual(bytes,readFileSync(resolve(import.meta.dirname,'../..',e.file)));
   }
  }
  for(const name of ['SOURCE.json','bundle.json'])assert.deepEqual(readFileSync(join(temp,'first',name)),readFileSync(join(temp,'second',name)));
 }finally{rmSync(temp,{recursive:true,force:true});}
});
