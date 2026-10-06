// Invoked only as the MCP wallet's policy-gated psyup child process.
// The wallet passes signing material in its environment directly to its CLI.
// This code never reads, stores or prints signing material.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {checkNewDeployment} from './deploymentGate.mjs';
const pins=JSON.parse(readFileSync(process.argv[2]));
assert.deepEqual(process.argv.slice(3),['deploy']);
const project=pins.projects[resolve('.')];assert.ok(project,'project is not allowlisted');
const sha=b=>createHash('sha256').update(b).digest('hex');
const frozen=readFileSync(project.artifact);assert.equal(sha(frozen),project.artifactSha256);
const artifact=JSON.parse(frozen),review=JSON.parse(readFileSync(project.review));
assert.equal(sha(readFileSync(pins.rpcConfig)),pins.rpcConfigSha256);
const dir=project.runDirectory;mkdirSync(dir,{mode:0o700});
const save=(name,data)=>{const fd=openSync(join(dir,name),'wx',0o600);try{writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}};
function run(bin,args,name){const out=spawnSync(bin,args,{encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});assert.equal(out.status,0,`${name} failed; no automatic retry`);}
run(pins.cli,['deploy-contract','--contract-path',project.artifact,'--rpc-config',pins.rpcConfig,'--output-path',join(dir,'prepared.json'),'--result-file',join(dir,'prepare-result.json')],'preparation');
const request=JSON.parse(readFileSync(join(dir,'prepared.json')));
const checked=checkNewDeployment(request,artifact,review,pins.deployer);
run(pins.reviewer,['proof',join(dir,'prepared.json'),join(dir,'proof-verification.json')],'canonical proof verification');
const verified=JSON.parse(readFileSync(join(dir,'proof-verification.json')));assert.equal(verified.valid,true);
assert.equal(sha(readFileSync(project.artifact)),project.artifactSha256,'artifact changed during preparation');
save('preflight.json',{...checked,...verified,artifactSha256:project.artifactSha256});
const http=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});assert.ok(r.ok,`HTTP ${r.status}`);return r.json();};
const prior=await fetch(pins.services+'/api/v1/transaction/hash/'+verified.contentHash,{signal:AbortSignal.timeout(15000)});
if(prior.ok){const receipt=await prior.json();assert.notEqual(receipt.data?.status,'included','identical deployment already exists; choose a distinct reviewed candidate');}
save('abi-upload-intent.json',{content_hash:verified.contentHash,abi:artifact.abi});
save('abi-upload-result.json',await http(pins.services+'/api/v1/contract/abi/pending',{content_hash:verified.contentHash,abi:artifact.abi}));
const payload={jsonrpc:'2.0',id:1,method:'psy_deploy_contract',params:{deploy_contract:request}};
save('submit-intent.json',payload); // Durable intent before the one broadcast.
try{const result=await http(pins.coordinator,payload);save('submit-result.json',result);assert.ok(!result.error,JSON.stringify(result.error));}
catch(e){save('submit-uncertain.json',{error:e.message,contentHash:verified.contentHash});throw new Error('submission unresolved; reconcile saved content hash before any retry');}
for(let i=0;i<60;i++){
 const r=await fetch(pins.services+'/api/v1/transaction/hash/'+verified.contentHash,{signal:AbortSignal.timeout(15000)});
 if(r.ok){const v=await r.json();if(v.data?.status==='included'){assert.ok(Number.isInteger(v.data.result?.contract_id));save('receipt.json',v);console.log(JSON.stringify({status:'included',contractId:v.data.result.contract_id,contentHash:verified.contentHash,runDirectory:dir}));process.exit(0);}}
 await new Promise(r=>setTimeout(r,3000));
}
throw new Error('submitted; inclusion unresolved, inspect saved intent and receipt before retrying');
