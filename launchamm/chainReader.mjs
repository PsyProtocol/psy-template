import {readFile} from 'node:fs/promises';
import {publicState} from '../executor/publicState.mjs';
import {mapReads,readTogether} from '../executor/readConcurrency.mjs';
import {createPoolCalls} from './operationCalls.mjs';
import {proposePoolAction} from './planner.mjs';
export async function scanPool(options,readState=publicState) {
 const state=await readState(options.rpcConfig),abi=JSON.parse(await readFile(options.abi,'utf8'));
 const fields=new Map(abi.contract.state.map(x=>[x.name,x.offset])),c=options.pool;
 const field=(user,name,index=0)=>state.slot(user,c.poolContractId,fields.get(name)+index);
 const p=await state.fields(c.poolUserId,c.poolContractId,abi,['phase','reserve_psy','reserve_token','total_shares']);
 const pool={phase:p.phase,reservePsy:p.reserve_psy,reserveToken:p.reserve_token,totalShares:p.total_shares};
 if(pool.phase===0n&&options.launch){
  const source=await state.fields(c.curveVaultId,c.curveContractId,abi,['phase','sold_lots','graduation_target','token_contract_id','issuer_user']);
  if(source.phase===2n&&source.graduation_target===BigInt(c.poolUserId)&&source.token_contract_id===BigInt(c.tokenId)&&source.issuer_user===BigInt(c.issuerId)){
   const submission=createPoolCalls(c).seedFromCurveCalls({launch:options.launch,soldLots:Number(source.sold_lots)});
   const [x,y]=submission.contract_calls[0].inputs.slice(6,8);
   const psy=await state.slot(c.curveVaultId,0,3+c.poolUserId*2),token=await state.slot(c.curveVaultId,c.tokenId,3+c.poolUserId*2),fee=await state.slot(c.issuerId,0,3+c.poolUserId*2);
   if(psy===BigInt(x)*BigInt(c.psyUnit)&&token===BigInt(y)*BigInt(c.tokenUnit)&&fee===1000100000n)return {checkpoint:state.checkpoint,pool,action:{kind:'seed',submission}};
  }
  return {checkpoint:state.checkpoint,pool,action:null};
 }
 const orders=await mapReads(options.users,async payerId=>{
  const a=await state.fields(payerId,c.poolContractId,abi,['order_kind','order_vault_user','order_asset','order_amount_psy','order_amount_token','order_min_out','order_deadline','order_nonce','order_shares','order_min_psy','order_min_token']);
  const o={payerId,kind:a.order_kind,pool:a.order_vault_user,asset:a.order_asset,amountPsy:a.order_amount_psy,amountToken:a.order_amount_token,minOut:a.order_min_out,deadline:a.order_deadline,nonce:a.order_nonce,shares:a.order_shares,minPsy:a.order_min_psy,minToken:a.order_min_token};
  [o.consumedNonce,o.ownedShares,o.settledPsy,o.settledToken,o.sentPsy,o.sentToken]=await readTogether([
   field(c.poolUserId,'consumed_nonce',payerId),field(c.poolUserId,'shares',payerId),field(c.poolUserId,'settled_psy_sent',payerId),field(c.poolUserId,'settled_token_sent',payerId),
   state.slot(payerId,0,3+c.poolUserId*2),state.slot(payerId,c.tokenId,3+c.poolUserId*2)]);
  return o;
 });
 return {checkpoint:state.checkpoint,pool,orders,action:proposePoolAction({config:c,pool,orders,checkpoint:state.checkpoint})};
}
