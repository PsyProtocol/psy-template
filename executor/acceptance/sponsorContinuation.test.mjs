// Pure unsigned-window/startup checks and temporary public-file fixtures only.
// No SDK session, network, proof, financial retry or finality claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
import {assertSponsorUnsignedWindow,assertSponsorFailedStartup,assertSponsorProofProfile,sponsorRecoveryAliasPaths,SPONSOR_MODE,SPONSOR_REPLACEMENT} from './sponsorContinuation.mjs';
function fixture(){
 const original={calls:{contract_calls:[{contract_id:58n,method_id:2870336142n,method_name:'authorize_sponsor',inputs:[570752n,2000200000n,1n,1n]},
  {contract_id:0n,method_name:'transfer',inputs:[570752n,2000200000n]}],software_defined_call:{inputs:[]}},
  contracts:[{contract:{contractId:0n,codeRoot:'a'.repeat(64)}}],validUntilCheckpoint:150136n,
  approvedActor:{userId:1975680n,publicKeyHash:'b'.repeat(64),startUserLeafHash:'c'.repeat(64),nextNonce:'4'}};
 return {original,reviewed:structuredClone(original),release:{mode:SPONSOR_MODE,originalNativeAttempts:0,maximumNewAttempts:1,automaticRetry:false,
  cause:'unclassified-start-ordinary-session',originalValidUntilCheckpoint:150136,reviewCheckpoint:150060,reviewedValidUntilCheckpoint:150136}};
}
test('only unchanged input or explicitly reviewed unsigned transport window is accepted',()=>{
 const x=fixture();assert.doesNotThrow(()=>assertSponsorUnsignedWindow(x));
 x.release.reviewCheckpoint=150140;x.release.reviewedValidUntilCheckpoint=150268;x.reviewed.validUntilCheckpoint=150268n;
 assert.doesNotThrow(()=>assertSponsorUnsignedWindow(x));assert.equal(x.original.validUntilCheckpoint,150136n);
 const parsed={...x,original:parseLosslessJson(losslessJson(x.original)),reviewed:parseLosslessJson(losslessJson(x.reviewed))};
 assert.doesNotThrow(()=>assertSponsorUnsignedWindow(parsed),'actual lossless parse must retain full field values');
});
test('review cannot change caller, account nonce, amount, contracts, batch, recipient or introduce a business deadline',()=>{
 const edits=[x=>x.reviewed.approvedActor.userId++,x=>x.reviewed.approvedActor.nextNonce='5',x=>x.reviewed.approvedActor.startUserLeafHash='d'.repeat(64),
  x=>x.reviewed.calls.contract_calls[0].inputs[0]++,x=>x.reviewed.calls.contract_calls[0].inputs[1]--,x=>x.reviewed.calls.contract_calls[0].inputs[2]=2n,
  x=>x.reviewed.calls.contract_calls[0].inputs[3]=2n,x=>x.reviewed.calls.contract_calls[1].inputs[0]++,x=>x.reviewed.contracts[0].contract.codeRoot='d'.repeat(64),
  x=>x.reviewed.businessDeadline=150500n,x=>x.reviewed.approvedActor.nextNonce=4n,x=>x.reviewed.calls.contract_calls.reverse()];
 for(const edit of edits){const x=fixture();edit(x);assert.throws(()=>assertSponsorUnsignedWindow(x));}
});
test('unreviewed expiry renewal, retry, diagnosis and unknown Native attempts are rejected',()=>{
 for(const edit of [x=>x.release.originalNativeAttempts=1,x=>x.release.maximumNewAttempts=2,x=>x.release.automaticRetry=true,
  x=>x.release.cause='SDK_CHECKPOINT_PROOF_NOT_READY',x=>x.reviewed.validUntilCheckpoint++,x=>x.release.reviewedValidUntilCheckpoint++,
  x=>{x.reviewed.validUntilCheckpoint=150135n;x.release.reviewedValidUntilCheckpoint=150135;},
  x=>{x.reviewed.validUntilCheckpoint=150267n;x.release.reviewedValidUntilCheckpoint=150267;x.release.reviewCheckpoint=150140;},
  x=>x.original.approvedActor.nextNonce='3',x=>x.release.reviewCheckpoint=150136,x=>x.release.reviewedValidUntilCheckpoint='150136']){
  const x=fixture();edit(x);assert.throws(()=>assertSponsorUnsignedWindow(x));
 }
});
const startup=()=>({files:['metrics.json','failure.json'],failure:{ok:false,phase:'start-ordinary-session',broadcastMayHaveBeenAttempted:false,automaticRetry:false,privateDataSuppressed:true},
 metrics:{schema:'ordinary-phases-v1',resident:true,ok:false,lastPhase:'start-ordinary-session',phases:[{phase:'load-job'},{phase:'load-own-isolated-identity'},{phase:'verify-ordinary-input-and-dependencies'},{phase:'start-ordinary-session'}]}});
