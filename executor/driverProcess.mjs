import {spawn} from 'node:child_process';
import {mkdir,open,readFile} from 'node:fs/promises';
import {dirname} from 'node:path';

// The child owns file descriptors rather than parent pipes. Its deterministic
// leaf remains observable if the executor process exits during submission.
export async function runDurableSubmission(binary,args,{env,timeout=900000,logFile}){
 await mkdir(dirname(logFile),{recursive:true,mode:0o700});
 const log=await open(logFile,'wx',0o600);
 try{
  const child=spawn(binary,args,{env,timeout,stdio:['ignore',log.fd,log.fd]});
  const [code,signal]=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve([code,signal]));});
  await log.sync();const output=await readFile(logFile,'utf8');
  if(code!==0){const error=Error(`public driver exited ${signal??code}`);error.stdout=output;throw error;}
  return {stdout:output,stderr:''};
 }finally{await log.close();}
}
export function driverRecords(output=''){
 return output.split('\n').flatMap(line=>{try{const v=JSON.parse(line);return v&&typeof v==='object'&&!Array.isArray(v)?[v]:[];}catch{return [];}});
}
export function submissionLeaf(output=''){
 const records=driverRecords(output),hashes=records.filter(v=>v.status==='broadcast_intent'||v.status==='submission_unknown').map(v=>v.endUserLeafHash).filter(x=>/^[0-9a-f]{64}$/.test(x??''));
 const text=output.match(/submitted (?:market|launch pool vault|orderbook escrow|curve vault|pool) transaction ([0-9a-f]{64})/)?.[1]??output.match(/deterministic leaf ([0-9a-f]{64})/)?.[1];
 if(text)hashes.push(text);if(new Set(hashes).size>1)throw Error('conflicting submission leaf identities');
 return hashes[0];
}
