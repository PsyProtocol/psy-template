// Closed-case observations, bound to independently verified actual requests.
// Does not generate or broadcast financial work or replace original evidence.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {join,dirname} from 'node:path';
import {ExecutionJournal} from '../../executor/journal.mjs';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {saveObservation} from '../../executor/observations.mjs';
import {observedConfirmation,matchVerifiedReceipt} from './livePerformance.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
const [base,output]=process.argv.slice(2),root=dirname(base),home=join(controllerDirectory(base),'service-recovery');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),plain=p=>JSON.parse(readFileSync(p,'utf8'));
const done=exact(join(home,'public/SERVICE-LIVE-COMPLETE-v1.json'));
assert.equal(done.phase,99n);assert.equal(done.native,0n);assert.ok(done.assets.every(a=>a.balance===0n));
const beforePath=join(base,'public/COMPOSITION-SERVICE-BEFORE-AUDIT-v1.json');
const auditPath=join(base,'public/COMPOSITION-SERVICE-AUDIT-v1.json');
const summaryPath=join(root,'composition-service-receipt-verification-v1/SUMMARY.json');
const claimsPath=join(base,'public/COMPOSITION-SERVICE-OWNER-CLAIM-AUDIT-v1.json');
const before=exact(beforePath),audit=exact(auditPath),verified=exact(summaryPath),claims=exact(claimsPath);
assert.equal(verified.auditSha256,sha256(readFileSync(auditPath)));
assert.equal(verified.broadcast,false);assert.equal(verified.mutatedActualFeeRejected,true);
const proofByHash=new Map(verified.rows.map(r=>[r.contentHash,r]));
assert.equal(proofByHash.size,verified.rows.length);assert.equal(proofByHash.size,audit.newReceipts.length);
for(const row of audit.newReceipts)matchVerifiedReceipt(row,proofByHash.get(row.contentHash));
assert.equal(claims.verificationSummarySha256,sha256(readFileSync(summaryPath)));
assert.equal(claims.rows.length,1);assert.equal(claims.rows[0].scenario,'service-recovery');
assert.equal(claims.rows[0].contentHash,done.ownerClaim.contentHash);
const options=plain(join(home,'route/executor.json'));
const journal=new ExecutionJournal({directory:options.runtimeDirectory,network:options.network,
 vaultId:options.vaultId,fingerprint:options.fingerprint});
const rows=await journal.records(),broadcasts=rows.filter(r=>r.status==='broadcast-intent');
assert.equal(broadcasts.length,2);assert.equal((await journal.unresolved()).length,0);
const proofs=rows.filter(r=>r.status==='included').map(row=>{
 const sent=broadcasts.find(r=>r.taskId===row.taskId);assert.ok(sent);
 const preflightPath=join(sent.proof.preparedDirectory,'preflight.json'),pre=exact(preflightPath);
 const verifiedRow=proofByHash.get(row.result.contentHash);assert.ok(verifiedRow);
 assert.equal(pre.fullUpsVerified,true);assert.equal(pre.exactStackAndSessionVerified,true);
 assert.equal(pre.core.state_transition.end_user_leaf_hash,verifiedRow.endUserLeafHash);
 assert.equal(pre.core.new_user_leaf.nonce,verifiedRow.nonce);
 assert.equal(sha256(readFileSync(join(sent.proof.preparedDirectory,'request.json'))),verifiedRow.requestSha256);
 return {operation:sent.task.operation,taskId:row.taskId,contentHash:row.result.contentHash,
  fee:verifiedRow.fee,actualCalls:pre.actualCalls,timingsMilliseconds:pre.timingsMilliseconds,
  broadcastIntentAt:sent.at,includedObservedAt:row.at,
  intentToIncludedObservationMilliseconds:observedConfirmation({finishedAt:sent.at},{checkedAt:row.at}),
  scope:'includes verification, fresh reads, HTTP and polling; not pure network confirmation latency'};
});
assert.deepEqual(proofs.map(r=>r.operation),['fund','return-input']);
assert.equal(proofs.reduce((n,r)=>n+r.fee,0n),done.controllerFeeBurn);
const ordinary=['owner-fund-cancel-v1','owner-claim-v1'].map(label=>{
 const p=join(home,'attempts',label),r=exact(join(p,'included.json')),v=proofByHash.get(r.contentHash);
 assert.ok(v);assert.equal(sha256(readFileSync(join(p,'request.json'))),v.requestSha256);
 const timing=plain(join(p,'timing.json'));
 return {label,contentHash:r.contentHash,checkpoint:r.checkpoint,fee:v.fee,timing,
  acknowledgementToIncludedCommonObservationMilliseconds:observedConfirmation(timing,r),
  scope:'ordinary wallet process wall combines build/read/proof/verification/submission; no unmeasured phase split'};
});
const oldHashes=new Set(before.newReceipts.map(r=>r.contentHash));
const added=audit.newReceipts.filter(r=>!oldHashes.has(r.contentHash));
assert.equal(added.length,proofs.length+ordinary.length);
assert.equal(added.reduce((n,r)=>n+r.fee,0n),audit.newBurn-before.newBurn);
const resourcesPath=join(root,'composition-service-resources-v1-SUMMARY.json'),resources=plain(resourcesPath);
const buildRows=readFileSync(done.buildResourceLog??join(home,'service-build-resources-v1.log'),'utf8').trim().split('\n').map(JSON.parse);
assert.equal(buildRows.filter(r=>r.cacheHit).length,3);assert.equal(buildRows.filter(r=>!r.cacheHit).length,3);
const serviceEvents=readdirSync(done.serviceEventDirectory).filter(n=>/^\d+-service-state\.json$/.test(n)).sort()
 .map(name=>plain(join(done.serviceEventDirectory,name)));
