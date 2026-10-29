// Owned native proposal route. It authenticates a finite source/seed inclusion
// and persists one complete plan; it cannot sign, broadcast or certify finality.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {readFile,mkdir,lstat} from 'node:fs/promises';import {resolve,join,dirname,isAbsolute} from 'node:path';
import {sealDriver} from './sealedDriver.mjs';import {sha256} from './requestBinding.mjs';
import {ExecutionJournal} from './journal.mjs';import {publishFile} from './durableFile.mjs';
import {planRandomBudget} from '../batching/checkpoint-stream/random-budget.mjs';
import {planMinimumBudget} from '../batching/checkpoint-stream/minimum-budget.mjs';
import {validateMinimumStreamPlan} from './minimumSourcePlan.mjs';
import {parseLosslessJson,losslessJson} from '../amm/u124/client.mjs';
const run=promisify(execFile),profile='source-covered-producer-random-stream-v1';
const outputNames=['plan','source-pages','ordering-pages','queue'];
const read=async p=>parseLosslessJson(await readFile(p,'utf8'));
async function put(p,b){try{await publishFile(p,b);}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(await readFile(p),Buffer.from(b),'immutable random source input changed');}}
export function validateRandomStreamPlan(plan,source,pages,queue){
 assert.equal(plan.profile,profile);assert.equal(plan.authenticatedSeedRelativeToHistory,true);
 for(const k of ['canSign','canBroadcast','fullUpsVerified','qualifiedRandomness','finalityVerified','causalSealBeforeReleaseAuthenticated'])assert.equal(plan[k],false);
 assert.equal(plan.producerInfluence,true);assert.equal(BigInt(plan.drawCheckpoint),BigInt(plan.sourceCheckpoint)+1n);
 const n=Number(plan.members);assert.ok(Number.isSafeInteger(n)&&n>=0&&n<2**24);assert.equal(queue.length,n);assert.equal(pages.length,Math.ceil(n/4));
 assert.equal(source.length,Number(plan.sourcePages));assert.equal(source.length,Math.ceil(Number(plan.accounts)/4));let accounts=0,ledger=null;
 for(const p of source){assert.deepEqual(p.scope,plan.scope,'one immutable source scope');assert.ok(p.rows.length>0&&p.rows.length<=4);if(accounts+p.rows.length<Number(plan.accounts))assert.equal(p.rows.length,4);if(ledger)assert.deepEqual(p.before,ledger,'source coverage gap');else assert.equal(Number(p.before.accounts),0);assert.equal(p.rows.length,Number(p.after.accounts)-Number(p.before.accounts));accounts+=p.rows.length;ledger=p.after;}
 assert.equal(accounts,Number(plan.accounts));assert.equal(Number(ledger.order_count),n);assert.deepEqual(ledger.orders,plan.sourceSetRoot);assert.deepEqual(ledger.users,source[0].facts[0]);
 let count=0,last=null;const owners=new Set();
 for(const p of pages){assert.equal(p.page.refund_only,false);assert.deepEqual(p.page.seed,plan.seed,'one seed across every page');if(last)assert.deepEqual(p.before,last,'ordering continuation gap');else{assert.equal(Number(p.before.cursor),0);assert.deepEqual(p.before.seen,plan.sourceSetRoot);}
  assert.equal(p.page.rows.length,Math.min(4,n-count));
  for(const row of p.page.rows){const key=String(row.origin.member.owner);assert.ok(!owners.has(key),'duplicate source member');owners.add(key);assert.equal(Number(row.append.index),count);assert.equal(Number(queue[count].index),count);assert.deepEqual(queue[count].member,row.origin.member,'global queue permutation changed');count++;}
  assert.equal(Number(p.after.cursor),count);last=p.after;
 }
 assert.equal(count,n);if(last){assert.deepEqual(last.ordered,plan.orderedRoot);}
 return {profile,accounts,members:n,orderingPages:pages.length,scope:'authenticated finite final-state source; not transaction-history or all-market admission',producerInfluence:true,qualifiedRandomness:false,fullUpsVerified:false,canSign:false,canBroadcast:false};
}
export async function prepareRandomSourceStream(o,options={}){return prepareSourceStream(o,options,{profile,outputNames,validate:validateRandomStreamPlan,budget:planRandomBudget,prefix:'random-stream'});}
export async function prepareMinimumSourceStream(o,options={}){return prepareSourceStream(o,options,{profile:'source-covered-producer-minimum-stream-v1',outputNames:['plan','source-pages','minimum-pages','queue'],validate:validateMinimumStreamPlan,budget:planMinimumBudget,prefix:'minimum-stream'});}
async function prepareSourceStream(o,{runNative=run}={},protocol){
 const {profile,outputNames,validate,budget,prefix}=protocol;
 const keys=['review','reviewSha256','snapshot','snapshotSha256','draw','drawSha256','policy','policySha256','historyRoot','wallet','walletSha256','runtimeDirectory'];
 assert.deepEqual(Object.keys(o).sort(),keys.sort(),'explicit reviewed preparation inputs only; no operator seed/round overrides');
 for(const k of ['reviewSha256','snapshotSha256','drawSha256','policySha256','historyRoot','walletSha256'])assert.match(o[k],/^[a-f0-9]{64}$/);
 const inputs={};for(const name of ['review','snapshot','draw','policy']){const b=await readFile(o[name]);assert.ok(b.length<=({review:1048576,snapshot:67108864,draw:65536,policy:4194304}[name]));assert.equal(sha256(b),o[name+'Sha256']);inputs[name]=b;}
 const initial=parseLosslessJson(inputs.snapshot.toString()),cfg=parseLosslessJson(inputs.review.toString());assert.ok([1,2].includes(Number(cfg.kind)));
 const f=initial.fields;assert.equal(f.length,41);const vault=Number(f[4]);assert.ok(Number.isSafeInteger(vault)&&vault>0&&vault<2**24);
 assert.equal(BigInt(f[0]),1n,'reviewed snapshot version');assert.equal(BigInt(f[1]),1384803358401154921n,'frozen testnet network domain');assert.equal(BigInt(f[2]),BigInt(cfg.kind),'reviewed market kind');assert.equal(BigInt(f[3]),BigInt(cfg.market),'reviewed market identity');
 // Exclude seed, source root, key and binary hashes from this namespace. An
 // altered identity/plan must conflict rather than create a new same-epoch plan.
 const scope={network:String(f[1]),chain:f.slice(9,13),market:String(f[3]),vault:String(f[4]),epoch:String(f[5])};
 const dir=join(resolve(o.runtimeDirectory),'random-source-stream',sha256(losslessJson(scope)));await mkdir(dir,{recursive:true,mode:0o700});
 const driver=await sealDriver({wallet:o.wallet,walletSha256:o.walletSha256,runtimeDirectory:o.runtimeDirectory});
 const journal=new ExecutionJournal({directory:dir,network:'offline-producer-stream',vaultId:vault,fingerprint:o.walletSha256});
 const input=join(dir,'input');
 const binding={scope,historyRoot:o.historyRoot,driverSha256:o.walletSha256,inputs:Object.fromEntries(Object.entries(inputs).map(([n,b])=>[n,sha256(b)]))};
 const load=async output=>{const plan=await read(join(output,'plan.json')),source=await read(join(output,'source-pages.json')),pages=await read(join(output,outputNames[2]+'.json')),queue=await read(join(output,'queue.json'));assert.equal(plan.historyRoot,o.historyRoot);for(const n of Object.keys(inputs))assert.equal(plan[n==='review'?'reviewSha256':n+'Sha256'],binding.inputs[n]);return {plan,source,pages,queue,status:validate(plan,source,pages,queue)};};
 await journal.locked(async()=>{
  await put(join(dir,'binding.json'),losslessJson(binding)+'\n');await mkdir(input,{recursive:true,mode:0o700});
  for(const[n,b]of Object.entries(inputs))await put(join(input,n+'.json'),b);
  for(const a of [cfg,...cfg.assets]){assert.ok(typeof a.artifact==='string'&&!isAbsolute(a.artifact)&&a.artifact.split(/[\\/]/).every(p=>p&&p!=='.'&&p!=='..'),'confined artifact');assert.ok(!['review.json','snapshot.json','draw.json','policy.json'].includes(a.artifact));const b=await readFile(join(dirname(resolve(o.review)),a.artifact));assert.equal(sha256(b),a.artifact_sha256);await mkdir(dirname(join(input,a.artifact)),{recursive:true,mode:0o700});await put(join(input,a.artifact),b);}
  await driver.check();const records=await journal.records();
  if(!records.some(r=>r.status===prefix+'-prepared')){
   // A planning crash may leave public partial output. Never overwrite it or
   // trust its JSON as a native verification result. Replay the same pinned
   // inputs in a fresh directory; this cannot prove, sign or send a transaction.
   const name=records.length?'prepared-recovery-'+records.length:'prepared',output=join(dir,name);
   const previous=records.filter(r=>r.status===prefix+'-native-intent');
   await journal.append({status:prefix+'-native-intent',outputDirectory:name,bindingSha256:sha256(await readFile(join(dir,'binding.json'))),financialOperations:0});
   await runNative(driver.file,[join(input,'review.json'),join(input,'snapshot.json'),o.historyRoot,join(input,'draw.json'),join(input,'policy.json'),output],{env:{...process.env,PSY_NETWORK:'testnet',PSY_MARKET_TESTNET_PROFILE:'mainnet-beta-20261027-v1',RAYON_NUM_THREADS:'2'},timeout:300000,maxBuffer:2000000});
   const p=await load(output),outputs={};for(const name of outputNames)outputs[name]=sha256(await readFile(join(output,name+'.json')));
   for(const prior of previous){assert.match(prior.outputDirectory,/^prepared(?:-recovery-\d+)?$/);for(const name of outputNames){const path=join(dir,prior.outputDirectory,name+'.json');try{assert.ok((await lstat(path)).isFile(),'interrupted output must remain a regular file');assert.equal(sha256(await readFile(path)),outputs[name],'interrupted native output conflicts with exact replay');}catch(e){if(e.code!=='ENOENT')throw e;}}}
   await journal.append({status:prefix+'-prepared',outputDirectory:name,bindingSha256:sha256(await readFile(join(dir,'binding.json'))),outputs,summary:p.status,financialOperations:0});
  }
 });
 const check=async()=>{await driver.check();assert.deepEqual(await read(join(dir,'binding.json')),parseLosslessJson(losslessJson(binding)));const r=(await journal.records()).find(r=>r.status===prefix+'-prepared');assert.ok(r);assert.match(r.outputDirectory,/^prepared(?:-recovery-\d+)?$/);const output=join(dir,r.outputDirectory);assert.equal(sha256(await readFile(join(dir,'binding.json'))),r.bindingSha256);for(const[n,h]of Object.entries(binding.inputs))assert.equal(sha256(await readFile(join(input,n+'.json'))),h,'copied source input changed');for(const a of [cfg,...cfg.assets]){const path=join(input,a.artifact);assert.ok((await lstat(path)).isFile(),'copied artifact must remain a regular file');assert.equal(sha256(await readFile(path)),a.artifact_sha256,'copied reviewed artifact changed');}for(const[n,h]of Object.entries(r.outputs))assert.equal(sha256(await readFile(join(output,n+'.json'))),h,'prepared plan changed');return load(output);};
 return {directory:dir,status:async()=>(await check()).status,plan:check,planBudget:async costs=>{const {plan}=await check();return budget(plan,costs);},authorizeSettlement:()=>{throw Error('A reviewed live source-stream spending driver and fresh instance admission are required; preparation cannot enable writes.');}};
}
