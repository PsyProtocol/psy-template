// Explicit owned QA exit after an overfunded sponsor stopped a performance run.
// No new grant, replacement payment, old contract update or SDK change.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,copyFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {threeMarketCase,SDK} from './threeMarketCase.mjs';
import {formal} from './candidateHarness.mjs';import {freezeAppModules} from './sourceClosure.mjs';
import {LiveMarket} from '../../batching/admission/liveMarket.mjs';
import {ordinary,confirmUps,save,read} from '../../batching/admission/liveSupport.mjs';
import {publicState} from '../publicState.mjs';import {readSponsorGrant} from '../sponsorGrant.mjs';
import {sha256} from '../requestBinding.mjs';
import {parseLosslessJson,losslessJson,call,encodeAmount,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
import {cohortAssets,payoutClaims,assertRefundCohort} from '../../batching/admission/liveAssets.mjs';

const [base,original]=process.argv.slice(2);assert.ok(original);
freezeAppModules(fileURLToPath(import.meta.url),base,'unused-sponsorship-exit-v1');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),release=read(join(base,'public/RELEASE.json'));
assert.equal(release.sdkManifestSha256,SDK);for(const b of Object.values(release.binaries))assert.equal(sha256(readFileSync(b.file)),b.sha256);
const rec=join(base,'unused-sponsorship-exit-v1');for(const d of[rec,join(rec,'public'),join(rec,'attempts')])if(!existsSync(d))mkdirSync(d);
assert.ok(!existsSync(join(rec,'public/COMPLETE.json')),'closed exit; inspect original evidence');
const config=join(rec,'public/rpc.json');if(!existsSync(config))copyFileSync(join(base,'public/rpc.json'),config);
const old=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'}),m=new LiveMarket({...old.by.orderbook,base:rec,config});
const h={...old,base:rec,config,markets:[m],binary:release.binaries.compact.file,binarySha256:release.binaries.compact.sha256,proverMemoryMode:'retain-v1',fixedVerifierMode:'cached-v1'};
const U=h.actors.bob.id,B=h.actors.buyer.id,T=h.actors.sponsor.id,V=m.vault;
assert.deepEqual([m.id,V,U,B,T],[2497,662720,1717440,406720,519360]);
const user=async(actor,label,calls)=>{
 const a=h.actors[actor],out=join(rec,'attempts',label),input=join(rec,'public',label+'.json');
 if(existsSync(out)){
  const p=exact(join(out,'preflight.json')),q=exact(join(out,'request.json'));assert.equal(p.inputSha256,sha256(readFileSync(input)));assert.deepEqual(q.user_ec_input.core,p.core);assert.equal(p.core.new_user_leaf.public_key,a.publicKeyHash);
  assert.deepEqual(exact(input).calls.contract_calls,parseLosslessJson(losslessJson(calls)));
  if(!existsSync(join(out,'included.json')))await confirmUps(config,out);
  const r=exact(join(out,'included.json'));assert.equal(r.receipt.data.status,'included');assert.equal(r.endUserLeafHash,p.endUserLeafHash);return;
 }
 assert.ok(!existsSync(input),'partial original input; inspect without replacement');
 await ordinary({base:rec,config,binary:release.binaries.ordinary.file,secret:a.secret,name:label,calls,bindings:h.bindings,env:{...h.env,PSY_FIXED_VERIFIER_MODE:'cached-v1',PSY_PROVER_MEMORY_MODE:'retain-v1'}});
};
const chosen=(label,make)=>{const p=join(rec,'public',label+'.json');return existsSync(p)?exact(p).calls.contract_calls:make();};
const state=await publicState(config);assert.equal(await h.at(state,m,V,'queue_phase'),3n);assert.equal(await h.at(state,m,V,'queue_epoch'),8n);
const inspection=join(rec,'public/INSPECTION.json');if(!existsSync(inspection)){
 const grant=await readSponsorGrant(state,m,T);assert.equal(grant.sent-grant.claimed,5n*F);assert.equal(grant.claimed,grant.settledFee);assert.ok(await state.slot(V,0,0)>=3n*F,'existing vault gas must cover three refunds; never add another grant');
 for(const id of[U,B]){assert.equal(await h.at(state,m,id,'kind'),1n);assert.equal(await h.at(state,m,id,'nonce'),9n);}
 save(inspection,{checkedAt:new Date().toISOString(),checkpoint:state.checkpoint,grant,originalReturnedSponsorship:5n*F,priorPendingSponsorship:4n*F,failedRoundNewGrant:F,qaFtSeedsPerAsset:1n,qaFtSeedOwner:U,qaFtSeedRecipient:T,qaFtSeedsReturned:true,buyerNativeSetupTransfer:10_000_000_000n,normalizationNonce:10,scope:'exact existing unused grants, owned QA account initialization and separately charged setup; no fills or cache performance claim'});
}
// Materialize both zero FT accounts legitimately, preserving ownership by
// returning these two one-atom QA seeds after the native-only sponsor refund.
await user('bob','seed-sponsor-asset-accounts',chosen('seed-sponsor-asset-accounts',()=>[2483,2484].map(id=>call(BigInt(id),h.token,'transfer',[BigInt(T),encodeAmount(1n)]))));
await user('sponsor','claim-seeds-and-enroll',chosen('claim-seeds-and-enroll',()=>[...[2483,2484].map(id=>call(BigInt(id),h.token,'claim',[BigInt(U)])),m.order('request_recovery',[BigInt(V)])]));
const f=await formal(h,m,'unused-sponsor-exit',read(join(base,'baseline/public/PLAN.json')),{performanceMetrics:true,expiry:512,runtimeSuffix:'-unused-sponsor-exit',recoveryPayers:[T]});
const refunds=id=>t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name==='recover_funding'&&c.inputs[0]===BigInt(id));
try{
 await f.step('sponsor-original-funding-return',refunds(T));
 await user('sponsor','claim-native-and-return-seeds',chosen('claim-native-and-return-seeds',()=>[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(V)]},...[2483,2484].map(id=>call(BigInt(id),h.token,'transfer',[BigInt(U),encodeAmount(1n)]))]));
 await user('bob','claim-seeds-cancel-and-qa-setup',chosen('claim-seeds-cancel-and-qa-setup',()=>[...[2483,2484].map(id=>call(BigInt(id),h.token,'claim',[BigInt(T)])),m.order('request_cancel',[]),m.order('release_unaccepted',[]),m.order('request_recovery',[BigInt(V)]),{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(B),10_000_000_000n]}]));
 await user('buyer','cancel-and-enroll',chosen('cancel-and-enroll',()=>[m.order('request_cancel',[]),m.order('release_unaccepted',[]),m.order('request_recovery',[BigInt(V)])]));
 // Explicit discovery order, not an alternative matching priority.
 for(const actor of['buyer','bob']){
  const id=h.actors[actor].id;await f.step(actor+'-original-funding-return',refunds(id));
  const label=actor+'-claim-original-funding',input=join(rec,'public',label+'.json');
  const calls=existsSync(input)?exact(input).calls.contract_calls:await payoutClaims(await publicState(config),{userId:id,markets:[m],tokenAbi:h.token,nftAbi:h.nft});
  if(actor==='buyer'&&!existsSync(input))calls.push({contract_id:0n,method_name:'simple_claim',inputs:[BigInt(U)]});
  await user(actor,label,calls);
 }
}finally{await f.close();}
const checkpoint=(await publicState(config)).checkpoint,unit=10n**18n;
for(const[actor,side]of[['bob',0n],['buyer',1n]]){const label='normalize-unfunded-'+actor;await user(actor,label,chosen(label,()=>[m.order('open_sell',[BigInt(V),side,encodeAmount(unit),encodeAmount(unit),BigInt(checkpoint)+8192n,10n])]));}
const before=exact(join(base,'baseline/public/assets-before.json')),after=await cohortAssets(await publicState(config),{users:Object.keys(before.accounts).map(Number),assets:[2483,2484],nftId:2496});
assertRefundCohort(before,after,{assets:[2483,2484],owners:[U,B,T],vaultId:V});
for(const owner of[U,B,T])for(const[sender,recipient]of[[owner,V],[V,owner]])assert.equal(after.pending.find(p=>p.sender===sender&&p.recipient===recipient).native,0n,'native refund/claim complete');
save(join(rec,'public/ASSETS-AFTER.json'),after);save(join(rec,'public/COMPLETE.json'),{actualFills:0,originalFtReturned:true,originalUnusedSponsorshipReturned:5n*F,qaSeedsReturned:true,buyerNativeSetupTransfer:10_000_000_000n,normalizationNonce:10,normalizationFunded:false,fullProofAccountingPending:true,scope:'failed real-fill experiment and explicit sender-only exit; excluded from any successful performance comparison'});
console.log('unused sponsor grant, both orders and QA seeds returned and claimed; independent full accounting pending');
