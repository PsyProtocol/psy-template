// Acceptance-only labels and windows. They do not change call/key capacity or
// permit modifying an opened/frozen epoch. A new plan is chosen before start.
import assert from 'node:assert/strict';
export const SCENARIOS = ['success','recovery','partial-recovery'];
export function scenarioProfile(name) {
  assert.ok(SCENARIOS.includes(name), 'known isolated scenario only');
  return name === 'success' ? {ownerIndex:0,publisherIndex:0,cutoffLead:64} :
    name === 'recovery' ? {ownerIndex:1,publisherIndex:1,cutoffLead:64} :
      {ownerIndex:1,publisherIndex:0,cutoffLead:96};
}
export function newIntakePlan({checkpoint,epoch,owner,nonce,scenario}) {
  const {cutoffLead} = scenarioProfile(scenario);
  for (const x of [checkpoint,epoch,owner]) assert.ok(Number.isSafeInteger(x) && x > 0);
  assert.ok(typeof nonce === 'bigint' && nonce > 0n && nonce < 1n<<62n);
  assert.ok(cutoffLead <= 128 && checkpoint+cutoffLead < 2**32);
  return {version:1,epoch,cutoff:checkpoint+cutoffLead,members:[{owner,nonce:String(nonce)}]};
}
