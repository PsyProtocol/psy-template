// Physical public RPC observations only. SDK-internal reads are uninstrumented.
import assert from'node:assert/strict';
export function readSegments(phase){
 const jobs=phase.residentJobs??[],first=jobs.length?Date.parse(jobs[0].startedAt):Infinity,last=jobs.length?Date.parse(jobs.at(-1).startedAt)+jobs.at(-1).wallMilliseconds:-Infinity;
 const groups={beforeResident:[],betweenResidentJobs:[],afterResident:[],withoutResident:[]};
 for(const r of phase.reads){const at=Date.parse(r.queuedAt);assert.ok(Number.isFinite(at));groups[!jobs.length?'withoutResident':at<first?'beforeResident':at>=last?'afterResident':'betweenResidentJobs'].push(r);}
 return Object.fromEntries(Object.entries(groups).map(([name,rows])=>{const intervals=rows.map(r=>{const at=Date.parse(r.queuedAt);assert.ok(r.queueMilliseconds===null||Number.isFinite(r.queueMilliseconds)&&r.queueMilliseconds>=0);assert.ok(r.rpcAndParseMilliseconds===null||Number.isFinite(r.rpcAndParseMilliseconds)&&r.rpcAndParseMilliseconds>=0);return{start:at,end:at+(r.queueMilliseconds??0)+(r.rpcAndParseMilliseconds??0)};});return[name,{attempts:rows.length,failedAttempts:rows.filter(r=>r.failed).length,readSpanMilliseconds:rows.length?Math.max(...intervals.map(r=>r.end))-Math.min(...intervals.map(r=>r.start)):null,rpcAndParseSumMilliseconds:rows.reduce((n,r)=>n+(r.rpcAndParseMilliseconds??0),0),scope:'JS RPC queued-to-last-finish span; includes scheduling gaps and queue/parse, excludes observer writes; do not add overlapping spans or interpret as SDK internal read/proof time'}];}));
}
