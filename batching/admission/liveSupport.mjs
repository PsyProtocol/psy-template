import{verifyDeploymentOwner,PROFILE as MAINNET_BETA_PROFILE}from'../mainnet-beta/native.mjs';
// Isolated acceptance helpers. An acknowledgement is never treated as inclusion.
// No mutation is retried. All outputs use exclusive creation; secrets stay outside.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {publicState} from '../../executor/publicState.mjs';
import {receiptReader} from '../../executor/chainReceipts.mjs';
import {retryRead} from '../../executor/readRetry.mjs';
import {losslessJson} from '../../amm/u124/client.mjs';
import {ordinaryPreflight} from './ordinaryReport.mjs';
import {freshDeploymentReceipt} from './freshDeployment.mjs';
import {saveObservation} from '../../executor/observations.mjs';
export const read=p=>JSON.parse(readFileSync(p,'utf8'));
export const save=(p,v)=>writeFileSync(p,losslessJson(v)+'\n',{flag:'wx'});
export async function run(binary,args,log,env={}){
 const fd=openSync(log,'wx',0o600),startedAt=new Date().toISOString(),start=performance.now();
 const outcome={spawned:false,exitCode:null,signal:null,errorCode:null};let failed=false,timing;
 try {await new Promise((resolve,reject)=>{const p=spawn(binary,args,{env:{...process.env,...env},stdio:['ignore',fd,fd]});p.on('spawn',()=>{outcome.spawned=true;});p.on('error',error=>{outcome.errorCode=error.code??null;reject(error);});p.on('exit',(code,signal)=>{outcome.exitCode=code;outcome.signal=signal;code===0?resolve():reject(Error(`client exit ${code??signal}; inspect ${log}; do not retry an unresolved intent`));});});}
 catch(error){failed=true;throw error;}
 finally {
  closeSync(fd);timing={startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:Math.round(performance.now()-start)};
  // Persist failed/cold invocations too. A telemetry failure never changes a
  // successful financial command into an automatic retry or masks its error.
  try{saveObservation(log+'.timing.json',{schema:1,...timing,ok:!failed,...outcome,scope:'whole child invocation including spawn, construction and exit; not phase CPU, confirmation or chain TPS'});}
  catch(error){console.error('PSY_PROCESS_TIMING_UNAVAILABLE '+JSON.stringify({code:error.code??null,commandFailed:failed}));}
 }
 return timing;
}
export function contractBinding(id,l){return {contract:{contractId:id,codeRoot:l.code_root,layoutRoot:l.state_layout_root,stateTreeHeight:l.state_tree_height},functionTreeRoot:l.function_tree_root,layoutFieldCount:l.state_layout_field_count,layoutSlotCount:l.state_layout_slot_count};}
export async function binding(state,id){return contractBinding(id,await state.contractLeaf(id));}
export async function confirmUps(config,attempt,{polls=120,intervalMs=10000,findReceipt,historyConcurrency=4}={}){
 const {preflight:p,userId,endUserLeafHash,minCheckpoint}=ordinaryPreflight(readFileSync(join(attempt,'preflight.json'),'utf8'));
 const find=findReceipt??await receiptReader(config,{maxPages:20,historyConcurrency,expectedNetwork:'testnet'});
 const startedAt=new Date().toISOString(),start=performance.now();let observations=0,commonObservations=0;
 for(let i=0;i<polls;i++){observations++;const result=await find({userId,endUserLeafHash,minCheckpoint});if(result.status==='included'){
  // A later cross-realm reader must not plan from an earlier common snapshot.
  let common;for(let j=0;j<polls;j++){commonObservations++;common=await publicState(config);if(common.checkpoint>=result.checkpoint)break;await new Promise(r=>setTimeout(r,intervalMs));}
  assert.ok(common.checkpoint>=result.checkpoint,'included UPS not yet visible at common realm checkpoint');
  save(join(attempt,'included.json'),{checkedAt:new Date().toISOString(),...result,commonCheckpoint:common.checkpoint,preflight:p});save(join(attempt,'confirmation-timing.json'),{startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:Math.round(performance.now()-start),observations,commonObservations,historyConcurrency,scope:'ACK/recovery start to indexed exact historical receipt and common visibility; includes polling/read time, not server finality alone'});return result;
 }await new Promise(r=>setTimeout(r,intervalMs));}
 throw Error('inclusion unresolved; saved intent must be reconciled, never blindly retried');
}
export async function ordinary({base,config,binary,secret,name,calls,bindings,env,worker,historyConcurrency=4}){
 const s=await publicState(config),ids=[...new Set([0,...calls.map(c=>Number(c.contract_id))])];
 const contracts=await Promise.all(ids.map(async id=>{const expected=bindings?.get(id);assert.ok(expected,'frozen dependency binding required '+id);assert.deepEqual(await binding(s,id),expected,'dependency changed');return expected;}));
 const input=join(base,'public',name+'.json'),out=join(base,'attempts',name);save(input,{calls:{contract_calls:calls,software_defined_call:{inputs:[]}},contracts,validUntilCheckpoint:s.checkpoint+128});
 const timing=worker?await worker.run({action:'call',input,out,log:join(base,name+'.log')}):await run(binary,['call',config,secret,input,out],join(base,name+'.log'),env);saveObservation(join(out,'timing.json'),timing);
 await confirmUps(config,out,{historyConcurrency,...(worker?{findReceipt:()=>worker.reconcile()}: {})});return out;
}
export async function confirmDeploy(config,attempt,expectedDeployer,{nativeProtocol='legacy-v1'}={}){
 verifyDeploymentOwner({deployer:expectedDeployer},expectedDeployer,nativeProtocol);
 const hash=read(join(attempt,'receipt.json')).receipt;assert.match(hash,/^[0-9a-f]{64}$/);
 const c=read(config),url=c.networks[c.defaultNetwork].api_services_url[0];
 for(let i=0;i<120;i++){
  const receipt=await (await fetch(url.replace(/\/$/,'')+'/api/v1/transaction/hash/'+hash,{signal:AbortSignal.timeout(20000)})).json();
  if(receipt.data?.status==='included'){
   assert.equal(receipt.success,true);assert.equal(receipt.data.content_hash,hash);assert.equal(receipt.data.tx_type,'DeployContract');
   const id=freshDeploymentReceipt(read(join(attempt,'before.json')),receipt.data);let s=await publicState(config);for(let visible=0;s.checkpoint<receipt.data.included_checkpoint_id&&visible<120;visible++){await new Promise(r=>setTimeout(r,10000));s=await publicState(config);}assert.ok(s.checkpoint>=receipt.data.included_checkpoint_id,'deployment not visible at common realm checkpoint');const leaf=await s.contractLeaf(id),preflight=read(join(attempt,'preflight.json'));
   verifyDeploymentOwner(leaf,expectedDeployer,nativeProtocol);if(nativeProtocol===MAINNET_BETA_PROFILE)assert.equal(preflight.expectedDeployer,String(expectedDeployer));assert.equal(preflight.initialLayoutVerified,true);assert.equal(preflight.publicEndpointsBound,true);assert.equal(preflight.oldFieldCount,0);assert.equal(preflight.oldSlotCount,0);
   for(const [actual,expected] of [['code_root','codeRoot'],['function_tree_root','functionTreeRoot'],['state_layout_root','layoutRoot'],['state_tree_height','stateTreeHeight'],['state_layout_field_count','newFieldCount'],['state_layout_slot_count','newSlotCount']])assert.equal(leaf[actual],preflight[expected],'deployed endpoint '+actual);
   const report={checkedAt:new Date().toISOString(),checkpoint:s.checkpoint,commonCheckpoint:s.checkpoint,receipt,contractId:id,leaf,preflight,requestSaved:true};
   save(join(attempt,'included.json'),report);return report;
  }
  await new Promise(r=>setTimeout(r,10000));
 }
 throw Error('deployment unresolved; preserve request and reconcile');
}
export async function confirmRegistration(config,userId,publicKeyHash){
 const c=read(config),url=c.networks[c.defaultNetwork].api_services_url[0].replace(/\/$/,'');
 const get=url=>retryRead(async()=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.ok(r.ok,'receipt HTTP');return r.json();});
 for(let i=0;i<120;i++){
  const list=await get(url+'/api/v1/get/user/transactions?user_id='+userId+'&limit=100&offset=0');assert.equal(list.success,true);assert.equal(list.data.user_id,userId);
  const e=list.data.items.find(e=>e.tx_type==='register_user'&&e.owner_user_id===userId&&e.result?.user_id===userId&&e.result?.public_key===publicKeyHash&&Number.isSafeInteger(e.included_checkpoint_id));
  if(e){const receipt=await get(url+'/api/v1/transaction/hash/'+e.content_hash),d=receipt.data;assert.equal(receipt.success,true);assert.equal(d.status,'included');assert.equal(d.content_hash,e.content_hash);assert.equal(d.included_checkpoint_id,e.included_checkpoint_id);assert.equal(d.result.user_id,userId);assert.equal(d.result.public_key,publicKeyHash);return {event:e,receipt};}
  await new Promise(r=>setTimeout(r,10000));
 }
 throw Error('registration receipt unresolved; do not register again');
}
