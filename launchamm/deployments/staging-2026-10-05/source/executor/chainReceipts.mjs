import {readFile} from 'node:fs/promises';
import {reconcileSubmission} from '../bondingcurve/receiptCheck.mjs';
import {retryRead} from './readRetry.mjs';
// A submission returns an end-user leaf, not a services transaction hash.
// Confirm both the historical leaf and the indexed content-hash receipt.
export async function receiptReader(rpcConfig) {
 const c=JSON.parse(await readFile(rpcConfig,'utf8'));
 const network=c.networks[c.defaultNetwork];
 if(!network?.api_services_url?.[0])throw Error('services URL missing');
 const get=(url,body)=>retryRead(async()=>{const r=await fetch(url,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)}:{signal:AbortSignal.timeout(15000)});if(!r.ok){const error=Error(`HTTP ${r.status}`);error.status=r.status;throw error;}const v=await r.json();if(v.error)throw Error(JSON.stringify(v.error));return v;});
 return async({userId,endUserLeafHash})=>{
  if(!endUserLeafHash)return {status:'unresolved',reason:'no deterministic leaf recorded; operator reconciliation required'};
  const services=network.api_services_url[0].replace(/\/$/,'');
  const listing=await get(services+'/api/v1/get/user/transactions?user_id='+userId+'&limit=100');
  if(!listing.success)throw Error('transaction listing unavailable');
  const realm=network.realm_configs.find(x=>x.id===Math.floor(userId/network.users_per_realm));
  if(!realm?.rpc_url?.[0])throw Error('user realm missing');
  return reconcileSubmission({userId,endUserLeafHash,events:listing.data.items,
   readUserLeafHash:async(checkpoint,id)=>(await get(realm.rpc_url[0],{jsonrpc:'2.0',id:1,method:'psy_get_user_tree_leaf_hash',params:{checkpoint_id:checkpoint,user_id:id}})).result,
   readReceipt:hash=>get(services+'/api/v1/transaction/hash/'+hash)});
 };
}
