import {readFile} from 'node:fs/promises';
import {decodeFeltSlot} from '../orderbook/matcherCore.mjs';
import {retryRead} from './readRetry.mjs';
import {withReadSlot,readTogether} from './readConcurrency.mjs';
export async function publicState(rpcConfig) {
 const config=JSON.parse(await readFile(rpcConfig,'utf8')),network=config.networks[config.defaultNetwork];
 if(!network||!Number.isSafeInteger(network.users_per_realm)||network.users_per_realm<1||!Array.isArray(network.realm_configs)||!network.realm_configs.length||!Array.isArray(network.coordinator_configs)||!network.coordinator_configs.length)throw Error('invalid public state network configuration');
 const realmIds=network.realm_configs.map(x=>x.id);if(realmIds.some(x=>!Number.isSafeInteger(x)||x<0)||new Set(realmIds).size!==realmIds.length)throw Error('invalid or duplicate realm ID');
 const bounded=(n,label,min=0)=>{if(!Number.isSafeInteger(n)||n<min||n>4294967295)throw Error('invalid '+label);return n;};
 const rpc=async(url,method,params)=>{if(!method.startsWith('psy_get_'))throw Error('read RPC methods only');return retryRead(()=>withReadSlot(async()=>{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});if(!response.ok){const error=Error(`HTTP ${response.status}`);error.status=response.status;throw error;}const v=await response.json();if(v.error)throw Error(JSON.stringify(v.error));return v.result;}));};
 const coordinator=network.coordinator_configs[0].rpc_url[0];
 const heads=await readTogether(network.realm_configs.map(x=>rpc(x.rpc_url[0],'psy_get_latest_l2_block_state',{})));
 if(heads.some(x=>!Number.isSafeInteger(x?.checkpoint_id)||x.checkpoint_id<1))throw Error('invalid realm checkpoint');
 const checkpoint=Math.min(...heads.map(x=>x.checkpoint_id));
 if(!Number.isSafeInteger(checkpoint)||checkpoint<1)throw Error('invalid checkpoint');
 const realm=id=>network.realm_configs.find(x=>x.id===Math.floor(id/network.users_per_realm))?.rpc_url[0];
 const cache=new Map();
 async function slot(userId,contractId,offset){bounded(userId,'user ID',1);bounded(contractId,'contract ID');bounded(offset,'slot offset');const url=realm(userId);if(!url)throw Error('unsupported user realm');const leaf=Math.floor(offset/4),key=`${userId}:${contractId}:${leaf}`;if(!cache.has(key))cache.set(key,rpc(url,'psy_get_user_contract_state_tree_leaf_hash',{checkpoint_id:checkpoint,user_id:userId,contract_id:contractId,leaf_id:leaf}));return decodeFeltSlot(await cache.get(key),offset);}
 async function fields(userId,contractId,abi,names){const state=abi.contract.state;const map=new Map(state.map(x=>[x.name,x.offset]));if(map.size!==state.length)throw Error('duplicate ABI field');
  for(const name of names)if(!map.has(name))throw Error(`ABI field missing: ${name}`);
  return Object.fromEntries(await readTogether(names.map(async name=>[name,await slot(userId,contractId,map.get(name))])));}
 return {networkName:config.defaultNetwork,network,checkpoint,heads,rpc,coordinator,slot,fields,
  contractLeaf:async id=>rpc(coordinator,'psy_get_contract_leaf_data',{contract_id:bounded(id,'contract ID')}),
  userIds:async hash=>{if(typeof hash!=='string'||!(/^[0-9a-f]{64}$/i).test(hash))throw Error('invalid public key hash');return rpc(coordinator,'psy_get_user_ids_for_public_key',[hash,0,64]);}};
}
