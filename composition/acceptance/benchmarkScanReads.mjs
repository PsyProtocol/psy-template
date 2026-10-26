// Read-only historical RPC comparison. No wallet, key, proof or submission API.
import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';
import{executionModel,scanComposition}from'../execution.mjs';import{decodeDocument}from'../codec.mjs';import{COMPOSITION_SDK}from'../contract/runtimePolicy.mjs';
import{publicState}from'../../executor/publicState.mjs';import{decodeFeltSlot}from'../../orderbook/matcherCore.mjs';import{saveObservation}from'../../executor/observations.mjs';import{sha256}from'../../executor/requestBinding.mjs';import{losslessJson}from'../../amm/u124/client.mjs';
const[base,configFile,baselineFile,checkpointText,orderText='ABBA']=process.argv.slice(2);assert.ok(checkpointText);assert.ok(['ABBA','BAAB'].includes(orderText));
const order=[...orderText].map(x=>x==='A'?'baseline':'candidate');
const checkpoints=checkpointText.split(',').map(Number);assert.ok(checkpoints.length===2&&checkpoints.every(x=>Number.isSafeInteger(x)&&x>0));
// The archived financialHarness used options relative to its original cwd.
// This read-only tool explicitly follows that convention; the formal CLI's
// config-file-relative loader and original configuration are unchanged.
const json=p=>JSON.parse(readFileSync(p,'utf8')),doc=p=>decodeDocument(readFileSync(p,'utf8')),config=json(configFile);
assert.equal(config.sdkManifestHash,COMPOSITION_SDK);assert.equal(config.profile,'composition-funded-v1');
for(const name of ['intent','plan','policy','controllerAbi','tokenAbi','nativeAbi','rpcConfig'])config[name]=resolve(config[name]);config.marketAbis=config.marketAbis.map(p=>resolve(p));
const model=executionModel({intent:doc(config.intent),plan:doc(config.plan),policy:json(config.policy),controllerAbi:json(config.controllerAbi),tokenAbi:json(config.tokenAbi),nativeAbi:json(config.nativeAbi),marketAbis:config.marketAbis.map(json),controllerBudget:BigInt(config.controllerBudget),ownerFeeReserve:BigInt(config.ownerFeeReserve)});
const baseline=(await import(pathToFileURL(resolve(baselineFile)).href)).scanComposition,rows=[];
saveObservation(join(base,'public/SCAN-READ-PLAN-v1.json'),{at:new Date().toISOString(),checkpoints,order,trials:8,configResolution:'historical-acceptance-original-working-directory',workingDirectory:process.cwd(),sourceFiles:[baselineFile,resolve('composition/execution.mjs'),configFile].map(file=>({file,sha256:sha256(readFileSync(file))})),sdkManifestHash:config.sdkManifestHash,financialOperations:0,scope:'same two historical checkpoints and model; fresh per-trial leaf cache, unchanged global RPC limit; only application scan RPC, no proving or confirmation performance claim'});
for(const checkpoint of checkpoints)for(const selection of order){
 const reads=[],live=await publicState(config.rpcConfig,{observeRead:r=>reads.push(r)});assert.ok(checkpoint<=live.checkpoint);const cache=new Map();
 const state={...live,checkpoint,slot:async(user,contract,offset)=>{
  const realm=live.network.realm_configs.find(r=>r.id===Math.floor(user/live.network.users_per_realm));assert.ok(realm);const leaf=Math.floor(offset/4),key=`${user}:${contract}:${leaf}`;
  if(!cache.has(key))cache.set(key,live.rpc(realm.rpc_url[0],'psy_get_user_contract_state_tree_leaf_hash',{checkpoint_id:checkpoint,user_id:user,contract_id:contract,leaf_id:leaf}));
  return decodeFeltSlot(await cache.get(key),offset);
 }};
 const startedAt=new Date().toISOString(),start=performance.now(),readsBefore=reads.length;let ok=false;
 try{const scan=await(selection==='baseline'?baseline:scanComposition)(model,state);rows.push({selection,checkpoint,startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start,scanSha256:sha256(losslessJson(scan)),operation:scan.action?.operation??null,reason:scan.reason??null,reads:reads.slice(readsBefore)});ok=true;}
 finally{saveObservation(join(base,'public',`SCAN-READ-${rows.length}-${selection}-${checkpoint}-v1.json`),{ok,row:rows.at(-1)??null,scope:'read-only historical RPC; not an authenticated state proof'});}
}
for(const checkpoint of checkpoints){const rs=rows.filter(r=>r.checkpoint===checkpoint);assert.equal(new Set(rs.map(r=>r.scanSha256)).size,1,'baseline and candidate must return exactly the same action/eligibility');}
saveObservation(join(base,'public/SCAN-READ-COMPLETE-v1.json'),{rows,financialOperations:0,scope:'eight read-only historical ABBA scans; no SDK-internal reads, proof, broadcast, current-state spending authority or end-to-end settlement speedup measured'});
