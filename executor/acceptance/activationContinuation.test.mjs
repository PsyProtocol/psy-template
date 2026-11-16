// Synthetic public artifacts in temporary directories. No RPC, Native proof,
// signing, transmission or actual-funds claim is made by these host tests.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {losslessJson} from '../../amm/u124/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {planFreshCoreAmmStage} from './freshCoreAmmLive.mjs';
import {activationContinuationPins,activationUnprovenWindowPins,activationRecoveryAliasPaths,validateActivationContinuation,validateActivationContinuationRelease,ACTIVATION_PREFIX,ACTIVATION_ORIGINAL,ACTIVATION_REPLACEMENT,ACTIVATION_ALIAS,ACTIVATION_CONTINUATION_MODE,ACTIVATION_WINDOW_REVIEW_MODE,ACTIVATION_REVIEWED_INPUT,ACTIVATION_ABSENCE_RECORD,ACTIVATION_UNSTARTED_PATHS} from './activationContinuation.mjs';
const h=n=>String(n).repeat(64),sha=b=>createHash('sha256').update(b).digest('hex'),releasePath='public/ACTIVATION-PRESESSION-RELEASE-v1.json';
function fixture(){
 const base=mkdtempSync(join(tmpdir(),'psy-activation-continuation-')),put=(p,v)=>{const file=join(base,p);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,typeof v==='string'?v:losslessJson(v)+'\n');},raw=p=>readFileSync(join(base,p)),read=p=>JSON.parse(raw(p));
 const issuer=1975680,trader=1136000,vault=570752,keys=new Map([[issuer,h('a')],[trader,h('b')],[vault,h('c')]]),zero='0'.repeat(64),
  config={assetA:56,assetB:57,networkMagic:'1384803358401154921'},policy={version:2,market:'amm',market_id:58,config,sdk_commit:'01b8f2b0a077367a7b9879baba1a72aea8ab5510',client_commit:'7058070057c3242b5d8b29e1a31d498aaa4202c0',chain_root_at1:h(1),native_protocol:PROFILE,execution_scope:'explicit-selected-orders-v1',whole_market_completeness:false,qualified_randomness:false},
  reviewed=readReviewedAbis().admission,context={policy,config,marketId:58n,vaultId:BigInt(vault),issuerId:BigInt(issuer),traderId:BigInt(trader),marketAbi:reviewed.markets.amm.artifact.abi,tokenAbi:reviewed.token.abi},
  deps=[0,56,57,58].map(contractId=>({contract:{contractId,codeRoot:h(1),layoutRoot:h(2),stateTreeHeight:contractId?31:32},functionTreeRoot:h(3),layoutFieldCount:1,layoutSlotCount:1}));
 put('bound-core-v1/config.json',config);put('bound-core-v1/policy.json',policy);put('bound-core-v1/dependencies.json',deps);put('bound-core-v1/abi.json',context.marketAbi);put('bound-core-v1/asset-a-abi.json',context.tokenAbi);
 put('public/AMM-VAULT-v1.json',{marketId:58,vaultId:vault});put('public/ACTORS-v1.json',{rows:[issuer,trader].map(userId=>({userId,publicKeyHash:keys.get(userId)}))});
 put('bin-v5/isolated_wallet','synthetic trusted binary bytes');put('public/BINARIES-v5.json',{isolated_wallet:sha(raw('bin-v5/isolated_wallet'))});
 put('public/fresh-initial-v1-state.json',{});put('public/fresh-initial-v1-state.json.binding.json',{});put('public/fresh-core-journey-v1-source/old.mjs','preserved original source');put('public/fresh-core-journey-v1-SOURCE.json',{files:{'old.mjs':sha(raw('public/fresh-core-journey-v1-source/old.mjs'))}});
 put('public/ROOT-PLAN-v1.json',{createdAt:new Date().toISOString(),maximumNewFullUps:24,maximumFeePsy:'75',maximumWallSeconds:21600});
 const initialActors=[{userId:issuer,endUserLeafHash:h(1),nonce:'1'},{userId:trader,endUserLeafHash:zero,nonce:'0',unmaterialized:true},{userId:vault,endUserLeafHash:zero,nonce:'0',unmaterialized:true}],
  manifest={issuerId:issuer,traderId:trader,symbolA:'1363226934',symbolB:'1363292470',ordinaryBinary:'bin-v5/isolated_wallet',initialActors,files:{'bound-core-v1/policy.json':sha(raw('bound-core-v1/policy.json')),'public/ROOT-PLAN-v1.json':sha(raw('public/ROOT-PLAN-v1.json'))}};
 put('public/FRESH-JOURNEY-v1.json',manifest);const anchors=new Map(initialActors.map(a=>[a.userId,{hash:a.endUserLeafHash,nonce:BigInt(a.nonce)}]));
 const stagePins={policySha256:sha(raw('bound-core-v1/policy.json')),dependenciesSha256:sha(raw('bound-core-v1/dependencies.json'))};
 const approvedReport=(approved,cp)=>({approvedActorSession:{...approved,isNewUser:approved.startUserLeafHash===zero,startContextLeafHash:approved.startUserLeafHash===zero?h('e'):approved.startUserLeafHash},approvedActorFreshState:{checkpointId:BigInt(cp+1),userId:approved.userId,observedNonce:String(BigInt(approved.nextNonce)-1n),rawUserLeafHash:approved.startUserLeafHash,userTreeRoot:h('d'),checkpointGlobalChainRoot:h('e'),rawMembershipVerified:true,assurance:'freshness relative to observed checkpoint roots; not independent finality authentication'}});
 const makeAttempt=(label,input,cp,end)=>{
  const approved=input.approvedActor,id=Number(approved.userId),core={checkpoint_id:BigInt(cp),new_user_leaf:{user_id:BigInt(id),public_key:approved.publicKeyHash,nonce:BigInt(approved.nextNonce)},state_transition:{user_id:BigInt(id),start_user_leaf_hash:approved.startUserLeafHash,end_user_leaf_hash:end},stats:{guta_fees_collected:1000000000n,da_fees_collected:3000n}},
   pre={fullUpsVerified:true,approvalBound:true,broadcast:false,inputSha256:sha(raw('public/'+label+'.json')),core,...approvedReport(approved,cp)},
   included={status:'included',userId:BigInt(id),endUserLeafHash:end,checkpoint:BigInt(cp+2),commonCheckpoint:BigInt(cp+3),contentHash:h('f'),receipt:{success:true,data:{status:'included',tx_type:'UserEndcap',owner_user_id:BigInt(id),included_checkpoint_id:BigInt(cp+2),content_hash:h('f'),result:{user_id:BigInt(id),fees_collected:1000003000n}}}};
  for(const[file,v]of Object.entries({'preflight.json':pre,'request.json':{user_ec_input:{core},proof:'synthetic public proof placeholder'},'intent.json':{status:'broadcast_intent',retryAllowed:false,userId:BigInt(id),nonce:BigInt(approved.nextNonce),endUserLeafHash:end},'included.json':included}))put('attempts/'+label+'/'+file,v);
  return core;
 };
 const stages=['native_fund_trader','native_claim_trader','issuer_setup','trader_claim_assets'];
 ACTIVATION_PREFIX.forEach((label,i)=>{const p=planFreshCoreAmmStage(context,stages[i],i===2?{symbolA:1363226934n,symbolB:1363292470n}:{}),id=Number(p.actorId),anchor=anchors.get(id),approved={userId:id,publicKeyHash:keys.get(id),startUserLeafHash:anchor.hash,nextNonce:String(anchor.nonce+1n)},input={calls:{contract_calls:p.contract_calls,software_defined_call:{inputs:[]}},contracts:deps,approvedActor:approved,validUntilCheckpoint:149816n};put('public/'+label+'-plan.json',{...p,...stagePins});put('public/'+label+'.json',input);const core=makeAttempt(label,input,149600+10*i,h(i+2));anchors.set(id,{hash:core.state_transition.end_user_leaf_hash,nonce:core.new_user_leaf.nonce});});
 const plan=planFreshCoreAmmStage(context,'activation_funding'),anchor=anchors.get(trader),originalInput={calls:{contract_calls:plan.contract_calls,software_defined_call:{inputs:[]}},contracts:deps.filter(d=>d.contract.contractId!==58),validUntilCheckpoint:149816n,approvedActor:{userId:trader,publicKeyHash:keys.get(trader),startUserLeafHash:anchor.hash,nextNonce:'3'}};
 put('public/'+ACTIVATION_ORIGINAL+'-plan.json',{...plan,...stagePins});put('public/'+ACTIVATION_ORIGINAL+'.json',originalInput);
 put('attempts/'+ACTIVATION_ORIGINAL+'/failure.json',{ok:false,phase:'start-ordinary-session',broadcastMayHaveBeenAttempted:false,automaticRetry:false,privateDataSuppressed:true,reasonCode:'REJECTED_REVIEW_REQUIRED'});
 put('attempts/'+ACTIVATION_ORIGINAL+'/diagnostic.json',{mode:'public-sdk-startup-error-projection-v1',category:{reasonCode:'SDK_CHECKPOINT_PROOF_NOT_READY',checkpointId:149690},broadcast:false,automaticRetry:false,privateDataSuppressed:true});
 put('attempts/'+ACTIVATION_ORIGINAL+'/metrics.json',{schema:'ordinary-phases-v1',resident:true,ok:false,lastPhase:'start-ordinary-session',phases:[{phase:'load-job'},{phase:'start-ordinary-session'}]});
 const release={schema:1,mode:ACTIVATION_CONTINUATION_MODE,maximumNewAttempts:1,automaticRetry:false,replacementLabel:ACTIVATION_REPLACEMENT,originalInputSha256:sha(raw('public/'+ACTIVATION_ORIGINAL+'.json')),originalValidUntilCheckpoint:149816,pins:Object.fromEntries(activationContinuationPins().map(p=>[p,sha(raw(p))]))};put(releasePath,release);
 put('public/'+ACTIVATION_REPLACEMENT+'.json',raw('public/'+ACTIVATION_ORIGINAL+'.json').toString());makeAttempt(ACTIVATION_REPLACEMENT,originalInput,149710,h('d'));
 const alias={schema:1,originalLabel:ACTIVATION_ORIGINAL,replacementLabel:ACTIVATION_REPLACEMENT,releaseSha256:sha(raw(releasePath)),originalInputSha256:release.originalInputSha256,replacementInputSha256:release.originalInputSha256,files:Object.fromEntries(activationRecoveryAliasPaths(base).map(p=>[p,sha(raw(p))]))};put(ACTIVATION_ALIAS,alias);
 return {base,put,raw,read,release,alias,cleanup:()=>rmSync(base,{recursive:true,force:true}),repin:p=>{release.pins[p]=sha(raw(p));put(releasePath,release);alias.releaseSha256=sha(raw(releasePath));put(ACTIVATION_ALIAS,alias);},repinAlias:p=>{alias.files[p]=sha(raw(p));put(ACTIVATION_ALIAS,alias);}};
}
test('exact confirmed prefix and one reviewed activation alias validate without financial work',()=>{const x=fixture();try{assert.equal(activationContinuationPins().length,33);const r=validateActivationContinuation(x.base,releasePath);assert.equal(r.replacementLabel,ACTIVATION_REPLACEMENT);assert.equal(r.originalInput.validUntilCheckpoint,149816n);assert.equal(r.prefixAnchors.get(1136000).nonce,2n);assert.equal(r.sourceLabel,'fresh-core-activation-continuation-v1');}finally{x.cleanup();}});
test('release rejects signed/extra original artifacts, changed startup diagnostics and unknown pin paths',()=>{
 for(const mutation of [x=>x.put('attempts/'+ACTIVATION_ORIGINAL+'/request.json',{}),x=>x.put('attempts/'+ACTIVATION_ORIGINAL+'/lock',{}),x=>{const p='attempts/'+ACTIVATION_ORIGINAL+'/failure.json',v=x.read(p);v.broadcastMayHaveBeenAttempted=true;x.put(p,v);x.repin(p);},x=>{const p='attempts/'+ACTIVATION_ORIGINAL+'/diagnostic.json',v=x.read(p);v.category.reasonCode='OTHER';x.put(p,v);x.repin(p);},x=>{x.release.pins['../outside']='a'.repeat(64);x.put(releasePath,x.release);}]){const x=fixture();try{mutation(x);assert.throws(()=>validateActivationContinuationRelease(x.base,releasePath));}finally{x.cleanup();}}
});
function reviewedFixture(){
 const x=fixture(),saved=new Map(activationRecoveryAliasPaths(x.base).map(p=>[p,x.raw(p)]));
 rmSync(join(x.base,'attempts',ACTIVATION_REPLACEMENT),{recursive:true});rmSync(join(x.base,'public',ACTIVATION_REPLACEMENT+'.json'));rmSync(join(x.base,ACTIVATION_ALIAS));
 const outcomePath='owners/activation-pre-session-retry-v1-outcome.json',scriptPath='retry-activation-pre-session-once-v1.mjs';
 x.put(outcomePath,{kind:'session-retry',exitCode:1,automaticRetry:false});x.put('owners/activation-pre-session-retry-v1.json',{kind:'session-retry',label:'activation-pre-session-retry-v1'});x.put(scriptPath,'synthetic readonly controller stopped before any Native attempt');x.put('activation-pre-session-retry-v1.log','readonly ID projection failed');
 x.put('public/ACTIVATION-RETRY-OWNER-CONTROL-ERROR-v1.json',{nativeWorkerStarted:false,financialOperations:0});
 x.put('public/ACTIVATION-RETRY-CONTROLLER-CORRECTION-v1.json',{originalControllerOutcomeSha256:sha(x.raw(outcomePath)),originalInputSha256:x.release.originalInputSha256,financialBudgetUnchanged:true});
 x.put(ACTIVATION_ABSENCE_RECORD,{schema:1,mode:'activation-unproven-artifact-absence-v2',originalNativeAttempts:0,nativeWorkerStarted:false,financialOperations:0,absentPaths:[...ACTIVATION_UNSTARTED_PATHS],controllerOutcomeSha256:sha(x.raw(outcomePath)),controllerScriptSha256:sha(x.raw(scriptPath))});
 const reviewed=x.read('public/'+ACTIVATION_ORIGINAL+'.json');reviewed.validUntilCheckpoint=149950;x.put(ACTIVATION_REVIEWED_INPUT,reviewed);
 const v2Path='public/ACTIVATION-UNPROVEN-WINDOW-RELEASE-v2.json',v2={...x.release,mode:ACTIVATION_WINDOW_REVIEW_MODE,originalNativeAttempts:0,reviewedInputPath:ACTIVATION_REVIEWED_INPUT,reviewedInputSha256:sha(x.raw(ACTIVATION_REVIEWED_INPUT)),reviewCheckpoint:149822,reviewedValidUntilCheckpoint:149950,pins:Object.fromEntries(activationUnprovenWindowPins().map(p=>[p,sha(x.raw(p))]))};x.put(v2Path,v2);
 const repinV2=p=>{v2.pins[p]=sha(x.raw(p));x.put(v2Path,v2);};
 const adopt=()=>{
  x.put('public/'+ACTIVATION_REPLACEMENT+'.json',x.raw(ACTIVATION_REVIEWED_INPUT).toString());
  for(const[p,b]of saved)if(p.startsWith('attempts/'))x.put(p,b.toString());
  const prePath='attempts/'+ACTIVATION_REPLACEMENT+'/preflight.json',pre=x.read(prePath),requestPath='attempts/'+ACTIVATION_REPLACEMENT+'/request.json',request=x.read(requestPath),includedPath='attempts/'+ACTIVATION_REPLACEMENT+'/included.json',included=x.read(includedPath);
  pre.inputSha256=v2.reviewedInputSha256;pre.core.checkpoint_id=149830;pre.approvedActorFreshState.checkpointId=149831;request.user_ec_input.core=pre.core;
  included.checkpoint=149832;included.commonCheckpoint=149833;included.receipt.data.included_checkpoint_id=149832;
  x.put(prePath,pre);x.put(requestPath,request);x.put(includedPath,included);
  const alias={...x.alias,releaseSha256:sha(x.raw(v2Path)),replacementInputSha256:v2.reviewedInputSha256,files:Object.fromEntries(activationRecoveryAliasPaths(x.base).map(p=>[p,sha(x.raw(p))]))};x.put(ACTIVATION_ALIAS,alias);return alias;
 };
 return {...x,v2,v2Path,repinV2,adopt};
}
test('V2 permits only an explicit unproven transport-window review and preserves strict V1',()=>{
 const x=reviewedFixture();try{
  assert.equal(activationUnprovenWindowPins().length,42);const r=validateActivationContinuationRelease(x.base,x.v2Path);assert.equal(r.originalInput.validUntilCheckpoint,149816n);assert.equal(r.adoptedInput.validUntilCheckpoint,149950n);assert.equal(r.adoptedInput.approvedActor.nextNonce,'3');
  assert.equal(validateActivationContinuationRelease(x.base,releasePath).originalInput.validUntilCheckpoint,149816n);
  x.adopt();x.put('public/ACTIVATION-NATIVE-ATTEMPT-v2.json',{maximumNewAttempts:1});
  const confirmed=validateActivationContinuation(x.base,x.v2Path);assert.equal(confirmed.sourceLabel,'fresh-core-activation-window-continuation-v3');assert.equal(confirmed.originalInputSha256,x.release.originalInputSha256);assert.equal(confirmed.replacementInputSha256,x.v2.reviewedInputSha256);
  assert.throws(()=>validateActivationContinuationRelease(x.base,x.v2Path),/already exists/,'the same reviewed release cannot authorize another attempt');
  assert.throws(()=>validateActivationContinuation(x.base,releasePath),'V1 must not adopt a V2 window or alias');
 }finally{x.cleanup();}
});
test('V2 rejects unauthorized window changes, business mutations and any prior Native/unknown material',()=>{
 const edits=[x=>{x.v2.reviewedValidUntilCheckpoint++;x.put(x.v2Path,x.v2);},x=>{x.v2.originalNativeAttempts=1;x.put(x.v2Path,x.v2);},
  x=>{const v=x.read(ACTIVATION_REVIEWED_INPUT);v.approvedActor.nextNonce='4';x.put(ACTIVATION_REVIEWED_INPUT,v);x.v2.reviewedInputSha256=sha(x.raw(ACTIVATION_REVIEWED_INPUT));x.repinV2(ACTIVATION_REVIEWED_INPUT);},
  x=>{const v=x.read(ACTIVATION_REVIEWED_INPUT);v.calls.contract_calls[0].inputs[1]=1;x.put(ACTIVATION_REVIEWED_INPUT,v);x.v2.reviewedInputSha256=sha(x.raw(ACTIVATION_REVIEWED_INPUT));x.repinV2(ACTIVATION_REVIEWED_INPUT);},
  x=>x.put('attempts/'+ACTIVATION_ORIGINAL+'/request.json',{}),x=>x.put('public/ACTIVATION-NATIVE-ATTEMPT-v1.json',{}),x=>x.put('public/'+ACTIVATION_REPLACEMENT+'.json',{}),
  x=>{const v=x.read(ACTIVATION_ABSENCE_RECORD);v.nativeWorkerStarted=true;x.put(ACTIVATION_ABSENCE_RECORD,v);x.repinV2(ACTIVATION_ABSENCE_RECORD);}];
 for(const edit of edits){const x=reviewedFixture();try{edit(x);assert.throws(()=>validateActivationContinuationRelease(x.base,x.v2Path));}finally{x.cleanup();}}
 const x=reviewedFixture();try{x.adopt();const p='attempts/'+ACTIVATION_REPLACEMENT+'/included.json',v=x.read(p),alias=x.read(ACTIVATION_ALIAS);v.status='unresolved';x.put(p,v);alias.files[p]=sha(x.raw(p));x.put(ACTIVATION_ALIAS,alias);assert.throws(()=>validateActivationContinuation(x.base,x.v2Path));}finally{x.cleanup();}
});
test('modified calls, nonce or expiry remain rejected even when the local file digest is repinned',()=>{
 for(const edit of [v=>v.calls.contract_calls[0].inputs[0]=999,v=>v.calls.contract_calls[0].inputs[1]=1,v=>v.approvedActor.nextNonce='4',v=>v.validUntilCheckpoint=149817]){const x=fixture();try{const p='public/'+ACTIVATION_ORIGINAL+'.json',v=x.read(p);edit(v);x.put(p,v);x.release.originalInputSha256=sha(x.raw(p));x.repin(p);assert.throws(()=>validateActivationContinuationRelease(x.base,releasePath));}finally{x.cleanup();}}
});
test('forged, unknown, stale or changed recovery aliases fail before a warm/sign callback',()=>{
 const mutations=[x=>{x.alias.releaseSha256=h('a');x.put(ACTIVATION_ALIAS,x.alias);},x=>{x.alias.replacementLabel='another';x.put(ACTIVATION_ALIAS,x.alias);},x=>{x.alias.files['public/extra.json']=h('a');x.put(ACTIVATION_ALIAS,x.alias);},x=>{const p='attempts/'+ACTIVATION_REPLACEMENT+'/included.json',v=x.read(p);v.status='unresolved';x.put(p,v);x.repinAlias(p);},x=>{const p='attempts/'+ACTIVATION_REPLACEMENT+'/preflight.json',v=x.read(p);v.approvedActorFreshState.checkpointId=149817;x.put(p,v);x.repinAlias(p);},x=>{const p='public/'+ACTIVATION_REPLACEMENT+'.json';x.put(p,x.raw(p).toString()+' ');x.repinAlias(p);}];
 for(const mutation of mutations){const x=fixture();try{let callbacks=0;mutation(x);assert.throws(()=>{validateActivationContinuation(x.base,releasePath);callbacks++;});assert.equal(callbacks,0);}finally{x.cleanup();}}
});
