// Owned QA recovery: exact empty timeout, new consent, same original deposits.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {threeMarketCase,SDK} from './threeMarketCase.mjs';
import {formal,pause} from './candidateHarness.mjs';import {freezeAppModules} from './sourceClosure.mjs';
import {unsignedSessionFailure} from './unsignedSessionFailure.mjs';
import {read,save,ordinary,confirmUps} from '../../batching/admission/liveSupport.mjs';
import {LiveMarket} from '../../batching/admission/liveMarket.mjs';
import {cohortAssets,payoutClaims} from '../../batching/admission/liveAssets.mjs';
import {publicState} from '../publicState.mjs';import {residentScope} from '../residentScope.mjs';
import {ordinaryResident} from '../ordinaryResident.mjs';import {saveObservation} from '../observations.mjs';import {sha256} from '../requestBinding.mjs';
import {readSponsorGrant,sponsorGrant} from '../sponsorGrant.mjs';
import {parseLosslessJson,losslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';import {sponsorCalls} from '../../batching/v2/client.mjs';
const[base,original,mode='empty-epoch-v1']=process.argv.slice(2);assert.ok(original);assert.ok(['empty-epoch-v1','original-admission-v1'].includes(mode));
const originalAdmission=mode==='original-admission-v1';
freezeAppModules(fileURLToPath(import.meta.url),base,originalAdmission?'original-admission-recovery-v1':'empty-epoch-recovery-v2');
const round=join(base,'baseline'),config=join(round,'public/rpc.json'),release=read(join(base,'public/RELEASE.json')),exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
assert.equal(release.sdkManifestSha256,SDK);for(const tool of Object.values(release.binaries))assert.equal(sha256(readFileSync(tool.file)),tool.sha256);
assert.equal(sha256(readFileSync(config)),sha256(readFileSync(join(original,'public/rpc.json'))));
assert.ok(!existsSync(join(base,'public/baseline-RECOVERY-COMPLETE-v1.json')));
const old=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'}),m=new LiveMarket({...old.by.orderbook,base:round,config}),scope=residentScope();
const h={...old,base:round,config,markets:[m],by:{orderbook:m},binary:release.binaries.compact.file,binarySha256:release.binaries.compact.sha256,proverMemoryMode:'retain-v1',fixedVerifierMode:'fresh-v1',residentScope:scope};
assert.deepEqual([m.id,m.vault,h.actors.bob.id,h.actors.buyer.id,h.actors.sponsor.id],[2497,662720,1717440,406720,519360]);
const prior=read(join(round,'public/PLAN.json')),named=name=>t=>t.kind==='batch_maintenance'&&t.maintenanceOperation===name,workers=new Map(),services=[];
const user=async(actor,label,calls)=>{
 const out=join(round,'attempts',label),input=join(round,'public',label+'.json'),a=h.actors[actor];
 if(existsSync(out)){
  const p=exact(join(out,'preflight.json'));assert.equal(p.inputSha256,sha256(readFileSync(input)));assert.equal(p.core.new_user_leaf.public_key,a.publicKeyHash);
  if(typeof calls!=='function')assert.deepEqual(exact(input).calls.contract_calls,parseLosslessJson(losslessJson(calls)));
  if(!existsSync(join(out,'included.json')))await confirmUps(config,out);return out;
 }
 assert.ok(!existsSync(input),'partial input needs explicit review');
 if(!workers.has(actor))workers.set(actor,ordinaryResident({binary:release.binaries.ordinary.file,binarySha256:release.binaries.ordinary.sha256,config,dependencies:join(round,'public/ordinary-dependencies.json'),secret:a.secret,publicKeyHash:a.publicKeyHash,sdkManifest:join(process.cwd(),'batching/dependencies/session-bound-sdk-20261020/manifest.json'),sdkSha256:SDK,env:{...h.env,PSY_PROVER_MEMORY_MODE:'retain-v1',PSY_FIXED_VERIFIER_MODE:'fresh-v1',PSY_PROVER_RESOURCE_METRICS:'1'}}));
 const startedAt=new Date().toISOString(),start=performance.now();
 const outDir=await ordinary({base:round,config,binary:release.binaries.ordinary.file,secret:a.secret,name:label,calls:typeof calls==='function'?await calls():calls,bindings:h.bindings,env:h.env,worker:await workers.get(actor)});
 saveObservation(join(round,'public',label+'-end-to-end.json'),{startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start,scope:'recovery only; real ordinary proof, submit, exact receipt/common visibility'});return outDir;
};
const fund=(label,purpose=2)=>user('sponsor',label,async()=>{
 const grant=sponsorGrant(await readSponsorGrant(await publicState(config),m,h.actors.sponsor.id),{vault:m.vault,purpose:BigInt(purpose),amount:purpose===1?2n*F:F});assert.equal(grant.adopt,false,'never duplicate pending funding');
 return sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),...grant});
});
const pair=async jobs=>{const results=await Promise.allSettled(jobs.map(f=>f()));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;};
try{
 const f=await formal(h,m,'rpc-ordinary',prior,{performanceMetrics:true,expiry:512,runtimeSuffix:'-comparison'});services.push(f);
 assert.equal((await f.journal.unresolved()).length,0,'unknown original broadcast blocks recovery');
 const records=await f.journal.records(),planned=records.findLast(r=>r.status==='planned'&&r.task.maintenanceOperation==='admit_entry');assert.ok(planned);
 // The task directory name is not its journal identity; locate the preserved
 // producer by exact task bytes instead of guessing or deleting old locks.
 const root=join(round,'runtime-comparison/compact/sepolia/662720');const candidates=[];
 for(const d of readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()))for(const child of readdirSync(join(root,d.name),{withFileTypes:true}).filter(x=>x.isDirectory()&&x.name.startsWith('proof-'))){const directory=join(root,d.name,child.name);if(existsSync(join(directory,'failure.json'))){const producer=read(directory+'.producer.json');if(producer.taskSha256===sha256(planned.task.submission+'\n'+planned.task.validUntilCheckpoint)){assert.equal(producer.driverSha256,h.binarySha256);assert.equal(producer.policySha256,sha256(readFileSync(f.options.policy)));assert.equal(producer.rpcConfigSha256,sha256(readFileSync(config)));candidates.push(directory);}}}
 assert.equal(candidates.length,1);unsignedSessionFailure({failure:read(join(candidates[0],'failure.json')),files:readdirSync(candidates[0]),records,taskId:planned.taskId});
 let state=await publicState(config);assert.equal(await h.at(state,m,m.vault,'queue_epoch'),BigInt(prior.epoch));assert.equal(await h.at(state,m,m.vault,'queue_count'),0n);assert.equal(await h.at(state,m,m.vault,'queue_phase'),1n);
 let next=f,plan=prior,prefix='';
 if(originalAdmission){
  assert.ok(BigInt(state.checkpoint)<=BigInt(planned.task.validUntilCheckpoint),'original admission send window expired');assert.ok(state.checkpoint<=prior.cutoff);
  save(join(round,'public/ORIGINAL-ADMISSION-READ-RECOVERY-v1.json'),{at:new Date().toISOString(),checkpoint:state.checkpoint,taskId:planned.taskId,failureDirectory:candidates[0],originalPlanUnchanged:true,originalOrdersAndDepositsUnchanged:true,noNewGrantOrConsent:true,failedAdmissionNeverBroadcast:true,cleanPerformancePairEligible:false});
 }else{
  const roots=await Promise.all([2483,2484].map(id=>state.contractStateRoot(m.vault,id)));
  while(state.checkpoint<=prior.cutoff){await pause(10000);state=await publicState(config);}
  await f.step('empty-timeout-read-recovery-v1',named('abort_empty_epoch'));
  state=await publicState(config);assert.equal(await h.at(state,m,m.vault,'queue_phase'),3n);assert.equal(await h.at(state,m,m.vault,'queue_count'),0n);assert.deepEqual(await Promise.all([2483,2484].map(id=>state.contractStateRoot(m.vault,id))),roots);
  for(const member of prior.members){assert.equal(await h.at(state,m,member.owner,'nonce'),BigInt(member.nonce));assert.ok(await h.at(state,m,m.vault,'consumed',member.owner)<BigInt(member.nonce));}
  save(join(round,'public/EMPTY-EPOCH-READ-RECOVERY-v1.json'),{at:new Date().toISOString(),checkpoint:state.checkpoint,queueEpoch:prior.epoch,queueCount:0,queuePhase:3,vaultFtRootsUnchanged:true,originalOrdersAndDepositsUnconsumed:true,failedAdmissionNeverBroadcast:true,newOwnerFunding:false});
  await fund('retry-start-fund-v1');
  const at=await publicState(config);plan={version:1,epoch:prior.epoch+1,cutoff:at.checkpoint+128,members:prior.members};prefix='retry-';
  for(const member of plan.members)assert.ok(await h.at(at,m,member.owner,'deadline')>BigInt(plan.cutoff));
  save(join(round,'public/RETRY-PLAN-v1.json'),plan);
  next=await formal(h,m,'recovered-epoch',plan,{performanceMetrics:true,expiry:512,runtimeSuffix:'-comparison'});services.push(next);
  const start=next.step('retry-start',named('start_epoch'));
  await pair([()=>start,()=>user('bob','retry-owner-consent-v1',[m.order('request_admission',[BigInt(plan.epoch),BigInt(plan.cutoff)])]),()=>user('buyer','retry-buyer-consent-v1',[m.order('request_admission',[BigInt(plan.epoch),BigInt(plan.cutoff)])]),async()=>{await start;await fund('retry-admit-0-fund-v1');}]);
 }
 await next.step(prefix+'admit-0',named('admit_entry'));await fund(prefix+'admit-1-fund'+(originalAdmission?'':'-v1'));await next.step(prefix+'admit-1',named('admit_entry'));await fund(prefix+'seal-fund'+(originalAdmission?'':'-v1'));
 while((await publicState(config)).checkpoint<=plan.cutoff)await pause(10000);
 await next.step(prefix+'seal',named('seal_epoch'));await fund(prefix+'commit-fund'+(originalAdmission?'':'-v1'),1);await next.step(prefix+'commit',t=>t.kind==='batch_commit');await next.step(prefix+'settle',t=>t.kind==='batch_settle');
 await pair(['bob','buyer'].map(actor=>()=>user(actor,originalAdmission?(actor==='bob'?'owner-payout':'buyer-payout'):actor+'-recovery-payout-v1',async()=>payoutClaims(await publicState(config),{userId:h.actors[actor].id,markets:[m],tokenAbi:h.token,nftAbi:h.nft}))));
 const before=exact(join(round,'public/assets-before.json')),spec={users:Object.keys(before.accounts).map(Number),assets:[2483,2484],nftId:2496},after=await cohortAssets(await publicState(config),spec),unit=10n**18n;
 for(const asset of spec.assets){assert.equal(after.totals[asset],before.totals[asset]);for(const[id,row]of Object.entries(before.accounts)){const delta=id===String(h.actors.bob.id)?(asset===2483?-unit:unit):id===String(h.actors.buyer.id)?(asset===2483?unit:-unit):0n;assert.equal(after.accounts[id].ft[asset]-row.ft[asset],delta);}}
 const terminal=await m.snapshot('recovery-terminal');assert.equal(terminal.fields.queue_phase[0],3n);assert.equal(terminal.fields.queue_count[0],2n);assert.deepEqual(terminal.fields.queue_outcome.slice(0,2),[1n,1n]);for(const member of plan.members)assert.equal(await h.at(await publicState(config),m,m.vault,'consumed',member.owner),BigInt(member.nonce));
 assert.deepEqual(after.nfts,before.nfts);assert.deepEqual(after.nftPending,before.nftPending);for(const service of services)assert.equal((await service.journal.unresolved()).length,0);
 save(join(round,'public/assets-after.json'),after);save(join(base,'public/baseline-RECOVERY-COMPLETE-v1.json'),{at:new Date().toISOString(),selection:'baseline',roundTag:'baseline',fills:1,ordinaryClaimsIncluded:true,expectedActualUps:originalAdmission?17:23,fullProofAccountingPending:true,cleanPerformancePairEligible:false,originalOrdersAndDepositsReused:true,emptyEpochAborted:!originalAdmission,scope:originalAdmission?'original 17 UPS workload resumed after unsigned session failure; recovery acceptance, not a matched performance pair':'23 UPS including original empty epoch and two new consents; recovery acceptance, not a matched performance pair'});
 console.log('original deposits settled and ordinary claims complete; independent full UPS audit pending');
}finally{
 for(const service of services)await service.close();await Promise.allSettled([...workers.values()].map(async worker=>(await worker).close()));await scope.close();
}
