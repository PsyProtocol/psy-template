import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {proofReadEvidence} from './proofReadRecovery.mjs';
test('only matching sealed read rejection without any prepared financial artifact permits recovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'proof-read-')),endpoint='https://realm1-stg.psy-protocol.xyz';
 const failure={ok:false,phase:'start-compact-session',reason:'Connection error to '+endpoint+': unavailable',broadcastMayHaveBeenAttempted:false,automaticRetry:false};
 const save=x=>writeFile(join(dir,'failure.json'),JSON.stringify(x));
 const check=()=>proofReadEvidence(dir,{phase:failure.phase,error:failure.reason},[endpoint]);
 try{
  await save(failure);assert.equal((await check()).broadcastMayHaveBeenAttempted,false);
  for(const edit of [{ok:true},{broadcastMayHaveBeenAttempted:true},{automaticRetry:true},
    {phase:'broadcast-compact-ups'},{reason:failure.reason+' changed'}]){
    await save({...failure,...edit});await assert.rejects(check);
  }
  await save(failure);await assert.rejects(()=>proofReadEvidence(dir,{phase:failure.phase,error:failure.reason},['https://wrong.example']));
  for(const name of ['request.json','intent.json','receipt.json','preflight.json','prepared.json','quote.json']){
    await writeFile(join(dir,name),'{}');await assert.rejects(check,/artifacts/);await rm(join(dir,name));
  }
  const other=join(dir,'target');await mkdir(other);await symlink(join(dir,'failure.json'),join(other,'failure.json'));
  await assert.rejects(()=>proofReadEvidence(other,{phase:failure.phase,error:failure.reason},[endpoint]),/regular file/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
