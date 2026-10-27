// Fresh chain-instance observation before starting expensive preparation. This
// is an RPC observation, not runtime attestation or proof of chain finality.
import {hashPattern} from '../protocol.mjs';
const ok=(value,message)=>{if(!value)throw Error(message);};
export function createMarketChainGuard({bundle,fetcher=fetch}){
 const expected=bundle.registry.network.chainRootAt1;
 ok(hashPattern.test(expected??''),'Reviewed chain-instance anchor required');
 const url=bundle.networkConfig.coordinator_configs[0].rpc_url[0];
 let pending;
 return async()=>{
  // Coalesce only a currently running identical observation. No completed
  // response can survive a reset or be reused for another preparation.
  if(pending)return pending;
  const task=(async()=>{
   const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'psy_get_checkpoint_leaf_data',params:{checkpoint_id:1}}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
   ok(response.ok,'Chain-instance observation unavailable');
   const text=await response.text();ok(text.length<=65536,'Chain-instance response limit');
   const observed=JSON.parse(text);
   ok(observed.jsonrpc==='2.0'&&observed.id===1&&!observed.error&&hashPattern.test(observed.result?.global_chain_root??''),'Invalid chain-instance response');
   ok(observed.result.global_chain_root===expected,'Reviewed chain instance changed; preserve original requests and stop');
   return {chainRootAt1:expected,scope:'fresh RPC observation only'};
  })();
  pending=task;
  try{return await task;}finally{if(pending===task)pending=undefined;}
 };
}
