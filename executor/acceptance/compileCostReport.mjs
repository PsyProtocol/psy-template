import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{sha256}from'../requestBinding.mjs';import{saveObservation}from'../observations.mjs';
export function compileUnits(text,{sdkRoot,sourceRoot}){
 const inside=(path,root)=>path===root||path.startsWith(root+'/'),groups=Object.fromEntries(['sdk','application','otherDependencies'].map(k=>[k,{units:0,reportedDurationSumMilliseconds:0,longestUnitMilliseconds:0}]));let artifacts=0,freshArtifacts=0,nonJsonLines=0;
 for(const line of text.split('\n').filter(Boolean)){
  let r;try{r=JSON.parse(line);}catch{nonJsonLines++;continue;}
  if(r.reason==='compiler-artifact'){assert.equal(typeof r.fresh,'boolean');artifacts++;if(r.fresh)freshArtifacts++;}
  if(r.reason!=='timing-info')continue;
  assert.ok(typeof r.target?.src_path==='string'&&typeof r.package_id==='string');assert.ok(Number.isFinite(r.duration)&&r.duration>=0,'invalid Cargo duration');
  const group=inside(r.target.src_path,sdkRoot)?'sdk':inside(r.target.src_path,sourceRoot)?'application':'otherDependencies',g=groups[group],ms=r.duration*1000;g.units++;g.reportedDurationSumMilliseconds+=ms;g.longestUnitMilliseconds=Math.max(g.longestUnitMilliseconds,ms);
 }
 return{groups,artifacts,freshArtifacts,nonFreshArtifacts:artifacts-freshArtifacts,nonJsonLines,scope:'Cargo unit elapsed sums overlap and must not be added to reconstruct build wall time; targeted client SDK subset, not a server Node build'};
}
export function reportCompileCost(base){
 const read=p=>JSON.parse(readFileSync(p,'utf8')),plan=read(join(base,'public/BUILD-PLAN-v1.json')),done=read(join(base,'public/BUILD-COMPLETE-v1.json'));assert.equal(done.ok,true);assert.equal(done.observerOutcome.code,0);assert.equal(done.rows.length,2);assert.equal(done.newBinariesSelectedForFinancialUse,false);
 const file=join(base,'build-tree-v1.log'),samples=readFileSync(file,'utf8').trim().split('\n').map(JSON.parse),summary=read(join(base,'build-tree-v1-SUMMARY.json'));assert.equal(summary.rootMissingObserved,false);
 const rows=done.rows.map(row=>{
  assert.equal(row.code,0);const from=Date.parse(row.startedAt),to=Date.parse(row.finishedAt);assert.ok(Date.parse(samples[0].at)<=from&&Date.parse(samples.at(-1).at)>=to);const inside=samples.filter(s=>Date.parse(s.at)>=from&&Date.parse(s.at)<=to),times=inside.map(s=>Date.parse(s.at)),gaps=times.length?[times[0]-from,...times.slice(1).map((t,i)=>t-times[i]),to-times.at(-1)]:[to-from];
  assert.ok(samples.every(s=>s.rootAlive));const memory={samples:inside.length,maxObservedGapMilliseconds:Math.max(...gaps),sampledTreeRssMaxBytes:inside.length>=2?Math.max(...inside.map(s=>s.sumRssBytes)):null,sufficientPhaseSamples:inside.length>=2,scope:'one-second owned process-tree sampled RSS sums including Node wrapper and Cargo/rustc children; shared pages can double-count; short warm builds may be undersampled, never a true physical or instantaneous peak'};
  if(inside.length>=2)assert.ok(memory.maxObservedGapMilliseconds<=5000,'compile sampler gap');
  return{...row,memory,units:compileUnits(readFileSync(join(base,row.mode+'.jsonl'),'utf8'),plan)};
 });
 const binaries=['cold','warm'].map(mode=>read(join(base,'public',mode+'-BINARIES-v1.json')));assert.deepEqual(binaries[0].binaries,binaries[1].binaries,'warm build changed the outputs');
 return{schema:1,plan,rows,binaries:binaries[0].binaries,financialOperations:0,newBinariesSelectedForFinancialUse:false,treeLogSha256:sha256(readFileSync(file)),scope:'clean-target versus unchanged warm Cargo source builds, with downloaded crate and OS caches retained. SDK/application unit sums are overlapping diagnostics, not separate additive wall times; not proof-resource construction, settlement, confirmation or throughput.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const[base,out]=process.argv.slice(2);assert.ok(out);saveObservation(resolve(out),reportCompileCost(base));}
