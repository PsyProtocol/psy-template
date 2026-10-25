import {readFile} from 'node:fs/promises';
import {reconcileSubmission} from '../bondingcurve/receiptCheck.mjs';
import {retryRead} from './readRetry.mjs';
import {withReadSlot} from './readConcurrency.mjs';
// A submission returns an end-user leaf, not a services transaction hash.
// Confirm both the historical leaf and the indexed content-hash receipt.
export async function receiptReader(rpcConfig,{fetchImpl=fetch,maxPages=20,historyConcurrency=4,observeRead}={}) {
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('receipt maxPages must be 1..100');
 if(![1,4].includes(historyConcurrency))throw Error('reviewed receipt history concurrency is 1 or 4');
 if(observeRead!==undefined&&typeof observeRead!=='function')throw Error('invalid receipt observer');
 const c=JSON.parse(await readFile(rpcConfig,'utf8'));
 const network=c.networks[c.defaultNetwork];
 if(!network?.api_services_url?.[0])throw Error('services URL missing');
 const get=(url,body)=>retryRead(async()=>withReadSlot(async()=>{const start=performance.now();let failed=true;try{const r=await fetchImpl(url,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)}:{signal:AbortSignal.timeout(15000)});if(!r.ok){const error=Error(`HTTP ${r.status}`);error.status=r.status;throw error;}const v=await r.json();if(v.error)throw Error(JSON.stringify(v.error));failed=false;return v;}finally{if(observeRead)await observeRead({at:new Date().toISOString(),method:body?.method??(url.includes('/get/user/transactions')?'services-list':'services-receipt'),milliseconds:performance.now()-start,failed});}}));
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
   let result={status:'unresolved',userId,endUserLeafHash,errors:[]};
   for(let begin=0;begin<events.length;begin+=historyConcurrency){
   const chunk=events.slice(begin,begin+historyConcurrency);
   // Preload only immutable historical candidates, with the same filters as
   // reconcileSubmission. Drain the complete bounded chunk before accepting
   // any result. Each invocation starts fresh: no negative-state cache across
   // polls and no inferred rejection / permission to submit a replacement.
   await Promise.all(chunk.filter(e=>e.tx_type==='user_endcap'&&e.owner_user_id===userId&&
    Number.isSafeInteger(e.included_checkpoint_id)&&e.included_checkpoint_id>=1&&/^[0-9a-f]{64}$/i.test(e.content_hash??'')).map(async e=>{
     const cp=e.included_checkpoint_id;
     if(!leaves.has(cp))leaves.set(cp,get(realm.rpc_url[0],{jsonrpc:'2.0',id:1,method:'psy_get_user_tree_leaf_hash',params:{checkpoint_id:cp,user_id:userId}}).then(x=>({value:x.result}),()=>({unavailable:true})));
     await leaves.get(cp);
   }));
   result=await reconcileSubmission({userId,endUserLeafHash,events:chunk,
    readUserLeafHash:async(checkpoint,id)=>{
     const read=await leaves.get(checkpoint);if(read?.unavailable)throw Error('historical state unavailable');return read?.value;
    },readReceipt:hash=>get(services+'/api/v1/transaction/hash/'+hash)});
   if(result.status==='included')return result;
   errors.push(...result.errors);
   }
   if(data.has_next===false||data.items.length<100)return {...result,errors};
  }
  // An exhausted history window is still ambiguous, never permission to retry.
  return {status:'unresolved',userId,endUserLeafHash,errors,reason:'receipt history page limit reached; increase receiptMaxPages or reconcile manually'};
 };
}
