// Offline independent full proof/receipt accounting of the stopped QA round
// and its sender-only exit. Initial native top-up/claim precede this interval.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync}from'node:fs';
import {join,dirname,basename}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
import{assertRefundCohort}from'../../batching/admission/liveAssets.mjs';
import{save}from'../../batching/admission/liveSupport.mjs';
import{sha256}from'../requestBinding.mjs';
import{indexBroadcastIntents,insideCase}from'../../composition/acceptance/receiptRequestLocator.mjs';
import{exactReceiptRequest}from'./exactReceiptRequest.mjs';
import{bindCompactRequest}from'../compactAdmissionAdapter.mjs';
import{validateReceiptAlias}from'../receiptAlias.mjs';
const[base,original,out]=process.argv.slice(2);assert.ok(out);
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),rec=join(base,'unused-sponsorship-exit-v1'),done=exact(join(rec,'public/COMPLETE.json'));
assert.equal(done.actualFills,0n);assert.equal(done.originalUnusedSponsorshipReturned,5_000_500_000n);assert.equal(done.buyerNativeSetupTransfer,10_000_000_000n);assert.equal(done.qaSeedsReturned,true);
const actors=exact(join(original,'public/CASE.json')).actors,reg=exact(join(original,'markets-v1/orderbook/live-registration.json'));
const identities=new Map([...Object.values(actors).map(a=>[String(a.id),a.publicKeyHash]),[String(reg.vaultId),reg.publicKeyHash]]);
const verifier=JSON.parse(readFileSync(join(original,'public/TOOLS-v2.json'))).binaries.verifier;
assert.equal(sha256(readFileSync(verifier.file)),verifier.sha256);mkdirSync(out);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>{if(['drivers','.secrets'].includes(e.name))return[];assert.ok(!e.isSymbolicLink());const p=join(d,e.name);return e.isDirectory()?walk(p):[p];});
const index=indexBroadcastIntents(base),actual=[],seen=new Map(),verified=new Map();
for(const root of[join(base,'baseline'),rec])for(const source of walk(root).filter(f=>f.endsWith('/included.json')||/\d+-included\.json$/.test(f))){
 const raw=exact(source),r=raw.result?.receipt?raw.result:raw;if(r.status!=='included'||!r.receipt?.data?.result?.fees_collected)continue;
 const request=insideCase(base,exactReceiptRequest(base,source,raw,r.userId,index)),bytes=readFileSync(request),digest=sha256(bytes),q=parseLosslessJson(bytes.toString()),core=q.user_ec_input.core;
 if(seen.has(r.contentHash)){const old=seen.get(r.contentHash);validateReceiptAlias(old.receipt,r,readFileSync(old.request),bytes);continue;}seen.set(r.contentHash,{receipt:r,request});
 let actualCalls;
 if(source.endsWith('/included.json')){
  const observedAttempt=dirname(source),delivery=exact(join(observedAttempt,'intent.json')),attempt=delivery.originalAttempt?insideCase(base,delivery.originalAttempt):observedAttempt,p=exact(join(attempt,'preflight.json')),input=join(dirname(dirname(attempt)),'public',basename(attempt)+'.json');
  assert.deepEqual(p.core,core);assert.equal(p.inputSha256,sha256(readFileSync(input)));assert.equal(p.fullUpsVerified,true);assert.equal(p.endUserLeafHash,r.endUserLeafHash);
  actualCalls=exact(input).calls.contract_calls;
  if(source.startsWith(rec+'/')){assert.ok(!actualCalls.some(c=>c.method_name==='authorize_sponsor'||c.method_name==='fund_gas'),'no unnecessary new gas grants during exit');for(const c of actualCalls.filter(c=>c.contract_id===0n&&c.method_name==='simple_transfer')){assert.equal(r.userId,1717440n);assert.deepEqual(c.inputs,[406720n,10_000_000_000n]);}}
 }else{
  const matches=index.get(raw.taskId);assert.equal(matches.length,1);const intent=matches[0].record,policy=JSON.parse(readFileSync(join(rec,'public/unused-sponsor-exit-orderbook-executor/policy.json'),'utf8'));
  actualCalls=bindCompactRequest(intent.task,policy).contract_calls;
  const p=exact(join(dirname(request),'preflight.json')),m=exact(join(dirname(request),'prepared.json'));
  assert.equal(sha256(readFileSync(join(dirname(request),'prepared.json'))),intent.proof.manifestSha256);assert.equal(m.requestSha256,digest);assert.equal(m.callsSha256,sha256(intent.task.submission));assert.deepEqual(p.core,core);assert.equal(p.exactStackAndSessionVerified,true);
  const refund=actualCalls.find(c=>c.method_name==='recover_funding'),unit=10n**18n;
  const expected=new Map([[519360n,[519360n,0n,0n,0n,0n,5_000_500_000n,4n]],[1717440n,[1717440n,unit,0n,0n,0n,1_000_100_000n,5n]],[406720n,[406720n,0n,0n,unit,0n,1_000_100_000n,6n]]]);
  assert.equal(refund.contract_id,2497n);assert.deepEqual(refund.inputs,expected.get(refund.inputs[0]));assert.ok(!actualCalls.some(c=>c.method_name==='fund_gas'));
  const transfers=actualCalls.filter(c=>c.contract_id===0n&&c.method_name==='simple_transfer');assert.equal(transfers.length,1);assert.deepEqual(transfers[0].inputs,[refund.inputs[0],refund.inputs[5]]);
 }
 assert.equal(core.new_user_leaf.user_id,r.userId);assert.equal(core.new_user_leaf.public_key,identities.get(String(r.userId)));assert.equal(core.state_transition.end_user_leaf_hash,r.endUserLeafHash);
 const data=r.receipt.data;assert.equal(data.status,'included');assert.equal(data.content_hash,r.contentHash);assert.equal(data.owner_user_id,r.userId);assert.equal(data.included_checkpoint_id,r.checkpoint);assert.ok(r.commonCheckpoint>=r.checkpoint);
 const fee=core.stats.guta_fees_collected+core.stats.da_fees_collected;assert.equal(fee,data.result.fees_collected);assert.equal(data.result.user_id,r.userId);for(const k of['slots_modified','total_transactions','user_ops_processed'])assert.equal(core.stats[k],data.result[k]);
 const report=join(out,digest+'.json');assert.ok(!verified.has(digest));const started=performance.now(),result=await promisify(execFile)(verifier.file,[request,report],{timeout:120000,maxBuffer:2000000,env:{...process.env,RAYON_NUM_THREADS:'2'}});
 writeFileSync(report+'.log',result.stdout+'\n'+result.stderr,{flag:'wx'});const v=exact(report);assert.equal(v.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(v.metadataEndpointsAndFeesVerified,true);assert.equal(v.requestSha256,digest);assert.equal(v.publicKeyHash,core.new_user_leaf.public_key);assert.equal(v.nonce,core.new_user_leaf.nonce);verified.set(digest,true);
 actual.push({source,request,requestSha256:digest,report,submittedContractCalls:actualCalls,fullStackTransactions:core.stats.total_transactions,verificationMilliseconds:Math.round(performance.now()-started),userId:r.userId,nonce:core.new_user_leaf.nonce,start:core.state_transition.start_user_leaf_hash,end:r.endUserLeafHash,contentHash:r.contentHash,checkpoint:r.checkpoint,fee});
}
assert.equal(actual.length,15,'three stopped-round UPSs and twelve explicit exit/setup UPSs');
for(const user of new Set(actual.map(a=>a.userId))){const rows=actual.filter(a=>a.userId===user).sort((a,b)=>a.nonce<b.nonce?-1:1);for(let i=1;i<rows.length;i++){assert.equal(rows[i].nonce,rows[i-1].nonce+1n);assert.equal(rows[i].start,rows[i-1].end);}}
const before=exact(join(base,'baseline/public/assets-before.json')),after=exact(join(rec,'public/ASSETS-AFTER.json')),totalFees=actual.reduce((n,a)=>n+a.fee,0n);
assertRefundCohort(before,after,{assets:[2483,2484],owners:[1717440,406720,519360],vaultId:662720});
for(const asset of[2483,2484])assert.equal(after.totals[asset],1000n*10n**18n);
assert.equal(before.nativeTotal-after.nativeTotal,totalFees);
for(const owner of[1717440n,406720n,519360n])for(const[sender,recipient]of[[owner,662720n],[662720n,owner]])assert.equal(after.pending.find(r=>r.sender===sender&&r.recipient===recipient).native,0n);
const ownFees=id=>actual.filter(a=>a.userId===BigInt(id)).reduce((n,a)=>n+a.fee,0n);
assert.equal(after.accounts[1717440].native-before.accounts[1717440].native,-10_000_000_000n-ownFees(1717440));
assert.equal(after.accounts[406720].native-before.accounts[406720].native,10_000_000_000n-ownFees(406720));
assert.equal(after.accounts[519360].native-before.accounts[519360].native,4_000_400_000n-ownFees(519360),'prior pending sponsorship becomes owned balance; new grant was returned whole');
save(join(out,'SUMMARY.json'),{schema:1,actualUps:15,actualFills:0,totalFees,actual,allActualFullProofsVerified:true,nonceAndStateChainsVerified:true,originalFtAndQaSeedsReturned:true,unusedSponsorshipReturned:5_000_500_000n,priorPendingSponsorshipIncludedInStartingAssets:4_000_400_000n,buyerNativeSetupTransfer:10_000_000_000n,ordinaryClaimsVerified:true,finiteCohortNativeAndFtConservationVerified:true,fullProofAccountingPending:false,scope:'stopped real-fill attempt plus exact sender-only recovery and separately charged QA setup; excludes the earlier two native setup UPSs, zero fills, no successful paired performance claim'});
console.log('stopped QA round and unused sponsor return fully audited: 15 UPSs, zero fills');
