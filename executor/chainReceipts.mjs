import {readFile} from 'node:fs/promises';
import {reconcileSubmission} from '../bondingcurve/receiptCheck.mjs';
import {retryRead} from './readRetry.mjs';
// A submission returns an end-user leaf, not a services transaction hash.
// Confirm both the historical leaf and the indexed content-hash receipt.
export async function receiptReader(rpcConfig,{fetchImpl=fetch,maxPages=20}={}) {
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('receipt maxPages must be 1..100');
 const c=JSON.parse(await readFile(rpcConfig,'utf8'));
 const network=c.networks[c.defaultNetwork];
 if(!network?.api_services_url?.[0])throw Error('services URL missing');
 const get=(url,body)=>retryRead(async()=>{const r=await fetchImpl(url,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)}:{signal:AbortSignal.timeout(15000)});if(!r.ok){const error=Error(`HTTP ${r.status}`);error.status=r.status;throw error;}const v=await r.json();if(v.error)throw Error(JSON.stringify(v.error));return v;});
 return async({userId,endUserLeafHash,minCheckpoint=0})=>{
  if(!endUserLeafHash)return {status:'unresolved',reason:'no deterministic leaf recorded; operator reconciliation required'};
  if(!Number.isSafeInteger(userId)||userId<1||userId>=16777216||!(/^[0-9a-f]{64}$/i).test(endUserLeafHash))throw Error('invalid receipt identity');
  if(!Number.isSafeInteger(minCheckpoint)||minCheckpoint<0)throw Error('invalid receipt source checkpoint bound');
  const services=network.api_services_url[0].replace(/\/$/,'');
  const realm=network.realm_configs.find(x=>x.id===Math.floor(userId/network.users_per_realm));
  if(!realm?.rpc_url?.[0])throw Error('user realm missing');
  const seen=new Set(),pages=new Set(),leaves=new Map(),errors=[];
  for(let page=0;page<maxPages;page++){
   const listing=await get(services+'/api/v1/get/user/transactions?user_id='+userId+'&limit=100&offset='+page*100);
   const data=listing.data;
   if(listing.success!==true||!Array.isArray(data?.items)||data.items.length>100||
     (data.user_id!==undefined&&data.user_id!==userId))throw Error('invalid transaction listing');
   const signature=JSON.stringify(data.items);
   if(pages.has(signature))return {status:'unresolved',userId,endUserLeafHash,errors,reason:'transaction pagination did not advance'};
   pages.add(signature);
   const events=data.items.filter(event=>{
    if(!event||typeof event!=='object')return false;
    // A verified UPS source is a lower bound for its inclusion checkpoint.
    // Skip only impossible older candidates; retain full pagination, exact
    // historical leaf matching and content-hash receipt validation.
    if(minCheckpoint>0&&(!Number.isSafeInteger(event.included_checkpoint_id)||event.included_checkpoint_id<minCheckpoint))return false;
    const key=JSON.stringify([event.tx_type,event.owner_user_id,event.included_checkpoint_id,event.content_hash]);
    if(seen.has(key))return false;seen.add(key);return true;
   });
   const result=await reconcileSubmission({userId,endUserLeafHash,events,
    readUserLeafHash:async(checkpoint,id)=>{
     if(!leaves.has(checkpoint))leaves.set(checkpoint,get(realm.rpc_url[0],{jsonrpc:'2.0',id:1,method:'psy_get_user_tree_leaf_hash',params:{checkpoint_id:checkpoint,user_id:id}}).then(x=>x.result));
     return leaves.get(checkpoint);
    },readReceipt:hash=>get(services+'/api/v1/transaction/hash/'+hash)});
   if(result.status==='included')return result;
   errors.push(...result.errors);
   if(data.has_next===false||data.items.length<100)return {...result,errors};
  }
  // An exhausted history window is still ambiguous, never permission to retry.
  return {status:'unresolved',userId,endUserLeafHash,errors,reason:'receipt history page limit reached; increase receiptMaxPages or reconcile manually'};
 };
}
