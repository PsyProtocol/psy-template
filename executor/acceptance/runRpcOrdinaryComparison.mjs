// Matched real fills. Baseline modules/binaries are frozen before mutations.
// A partial/unknown attempt is a stop, never permission to replace a payment.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,copyFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {hostname,cpus,totalmem,loadavg} from 'node:os';
import {threeMarketCase,SDK} from './threeMarketCase.mjs';
import {formal as candidateFormal,pause} from './candidateHarness.mjs';
import {LiveMarket} from '../../batching/admission/liveMarket.mjs';
import {ordinary,read,save,confirmUps} from '../../batching/admission/liveSupport.mjs';
import {call,encodeAmount,FEE_ESCROW as F,parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
import {sponsorCalls} from '../../batching/v2/client.mjs';
import {cohortAssets,payoutClaims} from '../../batching/admission/liveAssets.mjs';
import {publicState} from '../publicState.mjs';
import {sha256} from '../requestBinding.mjs';
import {ordinaryResident} from '../ordinaryResident.mjs';
import {residentScope} from '../residentScope.mjs';
import {freezeAppModules} from './sourceClosure.mjs';
import {saveObservation} from '../observations.mjs';
import {readSponsorGrant,sponsorGrant} from '../sponsorGrant.mjs';
import {verifyPreEpochResume} from './preEpochResume.mjs';
import {assertBookFillCohort} from './fillCohort.mjs';

const [base,original,selection='baseline']=process.argv.slice(2);
const resourceComparison=process.env.PSY_RESOURCE_COMPARISON==='1';
assert.ok(base&&original);assert.ok(['baseline','candidate'].includes(selection));
assert.ok(!existsSync(join(base,'public',selection+'-COMPLETE.json')),'closed round');
if(selection==='candidate'){
 const prior=read(join(base,'baseline-audit-v1/SUMMARY.json'));
 assert.equal(prior.fullProofAccountingPending,false,'close baseline and reconcile every original before another financial round');assert.equal(prior.fills,1);
}
const roundTag=process.env.PSY_RPC_COMPARISON_ROUND??selection;assert.match(roundTag,new RegExp('^'+selection+'(?:-v[1-9][0-9]*)?$'));
const sourceLabel=process.env.PSY_RPC_COMPARISON_SOURCE_LABEL??roundTag+'-run-v1';assert.match(sourceLabel,/^[a-z0-9-]+$/);
const bootstrapAt=new Date().toISOString(),bootstrapStart=performance.now();
if(resourceComparison)saveObservation(join(base,'public',sourceLabel+'-BOOTSTRAP-STARTED.json'),{startedAt:bootstrapAt,pid:process.pid,selection,scope:'application body after module imports; outer process timer records full invocation'});
freezeAppModules(fileURLToPath(import.meta.url),base,sourceLabel);
const old=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'});
assert.equal(read(join(original,'public/ACCEPTANCE-CLOSED-v1.json')).fullProofAccountingPending,false);
const releaseName=process.env.PSY_ORDINARY_RELEASE_FILE??'RELEASE.json';assert.match(releaseName,/^RELEASE(?:-v[1-9][0-9]*)?\.json$/);
const release=read(join(base,'public',releaseName)),sdkManifest=join(process.cwd(),'batching/dependencies/session-bound-sdk-20261020/manifest.json');
assert.equal(sha256(readFileSync(sdkManifest)),SDK);assert.equal(release.sdkManifestSha256,SDK);
if(selection==='candidate'){assert.ok(process.env.PSY_ORDINARY_RELEASE_FILE,'select a reviewed candidate release explicitly; original generations stay preserved');assert.equal(release.inputDigestBoundBeforeProof,true);assert.equal(release.readyIdentityBeforeJob,true);}
const round=join(base,roundTag);if(!existsSync(round)){mkdirSync(round);mkdirSync(join(round,'public'));mkdirSync(join(round,'attempts'));copyFileSync(join(base,'public/rpc.json'),join(round,'public/rpc.json'));}
const config=join(round,'public/rpc.json'),m=new LiveMarket({...old.by.orderbook,base:round,config});
const baselineFormal=resourceComparison?candidateFormal:(await import(pathToFileURL(join(base,'baseline-source/executor/acceptance/candidateHarness.mjs')).href)).formal;
const h={...old,base:round,config,markets:[m],by:{orderbook:m},residentScope:residentScope()};
const ordinaryTool=resourceComparison||selection==='candidate'?release.binaries.ordinary:old.tools.binaries.ordinary;
const verifierComparison=process.env.PSY_FIXED_VERIFIER_COMPARISON==='1';
const memoryMode=verifierComparison?'retain-v1':selection==='baseline'?'retain-v1':'release-unused-v1';
const fixedVerifierMode=verifierComparison?(selection==='baseline'?'fresh-v1':'cached-v1'):'cached-v1';
if(verifierComparison){assert.equal(release.experiment,'fixed-verifier-resources-v1');assert.deepEqual(release.variants[selection],{memoryMode,fixedVerifierMode});}
if(resourceComparison){
 assert.equal(release.resourceComparison,true);assert.equal(release.sameBinaryBothVariants,true);
 assert.equal(sha256(readFileSync(release.binaries.compact.file)),release.binaries.compact.sha256);
 h.binary=release.binaries.compact.file;h.binarySha256=release.binaries.compact.sha256;h.proverMemoryMode=memoryMode;h.fixedVerifierMode=fixedVerifierMode;
}
assert.equal(sha256(readFileSync(ordinaryTool.file)),ordinaryTool.sha256);
const env={...h.env,...(resourceComparison?{PSY_PROVER_MEMORY_MODE:memoryMode,PSY_FIXED_VERIFIER_MODE:fixedVerifierMode,PSY_PROVER_RESOURCE_METRICS:'1'}:selection==='candidate'?{}:{PSY_ORDINARY_GUARD_MODE:'serial-v1'})};
const depsFile=join(round,'public/ordinary-dependencies.json');if(!existsSync(depsFile))save(depsFile,m.contracts);
const workers=new Map();
const user=async(actor,label,calls)=>{
 const out=join(round,'attempts',label),input=join(round,'public',label+'.json');
 if(existsSync(out)){
  assert.ok(existsSync(join(out,'preflight.json')),'partial original ordinary attempt; inspect and never replace automatically');
  const p=parseLosslessJson(readFileSync(join(out,'preflight.json'),'utf8')),request=parseLosslessJson(readFileSync(join(out,'request.json'),'utf8'));
  assert.equal(p.inputSha256,sha256(readFileSync(input)));if(typeof calls!=='function')assert.deepEqual(parseLosslessJson(readFileSync(input,'utf8')).calls.contract_calls,parseLosslessJson(losslessJson(calls)),'original ordinary business calls changed');assert.equal(p.core.new_user_leaf.public_key,h.actors[actor].publicKeyHash);assert.deepEqual(request.user_ec_input.core,p.core);
  if(!existsSync(join(out,'included.json')))await confirmUps(config,out,{historyConcurrency:!resourceComparison&&selection==='baseline'?1:4});
  const included=parseLosslessJson(readFileSync(join(out,'included.json'),'utf8'));
  assert.equal(included.receipt.data.status,'included');assert.equal(included.userId,BigInt(h.actors[actor].id));assert.equal(included.endUserLeafHash,p.endUserLeafHash);assert.equal(included.contentHash,included.receipt.data.content_hash);assert.ok(included.commonCheckpoint>=included.checkpoint);return out;
 }
 assert.ok(!existsSync(input),'partial original ordinary input; preserve and inspect');
 let worker;
 if(resourceComparison||selection==='candidate'){
  const key=h.actors[actor].publicKeyHash;
  if(!workers.has(key))workers.set(key,ordinaryResident({binary:ordinaryTool.file,binarySha256:ordinaryTool.sha256,config,dependencies:depsFile,secret:h.actors[actor].secret,publicKeyHash:key,sdkManifest,sdkSha256:SDK,env}));
  worker=await workers.get(key);
 }
 const startedAt=new Date().toISOString(),t=performance.now();
 const result=await ordinary({base:round,config,binary:ordinaryTool.file,secret:h.actors[actor].secret,name:label,calls:typeof calls==='function'?await calls():calls,bindings:h.bindings,env,worker,historyConcurrency:!resourceComparison&&selection==='baseline'?1:4});
 saveObservation(join(round,'public',label+'-end-to-end.json'),{startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-t,selection,actor,scope:'fresh dependency/snapshot reads, ordinary preparation/proof, ACK, indexed receipt and common visibility; ordinary payout claims are real UPSs'});
 return result;
};
const fund=(label,purpose=2)=>user('sponsor',label,async()=>{
 const s=await publicState(config);
 const grant=sponsorGrant(await readSponsorGrant(s,m,h.actors.sponsor.id),{vault:m.vault,purpose:BigInt(purpose),amount:purpose===1?2n*F:F});
 assert.equal(grant.adopt,false,'matching performance workload requires a fresh funding UPS; never duplicate an existing grant');
 return sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:grant.nonce,purpose:grant.purpose,amount:grant.amount});
});
const U=h.actors.bob.id,B=h.actors.buyer.id,unit=10n**18n;
const spec={users:[U,B,h.actors.sponsor.id,...old.markets.map(m=>m.vault),...old.pin.legacyAssetVaults],assets:[2483,2484],nftId:2496};
const named=name=>t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===name);
const pair=async jobs=>{const results=await Promise.allSettled(jobs.map(fn=>fn()));const bad=results.find(r=>r.status==='rejected');if(bad)throw bad.reason;};
let f;
try {
 const s=await publicState(config);
 const beforeFile=join(round,'public/assets-before.json'),resuming=existsSync(beforeFile);
 if(!resuming){assert.equal(await h.at(s,m,m.vault,'queue_phase'),3n);assert.ok([3n,4n].includes(await h.at(s,m,m.vault,'batch_phase')));}
 const orderNonce=actor=>parseLosslessJson(readFileSync(join(round,'public',actor+'-order.json'),'utf8')).calls.contract_calls.find(c=>c.method_name==='open_sell').inputs.at(-1);
 const nonceU=resuming?orderNonce('owner'):await h.at(s,m,U,'nonce')+1n,nonceB=resuming?orderNonce('buyer'):await h.at(s,m,B,'nonce')+1n;
 assert.equal(nonceU,nonceB);
 // A vault UPS cannot clear another user's order state. Close the consumed
 // prior order in that user's ordinary UPS before opening the next nonce.
 if(!resuming)for(const [owner,side]of [[U,0n],[B,1n]]){assert.equal(await h.at(s,m,owner,'kind'),1n);assert.equal(await h.at(s,m,owner,'side'),side);assert.ok(await h.at(s,m,m.vault,'consumed',owner)<=nonceU-1n,'consumed never exceeds the prior nonce; close itself proves incoming cursors are settled, including an unfunded QA fixture');}
 const before=resuming?parseLosslessJson(readFileSync(beforeFile,'utf8')):await cohortAssets(s,spec);if(!resuming)save(beforeFile,before);
 assert.ok(before.accounts[U].ft[2483]>=unit&&before.accounts[B].ft[2484]>=unit);
 assert.ok(before.accounts[h.actors.sponsor.id].native>=12_000_000_000n,'explicit sponsor budget');
 const initialGrant=await readSponsorGrant(s,m,h.actors.sponsor.id);
 const recoveryLabel=process.env.PSY_PRE_EPOCH_READ_RECOVERY;
 if(recoveryLabel){assert.equal(resuming,true);await verifyPreEpochResume({base,round,original,selection,market:m,state:s,actors:h.actors,grant:initialGrant,bindings:h.bindings,label:recoveryLabel});}
 else assert.equal(initialGrant.sent,initialGrant.claimed,'recover unused sponsorship before any new financial round');
 assert.equal(initialGrant.claimed,initialGrant.settledFee,'sponsor claim/accounting cursor');
 if(!resuming)saveObservation(join(round,'public/ENVIRONMENT.json'),{at:new Date().toISOString(),host:hostname(),logicalCpus:cpus().length,physicalMemoryBytes:totalmem(),loadAverage:loadavg(),threads:2,sdkSha256:SDK,compactBinary:h.binarySha256,ordinaryBinary:ordinaryTool.sha256,selection,resourceComparison,verifierComparison,measuredGuardReadRetry:process.env.PSY_MEASURED_GUARD_READ_RETRY==='1',resourceHeartbeatRequired:process.env.PSY_REQUIRE_RESOURCE_HEARTBEAT==='1',prewarmBeforeEpoch:verifierComparison,consentSchedule:verifierComparison?'parallel-three-v1':'historical-pair-v1',fixedVerifierMode,memoryMode:resourceComparison?memoryMode:null,market:m.id,vault:m.vault,inputPerSide:unit.toString(),fills:1,matching:'existing deterministic Book priority, two members, one trade; normal new orders only, no contract updates'});
 if(resourceComparison)saveObservation(join(base,'public',sourceLabel+'-BOOTSTRAP-TIMING.json'),{startedAt:bootstrapAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-bootstrapStart,pid:process.pid,selection,cohortSnapshotMilliseconds:before.observation.wallMilliseconds,scope:'source/binary/config identity checks, SDK-selected fixture loading, fresh realm/dependency/order reads and finite-cohort snapshot; separate from native circuit construction'});
 await pair([
  ()=>user('bob','owner-order',[m.order('close_0',[]),m.order('open_sell',[BigInt(m.vault),0n,encodeAmount(unit),encodeAmount(unit),BigInt(before.checkpoint)+8192n,nonceU]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(m.vault),F]},call(2483n,h.token,'transfer',[BigInt(m.vault),encodeAmount(unit)])]),
  ()=>user('buyer','buyer-order',[m.order('close_1',[]),m.order('open_sell',[BigInt(m.vault),1n,encodeAmount(unit),encodeAmount(unit),BigInt(before.checkpoint)+8192n,nonceB]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(m.vault),F]},call(2484n,h.token,'transfer',[BigInt(m.vault),encodeAmount(unit)])])
 ]);
 await fund('start-fund');
 if(verifierComparison){
  const at=await publicState(config),prewarmPlan={version:1,epoch:Number(await h.at(at,m,m.vault,'queue_epoch'))+1,cutoff:at.checkpoint+128,members:[U,B].sort((a,b)=>a-b).map(owner=>({owner,nonce:nonceU.toString()}))};
  const warm=await candidateFormal(h,m,'non-authorizing-prewarm',prewarmPlan,{performanceMetrics:true,expiry:512,runtimeSuffix:'-comparison'});
  try{const startedAt=new Date().toISOString(),begin=performance.now(),result=await warm.warm();writeFileSync(join(round,'prewarm-native.log'),result.stdout+'\n'+result.stderr,{flag:'wx'});saveObservation(join(round,'public/PREWARM.json'),{startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-begin,residentStartup:result.residentStartup,scope:'immutable resources only, before actual epoch plan is frozen; no scan, proof, order consent or network submission; included in round wall and cold construction accounting'});}finally{await warm.close();}
 }
 const planName=process.env.PSY_RPC_COMPARISON_PLAN??'PLAN.json';assert.match(planName,/^PLAN(?:-v[1-9][0-9]*)?\.json$/);const planFile=join(round,'public',planName);
 let plan;if(existsSync(planFile))plan=read(planFile);else{const at=await publicState(config);plan={version:1,epoch:Number(await h.at(at,m,m.vault,'queue_epoch'))+1,cutoff:at.checkpoint+128,members:[U,B].sort((a,b)=>a-b).map(owner=>({owner,nonce:nonceU.toString()}))};save(planFile,plan);}
 const formalTag=process.env.PSY_RPC_FORMAL_TAG??'rpc-ordinary';assert.match(formalTag,/^[a-z0-9-]+$/);
 f=await(selection==='baseline'?baselineFormal:candidateFormal)(h,m,formalTag,plan,{performanceMetrics:true,expiry:512,runtimeSuffix:'-comparison'});
 await f.step('start',named('start_epoch'));
 await pair([()=>user('bob','owner-consent',[m.order('request_admission',[BigInt(plan.epoch),BigInt(plan.cutoff)])]),...(verifierComparison?[()=>user('buyer','buyer-consent',[m.order('request_admission',[BigInt(plan.epoch),BigInt(plan.cutoff)])])]:[]),()=>fund('admit-0-fund')]);
 if(!verifierComparison)await user('buyer','buyer-consent',[m.order('request_admission',[BigInt(plan.epoch),BigInt(plan.cutoff)])]);
 await f.step('admit-0',named('admit_entry'));
 await fund('admit-1-fund');await f.step('admit-1',named('admit_entry'));
 await fund('seal-fund');
 const waitFile=join(round,'public/cutoff-wait.json');
 if(existsSync(waitFile)){assert.equal(read(waitFile).cutoff,plan.cutoff,'original cutoff binding');}
 else{const waitStart=performance.now(),waitAt=new Date().toISOString();
 while((await publicState(config)).checkpoint<=plan.cutoff)await pause(10000);
 saveObservation(waitFile,{startedAt:waitAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-waitStart,cutoff:plan.cutoff,scope:'protocol cutoff wait, separate from prover/RPC execution cost'});}
 await f.step('seal',named('seal_epoch'));await fund('commit-fund',1);
 await f.step('commit',t=>t.kind==='batch_commit');await f.step('settle',t=>t.kind==='batch_settle');
 await pair([
  ()=>user('bob','owner-payout',async()=>payoutClaims(await publicState(config),{userId:U,markets:[m],tokenAbi:h.token,nftAbi:h.nft})),
  ()=>user('buyer','buyer-payout',async()=>payoutClaims(await publicState(config),{userId:B,markets:[m],tokenAbi:h.token,nftAbi:h.nft}))
 ]);
 const after=await cohortAssets(await publicState(config),spec);save(join(round,'public/assets-after.json'),after);
 assertBookFillCohort(before,after,{owner:U,buyer:B,assets:spec.assets,unit});
 const terminal=await m.snapshot('terminal');assert.equal(terminal.fields.queue_phase[0],3n);assert.equal(terminal.fields.queue_count[0],2n);assert.deepEqual(terminal.fields.queue_outcome.slice(0,2),[1n,1n]);
 for(const owner of [U,B])assert.equal(await h.at(await publicState(config),m,m.vault,'consumed',owner),nonceU);
 await f.journal.reconcile(f.adapter.reconcile);assert.equal((await f.journal.unresolved()).length,0);
 save(join(base,'public',selection+'-COMPLETE.json'),{at:new Date().toISOString(),selection,roundTag,fills:1,members:2,ordinaryClaimsIncluded:true,fullProofAccountingPending:true,assets:spec,ftConserved:true,oldContractUpdates:false,scope:'one real new Book epoch on the same owned QA market/key/vault and economic workload; not a four-market or steady-state TPS benchmark'});
} finally {
 const closed=await Promise.allSettled([Promise.resolve().then(()=>f?.close()),...Array.from(workers.values(),async worker=>(await worker).close())]);
 const scoped=await Promise.allSettled([h.residentScope.close()]);
 const failed=[...closed,...scoped].find(r=>r.status==='rejected');if(failed)throw failed.reason;
}
