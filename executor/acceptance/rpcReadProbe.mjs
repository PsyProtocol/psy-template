// Read-only application RPC observations. No signing, submission or raw balances.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {publicState} from '../publicState.mjs';import {saveObservation} from '../observations.mjs';import {losslessJson} from '../../amm/u124/client.mjs';
const [config,out,ownerArg]=process.argv.slice(2),owner=Number(ownerArg);assert.ok(Number.isSafeInteger(owner)&&owner>0&&owner<16777216);
const nativeFetch=globalThis.fetch,requests=[];
globalThis.fetch=async(url,options)=>{assert.equal(options?.method,'POST');const body=JSON.parse(options.body);assert.ok(body.method.startsWith('psy_get_'),'read methods only');const started=performance.now();try{const response=await nativeFetch(url,options);requests.push({method:body.method,httpStatus:response.status,headersMs:performance.now()-started,scope:'fetch through response headers only; body/limiter/retry costs are in operation durations'});return response;}catch(error){requests.push({method:body.method,httpStatus:null,headersMs:performance.now()-started,transportError:true});throw error;}};
const samples=[],measure=async(label,operation)=>{const count=requests.length,start=performance.now(),value=await operation();return {label,milliseconds:performance.now()-start,fetchAttempts:requests.length-count,resultSha256:createHash('sha256').update(losslessJson(value)).digest('hex')};};
try{for(let i=0;i<5;i++){
 let s;const heads=await measure('common-heads-and-config',async()=>{s=await publicState(config);return s.heads;});
 const first=await measure('four-native-felts-one-fixed-checkpoint-leaf',()=>Promise.all([0,1,2,3].map(offset=>s.slot(owner,0,offset))));
 const repeat=await measure('same-leaf-cached-read',()=>Promise.all([0,1,2,3].map(offset=>s.slot(owner,0,offset))));assert.equal(repeat.fetchAttempts,0);assert.equal(first.resultSha256,repeat.resultSha256);
 const ft=await measure('qa-ft-wide-balance-two-felts',()=>Promise.all([0,1].map(offset=>s.slot(owner,2464,offset))));
 const dependencies=await measure('four-current-asset-metadata-bindings',()=>Promise.all([0,2464,2466,2467].map(id=>s.contractLeaf(id))));
 samples.push({index:i,checkpoint:s.checkpoint,operations:[heads,first,repeat,ft,dependencies]});
}}finally{globalThis.fetch=nativeFetch;}
saveObservation(out,{schema:1,observedAt:new Date().toISOString(),owner,samples,requests,scope:'five fresh application snapshots; operation wall includes config, RPC bodies, limiter, retries and local decoding; fetch intervals stop at headers. Shared-cache demonstration is within one immutable checkpoint object only. Concurrent deployment/host load is uncontrolled. Not pure transport latency, version attestation, proof performance or network TPS',signing:false,broadcast:false,chainTps:null});
