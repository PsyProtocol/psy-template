// Complete synthetic commit+settle UPS measurements, not VM timings or TPS.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';import {join} from 'node:path';
import {createHash} from 'node:crypto';import {hostname,cpus,loadavg} from 'node:os';
import {read,run} from '../../batching/admission/liveSupport.mjs';
import {saveObservation} from '../observations.mjs';import {closedParent} from './parentRecoveryGate.mjs';
const [parent,binary,expectedBinarySha,legacy,compact,out]=process.argv.slice(2);
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');assert.equal(sha(binary),expectedBinarySha);assert.ok(!existsSync(out),'fresh benchmark directory required');mkdirSync(out);
const markets=['amm','orderbook','bondingcurve','nftmarket'];
for(const m of markets)for(const f of ['main.psy.rs','config.json','compiled/compilation_artifact.json'])assert.equal(sha(join(legacy,m,f)),sha(join(compact,m,f)),'identical contract/config fixtures required');
for(const f of ['native.json','token/compilation_artifact.json','nft/compilation_artifact.json'])assert.equal(sha(join(legacy,f)),sha(join(compact,f)));
console.log('Waiting for verified parent principal/claim closure before controlled proof jobs.');
while(!existsSync(join(parent,'public/maximum-partial-cancel-refund-complete-v1.json')))await new Promise(r=>setTimeout(r,5000));
const parentGate=closedParent({version:1,admissionMode:'all-four-v1',parentCase:parent});
saveObservation(join(out,'INPUTS.json'),{schema:1,parentGate,binary,binarySha256:expectedBinarySha,host:hostname(),logicalCpus:cpus().length,rayonThreadsPerProcess:2,maxParallelProcesses:2,legacy,compact,scope:'synthetic complete commit+settle UPSs; four members per market, 12 economic fills per profile; ordinary funding/consent/admission/claims are VM fixture setup and excluded; no network submission or TPS'});
const profiles=['fixed40','compact-v1'],results=[];
for(const profile of profiles){
 const started=performance.now(),startedAt=new Date().toISOString(),loadBefore=loadavg();
 for(let i=0;i<markets.length;i+=2){const jobs=markets.slice(i,i+2).map(async market=>{
  const dir=join(out,market+'-'+profile),env={PSY_NETWORK:'localhost',RAYON_NUM_THREADS:'2',BATCH_BUILD:profile==='fixed40'?legacy:compact,BATCH_ADMISSION_TEST:'1',BATCH_PROOF_PROFILE:profile,BATCH_FULL_UPS_MARKETS:market,BATCH_FULL_UPS_SIZE:['amm','bondingcurve'].includes(market)?'4':'2',BATCH_UPS_SPREAD_IDS:'1',BATCH_FULL_UPS_OUT:dir};
  const timing=await run(binary,['full_ups::full_ups_four_market_commit_and_settle_proofs','--exact','--test-threads=1','--nocapture'],dir+'.log',env),r=read(join(dir,market+'.json'));
  assert.equal(r.market,market);assert.equal(r.members,4);assert.equal(r.broadcast,false);assert.equal(r.fills,['amm','bondingcurve'].includes(market)?4:2);
  const proofs=r.measurements.filter(x=>x.fullUpsVerified);assert.deepEqual(proofs.map(x=>x.phase),['commit','settle']);
  for(const p of proofs){assert.equal(p.publicEndpointsBound,true);assert.equal(p.exportedDeltasVerified,true);assert.equal(p.profile,profile);assert.ok(p.burn<=1000100000);if(profile==='fixed40')assert.equal(p.calls,40);else assert.ok(p.calls<40);}
  const result={market,profile,timing,report:join(dir,market+'.json'),reportSha256:sha(join(dir,market+'.json')),proofs};saveObservation(join(dir,'OBSERVATION.json'),result);return result;
 });const settled=await Promise.allSettled(jobs);for(const r of settled)if(r.status==='fulfilled')results.push(r.value);const failure=settled.find(r=>r.status==='rejected');if(failure)throw failure.reason;}
 saveObservation(join(out,profile+'-GROUP.json'),{startedAt,finishedAt:new Date().toISOString(),processGroupWallMilliseconds:Math.round(performance.now()-started),loadBefore,loadAfter:loadavg(),markets:4,fills:12,scope:'two concurrent proof processes each with two Rayon threads; includes per-process cold circuit construction; synthetic offline proving group only, not on-chain TPS'});
}
const comparisons=markets.map(market=>{const before=results.find(r=>r.market===market&&r.profile==='fixed40'),after=results.find(r=>r.market===market&&r.profile==='compact-v1');
 for(let i=0;i<2;i++)for(const field of ['endStateRoot','slotsModified','burn'])assert.equal(before.proofs[i][field],after.proofs[i][field],`same business-state/fee result ${market}/${field}`);
 return {market,beforeReport:before.report,afterReport:after.report,beforeCommitSettleMs:before.proofs.reduce((n,p)=>n+p.elapsedMs,0),afterCommitSettleMs:after.proofs.reduce((n,p)=>n+p.elapsedMs,0),sameContractStateAndFees:true};});
saveObservation(join(out,'COMPARISON.json'),{schema:1,completedAt:new Date().toISOString(),comparisons,scope:'complete synthetic commit+settle UPS comparison only; not full economic lifecycle, actual confirmation, ordinary wallet claim cost or chain TPS',methodology:{samplesPerMarketAndProfile:1,profileOrder:profiles,cacheOrderBiasNotEliminated:true,concurrentKnownFinancialJobsIntentionallyAvoided:true,hostOtherwiseUncontrolled:true,rayonThreads:2,parallelProcesses:2,unchangedContractAndTokenFixtures:true,allProofsAndEndpointsVerified:true,keysDifferByPolicyAndProfile:true,chainTps:null},broadcast:false,productionReady:false});console.log('Full UPS profile comparison completed.');
