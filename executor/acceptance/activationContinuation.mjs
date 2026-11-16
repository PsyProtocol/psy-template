// Exact root-owned recovery of one pre-business startup failure. This module
// only validates public artifacts; it never proves, signs, retries or sends.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
import {planCoreAmmStage} from './coreAmmJourney.mjs';

export const ACTIVATION_CONTINUATION_MODE='fresh-core-activation-pre-session-continuation-v1';
export const ACTIVATION_WINDOW_REVIEW_MODE='fresh-core-activation-unproven-window-review-v2';
export const ACTIVATION_ORIGINAL='core-activation-fund-v1';
export const ACTIVATION_REPLACEMENT='core-activation-fund-recovery-v1';
export const ACTIVATION_ALIAS='public/ACTIVATION-RECOVERY-ACCEPTED-v1.json';
export const ACTIVATION_PREFIX=Object.freeze(['fresh-native-send-v1','fresh-native-claim-v1','core-issuer-setup-v1','core-trader-assets-v1']);
export function activationContinuationPins(){
 return ['public/fresh-core-journey-v1-SOURCE.json','public/FRESH-JOURNEY-v1.json','public/fresh-initial-v1-state.json','public/fresh-initial-v1-state.json.binding.json',
  'public/'+ACTIVATION_ORIGINAL+'-plan.json','public/'+ACTIVATION_ORIGINAL+'.json',
  ...['failure.json','diagnostic.json','metrics.json'].map(f=>'attempts/'+ACTIVATION_ORIGINAL+'/'+f),
  ...ACTIVATION_PREFIX.flatMap(label=>['public/'+label+'-plan.json','public/'+label+'.json',...['request.json','preflight.json','intent.json','included.json'].map(f=>'attempts/'+label+'/'+f)])];
}
export const ACTIVATION_REVIEWED_INPUT='public/core-activation-fund-reviewed-v2.json';
export const ACTIVATION_ABSENCE_RECORD='public/ACTIVATION-UNPROVEN-ABSENCE-v2.json';
export const ACTIVATION_UNSTARTED_PATHS=Object.freeze(['public/ACTIVATION-NATIVE-ATTEMPT-v1.json','public/ACTIVATION-NATIVE-ATTEMPT-v2.json','public/'+ACTIVATION_REPLACEMENT+'.json','attempts/'+ACTIVATION_REPLACEMENT,ACTIVATION_ALIAS]);
export function activationUnprovenWindowPins(){return [...activationContinuationPins(),
 'public/ACTIVATION-PRESESSION-RELEASE-v1.json','public/ACTIVATION-RETRY-OWNER-CONTROL-ERROR-v1.json','public/ACTIVATION-RETRY-CONTROLLER-CORRECTION-v1.json',
 'owners/activation-pre-session-retry-v1.json','owners/activation-pre-session-retry-v1-outcome.json','activation-pre-session-retry-v1.log','retry-activation-pre-session-once-v1.mjs',
 ACTIVATION_REVIEWED_INPUT,ACTIVATION_ABSENCE_RECORD];}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function path(base,name){assert.equal(typeof name,'string');assert.ok(name&&!isAbsolute(name)&&!name.split(/[\\/]/).some(s=>!s||s==='.'||s==='..'),'exact case-relative artifact path');assert.notEqual(name.split(/[\\/]/)[0],'.secrets');const p=resolve(base,name);assert.ok(p.startsWith(resolve(base)+'/'));return p;}