const adapterReconstructions=[];let creating;
for(const row of serviceEvents){
 if(row.state==='creating-adapter')creating=row;
 if(row.state==='adapter-ready'){
  assert.ok(creating);adapterReconstructions.push({startedAt:creating.at,finishedAt:row.at,
   wallMilliseconds:Date.parse(row.at)-Date.parse(creating.at),prebuiltBeforeService:adapterReconstructions.length===0});
  creating=undefined;
 }
}
assert.equal(adapterReconstructions.length,2);
const benchmarkPath=join(root,'composition-service-build-benchmark-v1/SUMMARY.json');
saveObservation(output,{checkedAt:new Date().toISOString(),scope:'real zero-fill cancellation/return/ordinary claim via formal local service; not a pool trading throughput or physical two-host test',
 done,beforeAuditSha256:sha256(readFileSync(beforePath)),auditSha256:verified.auditSha256,
 independentVerificationSummarySha256:sha256(readFileSync(summaryPath)),ownerAuditSha256:sha256(readFileSync(claimsPath)),
 actualMarketFills:0,financialReceipts:added.length,actualControllerBroadcasts:2,automaticSessionRebuilds:1,
 recoveryInjection:'explicit QA interception before proof-session start; no natural outage claim',
  totalReceiptFeeBurn:added.reduce((n,r)=>n+r.fee,0n),ordinary,proofs,buildRows,adapterReconstructions,
  adapterTimingScope:'first adapter was built by acceptance before funding; its near-zero service factory handoff is not cold construction. Second interval includes actual resource reuse and fresh guarded startup.',
 buildBenchmark:plain(benchmarkPath),buildBenchmarkSha256:sha256(readFileSync(benchmarkPath)),
  resources,resourceSummarySha256:sha256(readFileSync(resourcesPath)),
  resourceCoverage:'two-second sampled sums for known wallet basenames and two sealed wallet digests; excludes Node parents and source compiler/inspector or verifier binaries with other names. Shared pages may be counted twice. Not true process-tree or per-phase peak memory.',
 transactionProofReuse:'only exact verified artifacts accepted after current-state/nonce/identity/expiry checks; no stale-state reuse',
 matchedFinancialBeforeAfter:false,chainTps:null,
 unmeasured:['separate ordinary-wallet phase split','true peak or per-stage memory','physical two-host takeover','matched financial settlement acceleration']});
console.log('service performance evidence bound to independently verified actual requests');
