// Unit-only RPC stand-in with real archived ABI shapes, NOT deployed identities
// or authenticated state. Full bytecode/UPS and network gates stay separate.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {sha256} from '../executor/requestBinding.mjs';
import {compositionDomain} from './domain.mjs';
import {createRegistry,createIntent,planIntent} from './intent.mjs';import {fundsPolicy} from './contract/policy.mjs';import {runtimePolicy,COMPOSITION_SDK,COMPOSITION_MAGIC} from './contract/runtimePolicy.mjs';import {executionModel} from './execution.mjs';import {publicKeyFelts} from './funding.mjs';import {encodeAmount} from '../amm/u124/client.mjs';
const archive=new URL('../executor/verification/2026-10-23-funded-composition-v1/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',archive),'utf8'));
function abi(source){const r=manifest.records.find(r=>r.source===source);assert.ok(r);const gzip=readFileSync(new URL(r.file,archive));assert.equal(sha256(gzip),r.gzipSha256);const raw=gunzipSync(gzip);assert.equal(sha256(raw),r.sha256);return JSON.parse(raw).abi;}
export function executionFixture(){
 const controllerAbi=abi('fixture/compiled/compilation_artifact.json'),tokenAbi=abi('fixture/token.json'),nativeAbi=abi('fixture/native.json'),ammAbi=abi('fixture/amm.json'),root='a'.repeat(64),F=1000100000n;
 const dep=contractId=>({contractId,codeRoot:root,layoutRoot:root,functionTreeRoot:root,stateTreeHeight:contractId===0n?32n:31n,layoutFieldCount:1n,layoutSlotCount:100n});
 const market=(marketId,vaultId,key)=>({kind:'amm',marketId,vaultId,fingerprint:root,publicKeyHash:key.repeat(64),assets:[{id:42n,decimals:18},{id:43n,decimals:18}],dependencies:[0n,marketId,42n,43n].map(dep)});
 const network={magic:String(COMPOSITION_MAGIC),users_per_realm:1048576,realm_configs:[{id:0,rpc_url:['https://test.invalid']}],coordinator_configs:[{id:0,rpc_url:['https://coordinator.invalid']}]},domainHash=compositionDomain('sepolia',network);
 const registry=createRegistry({domainHash,sdkManifestHash:COMPOSITION_SDK,markets:[market(1000n,300n,'1'),market(1001n,400n,'2')]}),intent=createIntent({version:1,domainHash,sdkManifestHash:COMPOSITION_SDK,registryHash:registry.hash,owner:200n,receiver:200n,nonce:1n,expiresAtCheckpoint:500n,maxNativeFees:26n*F,input:{id:42n,decimals:18,amount:(1n<<62n)+17n},output:{id:42n,decimals:18,amount:1n},markets:[1000n,1001n],execution:{controllerId:1002n,vaultId:100n,fingerprint:root,publicKeyHash:'3'.repeat(64),...Object.fromEntries(Object.entries(dep(1002n)).filter(([k])=>k!=='contractId'))}});
 const plan=planIntent({intent,registry,checkpoint:100n,snapshots:[1000n,1001n].map((marketId,i)=>({marketId,vaultId:i?400n:300n,checkpoint:100n,stateRoot:root,reserveA:20n*10n**18n,reserveB:20n*10n**18n}))}),marketAbis=[ammAbi,ammAbi],policy=runtimePolicy(fundsPolicy({controllerId:1002,controllerAbi,assetA:42,assetB:43,tokenAbi,nativeAbi,markets:[{id:1000,vault:300,abi:ammAbi},{id:1001,vault:400,abi:ammAbi}],registryHash:registry.hash}));
 const model=executionModel({intent,plan,policy,controllerAbi,tokenAbi,nativeAbi,marketAbis,controllerBudget:20n*F,ownerFeeReserve:6n*F}),values=new Map();
 const put=(u,c,i,v)=>values.set(`${u}:${c}:${i}`,BigInt(v)),get=(u,c,i)=>values.get(`${u}:${c}:${i}`)??0n;
 const field=(u,n,v,i=0,c=1002)=>{const abi=c===1002?controllerAbi:ammAbi,f=abi.contract.state.find(f=>f.name===n);assert.ok(f,n);put(u,c,f.offset+i,v);};
 const wide=(u,n,v,c=1002)=>{const p=encodeAmount(v);field(u,n,p[0],0,c);field(u,n,p[1],1,c);};
 for(const[n,v]of Object.entries({request_funded:1,request_vault:100,request_nonce:1,request_expiry:500,request_budget:20n*F}))field(200,n,v);
 wide(200,'request_input',intent.terms.input.amount);wide(200,'request_mid',plan.steps[0].output);wide(200,'request_final',1n);publicKeyFelts(intent.terms.execution.publicKeyHash).forEach((v,i)=>field(200,'request_key',v,i));
 const funded=()=>{for(const[n,v]of Object.entries({owner:200,intent_nonce:1,phase:2,expiry:500,native_expected:19n*F}))field(100,n,v);put(100,0,0,19n*F);wide(100,'input',intent.terms.input.amount);wide(100,'minimum_mid',plan.steps[0].output);wide(100,'minimum_final',1n);const p=encodeAmount(intent.terms.input.amount);put(100,42,0,p[0]);put(100,42,1,p[1]);};
 const dependencies=new Map(registry.value.markets.flatMap(m=>m.dependencies).map(d=>[Number(d.contractId),d]));dependencies.set(1002,dep(1002n));
 const state={networkName:'sepolia',network,checkpoint:100,slot:async(u,c,i)=>get(u,c,i),userIds:async hash=>hash==='1'.repeat(64)?[300]:hash==='2'.repeat(64)?[400]:hash==='3'.repeat(64)?[100]:[],contractLeaf:async id=>{const d=dependencies.get(id);assert.ok(d);return{code_root:d.codeRoot,state_layout_root:d.layoutRoot,state_tree_height:Number(d.stateTreeHeight),function_tree_root:d.functionTreeRoot,state_layout_field_count:Number(d.layoutFieldCount),state_layout_slot_count:Number(d.layoutSlotCount)};},rpc:async(_url,method)=>method==='psy_get_user_leaf_data'?{nonce:0n,public_key:intent.terms.execution.publicKeyHash}:'f'.repeat(64)};
 return{model,state,values,field,wide,put,get,funded,dependencies};
}