const bytes=(base,name)=>readFileSync(path(base,name));
const json=(base,name)=>JSON.parse(bytes(base,name));
const exact=(base,name)=>parseLosslessJson(bytes(base,name).toString());
const same=(a,b,label)=>assert.deepEqual(parseLosslessJson(losslessJson(a)),parseLosslessJson(losslessJson(b)),label);
function closedDirectory(base,name,expected){const entries=readdirSync(path(base,name),{withFileTypes:true});assert.ok(entries.every(e=>e.isFile()&&!e.isSymbolicLink()),'only closed regular artifact files permitted');assert.deepEqual(entries.map(e=>e.name).sort(),[...expected].sort(),'unexpected request, broadcast, lock or extra artifact');}
function approvedEvidence(pre,input){
 const a=input.approvedActor,s=pre.approvedActorSession,f=pre.approvedActorFreshState;assert.equal(pre.approvalBound,true);assert.ok(s&&f,'actual Native approval/session/freshness evidence required');
 for(const field of ['publicKeyHash','startUserLeafHash','nextNonce'])assert.equal(s[field],a[field]);assert.equal(s.userId,a.userId);assert.equal(s.isNewUser,a.startUserLeafHash==='0'.repeat(64));assert.match(s.startContextLeafHash,/^[a-f0-9]{64}$/);
 if(!s.isNewUser)assert.equal(s.startContextLeafHash,a.startUserLeafHash);
 assert.equal(f.rawMembershipVerified,true);assert.equal(f.userId,a.userId);assert.equal(f.rawUserLeafHash,a.startUserLeafHash);assert.equal(typeof f.observedNonce,'string');assert.match(f.observedNonce,/^(0|[1-9][0-9]*)$/);assert.equal(BigInt(f.observedNonce)+1n,BigInt(a.nextNonce));
 assert.ok(f.checkpointId>=pre.core.checkpoint_id&&f.checkpointId<=input.validUntilCheckpoint,'original approval freshness expired');
 for(const key of ['userTreeRoot','checkpointGlobalChainRoot'])assert.match(f[key],/^[a-f0-9]{64}$/);
 assert.equal(f.assurance,'freshness relative to observed checkpoint roots; not independent finality authentication');
}
export function activationRecoveryAliasPaths(base){
 const directory='attempts/'+ACTIVATION_REPLACEMENT,entries=readdirSync(path(base,directory),{withFileTypes:true});
 assert.ok(entries.every(e=>e.isFile()&&!e.isSymbolicLink()&&!/lock/i.test(e.name)),'closed replacement artifact files required');
 const required=['request.json','preflight.json','intent.json','included.json'];for(const f of required)assert.ok(entries.some(e=>e.name===f),'exact confirmed replacement missing '+f);
 assert.ok(!entries.some(e=>e.name==='failure.json'),'failed or ambiguous replacement must not be adopted');
 return ['public/'+ACTIVATION_REPLACEMENT+'.json',...entries.map(e=>directory+'/'+e.name),
  ...[ACTIVATION_REPLACEMENT+'.log',ACTIVATION_REPLACEMENT+'.log.lifecycle.jsonl'].filter(p=>existsSync(path(base,p)))].sort();
}
function validateRelease(base,releasePath,{requireUnstarted}){
 const release=json(base,releasePath),reviewed=release.mode===ACTIVATION_WINDOW_REVIEW_MODE;assert.equal(release.schema,1);assert.ok(reviewed||release.mode===ACTIVATION_CONTINUATION_MODE,'explicit activation continuation mode required');assert.equal(release.maximumNewAttempts,1);assert.equal(release.automaticRetry,false);
 assert.equal(release.replacementLabel,ACTIVATION_REPLACEMENT);assert.equal(release.originalValidUntilCheckpoint,149816);
 const required=reviewed?activationUnprovenWindowPins():activationContinuationPins();assert.deepEqual(Object.keys(release.pins).sort(),[...required].sort(),'exact release pin paths required');
 for(const p of required){assert.match(release.pins[p]??'',/^[a-f0-9]{64}$/);assert.equal(sha(bytes(base,p)),release.pins[p],'original continuation artifact changed '+p);}
 const original='attempts/'+ACTIVATION_ORIGINAL;
 closedDirectory(base,original,['diagnostic.json','failure.json','metrics.json']);
 const failure=json(base,original+'/failure.json'),diagnostic=json(base,original+'/diagnostic.json'),metrics=json(base,original+'/metrics.json');
 assert.equal(failure.ok,false);assert.equal(failure.phase,'start-ordinary-session');assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.automaticRetry,false);assert.equal(failure.privateDataSuppressed,true);
 assert.equal(diagnostic.mode,'public-sdk-startup-error-projection-v1');assert.equal(diagnostic.category.reasonCode,'SDK_CHECKPOINT_PROOF_NOT_READY');assert.equal(diagnostic.category.checkpointId,149690);
 assert.equal(diagnostic.broadcast,false);assert.equal(diagnostic.automaticRetry,false);assert.equal(diagnostic.privateDataSuppressed,true);
 assert.equal(metrics.schema,'ordinary-phases-v1');assert.equal(metrics.resident,true);assert.equal(metrics.ok,false);assert.equal(metrics.lastPhase,'start-ordinary-session');
 assert.ok(Array.isArray(metrics.phases)&&metrics.phases.length>0);assert.equal(metrics.phases.at(-1).phase,'start-ordinary-session');
 assert.ok(metrics.phases.every(p=>['load-job','load-own-isolated-identity','verify-ordinary-input-and-dependencies','start-ordinary-session'].includes(p.phase)),'original advanced beyond business-free startup');
 const manifest=json(base,'public/FRESH-JOURNEY-v1.json');for(const[p,h]of Object.entries(manifest.files))assert.equal(sha(bytes(base,p)),h,'frozen journey input changed '+p);
 // Verify the preserved source COPY, never rewrite/relabel its old manifest.
 const source=json(base,'public/fresh-core-journey-v1-SOURCE.json');for(const[p,h]of Object.entries(source.files))assert.equal(sha(bytes(base,'public/fresh-core-journey-v1-source/'+p)),h,'original source copy changed');
 const policy=json(base,'bound-core-v1/policy.json'),config=json(base,'bound-core-v1/config.json'),reg=json(base,'public/AMM-VAULT-v1.json'),actors=json(base,'public/ACTORS-v1.json'),
  tokenAbi=json(base,'bound-core-v1/asset-a-abi.json'),marketAbi=json(base,'bound-core-v1/abi.json'),dependencies=json(base,'bound-core-v1/dependencies.json'),
  context={policy,config,marketId:BigInt(reg.marketId),vaultId:BigInt(reg.vaultId),issuerId:BigInt(manifest.issuerId),traderId:BigInt(manifest.traderId),marketAbi,tokenAbi};
 assert.equal(manifest.ordinaryBinary,'bin-v5/isolated_wallet');assert.equal(sha(bytes(base,manifest.ordinaryBinary)),json(base,'public/BINARIES-v5.json').isolated_wallet,'trusted original ordinary binary changed');
 const prefixAnchors=new Map(manifest.initialActors.map(a=>[a.userId,{hash:a.endUserLeafHash,nonce:BigInt(a.nonce)}])),publicKeys=new Map(actors.rows.map(a=>[a.userId,a.publicKeyHash]));
 for(const label of ACTIVATION_PREFIX){
  const plan=exact(base,'public/'+label+'-plan.json'),inputBytes=bytes(base,'public/'+label+'.json'),input=parseLosslessJson(inputBytes.toString()),pre=exact(base,'attempts/'+label+'/preflight.json'),request=exact(base,'attempts/'+label+'/request.json'),intent=exact(base,'attempts/'+label+'/intent.json'),included=exact(base,'attempts/'+label+'/included.json'),core=pre.core;
  let canonical;if(label==='fresh-native-send-v1'||label==='fresh-native-claim-v1'){const fund=label==='fresh-native-send-v1';canonical={stage:fund?'native_fund_trader':'native_claim_trader',actorId:fund?context.issuerId:context.traderId,unsigned:true,proofVerified:false,liveAccepted:false,contract_calls:[{contract_id:0n,method_name:fund?'transfer':'claim',inputs:fund?[context.traderId,50000000000n]:[context.issuerId]}]};}
  else canonical=planCoreAmmStage(context,label==='core-issuer-setup-v1'?'issuer_setup':'trader_claim_assets',label==='core-issuer-setup-v1'?{symbolA:BigInt(manifest.symbolA),symbolB:BigInt(manifest.symbolB)}:{});
  same(plan,{...canonical,policySha256:sha(bytes(base,'bound-core-v1/policy.json')),dependenciesSha256:sha(bytes(base,'bound-core-v1/dependencies.json'))},'confirmed prefix canonical plan changed');
  const id=Number(plan.actorId),anchor=prefixAnchors.get(id);assert.ok(anchor);same(input.calls,{contract_calls:plan.contract_calls,software_defined_call:{inputs:[]}},'confirmed prefix input changed');
  assert.equal(pre.fullUpsVerified,true);assert.equal(pre.approvalBound,true);assert.equal(pre.inputSha256,sha(inputBytes));same(core,request.user_ec_input.core,'confirmed request/core differs');
  approvedEvidence(pre,input);
  assert.equal(core.new_user_leaf.user_id,BigInt(id));assert.equal(core.new_user_leaf.public_key,publicKeys.get(id));assert.equal(core.new_user_leaf.nonce,anchor.nonce+1n);assert.equal(core.state_transition.start_user_leaf_hash,anchor.hash);
  same(input.approvedActor,{userId:id,publicKeyHash:publicKeys.get(id),startUserLeafHash:anchor.hash,nextNonce:String(anchor.nonce+1n)},'confirmed original approval differs');
  assert.equal(pre.approvedActorFreshState.rawMembershipVerified,true);assert.equal(pre.approvedActorFreshState.rawUserLeafHash,anchor.hash);assert.equal(BigInt(pre.approvedActorFreshState.observedNonce),anchor.nonce);
  assert.equal(intent.retryAllowed,false);assert.equal(intent.userId,BigInt(id));assert.equal(intent.nonce,core.new_user_leaf.nonce);assert.equal(intent.endUserLeafHash,core.state_transition.end_user_leaf_hash);
  assert.equal(included.status,'included');assert.equal(included.receipt.success,true);assert.equal(included.receipt.data.status,'included');assert.equal(included.userId,BigInt(id));assert.equal(included.receipt.data.owner_user_id,BigInt(id));assert.equal(included.receipt.data.result.user_id,BigInt(id));assert.equal(included.contentHash,included.receipt.data.content_hash);assert.equal(included.endUserLeafHash,core.state_transition.end_user_leaf_hash);assert.equal(included.checkpoint,included.receipt.data.included_checkpoint_id);assert.ok(included.commonCheckpoint>=included.checkpoint);
  assert.equal(included.receipt.data.result.fees_collected,core.stats.guta_fees_collected+core.stats.da_fees_collected);
  prefixAnchors.set(id,{hash:core.state_transition.end_user_leaf_hash,nonce:core.new_user_leaf.nonce});
 }
 const originalInput=exact(base,'public/'+ACTIVATION_ORIGINAL+'.json'),originalInputSha256=sha(bytes(base,'public/'+ACTIVATION_ORIGINAL+'.json')),plan=exact(base,'public/'+ACTIVATION_ORIGINAL+'-plan.json'),canonical=planCoreAmmStage(context,'activation_funding'),trader=prefixAnchors.get(manifest.traderId);
 assert.equal(release.originalInputSha256,originalInputSha256);assert.equal(originalInput.validUntilCheckpoint,149816n);assert.equal(trader.nonce,2n);
 same(plan,{...canonical,policySha256:sha(bytes(base,'bound-core-v1/policy.json')),dependenciesSha256:sha(bytes(base,'bound-core-v1/dependencies.json'))},'original activation plan differs');
 same(originalInput.calls,{contract_calls:canonical.contract_calls,software_defined_call:{inputs:[]}},'original activation calls differ');
 same(originalInput.contracts,dependencies.filter(d=>[0,config.assetA,config.assetB].includes(d.contract.contractId)),'original dependencies differ');
 same(originalInput.approvedActor,{userId:manifest.traderId,publicKeyHash:publicKeys.get(manifest.traderId),startUserLeafHash:trader.hash,nextNonce:'3'},'original activation approval changed');
 let adoptedInput=originalInput,adoptedInputPath='public/'+ACTIVATION_ORIGINAL+'.json',replacementInputSha256=originalInputSha256,minimumSourceCheckpoint=149690n,sourceLabel='fresh-core-activation-continuation-v1';
 if(reviewed){
  assert.equal(release.originalNativeAttempts,0,'review cannot replace an attempted or unknown Native operation');
  assert.equal(release.reviewedInputPath,ACTIVATION_REVIEWED_INPUT);assert.match(release.reviewedInputSha256??'',/^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(release.reviewCheckpoint)&&release.reviewCheckpoint>=149690&&release.reviewCheckpoint<2**32);
  assert.equal(release.reviewedValidUntilCheckpoint,release.reviewCheckpoint+128,'review is bounded by the fresh root checkpoint plus 128');
  assert.ok(release.reviewedValidUntilCheckpoint>149816&&release.reviewedValidUntilCheckpoint<2**32,'a distinct reviewed unsigned transport window required');
  adoptedInputPath=ACTIVATION_REVIEWED_INPUT;adoptedInput=exact(base,adoptedInputPath);replacementInputSha256=sha(bytes(base,adoptedInputPath));assert.equal(replacementInputSha256,release.reviewedInputSha256);
  assert.equal(adoptedInput.validUntilCheckpoint,BigInt(release.reviewedValidUntilCheckpoint));
  same({...adoptedInput,validUntilCheckpoint:originalInput.validUntilCheckpoint},originalInput,'review may change ONLY the unsigned transport window');
  const v1=json(base,'public/ACTIVATION-PRESESSION-RELEASE-v1.json');assert.equal(v1.mode,ACTIVATION_CONTINUATION_MODE);assert.equal(v1.originalInputSha256,originalInputSha256);assert.equal(v1.originalValidUntilCheckpoint,149816);
  for(const p of activationContinuationPins())assert.equal(v1.pins[p],release.pins[p],'original V1 release must remain unchanged');
  const outcome=json(base,'owners/activation-pre-session-retry-v1-outcome.json'),ownerError=json(base,'public/ACTIVATION-RETRY-OWNER-CONTROL-ERROR-v1.json'),correction=json(base,'public/ACTIVATION-RETRY-CONTROLLER-CORRECTION-v1.json'),absence=json(base,ACTIVATION_ABSENCE_RECORD);
  assert.equal(outcome.kind,'session-retry');assert.equal(outcome.exitCode,1);assert.equal(outcome.automaticRetry,false);assert.equal(ownerError.nativeWorkerStarted,false);assert.equal(ownerError.financialOperations,0);
  assert.equal(correction.originalControllerOutcomeSha256,sha(bytes(base,'owners/activation-pre-session-retry-v1-outcome.json')));assert.equal(correction.originalInputSha256,originalInputSha256);assert.equal(correction.financialBudgetUnchanged,true);
  assert.equal(absence.schema,1);assert.equal(absence.mode,'activation-unproven-artifact-absence-v2');assert.equal(absence.originalNativeAttempts,0);assert.equal(absence.nativeWorkerStarted,false);assert.equal(absence.financialOperations,0);
  assert.deepEqual(absence.absentPaths,ACTIVATION_UNSTARTED_PATHS);assert.equal(absence.controllerOutcomeSha256,sha(bytes(base,'owners/activation-pre-session-retry-v1-outcome.json')));assert.equal(absence.controllerScriptSha256,sha(bytes(base,'retry-activation-pre-session-once-v1.mjs')));
  if(requireUnstarted)for(const p of ACTIVATION_UNSTARTED_PATHS)assert.equal(existsSync(path(base,p)),false,'Native attempt or replacement material already exists; no unsigned review');
  const master=json(base,'public/ROOT-PLAN-v1.json');assert.equal(master.maximumNewFullUps,24);assert.equal(master.maximumFeePsy,'75');assert.equal(master.maximumWallSeconds,21600);
  if(requireUnstarted)assert.ok(Date.now()-Date.parse(master.createdAt)<master.maximumWallSeconds*1000,'original master budget clock expired');
  // Code-only prewarm recovery release: preserve the V2 source closure, input
  // review and accepted financial alias; this label cannot run a fund retry.
  minimumSourceCheckpoint=BigInt(release.reviewCheckpoint);sourceLabel='fresh-core-activation-window-continuation-v3';
 }
 return {release,releasePath,releaseSha256:sha(bytes(base,releasePath)),manifest,originalInput,originalInputSha256,adoptedInput,adoptedInputPath,replacementInputSha256,minimumSourceCheckpoint,validUntilCheckpoint:adoptedInput.validUntilCheckpoint,prefixAnchors,sourceLabel,windowReview:reviewed};
}
export function validateActivationContinuationRelease(base,releasePath){return validateRelease(base,releasePath,{requireUnstarted:true});}
export function validateActivationContinuation(base,releasePath){
 const checked=validateRelease(base,releasePath,{requireUnstarted:false}),alias=json(base,ACTIVATION_ALIAS);
 assert.equal(alias.schema,1);assert.equal(alias.originalLabel,ACTIVATION_ORIGINAL);assert.equal(alias.replacementLabel,ACTIVATION_REPLACEMENT);assert.equal(alias.releaseSha256,checked.releaseSha256);
 assert.equal(alias.originalInputSha256,checked.originalInputSha256);assert.equal(alias.replacementInputSha256,checked.replacementInputSha256);
 const paths=activationRecoveryAliasPaths(base);assert.deepEqual(Object.keys(alias.files).sort(),paths);
 for(const p of paths){assert.match(alias.files[p]??'',/^[a-f0-9]{64}$/);assert.equal(sha(bytes(base,p)),alias.files[p],'replacement artifact changed '+p);}
 const inputPath='public/'+ACTIVATION_REPLACEMENT+'.json',out='attempts/'+ACTIVATION_REPLACEMENT;
 assert.deepEqual(bytes(base,inputPath),bytes(base,checked.adoptedInputPath),'replacement must preserve exact explicitly reviewed input bytes');
 const pre=exact(base,out+'/preflight.json'),request=exact(base,out+'/request.json'),intent=exact(base,out+'/intent.json'),included=exact(base,out+'/included.json'),core=pre.core,approved=checked.adoptedInput.approvedActor;
 assert.equal(pre.fullUpsVerified,true);assert.equal(pre.approvalBound,true);assert.equal(pre.broadcast,false);assert.equal(pre.inputSha256,checked.replacementInputSha256);same(request.user_ec_input.core,core,'replacement request/core mismatch');
 approvedEvidence(pre,checked.adoptedInput);
 assert.equal(core.new_user_leaf.user_id,approved.userId);assert.equal(core.new_user_leaf.public_key,approved.publicKeyHash);assert.equal(core.new_user_leaf.nonce,3n);assert.equal(core.state_transition.user_id,approved.userId);assert.equal(core.state_transition.start_user_leaf_hash,approved.startUserLeafHash);
 assert.ok(core.checkpoint_id>=checked.minimumSourceCheckpoint&&core.checkpoint_id<=checked.validUntilCheckpoint,'replacement proof outside explicitly reviewed readiness/window');
 const fresh=pre.approvedActorFreshState;assert.equal(fresh.rawMembershipVerified,true);assert.equal(fresh.rawUserLeafHash,approved.startUserLeafHash);assert.equal(fresh.userId,approved.userId);assert.equal(fresh.observedNonce,'2');assert.ok(fresh.checkpointId>=core.checkpoint_id&&fresh.checkpointId<=checked.validUntilCheckpoint,'replacement freshness expired');
 assert.equal(intent.status,'broadcast_intent');assert.equal(intent.retryAllowed,false);assert.equal(intent.userId,approved.userId);assert.equal(intent.nonce,3n);assert.equal(intent.endUserLeafHash,core.state_transition.end_user_leaf_hash);
 assert.equal(included.status,'included');assert.equal(included.receipt.success,true);assert.equal(included.receipt.data.status,'included');assert.equal(included.userId,approved.userId);assert.equal(included.receipt.data.owner_user_id,approved.userId);assert.equal(included.receipt.data.result.user_id,approved.userId);assert.equal(included.receipt.data.tx_type,'UserEndcap');assert.equal(included.contentHash,included.receipt.data.content_hash);assert.equal(included.endUserLeafHash,core.state_transition.end_user_leaf_hash);assert.equal(included.checkpoint,included.receipt.data.included_checkpoint_id);assert.ok(included.commonCheckpoint>=included.checkpoint&&included.checkpoint>=fresh.checkpointId);
 const fee=core.stats.guta_fees_collected+core.stats.da_fees_collected;assert.equal(included.receipt.data.result.fees_collected,fee);assert.ok(fee<=3000000000n);
 return {...checked,alias,aliasPath:ACTIVATION_ALIAS,aliasSha256:sha(bytes(base,ACTIVATION_ALIAS)),replacementLabel:ACTIVATION_REPLACEMENT};
}
