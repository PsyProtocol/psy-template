import {readFile} from 'node:fs/promises';
import {decodeFeltSlot} from '../orderbook/matcherCore.mjs';
import {retryRead} from './readRetry.mjs';
export async function publicState(rpcConfig) {
 const config=JSON.parse(await readFile(rpcConfig,'utf8')),network=config.networks[config.defaultNetwork];
 const rpc=async(url,method,params)=>{if(!method.startsWith('psy_get_'))throw Error('read RPC methods only');return retryRead(async()=>{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});if(!response.ok){const error=Error(`HTTP ${response.status}`);error.status=response.status;throw error;}const v=await response.json();if(v.error)throw Error(JSON.stringify(v.error));return v.result;});};
 const coordinator=network.coordinator_configs[0].rpc_url[0];
 const heads=await Promise.all(network.realm_configs.map(x=>rpc(x.rpc_url[0],'psy_get_latest_l2_block_state',{})));
 const checkpoint=Math.min(...heads.map(x=>x.checkpoint_id));
 if(!Number.isSafeInteger(checkpoint)||checkpoint<1)throw Error('invalid checkpoint');
 const realm=id=>network.realm_configs.find(x=>x.id===Math.floor(id/network.users_per_realm))?.rpc_url[0];
 const cache=new Map();
 async function slot(userId,contractId,offset){const url=realm(userId);if(!url)throw Error('unsupported user realm');const leaf=Math.floor(offset/4),key=`${userId}:${contractId}:${leaf}`;if(!cache.has(key))cache.set(key,rpc(url,'psy_get_user_contract_state_tree_leaf_hash',{checkpoint_id:checkpoint,user_id:userId,contract_id:contractId,leaf_id:leaf}));return decodeFeltSlot(await cache.get(key),offset);}
 async function fields(userId,contractId,abi,names){const map=new Map(abi.contract.state.map(x=>[x.name,x.offset]));const out={};
  for(let i=0;i<names.length;i+=4)await Promise.all(names.slice(i,i+4).map(async name=>{if(!map.has(name))throw Error(`ABI field missing: ${name}`);out[name]=await slot(userId,contractId,map.get(name));}));return out;}
 return {networkName:config.defaultNetwork,network,checkpoint,heads,rpc,coordinator,slot,fields,
  contractLeaf:async id=>rpc(coordinator,'psy_get_contract_leaf_data',{contract_id:id}),
  userIds:async hash=>rpc(coordinator,'psy_get_user_ids_for_public_key',[hash,0,64])};
}
