// Diagnostic only: the production preflight, never this report, gates finance.
// One original read per endpoint, no redirect, retry, signature or submission.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../requestBinding.mjs';
import {saveObservation} from '../observations.mjs';

export function diagnosticRead(target) {
 assert.ok(['realm','coordinator'].includes(target.role),'invalid diagnostic role');
 assert.ok(Number.isSafeInteger(target.id)&&target.id>=0&&target.id<4294967296,'invalid diagnostic endpoint ID');
 const url=new URL(target.url);assert.equal(url.protocol,'https:');assert.ok(!url.username&&!url.password);
 const {method,params}=target;
 assert.ok(['psy_get_latest_l2_block_state','psy_get_contract_leaf_data'].includes(method),'diagnostic read allowlist');
 if(method==='psy_get_latest_l2_block_state')assert.deepEqual(params,{});
 else {assert.deepEqual(Object.keys(params),['contract_id']);assert.ok(Number.isSafeInteger(params.contract_id)&&params.contract_id>0);}
 return JSON.stringify({jsonrpc:'2.0',id:1,method,params});
}
export function readableResult(method,status,raw,{truncated=false}={}) {
 if(truncated)return {readable:false,reason:'body-limit-exceeded'};
 if(status!==200)return {readable:false,reason:'http-'+status};
 let r;try{r=JSON.parse(raw);}catch{return {readable:false,reason:'malformed-json'};}
 if(r?.jsonrpc!=='2.0'||r?.id!==1)return {readable:false,reason:'wrong-rpc-envelope'};
 if(r.error!==undefined)return {readable:false,reason:'json-rpc-error'};
 if(method==='psy_get_latest_l2_block_state')return Number.isSafeInteger(r.result?.checkpoint_id)&&r.result.checkpoint_id>0?{readable:true,checkpoint:r.result.checkpoint_id}:{readable:false,reason:'invalid-head'};
 if(method==='psy_get_contract_leaf_data')return typeof r.result?.code_root==='string'&&/^[0-9a-f]{64}$/i.test(r.result.code_root)?{readable:true,codeRoot:r.result.code_root}:{readable:false,reason:'invalid-contract-leaf'};
 throw Error('unsupported diagnostic result');
}
export async function probeEndpoint(target,{fetcher=fetch,maxBytes=262144}={}) {
 const request=diagnosticRead(target);assert.ok(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=262144);
 const startedAt=new Date().toISOString(),start=performance.now();
 let raw=Buffer.alloc(0),response,classification,transportError=null,truncated=false;
 try {
  response=await fetcher(target.url,{method:'POST',headers:{'content-type':'application/json'},body:request,redirect:'manual',signal:AbortSignal.timeout(20000)});
  const reader=response.body?.getReader();if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;const available=maxBytes-raw.length;raw=Buffer.concat([raw,Buffer.from(value).subarray(0,available)]);if(value.byteLength>available){truncated=true;await reader.cancel();break;}}}finally{reader.releaseLock();}}
  classification=readableResult(target.method,response.status,raw.toString('utf8'),{truncated});
 }catch(error){transportError={name:error.name,message:error.message};classification={readable:false,reason:'transport-error'};}
 const headers={};for(const name of ['content-type','server','retry-after','location','cf-ray','x-request-id']){const v=response?.headers.get(name);if(v!==null&&v!==undefined)headers[name]=v;}
 return {request,raw,metadata:{schema:1,startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start,target,httpStatus:response?.status??null,headers,bodyBytes:raw.length,bodySha256:sha256(raw),truncated,transportError,...classification,financialAuthorization:false,retries:0,redirectsFollowed:0}};
}
export async function probeNetwork(configPath,out,{fetcher=fetch}={}) {
 const raw=readFileSync(configPath),config=JSON.parse(raw),network=config.networks[config.defaultNetwork];
 assert.ok(Array.isArray(network?.realm_configs)&&network.realm_configs.length>0);assert.ok(Array.isArray(network.coordinator_configs)&&network.coordinator_configs.length>0);
 const targets=[...network.realm_configs.map(r=>({role:'realm',id:r.id,url:r.rpc_url[0],method:'psy_get_latest_l2_block_state',params:{}})),...network.coordinator_configs.map(c=>({role:'coordinator',id:c.id,url:c.rpc_url[0],method:'psy_get_contract_leaf_data',params:{contract_id:2485}}))];
 targets.forEach(diagnosticRead);const labels=targets.map(t=>t.role+'-'+t.id);assert.equal(new Set(labels).size,labels.length);
 mkdirSync(out,{mode:0o700});
 saveObservation(join(out,'PLAN.json'),{schema:1,startedAt:new Date().toISOString(),configSha256:sha256(raw),targets,attemptsPerEndpoint:1,timeoutMillisecondsPerEndpoint:20000,financialOperations:0,scope:'readability only; no code/layout attestation, state authorization or settlement readiness'});
 const rows=await Promise.all(targets.map(async t=>{const result=await probeEndpoint(t,{fetcher}),prefix=join(out,t.role+'-'+t.id);writeFileSync(prefix+'-request.json',result.request,{flag:'wx',mode:0o600});writeFileSync(prefix+'-response.body',result.raw,{flag:'wx',mode:0o600});saveObservation(prefix+'-observation.json',result.metadata);return result.metadata;}));
 assert.equal(sha256(readFileSync(configPath)),sha256(raw),'diagnostic network config changed');
 const report={schema:1,finishedAt:new Date().toISOString(),configSha256:sha256(raw),rows,allEndpointsReadable:rows.every(r=>r.readable),financialOperations:0,financialAuthorization:false,scope:'diagnostic observations only; rerun original complete fresh preflight before any financial work'};
 saveObservation(join(out,'SUMMARY.json'),report);return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const [config,out]=process.argv.slice(2);assert.ok(config&&out);const r=await probeNetwork(config,resolve(out));
 console.log(JSON.stringify({allEndpointsReadable:r.allEndpointsReadable,endpoints:r.rows.map(x=>({role:x.target.role,id:x.target.id,httpStatus:x.httpStatus,readable:x.readable,reason:x.reason??null})),financialOperations:0}));
}
