// Read-only cross-check followed by one exclusive public completion marker.
// This joins actual proof/accounting/claim evidence with local lifecycle tests;
// it never signs, sends or reclassifies unknown requests as safe to replace.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {save} from '../../batching/admission/liveSupport.mjs';
import {COMPOSITION_SDK} from '../contract/runtimePolicy.mjs';
const [base]=process.argv.slice(2),root=dirname(base),home=join(base,'controllers-initialized-v1/service-recovery');
const files={done:join(home,'public/SERVICE-LIVE-COMPLETE-v1.json'),
 before:join(base,'public/COMPOSITION-SERVICE-BEFORE-AUDIT-v1.json'),audit:join(base,'public/COMPOSITION-SERVICE-AUDIT-v1.json'),
 proofs:join(root,'composition-service-receipt-verification-v1/SUMMARY.json'),
 claims:join(base,'public/COMPOSITION-SERVICE-OWNER-CLAIM-AUDIT-v1.json'),
 performance:join(base,'public/COMPOSITION-SERVICE-PERFORMANCE-v1.json'),
 contender:join(home,'public/LOCAL-CONTENDER-COMPLETE-v2.json'),
 cli:join(root,'composition-service-terminal-cli-v1.json'),sdk:join(root,'composition-service-sdk-integrity-v2.json')};
const read=p=>parseLosslessJson(readFileSync(p,'utf8'));
const {done,before,audit,proofs,claims,performance,contender,cli,sdk}=Object.fromEntries(Object.entries(files)
 .map(([k,p])=>[k,k==='performance'?JSON.parse(readFileSync(p,'utf8')):read(p)]));
assert.equal(done.phase,99n);assert.equal(done.native,0n);assert.ok(done.assets.every(a=>a.balance===0n));
assert.equal(done.actualControllerBroadcasts,2n);assert.equal(done.automaticSessionRebuilds,1n);
assert.equal(done.budget,done.controllerFeeBurn+done.ownerNativeRefund);
assert.equal(proofs.auditSha256,sha256(readFileSync(files.audit)));
assert.equal(proofs.broadcast,false);assert.equal(proofs.mutatedActualFeeRejected,true);
assert.equal(proofs.rows.length,audit.newReceipts.length);
assert.equal(proofs.rows.reduce((n,r)=>n+r.fee,0n),audit.newBurn);
assert.equal(audit.newReceipts.length-before.newReceipts.length,4);
for(const row of audit.totals)assert.equal(row.amount,1000n*10n**18n);
assert.equal(claims.rows.length,1);assert.equal(claims.rows[0].contentHash,done.ownerClaim.contentHash);
assert.equal(claims.verificationSummarySha256,sha256(readFileSync(files.proofs)));
assert.equal(performance.auditSha256,proofs.auditSha256);assert.equal(performance.actualMarketFills,0);
assert.equal(BigInt(performance.totalReceiptFeeBurn),audit.newBurn-before.newBurn);
assert.equal(contender.status,'busy');assert.equal(contender.broadcast,false);
assert.equal(contender.intentId,done.intentId);assert.equal(contender.vaultId,done.vaultId);
assert.notEqual(contender.pid,contender.holder.pid);assert.ok(Object.values(contender.financialMethodsInvoked).every(n=>n===0n));
assert.equal(cli.status,'completed');assert.equal(cli.newBroadcasts,0n);assert.equal(cli.financialJournalUnchanged,true);
assert.equal(sdk.sdkManifestSha256,COMPOSITION_SDK);assert.equal(sdk.verifiedSourceFiles,1466n);
assert.equal(sdk.userNodeTrackedDiffSha256,'002e35e0b13cb6c422fe3abf500ce6aa5241229264d85a3314f22b5e14b59a64');
const regression=join(root,'composition-service-final-regression-v1.log'),text=readFileSync(regression,'utf8');
assert.match(text,/^ℹ fail 0$/m);assert.match(text,/^ℹ skipped 0$/m);
const count=text.match(/^ℹ tests ([0-9]+)$/m);assert.ok(count);
save(join(base,'public/SERVICE-LOCAL-ACCEPTANCE-COMPLETE-v1.json'),{
 checkedAt:new Date().toISOString(),status:'local-acceptance-complete',controllerId:done.controllerId,vaultId:done.vaultId,
 intentId:done.intentId,sdkManifestHash:COMPOSITION_SDK,independentlyVerifiedActualUps:proofs.rows.length,
 newActualUps:4,actualMarketFills:0,newFeeBurn:audit.newBurn-before.newBurn,
 ordinaryOwnerClaimIncluded:true,zeroControllerBalances:true,independentLocalContenderExcluded:true,
 terminalCliFinancialJournalUnchanged:true,regressionTests:Number(count[1]),
 evidence:Object.entries(files).map(([kind,p])=>({kind,path:relative(root,p),sha256:sha256(readFileSync(p))})),
 regressionSha256:sha256(readFileSync(regression)),broadcast:false,
 scope:'actual new isolated controller/key with ordinary funding/cancel, explicit QA read injection, exact two controller UPSs and ordinary final claim; independent verification and local contention/re-entry. No physical two-host/coordinator-mode financial takeover, matched settlement acceleration, global finality or production certification.'});
console.log('all local service acceptance evidence cross-checked and closed');
