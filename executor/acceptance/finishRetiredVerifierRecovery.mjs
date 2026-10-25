// Explicit continuation after a confirmed, independently audited ordinary
// same-nonce retirement. Never replaces a live or ambiguous original request.
import assert from 'node:assert/strict';import {existsSync,mkdirSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {readSponsorGrant,sponsorGrant} from '../sponsorGrant.mjs';
import {threeMarketCase,SDK} from './threeMarketCase.mjs';import {formal} from './candidateHarness.mjs';import {freezeAppModules} from './sourceClosure.mjs';import {ordinaryNonceConflict} from '../ordinaryNonceConflict.mjs';import {LiveMarket} from '../../batching/admission/liveMarket.mjs';import {ordinary,confirmUps,save,read} from '../../batching/admission/liveSupport.mjs';import {publicState} from '../publicState.mjs';import {parseLosslessJson,losslessJson,encodeAmount,FEE_ESCROW as F} from '../../amm/u124/client.mjs';import {sponsorCalls} from '../../batching/v2/client.mjs';import {payoutClaims,cohortAssets,assertRefundCohort} from '../../batching/admission/liveAssets.mjs';import {sha256} from '../requestBinding.mjs';
const [base,original,candidateName,auditDir,releasePath,sendName='authorized-send-v1']=process.argv.slice(2);assert.ok(releasePath);assert.ok(['authorized-send-v1','authorized-compact-send-v1'].includes(sendName));assert.match(candidateName,/^nonce-retirement-candidate-v[1-9][0-9]*$/);
freezeAppModules(fileURLToPath(import.meta.url),base,'finish-retired-verifier-recovery-v3');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),candidate=join(base,candidateName),review=exact(join(candidate,'REVIEW.json')),send=join(candidate,sendName);
const conflict=ordinaryNonceConflict({originalBytes:readFileSync(join(review.originalAttempt,'request.json')),resolutionBytes:readFileSync(join(send,'request.json')),originalVerification:exact(join(auditDir,'original-full-proof.json')),resolutionVerification:exact(join(auditDir,'resolution-full-proof.json')),included:exact(join(send,'included.json')),expectedUserId:1717440,expectedPublicKeyHash:review.publicKeyHash});
assert.equal(conflict.resolutionRequestSha256,exact(join(auditDir,'CONFIRMED-CONFLICT.json')).resolutionRequestSha256);
const release=read(releasePath);assert.equal(release.sdkManifestSha256,SDK);for(const t of Object.values(release.binaries))assert.equal(sha256(readFileSync(t.file)),t.sha256);
const old=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'}),round=join(base,'baseline'),config=join(round,'public/rpc.json'),m=new LiveMarket({...old.by.orderbook,base:round,config});
const h={...old,base:round,config,binary:release.binaries.compact.file,binarySha256:release.binaries.compact.sha256,proverMemoryMode:'retain-v1',fixedVerifierMode:'cached-v1'};
const rec=join(base,'retired-recovery-v1');for(const d of [rec,join(rec,'public'),join(rec,'attempts')])if(!existsSync(d))mkdirSync(d);
assert.equal(existsSync(join(rec,'public/COMPLETE.json')),false,'closed recovery');
if(!existsSync(join(rec,'public/RELEASE.json')))save(join(rec,'public/RELEASE.json'),release);else assert.deepEqual(read(join(rec,'public/RELEASE.json')),release);
const user=async(actor,label,calls)=>{
 const a=h.actors[actor],out=join(rec,'attempts',label),input=join(rec,'public',label+'.json');
 if(existsSync(out)){
  const p=exact(join(out,'preflight.json')),q=exact(join(out,'request.json'));assert.equal(p.inputSha256,sha256(readFileSync(input)));assert.deepEqual(q.user_ec_input.core,p.core);assert.equal(p.core.new_user_leaf.public_key,a.publicKeyHash);
  assert.deepEqual(exact(input).calls,parseLosslessJson(losslessJson({contract_calls:calls,software_defined_call:{inputs:[]}})));
  if(!existsSync(join(out,'included.json')))await confirmUps(config,out);
  const r=exact(join(out,'included.json'));assert.equal(r.endUserLeafHash,p.endUserLeafHash);assert.equal(r.receipt.data.status,'included');return out;
 }
 assert.equal(existsSync(input),false,'partial input requires explicit inspection');
 return ordinary({base:rec,config,binary:release.binaries.ordinary.file,secret:a.secret,name:label,calls,bindings:h.bindings,env:{...h.env,PSY_FIXED_VERIFIER_MODE:'cached-v1',PSY_PROVER_MEMORY_MODE:'retain-v1'}});
};
const U=h.actors.bob.id,B=h.actors.buyer.id,s=await publicState(config);assert.equal(await h.at(s,m,m.vault,'queue_phase'),3n);assert.equal(await h.at(s,m,m.vault,'queue_count'),1n);assert.equal(await h.at(s,m,m.vault,'queue_owner',0),BigInt(B));assert.equal(await h.at(s,m,m.vault,'queue_outcome',0),3n);
const f=await formal(h,m,'retired-nonce-recovery',read(join(round,'public/PLAN.json')),{performanceMetrics:true,expiry:512,runtimeSuffix:'-retired-recovery'});
try{for(const actor of ['bob','buyer']){
 const owner=h.actors[actor].id;
 await user(actor,actor+'-cancel-release-and-enroll',[m.order('request_cancel',[]),m.order('release_unaccepted',[]),m.order('request_recovery',[BigInt(m.vault)])]);
 // A saved funding operation uses its original exact inputs (including its
 // sponsor nonce). Never derive a new grant when resuming an existing intent.
 const fundLabel=actor+'-original-recovery-fund',fundInput=join(rec,'public',fundLabel+'.json');
 if(existsSync(fundInput))await user('sponsor',fundLabel,exact(fundInput).calls.contract_calls);
 else if((await f.adapter.scan()).reason==='recovery-gas-sponsorship-required'){
  const grant=sponsorGrant(await readSponsorGrant(await publicState(config),m,h.actors.sponsor.id),{vault:m.vault,purpose:2n,amount:2n*F});
  if(!grant.adopt)await user('sponsor',fundLabel,sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:grant.nonce,purpose:grant.purpose,amount:grant.amount}));
 }
 const scan=await f.adapter.scan();if(scan.action&&parseLosslessJson(scan.action.submission).contract_calls.some(c=>c.method_name==='fund_gas'))await f.step(actor+'-retired-recovery-gas',t=>parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name==='fund_gas'));
 await f.step(actor+'-retired-original-funding-refund',t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name==='recover_funding'&&c.inputs[0]===BigInt(owner)));
 const claimLabel=actor+'-original-funding-claim',claimInput=join(rec,'public',claimLabel+'.json');
 await user(actor,claimLabel,existsSync(claimInput)?exact(claimInput).calls.contract_calls:await payoutClaims(await publicState(config),{userId:owner,markets:[m],tokenAbi:h.token,nftAbi:h.nft}));
}}finally{await f.close();}
const before=exact(join(round,'public/assets-before.json')),spec={users:Object.keys(before.accounts).map(Number),assets:[2483,2484],nftId:2496},after=await cohortAssets(await publicState(config),spec);if(!existsSync(join(rec,'public/ASSETS-AFTER-REFUNDS.json')))save(join(rec,'public/ASSETS-AFTER-REFUNDS.json'),after);
assertRefundCohort(before,after,{assets:spec.assets,owners:[U,B],vaultId:m.vault});
if(!existsSync(join(rec,'public/REFUNDS-COMPLETE.json')))save(join(rec,'public/REFUNDS-COMPLETE.json'),{actualFills:0,originalFtReturned:true,ordinaryClaimsIncluded:true,confirmedConflict:conflict.resolutionRequestSha256,nativeFeeAuditPending:true});
const unit=10n**18n,cp=(await publicState(config)).checkpoint;
for(const [actor,side]of [['bob',0n],['buyer',1n]]){
 const label='normalize-unfunded-'+actor,path=join(rec,'public',label+'.json');
 await user(actor,label,existsSync(path)?exact(path).calls.contract_calls:[m.order('open_sell',[BigInt(m.vault),side,encodeAmount(unit),encodeAmount(unit),BigInt(cp)+8192n,8n])]);
}
const normalized=await cohortAssets(await publicState(config),spec);if(!existsSync(join(rec,'public/ASSETS-AFTER-NORMALIZATION.json')))save(join(rec,'public/ASSETS-AFTER-NORMALIZATION.json'),normalized);for(const id of Object.keys(after.accounts))for(const asset of spec.assets)assert.equal(normalized.accounts[id].ft[asset],after.accounts[id].ft[asset]);
save(join(rec,'public/COMPLETE.json'),{actualFills:0,originalFundsReturned:true,normalizationOrderNonce:8,normalizationFunded:false,nativeFeeAuditPending:true,scope:'explicit audited same-nonce conflict, fresh cancellations, sender-only SD-key refund and ordinary claims; separately charged unfunded QA fixtures, excluded from performance rounds'});console.log('original funds returned; unfunded nonce-8 QA fixtures ready');
