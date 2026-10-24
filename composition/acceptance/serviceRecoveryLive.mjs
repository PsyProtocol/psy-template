// New isolated controller, ordinary owner funding/cancellation and claim, then
// the SAME service used by composition/run.mjs. Injection is explicit QA, not
// represented as a naturally occurring SDK/RPC failure. No old contract update.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,appendFileSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createCompositionAdapter} from '../adapter.mjs';
import {runCompositionService} from '../service.mjs';
import {prepareOwnerFunding} from '../client.mjs';
import {residentProver} from '../../executor/residentProver.mjs';
import {ExecutionJournal} from '../../executor/journal.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {parseLosslessJson,losslessJson,decodeAmount} from '../../amm/u124/client.mjs';
import {read,save,run,confirmUps} from '../../batching/admission/liveSupport.mjs';
import {ordinaryRelease} from './applicationRelease.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
import {createCompositionBuildResources} from '../buildResources.mjs';
const [base]=process.argv.slice(2),home=join(controllerDirectory(base),'service-recovery');
const benchmarkPlan=join(base,'public/SERVICE-BUILD-BENCHMARK-PLAN-v1.json');
if(existsSync(benchmarkPlan)){
 const benchmark=read(benchmarkPlan).outputDirectory;
 assert.equal(resolve(benchmark),join(dirname(base),'composition-service-build-benchmark-v1'));
 for(let i=0;!existsSync(join(benchmark,'SUMMARY.json'));i++){
   assert.ok(i<180,'matched read-only benchmark incomplete; no owner funding started');
   await new Promise(r=>setTimeout(r,10000));
 }
 assert.equal(read(join(benchmark,'SUMMARY.json')).broadcast,false);
}
const donePath=join(home,'public/SERVICE-LIVE-COMPLETE-v1.json');
if(existsSync(donePath)){console.log('already closed; no financial request replayed');process.exit(0);}
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),o=read(join(home,'route/executor.json'));
const registration=read(join(home,'build/REGISTERED.json')),pin=read(join(base,'public/BOOTSTRAP-v1.json'));
const actor=pin.actors.find(a=>a.userId===registration.owner.userId);assert.ok(actor);
const oldTools=read(join(base,'public/toolchain-v1.json')),ordinary=ordinaryRelease(base,oldTools.binaries.isolated_wallet);
const env={PSY_MARKET_TESTNET_PROFILE:o.testnetProfile,RAYON_NUM_THREADS:'2'};
let injected=false,first,usedFirst=false,claimed=false;
const startedAt=new Date().toISOString(),wall=performance.now();
const stateLog=join(home,'service-live-status-v1.log');assert.ok(!existsSync(stateLog),'immutable invocation; reconcile partial run before continuing');
const resources=createCompositionBuildResources({observe:event=>appendFileSync(join(home,'service-build-resources-v1.log'),losslessJson(event)+'\n')});
const request=async(label,inputPath)=>{
 const out=join(home,'attempts',label);assert.ok(!existsSync(out),'never replay an original owner request');
 const timing=await run(ordinary.file,['call',o.rpcConfig,join(base,'.secrets',actor.name+'.json'),inputPath,out],join(home,label+'.log'),env);
 save(join(out,'timing.json'),timing);await confirmUps(o.rpcConfig,out);return exact(join(out,'included.json'));
};
try{
 first=await createCompositionAdapter(o,{...resources,residentFactory:(binary,policy,rpc,settings)=>{
  const prover=residentProver(binary,policy,rpc,settings);
  return {...prover,prove:async args=>{
   if(injected)return prover.prove(args);injected=true;
   const out=args[5];await mkdir(out);
   const config=read(o.rpcConfig),n=config.networks[o.network],realm=n.realm_configs.find(r=>r.id===Math.floor(o.vaultId/n.users_per_realm));
   assert.ok(realm);const reason='Connection error to '+realm.rpc_url[0].replace(/\/$/,'')+': injected QA pre-session read rejection (no RPC attempted)';
   const failure={ok:false,phase:'start-compact-session',reason,broadcastMayHaveBeenAttempted:false,automaticRetry:false};
   save(join(out,'failure.json'),failure);
   save(join(home,'public/INJECTED-PROOF-READ-v1.json'),{checkedAt:new Date().toISOString(),injected:true,directory:out,
    failureSha256:sha256(readFileSync(join(out,'failure.json'))),scope:'test-only proof IO interception before full proving; normal service recovery; not a natural network outage'});
   const error=Error('explicit QA injected pre-session read rejection');error.residentRejection={phase:failure.phase,error:reason};throw error;
  }};
 }});
 const funding=await prepareOwnerFunding(first);
 // The ordinary owner signs both the funding and its cancellation in ONE UPS.
 // No second market order is created; controller may claim then return only.
 funding.input.calls.contract_calls.push({contract_id:BigInt(registration.controllerId),method_name:'request_cancel',inputs:[1n]});
 const fundingPath=join(home,'public/owner-fund-cancel-v1.json');save(fundingPath,funding.input);
 const funded=await request('owner-fund-cancel-v1',fundingPath);
 const service=await runCompositionService(o,{settings:{intervalMs:10000,maxBackoffMs:300000,maxSessionRestarts:1,maxReadFailures:5},
  adapterFactory:async()=>{if(!usedFirst){usedFirst=true;return first;}return createCompositionAdapter(o,resources);},
  onStatus:async event=>{
   appendFileSync(stateLog,losslessJson(event)+'\n');console.log('service',event.status);
   if(event.status==='owner-claim-required'){
    assert.equal(claimed,false,'one exact ordinary claim only');claimed=true;
    assert.equal(sha256(readFileSync(event.requestPath)),event.requestSha256);
    save(join(home,'public/FINAL-OWNER-OUTBOX-v1.json'),event.claim);
    await request('owner-claim-v1',event.requestPath);
   }
  }});
 assert.equal(service.status,'completed');assert.equal(injected,true);assert.equal(claimed,true);
 const journal=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
 const records=await journal.records(),included=records.filter(r=>r.status==='included'),broadcasts=records.filter(r=>r.status==='broadcast-intent');
 assert.deepEqual(included.map(r=>broadcasts.find(b=>b.taskId===r.taskId).task.operation),['fund','return-input']);
 assert.equal(broadcasts.length,2);assert.equal(records.filter(r=>r.status==='session-restart-reserved').length,1);
 assert.equal((await journal.unresolved()).length,0);
 const s=await first.snapshot(),abi=read(o.controllerAbi),field=n=>s.slot(o.vaultId,registration.controllerId,abi.contract.state.find(f=>f.name===n).offset);
 assert.equal(await field('phase'),99n);assert.equal(await s.slot(o.vaultId,0,0),0n);
 const assets=[];for(const m of o.assetMetadata){const balance=decodeAmount(await Promise.all([0,1].map(j=>s.slot(o.vaultId,m.contractId,j))));assert.equal(balance,0n);assets.push({asset:m.contractId,balance});}
 const fees=await field('fees'),budget=await field('budget'),refund=await s.slot(o.vaultId,0,3+2*actor.userId);
 assert.equal(budget,fees+refund);assert.equal(included.reduce((n,r)=>n+BigInt(r.result.receipt.data.result.fees_collected),0n),fees);
 save(donePath,{checkedAt:new Date().toISOString(),startedAt,wallMilliseconds:Math.round(performance.now()-wall),
  checkpoint:s.checkpoint,controllerId:registration.controllerId,vaultId:o.vaultId,owner:actor.userId,intentId:first.model.intent.id,
  phase:99,assets,native:0,controllerFeeBurn:fees,ownerNativeRefund:refund,budget,
  ownerFundingContentHash:funded.contentHash,ownerClaim:exact(join(home,'attempts/owner-claim-v1/included.json')),
  injectedSessionReadFailure:true,automaticSessionRebuilds:1,actualControllerBroadcasts:2,
  serviceEventDirectory:service.eventDirectory,sdkManifestHash:o.sdkManifestHash,atomic:false,
  scope:'real new controller/key, owner funding/cancel, two full controller UPSs via formal service, exact ordinary claim; explicit QA read injection, no natural outage/multi-host claim'});
 save(join(home,'public/LIVE-ROUTE-COMPLETE-v1.json'),{checkedAt:new Date().toISOString(),checkpoint:s.checkpoint,
  scenario:'service-recovery',outcome:'owner-cancel-before-first-order',marketFills:0,intentId:first.model.intent.id,
  input:first.model.intent.terms.input,owner:actor.userId,vaultId:o.vaultId,controllerId:registration.controllerId,
  nativeAccounting:{budget,controllerReceiptBurn:fees,ownerRefund:refund,netMarketEscrow:0n},
  ordinaryOwnerClaimIncluded:true,controllerPhase:99,controllerNative:0n,controllerAssets:assets,atomic:false,
  scope:'ordinary owner signed funding/cancellation, formal service rebuild after explicit QA injected read rejection, exact original-asset return and ordinary final claim; no pool fill or natural outage claim'});
 console.log('formal service live recovery and ordinary owner claim complete');
}finally{await first?.close();}
