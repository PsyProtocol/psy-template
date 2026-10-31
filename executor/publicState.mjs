import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {publicReadFlight} from './readSingleFlight.mjs';
import {decodeFeltSlot} from '../orderbook/matcherCore.mjs';
import {parseLosslessJson,losslessJson} from '../amm/u124/client.mjs';
import {retryRead} from './readRetry.mjs';
import {withReadSlot,readTogether} from './readConcurrency.mjs';
import {checkpointHeads} from './checkpointHeads.mjs';
import {pendingContractMetadata} from './contractMetadataRead.mjs';
import {readBoundedUtf8,rpcEnvelope,discardResponse,RpcProtocolError} from '../market-client/rpcWire.mjs';
export async function publicState(rpcConfig,{observeRead,coalesceRead=true,fetchImpl=fetch}={}) {
 if(observeRead!==undefined&&typeof observeRead!=='function')throw Error('invalid read observer');
 if(typeof fetchImpl!=='function')throw Error('invalid public read transport');
 if(typeof coalesceRead!=='boolean')throw Error('invalid public read coalescing mode');
 const configBytes=await readFile(rpcConfig,'utf8'),domain=createHash('sha256').update(configBytes).digest('hex'),fetcher=fetchImpl,config=JSON.parse(configBytes),network=config.networks[config.defaultNetwork];
 if(!network||!Number.isSafeInteger(network.users_per_realm)||network.users_per_realm<1||!Array.isArray(network.realm_configs)||!network.realm_configs.length||!Array.isArray(network.coordinator_configs)||!network.coordinator_configs.length)throw Error('invalid public state network configuration');
 const realmIds=network.realm_configs.map(x=>x.id);if(realmIds.some(x=>!Number.isSafeInteger(x)||x<0)||new Set(realmIds).size!==realmIds.length)throw Error('invalid or duplicate realm ID');
 const endpoints=new Set([...network.realm_configs,...network.coordinator_configs].flatMap(x=>x.rpc_url));
 const bounded=(n,label,min=0)=>{if(!Number.isSafeInteger(n)||n<min||n>4294967295)throw Error('invalid '+label);return n;};
 let readMetricFailures=0;
 const rpc=async(url,method,params,{exactIntegers=false}={})=>{
  if(!method.startsWith('psy_get_'))throw Error('read RPC methods only');
  if(!endpoints.has(url))throw new RpcProtocolError('Unconfigured public RPC endpoint');
  const wireParams=structuredClone(params),body=losslessJson({jsonrpc:'2.0',id:1,method,params:wireParams});
  return retryRead(async()=>{
   const started=observeRead?performance.now():null,queuedAt=observeRead?new Date().toISOString():null;let failed=false,flight;
   try{
    flight=publicReadFlight(fetcher,{domain,endpoint:url,method,params:wireParams},timing=>withReadSlot(async()=>{timing.activeAt=performance.now();try{const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});if(response.status>=300&&response.status<400){discardResponse(response);throw new RpcProtocolError('Public read redirect rejected');}if(!response.ok){discardResponse(response);const error=Error(`HTTP ${response.status}`);error.status=response.status;throw error;}return await readBoundedUtf8(response,1048576);}finally{timing.endedAt=performance.now();}}),{enabled:coalesceRead});
    // Each consumer parses its own value. Amounts/metadata never share a
    // mutable object; exact-integer callers keep the lossless parser.
    const raw=await flight.promise,v=rpcEnvelope(exactIntegers?parseLosslessJson(raw):JSON.parse(raw));if(v.error)throw pendingContractMetadata(method,wireParams,v.error)??Error(losslessJson(v.error));return v.result;
   }catch(error){failed=true;throw error;}
   finally{if(observeRead)try{const activeAt=flight?.timing.activeAt,now=performance.now();await observeRead({schema:1,phase:'public-rpc-read',queuedAt,endpointHost:new URL(url).host,method,failed,coalesced:flight?.coalesced??false,physicalReadOwner:flight?!flight.coalesced:null,queueMilliseconds:activeAt===null||activeAt===undefined?null:Math.max(0,activeAt-started),rpcAndParseMilliseconds:activeAt===null||activeAt===undefined?null:now-Math.max(started,activeAt),phaseScope:'one logical public read attempt; identical simultaneous reads may share one physical transport. Completed reads are evicted; each consumer parses and validates independently. Includes queue/parse and excludes observer writes, not proof/confirmation time'});}catch{readMetricFailures++;}}

  });
 };
 const coordinator=network.coordinator_configs[0].rpc_url[0];
 const heads=await checkpointHeads(network.realm_configs,rpc,{onRecovery:row=>console.error('PSY_CHECKPOINT_READ_RECOVERY '+JSON.stringify(row))});
 if(heads.some(x=>!Number.isSafeInteger(x?.checkpoint_id)||x.checkpoint_id<1))throw Error('invalid realm checkpoint');
 const checkpoint=Math.min(...heads.map(x=>x.checkpoint_id));
 if(!Number.isSafeInteger(checkpoint)||checkpoint<1)throw Error('invalid checkpoint');
 const realm=id=>network.realm_configs.find(x=>x.id===Math.floor(id/network.users_per_realm))?.rpc_url[0];
 const cache=new Map();
 async function slot(userId,contractId,offset){bounded(userId,'user ID',1);bounded(contractId,'contract ID');bounded(offset,'slot offset');const url=realm(userId);if(!url)throw Error('unsupported user realm');const leaf=Math.floor(offset/4),key=`${userId}:${contractId}:${leaf}`;if(!cache.has(key))cache.set(key,rpc(url,'psy_get_user_contract_state_tree_leaf_hash',{checkpoint_id:checkpoint,user_id:userId,contract_id:contractId,leaf_id:leaf}));return decodeFeltSlot(await cache.get(key),offset);}
 async function fields(userId,contractId,abi,names){const state=abi.contract.state;const map=new Map(state.map(x=>[x.name,x.offset]));if(map.size!==state.length)throw Error('duplicate ABI field');
  for(const name of names)if(!map.has(name))throw Error(`ABI field missing: ${name}`);
  return Object.fromEntries(await readTogether(names.map(async name=>[name,await slot(userId,contractId,map.get(name))])));}
 return {networkName:config.defaultNetwork,network,checkpoint,heads,rpc,coordinator,slot,fields,get readMetricFailures(){return readMetricFailures;},
  contractStateRoot:async(userId,contractId)=>{bounded(userId,'user ID',1);bounded(contractId,'contract ID');const url=realm(userId);if(!url)throw Error('unsupported user realm');const key=`root:${userId}:${contractId}`;if(!cache.has(key))cache.set(key,rpc(url,'psy_get_user_contract_tree_leaf_hash',{checkpoint_id:checkpoint,user_id:userId,contract_id:contractId}));const root=await cache.get(key);if(typeof root!=='string'||!/^[0-9a-fA-F]{64}$/.test(root))throw Error('invalid user contract root');return root.toLowerCase();},
  contractLeaf:async id=>rpc(coordinator,'psy_get_contract_leaf_data',{contract_id:bounded(id,'contract ID')}),
  userIds:async hash=>{if(typeof hash!=='string'||!(/^[0-9a-f]{64}$/i).test(hash))throw Error('invalid public key hash');return rpc(coordinator,'psy_get_user_ids_for_public_key',[hash,0,64]);}};
}
