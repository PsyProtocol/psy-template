import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGloasCertificateReport} from './consensusEvidence.mjs';

test('conditional signature relations never promote same-source bootstrap trust',()=>{
 const h='0x'+'1'.repeat(64),digests=Object.fromEntries(['policy','bootstrap','update'].map(n=>[n,'a'.repeat(64)]));
 const r={schema:1,kind:'conditional-gloas-certificate-inspection-v1',sdkCommit:'c92880c8b6e2c8d392f19368bc8801a2584fd427',bootstrapRoot:h,attestedBeaconRoot:h,finalizedBeaconRoot:h,signingRoot:h,signatureSlot:'11469060',attestedSlot:'11469059',finalizedSlot:'11468992',committeePeriod:'1400',participation:512,committeeMembershipVerifiedRelativeToBootstrap:true,aggregateCommitteeKeyMatches:true,syncSignatureVerifiedRelativeToCommittee:true,finalityBranchVerifiedRelativeToAttestedHeader:true,executionHashBranchesVerified:true,conditionalFinalizedExecutionParentHash:h,anchorReviewed:false,independentAnchorAuthenticated:false,committeeTransitionVerified:false,freshnessVerified:false,canonicalFinalityVerified:false,checkpointResourcesAuthenticated:false,seedSecrecyAuthenticated:false,qualifiedRandomness:false,canSign:false,canBroadcast:false,financialOperations:0,newZkProofsGenerated:0,scope:'test-only schema fixture; no crypto or financial acceptance',inspectionPassed:true,...Object.fromEntries(Object.entries(digests).map(([k,v])=>[k+'Sha256',v]))};
 assert.equal(validateGloasCertificateReport(r,digests),r);
 for(const field of ['anchorReviewed','independentAnchorAuthenticated','canonicalFinalityVerified','checkpointResourcesAuthenticated','seedSecrecyAuthenticated','qualifiedRandomness','canSign','canBroadcast'])assert.throws(()=>validateGloasCertificateReport({...r,[field]:true},digests));
 assert.throws(()=>validateGloasCertificateReport({...r,participation:341},digests));
 assert.throws(()=>validateGloasCertificateReport({...r,externalVerifier:'https://example.invalid'},digests));
 assert.throws(()=>validateGloasCertificateReport({...r,updateSha256:'b'.repeat(64)},digests));
});
