import assert from 'node:assert/strict';
const markets=['amm','orderbook','bondingcurve','nftmarket'];
export function analyzeProofCosts(comparison,reports){
 assert.equal(comparison.broadcast,false);assert.ok(comparison.chainTps==null);assert.equal(comparison.methodology.chainTps,null);
 assert.equal(comparison.comparisons.length,4);assert.deepEqual(comparison.comparisons.map(r=>r.market).sort(),[...markets].sort());
 const rows=comparison.comparisons.map(pair=>{
  assert.equal(pair.sameContractStateAndFees,true);const result={market:pair.market};
  for(const profile of ['fixed40','compact-v1']){
   const r=reports[pair.market]?.[profile];assert.ok(r,'missing complete profile');assert.equal(r.market,pair.market);assert.equal(r.broadcast,false);assert.equal(r.chainTps,null);assert.equal(r.members,4);assert.equal(r.fills,['amm','bondingcurve'].includes(r.market)?4:2);
   const cold=r.measurements.filter(p=>p.phase==='cold-circuit-build');assert.equal(cold.length,1);assert.ok(Number.isFinite(cold[0].elapsedMs)&&cold[0].elapsedMs>=0);
   const proofs=r.measurements.filter(p=>p.phase!=='cold-circuit-build');assert.deepEqual(proofs.map(p=>p.phase),['commit','settle']);
   const sample={coldCircuitBuildMs:cold[0].elapsedMs,warmCommitSettlementMs:0,callStepMs:0,noopStepMs:0,noopCalls:0,endcapProveAndVerifyMs:0,sdKeySignMs:0,fees:[],actualCalls:[],proofBytes:[],phases:[]};
   for(const p of proofs){
    for(const flag of ['fullUpsVerified','publicEndpointsBound','exportedDeltasVerified'])assert.equal(p[flag],true,'whole UPS evidence required');assert.equal(p.profile,profile);assert.equal(p.steps.length,p.calls-1,'burn has its own measured interval');
    assert.ok(Number.isSafeInteger(p.burn)&&p.burn>0&&p.burn<=1000100000);assert.ok(Number.isSafeInteger(p.proofBytes)&&p.proofBytes>0);
    if(profile==='fixed40')assert.equal(p.calls,40);else assert.ok(p.calls>0&&p.calls<40);
    const values=[p.elapsedMs,...p.steps.map(s=>s.ms),...Object.values(p.overheadStagesMs)];assert.ok(values.every(n=>Number.isFinite(n)&&n>=0),'finite nonnegative measured durations');
    const call=p.steps.reduce((n,s)=>n+s.ms,0),noops=p.steps.filter(s=>s.method==='noop'),nop=noops.reduce((n,s)=>n+s.ms,0),endcap=p.overheadStagesMs.endcapProveAndVerify,sign=p.overheadStagesMs.sdKeySign;
    assert.ok(Number.isFinite(endcap)&&Number.isFinite(sign));
    sample.warmCommitSettlementMs+=p.elapsedMs;sample.callStepMs+=call;sample.noopStepMs+=nop;sample.noopCalls+=noops.length;sample.endcapProveAndVerifyMs+=endcap;sample.sdKeySignMs+=sign;sample.fees.push(p.burn);sample.actualCalls.push(p.calls);sample.proofBytes.push(p.proofBytes);
    sample.phases.push({phase:p.phase,elapsedMs:p.elapsedMs,callStepMs:call,noopStepMs:nop,noopCalls:noops.length,endcapProveAndVerifyMs:endcap,sdKeySignMs:sign});
   }
   assert.ok(sample.coldCircuitBuildMs>=0&&sample.warmCommitSettlementMs>0);result[profile]=sample;
  }
  const before=result.fixed40,after=result['compact-v1'];assert.deepEqual(before.fees,after.fees);assert.equal(before.warmCommitSettlementMs,pair.beforeCommitSettleMs);assert.equal(after.warmCommitSettlementMs,pair.afterCommitSettleMs);
  result.observedWarmRatioFixedOverCompact=before.warmCommitSettlementMs/after.warmCommitSettlementMs;return result;
 });
 return {schema:1,rows,scope:'complete synthetic four-member commitment plus settlement UPS costs; not full economic lifecycle or network TPS',methodology:comparison.methodology,attribution:{callSteps:'CFC execution/proving and recursive compression intervals combined; recursion not separately isolated',endcap:'SDK end-cap proof generation and verification combined',coldCircuitBuild:'separate fresh-process key/circuit resources, not Cargo build or real RPC setup',causalAttribution:false},chainTps:null,productionReady:false};
}
