// Complete owned application tree. Only executable names/PIDs/resources are
// collected; argv, environment, wallet material and witnesses are never logged.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {join,basename} from 'node:path';import {fileURLToPath} from 'node:url';import {sha256} from '../requestBinding.mjs';
export function processTree(text,root,excluded=[]){
 const rows=text.split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);return m?[{pid:+m[1],parentPid:+m[2],rssBytes:+m[3]*1024,cpuPercent:+m[4],executable:basename(m[5])}]:[];});
 const skip=new Set(excluded),selected=new Set([root]);let changed=true;while(changed){changed=false;for(const r of rows){if(skip.has(r.parentPid))skip.add(r.pid);if(selected.has(r.parentPid)&&!skip.has(r.pid)&&!selected.has(r.pid)){selected.add(r.pid);changed=true;}}}
 return{rootAlive:rows.some(r=>r.pid===root),processes:rows.filter(r=>selected.has(r.pid)&&!skip.has(r.pid))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const[base,rootFile,excludeFile,label='tree-resources-v1']=process.argv.slice(2);assert.match(label,/^[a-z0-9-]+$/);const rootRaw=readFileSync(rootFile),root=JSON.parse(rootRaw);assert.ok(Number.isSafeInteger(root.pid)&&root.pid>0);
 const log=join(base,label+'.log');writeFileSync(log,'',{flag:'wx',mode:0o600});let count=0,max=0,missing=false,stopping=false;const startedAt=new Date().toISOString();
 const sample=()=>{const excluded=existsSync(excludeFile)?JSON.parse(readFileSync(excludeFile)).pids:[];const row=processTree(execFileSync('ps',['-Ao','pid,ppid,rss,pcpu,comm'],{encoding:'utf8'}),root.pid,[process.pid,...excluded]),sumRssBytes=row.processes.reduce((n,r)=>n+r.rssBytes,0);missing||=!row.rootAlive;max=Math.max(max,sumRssBytes);count++;appendFileSync(log,JSON.stringify({at:new Date().toISOString(),...row,sumRssBytes})+'\n');};
 let timer;const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);sample();writeFileSync(join(base,label+'-SUMMARY.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),samples:count,maxObservedTreeRssBytes:max,rootMissingObserved:missing,rootIdentitySha256:sha256(rootRaw),observerSourceSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),intervalMilliseconds:1000,scope:'one-second sampled owned application process tree including Node controller/round parents and all children, excluding both telemetry observers and descendants; RSS can double-count shared pages and is not true peak or physical footprint'})+'\n',{flag:'wx'});process.exit(0);};
 sample();timer=setInterval(sample,1000);writeFileSync(join(base,label+'-READY.json'),JSON.stringify({pid:process.pid,rootPid:root.pid,startedAt,rootIdentitySha256:sha256(rootRaw)})+'\n',{flag:'wx'});process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
