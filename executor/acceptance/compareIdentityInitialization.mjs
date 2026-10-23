// Measures ONLY deterministic public identity construction, never a UPS or TPS.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hostname,loadavg} from 'node:os';
import {sha256} from '../requestBinding.mjs';
import {compactIdentityCache} from '../identityCache.mjs';
import {driverRecords} from '../driverProcess.mjs';
import {saveObservation} from '../observations.mjs';
import {darwinResourceUsage} from './resourceUsage.mjs';
const [binary,expectedSha,directory,rpcConfig,out]=process.argv.slice(2);
assert.equal(process.platform,'darwin');assert.ok(binary&&expectedSha&&directory&&rpcConfig&&out);
assert.equal(sha256(readFileSync(binary)),expectedSha);mkdirSync(out);
const read=p=>JSON.parse(readFileSync(p,'utf8')),options=read(join(directory,'executor.json')),policy=join(directory,'policy.json'),dependencies=read(join(directory,'dependencies.json'));
const identity={version:1,network:options.network,marketId:options.contractId,vaultId:options.vaultId,fingerprint:options.fingerprint,publicKeyHash:options.publicKeyHash,contracts:dependencies.map(b=>b.contract)};
const binding={driverSha256:expectedSha,policySha256:sha256(readFileSync(policy)),rpcConfigSha256:sha256(readFileSync(rpcConfig)),identity,dependencies};
const run=promisify(execFile),startedAt=new Date().toISOString(),loadBefore=loadavg(),records=[];
for(const profile of ['uncached','cached']){
 const cache=compactIdentityCache();let builds=0;
 for(let i=0;i<4;i++){
  assert.equal(sha256(readFileSync(binary)),expectedSha);assert.equal(sha256(readFileSync(policy)),binding.policySha256);assert.equal(sha256(readFileSync(rpcConfig)),binding.rpcConfigSha256);
  let resources=null;const start=performance.now();
  const load=async()=>{builds++;const r=await run('/usr/bin/time',['-l',binary,'identity',policy],{env:{...process.env,RAYON_NUM_THREADS:'2'},timeout:120000,maxBuffer:2000000});saveObservation(join(out,`${profile}-${i}-process.json`),{stdout:r.stdout,stderr:r.stderr});resources=darwinResourceUsage(r.stderr);const v=driverRecords(r.stdout).find(x=>x.profile==='compact-v1');assert.equal(v?.fingerprint,identity.fingerprint);assert.equal(v?.publicKeyHash,identity.publicKeyHash);return v;};
  const value=profile==='cached'?await cache(binding,load):await load();
  records.push({profile,iteration:i,wallMilliseconds:performance.now()-start,identity:value,resources,childProcessesSoFar:builds,scope:'identity-only process/cache lookup; no state read, transaction proof, send or confirmation. Child RSS only when a process runs.'});
 }
}
saveObservation(join(out,'COMPARISON.json'),{schema:1,startedAt,finishedAt:new Date().toISOString(),host:hostname(),loadBefore,loadAfter:loadavg(),binding,records,scope:'Single-host four identity lookups per profile, uncached then cached, OS/cache/order bias uncontrolled. Measures adapter public metadata startup only, not resident circuit/session, proof throughput or network settlement.',broadcast:false,proofsGenerated:0,chainTps:null,productionReady:false});
