// Compiled, registered SD-key fingerprints bind these exact call templates.
// Witness: branch,payer,peer,xlo,xhi,ylo,yhi,zlo,zhi,lots,nonce,peerNonce,burnFee.
import {FEE_ESCROW,integer,user} from './client.mjs';
const w=index=>({witness:index}),k=value=>({constant:String(value)});
export function makePolicy(market,marketId,config,abi,tokenAbi){
 const id=name=>{const m=abi.contract.methods.find(m=>m.name===name);if(!m)throw Error(`missing market ${name}`);return m;};
 const tokenId=name=>{const m=tokenAbi.contract.methods.find(m=>m.name===name);if(!m)throw Error(`missing Token ${name}`);return m;};
 const invoke=(contract,method,inputs)=>({contract_id:contract,method_id:method.method_id,method_name:method.name,inputs});
 const guard=(name,inputs)=>invoke(marketId,id(name),inputs);
 const t=(asset,name,inputs)=>invoke(asset,tokenId(name),inputs);
 const native=(name,inputs)=>invoke(0,{name,method_id:{simple_claim:2293029357,simple_transfer:354447671,simple_burn:2923993647}[name]},inputs);
 const fee=p=>native('simple_claim',[p]),claim=(asset,p)=>t(asset,'claim',[p]),transfer=(asset,p,a)=>t(asset,'transfer',[p,...a]);
 const p=w(1),peer=w(2),x=[w(3),w(4)],y=[w(5),w(6)],z=[w(7),w(8)],lots=w(9),nonce=w(10),peerNonce=w(11),a=config.assetA,b=config.assetB;
 const branches=[];const add=(name,calls)=>{while(calls.length<8)calls.push(guard('noop',[]));if(calls.length!==8)throw Error('stack overflow');calls.push(native('simple_burn',[w(12)]));branches.push({branch:branches.length+1,name,calls});};
 if(market==='amm'){
  add('swap_0',[guard('swap_0',[p,...x,...y,nonce]),fee(p),claim(a,p),transfer(b,p,y)]);
  add('swap_1',[guard('swap_1',[p,...x,...y,nonce]),fee(p),claim(b,p),transfer(a,p,y)]);
  add('refund_swap_0',[guard('refund_swap_0',[p,...x,nonce]),fee(p),claim(a,p),transfer(a,p,x)]);
  add('refund_swap_1',[guard('refund_swap_1',[p,...x,nonce]),fee(p),claim(b,p),transfer(b,p,x)]);
  add('add_liquidity',[guard('add_liquidity',[p,...x,...y,...z,nonce]),fee(p),claim(a,p),claim(b,p)]);
  add('remove_liquidity',[guard('remove_liquidity',[p,...x,...y,...z,nonce]),fee(p),transfer(a,p,y),transfer(b,p,z)]);
  add('refund_add',[guard('refund_add',[p,...x,...y,nonce]),fee(p),claim(a,p),claim(b,p),transfer(a,p,x),transfer(b,p,y)]);
  add('cancel_remove',[guard('cancel_remove',[p,nonce]),fee(p)]);
 }else if(market==='orderbook'){
  add('match_orders',[guard('match_orders',[p,peer,...x,...y,nonce,peerNonce]),fee(p),fee(peer),claim(a,p),claim(b,peer),transfer(a,peer,x),transfer(b,p,y),native('simple_transfer',[peer,k(FEE_ESCROW)])]);
  for(const[side,asset]of[[0,a],[1,b]])add(`cancel_${side}`,[guard(`cancel_${side}`,[p,...x,nonce]),fee(p),claim(asset,p),transfer(asset,p,x)]);
 }else if(market==='bondingcurve'){
  const issuer=k(config.issuer),target=k(config.target);
  add('initialize',[guard('initialize',[]),fee(issuer),claim(a,issuer)]);
  add('settle_buy',[guard('settle_buy',[p,lots,...x,...y,nonce]),fee(p),claim(b,p),transfer(a,p,y)]);
  add('settle_sell',[guard('settle_sell',[p,lots,...x,...y,nonce]),fee(p),claim(a,p),transfer(b,p,x)]);
  add('refund_buy',[guard('refund_buy',[p,lots,...x,nonce]),fee(p),claim(b,p),transfer(b,p,x)]);
  add('refund_sell',[guard('refund_sell',[p,lots,...y,nonce]),fee(p),claim(a,p),transfer(a,p,y)]);
  if(config.bootstrap){
   const boot=config.bootstrap;
   if(boot.ammVaultId!==config.target||boot.funderId===config.issuer)throw Error('bootstrap roles');
   // The curve vault becomes the fixed payer of one AMM seed order. LP stays
   // in this public account; its fingerprint exposes no LP withdrawal branch.
   const open=invoke(boot.ammContractId,{name:'open_add',method_id:boot.openAddMethodId},[target,...y,...x,k(1),k(0),k(4294967295),k(1)]);
   add('graduate',[guard('graduate',[target,...x,...y]),fee(issuer),fee(k(boot.funderId)),transfer(b,target,x),transfer(a,target,y),native('simple_transfer',[target,k(FEE_ESCROW)]),open]);
  }else add('graduate',[guard('graduate',[target,...x,...y]),fee(issuer),transfer(b,target,x),transfer(a,target,y)]);
 }else throw Error('unknown market');
 for(const branch of branches)for(const c of branch.calls)if(c.contract_id===marketId && c.inputs.length!==id(c.method_name).input_felt_count)throw Error('market policy arity');
 return {version:1,market,market_id:marketId,asset_a:a,asset_b:b,witness_length:13,tx_count:9,fee_min:'1000000000',fee_max:String(FEE_ESCROW),branches,...(market==='bondingcurve'&&config.bootstrap?{bootstrap:config.bootstrap}:{})};
}
export function operationCalls(policy,fields){if(!Array.isArray(fields)||fields.length!==13)throw Error('13 witness fields required');fields.forEach(x=>integer(x,(1n<<62n)-1n));user(fields[1]);const branch=policy.branches.find(b=>BigInt(b.branch)===fields[0]);if(!branch)throw Error('unknown branch');if(fields[12]<1000000000n||fields[12]>FEE_ESCROW||fields[12]%1000n)throw Error('invalid burn fee');return branch.calls.map(c=>({contract_id:BigInt(c.contract_id),method_id:BigInt(c.method_id),method_name:c.method_name,inputs:c.inputs.map(v=>v.witness===undefined?BigInt(v.constant):fields[v.witness])}));}
export function signingRequest(policy,fields){const supplied=[...fields];if(supplied[12]===0n)supplied[12]=1000000000n;const calls=operationCalls(policy,supplied);return {contract_calls:calls.slice(0,8).map(({contract_id,method_name,inputs})=>({contract_id,method_name,inputs})),software_defined_call:{inputs:[...fields]}};}
