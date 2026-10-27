// HTTP/observation tests use explicit mocks, never claim cryptographic verification.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createExactMarketTransport} from "./exactTransport.mjs";
import {canonical,digest} from "../protocol.mjs";
import {parseLosslessJson,losslessJson} from "../../amm/u124/client.mjs";
const H=x=>createHash("sha256").update(x).digest("hex");
async function fixture(reset=false){
 const dep={contract:{contractId:0,codeRoot:H("code"),layoutRoot:H("layout"),stateTreeHeight:32},functionTreeRoot:H("functions"),layoutFieldCount:0,layoutSlotCount:0};
 const network={magic:"1384803358401154921",users_per_realm:1048576,realm_configs:[{id:0,rpc_url:["https://realm.invalid"]}],coordinator_configs:[{id:0,rpc_url:["https://coordinator.invalid"]}],api_services_url:["https://services.invalid"]};
 const registry={nativeProtocol:"mainnet-beta-20261027",sdkManifestSha256:"06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f",network:{name:"testnet",magic:network.magic,usersPerRealm:1048576,chainRootAt1:H("genesis")},markets:[{marketId:1000,vaultId:100,publicKeyHash:H("vault"),dependencies:[dep]}]};
 if(reset){const {RESET_BETA_PROFILE,RESET_CHAIN_ROOT,RESET_NATIVE_BINDING}=await import('../nativeProtocol.mjs');registry.nativeProtocol=RESET_BETA_PROFILE;registry.network.chainRootAt1=RESET_CHAIN_ROOT;Object.assign(dep,structuredClone(RESET_NATIVE_BINDING));}
 const bundle={registry,registryHash:await digest(registry),networkConfig:network};
 const requestJson=losslessJson({user_ec_input:{core:{checkpoint_id:100,state_transition:{user_id:201,end_user_leaf_hash:H("end")}}},proof:[1,2,3]});
 const p={schema:2,userId:201,publicKeyHash:H("user"),startUserLeafHash:H("start"),walletNonce:"1",validUntilCheckpoint:164,actualFee:"1000000",requestJson,requestSha256:H(requestJson),contentHash:H("content"),registryHash:bundle.registryHash,networkHash:await digest(registry.network),sdkManifestSha256:registry.sdkManifestSha256,endUserLeafHash:H("end")};
 const record={registryHash:bundle.registryHash,plan:{marketId:1000,startCheckpoint:100,anchors:[{userId:201,contractId:0,root:H("state")}],sellerAnchors:[],debits:[{contractId:0,amount:"100"}],maxNetworkFee:"2000000"}};
 const state={sent:[],calls:[],included:false,drop:false,mutation:null};
 const respond=value=>({ok:true,text:async()=>losslessJson(value)});
 const fetcher=async(url,options={})=>{
  state.calls.push({url,options});
  if(options.body){const q=JSON.parse(options.body);if(q.method==="psy_submit_user_end_cap"){state.sent.push(options.body);if(state.drop)throw Error("connection lost after receive");return respond({result:p.endUserLeafHash});}
   let result;
   switch(q.method){
    case "psy_get_latest_l2_block_state":result={checkpoint_id:state.checkpoint??110};break;
    case "psy_get_checkpoint_leaf_data":result={global_chain_root:state.mutation==="network"?H("other chain"):registry.network.chainRootAt1};break;
    case "psy_get_contract_leaf_data":result={code_root:dep.contract.codeRoot,state_layout_root:state.mutation==="layout"?H("changed"):dep.contract.layoutRoot,state_tree_height:state.height??32,function_tree_root:dep.functionTreeRoot,state_layout_field_count:dep.layoutFieldCount,state_layout_slot_count:state.slots??dep.layoutSlotCount};break;
    case "psy_get_user_ids_for_public_key":result=[100];break;
    case "psy_get_user_leaf_data":result={public_key:p.publicKeyHash,user_id:201,nonce:state.mutation==="nonce"?2:state.included?1:0};break;
    case "psy_get_user_tree_leaf_hash":break;
    case "psy_get_user_contract_tree_leaf_hash":result=state.mutation==="state"?H("changed"):H("state");break;
    case "psy_get_user_contract_state_tree_leaf_hash":result=(state.mutation==="fees"?0n:1000000000000n).toString(16).padStart(64,"0");break;
    default:throw Error("unexpected public method "+q.method);
   }
   if(q.method==="psy_get_user_tree_leaf_hash") result=state.included?p.endUserLeafHash:p.startUserLeafHash;
   return respond({result});
  }
  if(url.includes("/get/user/transactions"))return respond({success:true,data:{items:state.included?[{tx_type:"user_endcap",owner_user_id:201,included_checkpoint_id:105,content_hash:state.mutation==="receipt"?H("unrelated"):p.contentHash}]:[],has_next:false}});
  if(url.includes("/transaction/hash/"))return respond({success:true,data:{status:"included",owner_user_id:201,included_checkpoint_id:105,content_hash:p.contentHash}});
  throw Error("unexpected fixed endpoint");
 };
 const transport=createExactMarketTransport({bundle,fetcher,parse:parseLosslessJson});
 return {bundle,p,record,state,transport};
}
test("fresh transport checks retain network/layout/state/nonce/fee gates",async()=>{
 const f=await fixture();assert.equal((await f.transport.recheck(f.record,f.p)).fullStateAndNonceVerified,true);
 for(const mutation of ["network","layout","state","nonce","fees"]){f.state.mutation=mutation;await assert.rejects(f.transport.recheck(f.record,f.p));assert.equal(f.state.sent.length,0);}
});
test("one call sends exact prepared bytes and ACK remains unconfirmed",async()=>{
 const f=await fixture();const ack=await f.transport.broadcastExact(f.p.requestJson,f.p.requestSha256);assert.equal(ack.confirmed,false);assert.equal(f.state.sent.length,1);assert.ok(f.state.sent[0].endsWith('"params":'+f.p.requestJson+'}'));
 await assert.rejects(f.transport.broadcastExact(f.p.requestJson+" ",f.p.requestSha256));assert.equal(f.state.sent.length,1);
});
test("dropped response has no transport retry; original receipt and historical endpoint both required",async()=>{
 const f=await fixture();f.state.drop=true;await assert.rejects(f.transport.broadcastExact(f.p.requestJson,f.p.requestSha256));assert.equal(f.state.sent.length,1);
 assert.equal((await f.transport.reconcile(f.p)).status,"unresolved");f.state.included=true;f.state.mutation="receipt";assert.equal((await f.transport.reconcile(f.p)).status,"unresolved");f.state.mutation=null;
 const receipt=await f.transport.reconcile(f.p);assert.equal(receipt.status,"included");assert.equal(receipt.contentHash,f.p.contentHash);assert.equal(f.state.sent.length,1);
});

test("reset transport accepts exact native slot count without relaxing checkpoint bounds",async()=>{
 const f=await fixture(true);
 for(const slots of [8594128984,"8594128984",8594128984n]){f.state.slots=slots;assert.equal((await f.transport.recheck(f.record,f.p)).fullStateAndNonceVerified,true);}
 for(const slots of [8594128985,9007199254740992,"9007199254740993",18446744073709551616n]){f.state.slots=slots;await assert.rejects(f.transport.recheck(f.record,f.p));}
 f.state.slots=8594128984;f.state.checkpoint=4294967296;await assert.rejects(f.transport.recheck(f.record,f.p));f.state.checkpoint=110;f.state.height=4294967296;await assert.rejects(f.transport.recheck(f.record,f.p));
 assert.equal(f.state.sent.length,0);
});
