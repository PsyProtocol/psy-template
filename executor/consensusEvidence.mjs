// Operator-owned conditional certificate inspection. No wallet or UI write API.
// Same-provider bootstrap consistency never becomes a finality trust anchor.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readPublicBytes} from './sourcePlanReceipt.mjs';
import {publishFile} from './durableFile.mjs';
import {sealDriver} from './sealedDriver.mjs';
import {runDurableSubmission,driverRecords} from './driverProcess.mjs';
import {sha256} from './requestBinding.mjs';
import {inspectStoredL1Evidence} from './l1Evidence.mjs';
const exact=(v,keys)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),[...keys].sort());};
const pin=s=>assert.match(s??'',/^[0-9a-f]{64}$/);
const fields=['schema','kind','sdkCommit','bootstrapRoot','attestedBeaconRoot','finalizedBeaconRoot','signingRoot','signatureSlot','attestedSlot','finalizedSlot','committeePeriod','participation','committeeMembershipVerifiedRelativeToBootstrap','aggregateCommitteeKeyMatches','syncSignatureVerifiedRelativeToCommittee','finalityBranchVerifiedRelativeToAttestedHeader','executionHashBranchesVerified','conditionalFinalizedExecutionParentHash','anchorReviewed','independentAnchorAuthenticated','committeeTransitionVerified','freshnessVerified','canonicalFinalityVerified','checkpointResourcesAuthenticated','seedSecrecyAuthenticated','qualifiedRandomness','canSign','canBroadcast','financialOperations','newZkProofsGenerated','scope','inspectionPassed','policySha256','bootstrapSha256','updateSha256'];
export function validateGloasCertificateReport(r,digests){
 exact(r,fields);assert.equal(r.schema,1);assert.equal(r.kind,'conditional-gloas-certificate-inspection-v1');assert.equal(r.sdkCommit,'c92880c8b6e2c8d392f19368bc8801a2584fd427');
 for(const n of ['policy','bootstrap','update'])assert.equal(r[n+'Sha256'],digests[n]);
 for(const n of ['inspectionPassed','committeeMembershipVerifiedRelativeToBootstrap','aggregateCommitteeKeyMatches','syncSignatureVerifiedRelativeToCommittee','finalityBranchVerifiedRelativeToAttestedHeader','executionHashBranchesVerified'])assert.equal(r[n],true);
 for(const n of ['anchorReviewed','independentAnchorAuthenticated','committeeTransitionVerified','freshnessVerified','canonicalFinalityVerified','checkpointResourcesAuthenticated','seedSecrecyAuthenticated','qualifiedRandomness','canSign','canBroadcast'])assert.equal(r[n],false,'certificate inspection cannot promote '+n);
 assert.equal(r.financialOperations,0);assert.equal(r.newZkProofsGenerated,0);assert.ok(Number.isInteger(r.participation)&&r.participation>=342&&r.participation<=512);
 for(const k of ['bootstrapRoot','attestedBeaconRoot','finalizedBeaconRoot','signingRoot','conditionalFinalizedExecutionParentHash'])assert.match(r[k],/^0x[0-9a-f]{64}$/);
 return r;
}
export async function inspectGloasCertificate(o){
 pin(o.policySha256);pin(o.driverSha256);const paths={policy:resolve(o.policy),bootstrap:resolve(o.bootstrap),update:resolve(o.update)},digests={};
 for(const [n,path]of Object.entries(paths))digests[n]=sha256(await readPublicBytes(path,1048576));
 assert.equal(digests.policy,o.policySha256,'reviewed certificate policy differs');
 const driver=await sealDriver({wallet:o.driver,walletSha256:o.driverSha256,runtimeDirectory:resolve(o.runtimeDirectory)}),report=resolve(o.report);
 await publishFile(report+'.intent.json',JSON.stringify({schema:1,kind:'conditional-certificate-inspection-intent-v1',digests,driverSha256:driver.sha256,canBroadcast:false,canonicalFinalityVerified:false,financialOperations:0})+'\n');
 await driver.check();
 const result=await runDurableSubmission(driver.file,[paths.policy,digests.policy,paths.bootstrap,paths.update,report],{env:process.env,timeout:120000,logFile:report+'.native.log'});
 await driver.check();for(const[n,path]of Object.entries(paths))assert.equal(sha256(await readPublicBytes(path,1048576)),digests[n],'certificate input changed');
 const records=driverRecords(result.stdout);assert.equal(records.length,1,'exact owned native certificate output required');
 const raw=await readPublicBytes(report,32768),r=JSON.parse(raw.toString('utf8'));assert.deepEqual(r,records[0],'certificate report substituted after native verification');validateGloasCertificateReport(r,digests);
 await publishFile(report+'.receipt.json',JSON.stringify({schema:1,digests,driverSha256:driver.sha256,reportSha256:sha256(raw),ownedOutputSha256:sha256(Buffer.from(result.stdout)),canBroadcast:false,canonicalFinalityVerified:false})+'\n');return r;
}
export async function inspectGloasExecutionEvidence({certificate,inclusion}){
 // Never accept external "verified" JSON. Both native inspections are owned.
 const c=await inspectGloasCertificate(certificate),l1=await inspectStoredL1Evidence(inclusion);
 assert.equal(c.conditionalFinalizedExecutionParentHash,l1.blockHash,'certificate and inclusion must bind the exact same execution hash; height ordering is insufficient');
 return {schema:1,kind:'conditional-certificate-execution-binding-v1',executionHash:l1.blockHash,stateRoot:l1.stateRoot,certificateRelationsVerified:true,accountInclusionVerified:true,independentAnchorAuthenticated:false,canonicalFinalityVerified:false,seedSecrecyAuthenticated:false,qualifiedRandomness:false,canSign:false,canBroadcast:false,financialOperations:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [policy,policySha256,bootstrap,update,driver,driverSha256,runtimeDirectory,report,...extra]=process.argv.slice(2);
 if(!report||extra.length)throw Error('POLICY REVIEWED_POLICY_SHA256 BOOTSTRAP UPDATE NATIVE_DRIVER REVIEWED_DRIVER_SHA256 RUNTIME_DIRECTORY FRESH_REPORT required');
 inspectGloasCertificate({policy,policySha256,bootstrap,update,driver,driverSha256,runtimeDirectory,report}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
