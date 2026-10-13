import {publicState} from '../publicState.mjs';
export async function captureBalances(rpcConfig){
 const state=await publicState(rpcConfig),ids=[1882112,1283072,861696,499200,591872];
 const result={checkpoint:state.checkpoint,users:{},pending:[],totals:{}};
 for(const id of ids)result.users[id]={psy:String(await state.slot(id,0,0)),pusdt:String(await state.slot(id,4,0))};
 for(const [asset,name] of [[0,'psy'],[4,'pusdt']]){
  let total=ids.reduce((n,id)=>n+BigInt(result.users[id][name]),0n);
  for(const sender of ids)for(const recipient of ids){
   if(sender===recipient)continue;
   const sent=await state.slot(sender,asset,3+2*recipient),claimed=await state.slot(recipient,asset,4+2*sender);
   if(claimed>sent)throw Error('claim cursor ahead of Outbox');
   if(sent>claimed){total+=sent-claimed;result.pending.push({sender,recipient,asset,amount:String(sent-claimed)});}
  }
  result.totals[name]=String(total);
 }
 return result;
}
