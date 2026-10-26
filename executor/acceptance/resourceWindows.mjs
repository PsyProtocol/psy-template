import assert from 'node:assert/strict';

// A window describes all owned processes during a phase, not allocations
// attributable to that task. Concurrent tasks and idle residents stay visible.
export function resourceWindow(samples, startedAt, finishedAt) {
 const from=Date.parse(startedAt),to=Date.parse(finishedAt);
 assert.ok(Number.isFinite(from)&&Number.isFinite(to)&&to>from,'invalid resource window');
 const times=samples.map(s=>Date.parse(s.at));
 for(let i=0;i<samples.length;i++){
  assert.ok(Number.isFinite(times[i])&&(i===0||times[i]>times[i-1]),'unordered resource samples');
  const s=samples[i];assert.equal(s.rootAlive,true,'missing owner');
  assert.ok(s.processes.every(p=>Number.isSafeInteger(p.rssBytes)&&p.rssBytes>=0),'invalid RSS');
  assert.equal(s.sumRssBytes,s.processes.reduce((n,p)=>n+p.rssBytes,0),'RSS sum mismatch');
 }
 assert.ok(times[0]<=from&&times.at(-1)>=to,'resource window not fully observed');
 const rows=samples.filter((_,i)=>times[i]>=from&&times[i]<=to);assert.ok(rows.length>=2,'insufficient phase samples');
 const t=rows.map(r=>Date.parse(r.at)),gaps=[t[0]-from,...t.slice(1).map((x,i)=>x-t[i]),to-t.at(-1)];
 const maxGapMilliseconds=Math.max(...gaps);assert.ok(maxGapMilliseconds<=5000,'resource sample gap');
 const node=r=>r.processes.filter(p=>p.executable==='node').reduce((n,p)=>n+p.rssBytes,0);
 return{startedAt,finishedAt,wallMilliseconds:to-from,samples:rows.length,maxGapMilliseconds,
  sampledTreeRssMaxBytes:Math.max(...rows.map(r=>r.sumRssBytes)),
  sampledNodeRssMaxBytes:Math.max(...rows.map(node)),
  sampledOtherChildrenRssMaxBytes:Math.max(...rows.map(r=>r.sumRssBytes-node(r)))};
}
