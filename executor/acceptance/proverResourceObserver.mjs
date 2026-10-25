// Exact executable inventory for both ordinary and sealed market drivers.
// No arguments, keys or witnesses are collected. Sampling is observational.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hostname,totalmem,cpus} from 'node:os';
import {sha256} from '../requestBinding.mjs';
export function selectedProcesses(text,tools,checked=new Map()) {
 const digests=new Set(Object.values(tools.binaries).map(t=>t.sha256));
 const files=new Map(Object.values(tools.binaries).map(t=>[t.file,t.sha256]));
 return text.split('\n').flatMap(line=>{
  const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);if(!m)return[];
  const file=m[5],binary=basename(file),driverDigest=basename(file.slice(0,file.lastIndexOf('/')));
  const expected=files.get(file)??(binary==='market-wallet'&&digests.has(driverDigest)?driverDigest:null);if(!expected)return[];
  const stat=statSync(file),id=[stat.dev,stat.ino,stat.size,stat.mtimeMs].join(':');
  if(checked.get(file)!==id){assert.equal(sha256(readFileSync(file)),expected,'observed executable changed');checked.set(file,id);}
  return[{pid:Number(m[1]),parentPid:Number(m[2]),rssBytes:Number(m[3])*1024,cpuPercent:Number(m[4]),binary,binarySha256:expected}];
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const [base,label,release]=process.argv.slice(2);assert.match(label,/^[a-z0-9-]+$/);
 const raw=readFileSync(release),tools=JSON.parse(raw),checked=new Map();
 for(const t of Object.values(tools.binaries)){assert.match(t.sha256,/^[0-9a-f]{64}$/);assert.equal(sha256(readFileSync(t.file)),t.sha256);}
 const log=join(base,label+'.log'),summary=join(base,label+'-SUMMARY.json');writeFileSync(log,'',{flag:'wx',mode:0o600});
 const startedAt=new Date().toISOString();writeFileSync(join(base,label+'-IDENTITY.json'),JSON.stringify({pid:process.pid,startedAt,releaseSha256:sha256(raw),observerSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),release,host:hostname(),physicalMemoryBytes:totalmem(),logicalCpus:cpus().length,scope:'exact declared executables plus byte-identical sealed copies; excludes unlisted clients and host total'})+'\n',{flag:'wx',mode:0o600});
 let count=0,max=0,stopping=false;
 const sample=()=>{const at=new Date().toISOString(),processes=selectedProcesses(execFileSync('ps',['-Ao','pid,ppid,rss,pcpu,comm'],{encoding:'utf8'}),tools,checked),sumRssBytes=processes.reduce((n,p)=>n+p.rssBytes,0);max=Math.max(max,sumRssBytes);count++;appendFileSync(log,JSON.stringify({at,processes,sumRssBytes})+'\n');};
 const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);sample();writeFileSync(summary,JSON.stringify({startedAt,finishedAt:new Date().toISOString(),samples:count,maxObservedSumRssBytes:max,intervalMilliseconds:1000,releaseSha256:sha256(raw),scope:'sampled declared prover process RSS sum, including idle residents and shared pages; not a true peak or host physical footprint'})+'\n',{flag:'wx',mode:0o600});process.exit(0);};
 sample();const timer=setInterval(sample,1000);process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
