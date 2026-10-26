import assert from 'node:assert/strict';
export function validateSetupAudit(a,mode){
 assert.equal(a.fullProofAccountingPending,false);assert.equal(a.nonceAndStateChainsVerified,true);
 if(mode==='closed-fill-v1'){
  assert.equal(a.actualUps,17n);assert.equal(a.fills,1n);assert.equal(a.allCompletedRequestsVerified,true);assert.equal(a.ordinaryClaimsVerified,true);assert.equal(a.ftAndNativeConservationVerified,true);assert.equal(a.nftUnchanged,true);assert.equal(a.actual.length,17);
 }else{
  assert.equal(mode,'closed-refund-v1');assert.equal(a.actualUps,15n);assert.equal(a.actualFills,0n);assert.equal(a.allActualFullProofsVerified,true);assert.equal(a.finiteCohortNativeAndFtConservationVerified,true);
 }
}
