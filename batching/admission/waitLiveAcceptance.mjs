// Foreground sequence for this owned-wallet QA fixture, not an automation or
// mutation retry loop. Wait for predecessor receipts, freeze sources, run once.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync,copyFileSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const [mode,base,original,ordinaryBinary,compactBinary]=process.argv.slice(2);
assert.ok(['refund','refund-settlement','refund-claims','nft-test'].includes(mode));assert.ok(base&&original&&ordinaryBinary&&compactBinary);
const ready=()=>mode==='refund'?existsSync(join(base,'public/live-first-complete.json')):mode==='refund-settlement'?['amm-seal','orderbook-seal','bondingcurve-seal','nftmarket-seal-recovery-v1'].every(n=>existsSync(join(base,'attempts','live-refund-'+n,'included.json'))):mode==='refund-claims'?['bob-claim-recovery-v1','trader-claim'].every(n=>existsSync(join(base,'attempts','live-refund-'+n,'included.json'))):existsSync(join(original,'public/live-refund-complete.json'))&&existsSync(join(base,'markets-v1/nftmarket/live-registration.json'));
for(let i=0;!ready();i++){assert.ok(i<2160,'predecessor unresolved; no next-stage mutation');await new Promise(r=>setTimeout(r,5000));}
if(mode==='refund')assert.ok(!existsSync(join(base,'public/live-refund-plan.json')),'refund stage already started; use explicit reconciliation');
if(mode==='refund-settlement')assert.ok(!existsSync(join(base,'public/live-refund-commit-fund.json')),'commit funding already planned; reconcile first');
const snapshot=join(base,'public',mode==='refund'?'runner-source-refund-v1':mode==='refund-settlement'?'runner-source-refund-settlement-recovery-v1':mode==='refund-claims'?'runner-source-refund-claims-recovery-v1':'runner-source-nft-recovery-v1');mkdirSync(snapshot);
const records=[];
for(const dir of ['batching/admission','batching/v2','executor']){mkdirSync(join(snapshot,dir),{recursive:true});for(const name of readdirSync(dir).filter(n=>n.endsWith('.mjs')||n.endsWith('.py'))){const path=join(dir,name),bytes=readFileSync(path);copyFileSync(path,join(snapshot,path),constants.COPYFILE_EXCL);records.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});}}
writeFileSync(join(snapshot,'manifest.json'),JSON.stringify({startedAt:new Date().toISOString(),mode,scope:'application sources copied before a single authorized QA stage; no wallet files',binaries:[ordinaryBinary,compactBinary].map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),records},null,2),{flag:'wx'});
if(mode!=='nft-test'){const {runAcceptance}=await import('./liveAcceptance.mjs');await runAcceptance({base,ordinaryBinary,compactBinary,round:'refund',resumeSettlement:mode==='refund-settlement',resumeClaims:mode==='refund-claims'});}
else{const {runNftRecovery}=await import('./liveNftRecovery.mjs');await runNftRecovery({base,original,ordinaryBinary,compactBinary,stage:'test'});}
