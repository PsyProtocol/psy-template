import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';
import {runDurableSubmission,submissionLeaf} from './driverProcess.mjs';
test('driver failure preserves deterministic leaf and prevents overwrite of a prior submission log',async()=>{
 const d=await mkdtemp(join(tmpdir(),'psy-driver-')),logFile=join(d,'submission.log'),leaf='e'.repeat(64);
 try{
  await assert.rejects(runDurableSubmission(process.execPath,['-e',`console.error('deterministic leaf ${leaf}');process.exit(1)`],{logFile}),/exited 1/);
  assert.equal(submissionLeaf(await readFile(logFile,'utf8')),leaf);
  await assert.rejects(runDurableSubmission(process.execPath,['-e','process.exit(0)'],{logFile}),{code:'EEXIST'});
 }finally{await rm(d,{recursive:true,force:true});}
});
test('child transaction output remains durable after the executor process exits abruptly',async()=>{
 const d=await mkdtemp(join(tmpdir(),'psy-driver-crash-')),logFile=join(d,'submission.log'),leaf='f'.repeat(64);
 const helper=new URL('./driverProcess.mjs',import.meta.url).href;
 const driver=`setTimeout(()=>console.log('submitted curve vault transaction ${leaf}'),100)`;
 const parent=`import {runDurableSubmission} from ${JSON.stringify(helper)};runDurableSubmission(process.execPath,['-e',${JSON.stringify(driver)}],{logFile:${JSON.stringify(logFile)}});setTimeout(()=>process.exit(7),80);`;
 try{
  const child=spawn(process.execPath,['--input-type=module','-e',parent],{stdio:'ignore'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,7);
  let found;for(let i=0;i<100;i++){try{found=submissionLeaf(await readFile(logFile,'utf8'));}catch{}if(found)break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(found,leaf);
 }finally{await rm(d,{recursive:true,force:true});}
});