test('original startup must be closed and strictly before any business/proof/sign/send phase',()=>{
 assert.doesNotThrow(()=>assertSponsorFailedStartup(startup()));
 for(const edit of [x=>x.files.push('request.json'),x=>x.files.push('preflight.json'),x=>x.files.push('intent.json'),x=>x.files.push('lock'),
  x=>x.files.push('diagnostic.json'),x=>x.failure.broadcastMayHaveBeenAttempted=true,x=>x.failure.privateDataSuppressed=false,
  x=>x.metrics.phases.push({phase:'sign'}),x=>x.metrics.phases.push({phase:'prove-calls'}),x=>x.metrics.phases=[],x=>x.metrics.resident=false]){
  const x=startup();edit(x);assert.throws(()=>assertSponsorFailedStartup(x));
 }
});
test('accepted alias paths require a closed confirmed directory and exclude locks or failed requests',()=>{
 const base=mkdtempSync(join(tmpdir(),'psy-sponsor-alias-'));
 try{
  const name='attempts/'+SPONSOR_REPLACEMENT;mkdirSync(join(base,name),{recursive:true});
  for(const f of ['request.json','preflight.json','intent.json'])writeFileSync(join(base,name,f),'{}');
  assert.throws(()=>sponsorRecoveryAliasPaths(base));writeFileSync(join(base,name,'included.json'),'{}');
  const paths=sponsorRecoveryAliasPaths(base);assert.equal(paths.length,5);assert.ok(paths.includes('public/'+SPONSOR_REPLACEMENT+'.json'));
  for(const extra of ['failure.json','send.lock']){writeFileSync(join(base,name,extra),'{}');assert.throws(()=>sponsorRecoveryAliasPaths(base));rmSync(join(base,name,extra));}
  mkdirSync(join(base,name,'nested'));assert.throws(()=>sponsorRecoveryAliasPaths(base));
 }finally{rmSync(base,{recursive:true,force:true});}
});

test('adopted ordinary UPS must name the frozen verifier/common-data profile and exact chain',()=>{
 const chain='1'.repeat(64),pre={chainRootAt1:chain,proofProfile:{profile:'sdk-audit-20261102-v1',networkMagic:'1384803358401154921',verifierOnlyMatches:true,fullProofVerifiedWithPinnedCommonData:true,bundledNodeVerifierFingerprint:'043e026dc674c310d8a9c529268a02619cab6f3779a74396a330c5ff0d0a5893'}};
 assert.doesNotThrow(()=>assertSponsorProofProfile(pre,chain));
 for(const edit of [x=>x.chainRootAt1='2'.repeat(64),x=>x.proofProfile.profile='legacy',x=>x.proofProfile.networkMagic='1',x=>x.proofProfile.verifierOnlyMatches=false,x=>x.proofProfile.fullProofVerifiedWithPinnedCommonData=false,x=>x.proofProfile.bundledNodeVerifierFingerprint='a'.repeat(64)]){const v=structuredClone(pre);edit(v);assert.throws(()=>assertSponsorProofProfile(v,chain));}
});
