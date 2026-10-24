// Read-only ABBA calibration of the EXACT saved UPS; no signing or submit.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';import{join,dirname}from'node:path';
import {read,run} from '../../batching/admission/liveSupport.mjs';
import {saveObservation} from '../observations.mjs';
import {sha256} from '../requestBinding.mjs';
export function withGuardCalibration(f,{base,binary,baselineBinary,env},kind){
 const prepare=f.adapter.prepareSubmission;
 f.adapter.prepareSubmission=async(task,proof)=>{
  if(task.maintenanceOperation!=='seal_epoch')return prepare(task,proof);
  const marker=join(base,'public',kind+'-guard-calibration.json');
  assert.ok(!existsSync(marker),'preserve earlier calibration; reconcile exact prepared work before repeating');
  const root=dirname(proof.preparedDirectory),samples=[],manifest=read(join(proof.preparedDirectory,'prepared.json'));
  for(const [i,variant]of ['baseline','optimized','optimized','baseline'].entries()){
   assert.ok(baselineBinary,'frozen original application driver required');const driver=variant==='baseline'?baselineBinary:binary;
   const out=join(base,'attempts',kind+'-guard-read-'+i),timing=await run(driver,['verify-prepared',f.options.policy,f.options.rpcConfig,join(root,'calls.json'),join(root,'guard.json'),proof.preparedDirectory,proof.manifestSha256,out],out+'.log',env);
   const v=read(join(out,'verification.json'));assert.equal(v.fullUpsVerified,true);assert.equal(v.exactStackAndSessionVerified,true);assert.equal(v.broadcast,false);assert.equal(v.reproved,false);assert.equal(v.requestSha256,manifest.requestSha256);assert.equal(v.preparedManifestSha256,proof.manifestSha256);assert.ok(!existsSync(join(out,'intent.json'))&&!existsSync(join(out,'request.json')));
   samples.push({variant,driverSha256:sha256(readFileSync(driver)),timing,verification:v,verificationSha256:sha256(readFileSync(join(out,'verification.json'))),source:out});
  }
  assert.equal(sha256(readFileSync(join(proof.preparedDirectory,'prepared.json'))),proof.manifestSha256);
  saveObservation(marker,{scope:'same exact proof, full stack/session/fee/nonce/code/layout checks; ABBA original frozen application driver versus bounded public guards; same SDK, no financial broadcast or proving-speed comparison',samples,requestSha256:manifest.requestSha256,binarySha256:sha256(readFileSync(binary))});
  return prepare(task,proof);
 };
 return f;
}
