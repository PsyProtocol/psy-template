// Include every resident startup, including restarts whose first job is not
// start_epoch. This is summed construction work, not parallel elapsed time.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
export function residentStartupRecords(base,kind){
 const publicDir=join(base,'public'),reg=JSON.parse(readFileSync(join(base,'markets-v1',kind,'live-registration.json'),'utf8'));
 assert.ok(Number.isSafeInteger(reg.vaultId)&&reg.vaultId>0&&reg.vaultId<16777216,'resident vault identity');
 const roots=new Map();
 for(const name of readdirSync(publicDir).sort().filter(n=>n.startsWith('maximum-'+kind+'-')&&n.endsWith('-formal-task.json'))){
  const task=JSON.parse(readFileSync(join(publicDir,name),'utf8'));
  const key=createHash('sha256').update(task.submission+'\n'+task.validUntilCheckpoint).digest('hex');
  roots.set(join(base,'runtime/compact/sepolia',String(reg.vaultId),key),'public/'+name);
 }
 const samples=[];
 for(const [dir,taskFile]of roots){
  if(!existsSync(dir))continue;
  for(const name of readdirSync(dir).sort().filter(n=>n.endsWith('.preflight.log')||n.endsWith('.preflight-failure.log'))){
   const path=join(dir,name);let found=0;
   for(const line of readFileSync(path,'utf8').split('\n')){
    if(!line.startsWith('PSY_COMPACT_SERVER '))continue;
    const value=JSON.parse(line.slice(19));if(!value.ready)continue;
    assert.equal(++found,1,'duplicate startup record in one proof log');
    for(const key of ['keyConstructionMs','sessionConstructionMs'])assert.ok(Number.isSafeInteger(value[key])&&value[key]>=0,'invalid resident construction timing');
    samples.push({source:relative(base,path),taskFile,...value});
   }
  }
 }
 return samples.sort((a,b)=>a.source.localeCompare(b.source));
}
