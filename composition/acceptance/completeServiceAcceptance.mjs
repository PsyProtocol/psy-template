// Immutable invocation coordinator. A failed step halts; it never automatically
// invokes another financial attempt. Explicit restarts need fresh labels and
// reviewed existing step evidence. Logs always use exclusive creation.
import assert from 'node:assert/strict';
import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {run,save} from '../../batching/admission/liveSupport.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
const [base,label,from='controller-independent']=process.argv.slice(2);assert.match(label??'',/^v[1-9][0-9]*$/);
const root=dirname(base),repo=fileURLToPath(new URL('../../',import.meta.url));
const script=n=>join(repo,'composition/acceptance',n+'.mjs'),release=join(root,'composition-live-release-v1/RELEASE.json');
const jobs=[['controller-independent','controllerSetup',[base,'service-recovery',release]],
 ['route-setup','routeSetup',[base,'service-recovery',release,join(root,'composition-tool-release-v1/RELEASE.json')]],
 ['before-accounting','routeAccounting',[base,'COMPOSITION-SERVICE-BEFORE-AUDIT-v1']],
 ['live-recovery','serviceRecoveryLive',[base,label]],
 ['final-accounting','routeAccounting',[base,'COMPOSITION-SERVICE-AUDIT-v1']],
 ['full-verification','verifyReceiptBundle',[base,join(base,'public/COMPOSITION-SERVICE-AUDIT-v1.json'),
   join(root,'build-v1/target/release/verify_saved_ups'),join(root,'composition-service-receipt-verification-v1')]],
 ['owner-audit','ownerClaimAudit',[base,join(root,'composition-service-receipt-verification-v1/SUMMARY.json'),
   join(base,'public/COMPOSITION-SERVICE-OWNER-CLAIM-AUDIT-v1.json'),'service-recovery']]];
const start=jobs.findIndex(([name])=>name===from);assert.ok(start>=0,'explicit known continuation stage');
if(start>=3)assert.ok(existsSync(join(base,'public/COMPOSITION-SERVICE-BEFORE-AUDIT-v1.json')),'reviewed original before audit required');
for(const [name,file,args] of jobs.slice(start)){
 const path=script(file),log=join(root,'composition-service-'+name+'-'+label+'.log');
 save(log+'-INPUTS.json',{startedAt:new Date().toISOString(),script:path,scriptSha256:sha256(readFileSync(path)),arguments:args});
 if(name==='live-recovery'){
  const target=join(root,'composition-service-live-source-'+label);assert.ok(!existsSync(target));mkdirSync(target);
  const {readdirSync}=await import('node:fs'),rows=[];
  function copy(dir){for(const entry of readdirSync(join(repo,dir),{withFileTypes:true})){
    const p=join(dir,entry.name);if(entry.isDirectory())copy(p);else if(p.endsWith('.mjs')){
      const dest=join(target,p);mkdirSync(dirname(dest),{recursive:true});const bytes=readFileSync(join(repo,p));writeFileSync(dest,bytes,{flag:'wx'});rows.push({path:p,sha256:sha256(bytes)});
    }
  }}copy('composition');
  for(const p of ['executor/residentProver.mjs','executor/journal.mjs','executor/worker.mjs']){
    const dest=join(target,p);mkdirSync(dirname(dest),{recursive:true});const bytes=readFileSync(join(repo,p));writeFileSync(dest,bytes,{flag:'wx'});rows.push({path:p,sha256:sha256(bytes)});
  }
  save(join(target,'MANIFEST.json'),{scope:'exact source snapshot before live service import; no binaries or wallets',files:rows});
 }
 console.log('START',name);await run(process.execPath,[path,...args],log,{});console.log('PASS',name);
}
