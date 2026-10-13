import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {mapReads,readTogether} from './readConcurrency.mjs';
import {publicState} from './publicState.mjs';
import {validateConfig} from '../amm/u124/build.mjs';
import {decodeAmount,encodeAmount,losslessJson,swapQuote,initialShares,addShares,withdraw,curveQuote,matchBook,FEE_ESCROW} from '../amm/u124/client.mjs';
import {signingRequest} from '../amm/u124/policy.mjs';
const MAX=(1n<<124n)-1n;
const positive=x=>typeof x==='bigint'&&x>0n&&x<=MAX;
const cumulative=(sold,c)=>BigInt(c.base)*sold+BigInt(c.step)*sold*(sold-1n)/2n;

export function proposeU124Action({kind,vaultId,policy,config,pool,orders,checkpoint,issuer,automaticInitialize=false,automaticGraduation=false}){
 const task=(name,o={},amounts={})=>{
  const b=policy.branches.find(b=>b.name===name);if(!b)throw Error(`policy branch missing: ${name}`);
  const {x=0n,y=0n,z=0n,lots=0n}=amounts;
  const fields=[BigInt(b.branch),BigInt(o.payerId??config.issuer),BigInt(o.peerId??0),...encodeAmount(x),...encodeAmount(y),...encodeAmount(z),lots,o.nonce??0n,o.peerNonce??0n,0n];
  return {kind:name,submission:losslessJson(signingRequest(policy,fields))};
 };
 const active=orders.filter(o=>o.pool===BigInt(vaultId)&&o.nonce>o.consumed&&o.nonce>0n&&o.feeDelta===FEE_ESCROW);
 if(kind==='amm'){
  for(const o of active){
   if(o.kind===1n&&[0n,1n].includes(o.side)&&positive(o.x)&&positive(o.y)&&o[o.side===0n?'aDelta':'bDelta']===o.x){
    if(o.deadline>=BigInt(checkpoint))try{
     const output=swapQuote(o.x,o.side===0n?pool.reserve_a:pool.reserve_b,o.side===0n?pool.reserve_b:pool.reserve_a);
     if(output>=o.y&&positive(output))return task(`swap_${o.side}`,o,{x:o.x,y:output});
    }catch(error){if(!(error instanceof RangeError)&&!['empty swap'].includes(error.message))throw error;}
    return task(`refund_swap_${o.side}`,o,{x:o.x});
   }
   if(o.kind===2n&&positive(o.x)&&positive(o.y)&&positive(o.z)&&o.aDelta===o.x&&o.bDelta===o.y){
    if(o.deadline>=BigInt(checkpoint))try{
     const minted=pool.total_shares===0n?initialShares(o.x,o.y):addShares(o.x,o.y,pool.reserve_a,pool.reserve_b,pool.total_shares);
     if(pool.total_shares===0n)assert.equal(pool.reserve_a+pool.reserve_b,0n,'uninitialized AMM reserves');
     if(minted>=o.z)return task('add_liquidity',o,{x:o.x,y:o.y,z:minted});
    }catch(error){if(!(error instanceof RangeError)&&!['initial liquidity too small','deposit ratio mismatch','empty liquidity','unequal share floors'].includes(error.message))throw error;}
    return task('refund_add',o,{x:o.x,y:o.y});
   }
   if(o.kind===3n&&positive(o.x)){
    if(o.deadline>=BigInt(checkpoint))try{
     const amount=withdraw(o.x,pool.reserve_a,pool.reserve_b,pool.total_shares,o.ownedShares);
     if(amount.a>=o.y&&amount.b>=o.z)return task('remove_liquidity',o,{x:o.x,y:amount.a,z:amount.b});
    }catch(error){if(!(error instanceof RangeError)&&!['invalid shares','dust withdrawal'].includes(error.message))throw error;}
    return task('cancel_remove',o);
   }
  }
 }else if(kind==='orderbook'){
  const funded=active.filter(o=>o.kind===1n&&[0n,1n].includes(o.side)&&positive(o.x)&&positive(o.y)&&o[o.side===0n?'aDelta':'bDelta']===o.x);
  const live=funded.filter(o=>o.deadline>=BigInt(checkpoint));
  const rows=side=>live.filter(o=>o.side===side).map(o=>({user:BigInt(o.payerId),amount:o.x,minimum:o.y,order:o}));
  const match=matchBook(rows(0n),rows(1n))[0];
  if(match)return task('match_orders',{...match.a.order,peerId:match.b.order.payerId,peerNonce:match.b.order.nonce},{x:match.a.amount,y:match.b.amount});
  const expired=funded.find(o=>o.deadline<BigInt(checkpoint));if(expired)return task(`cancel_${expired.side}`,expired,{x:expired.x});
 }else if(kind==='bondingcurve'){
  if(pool.phase===0n){if(automaticInitialize&&issuer.feeDelta===FEE_ESCROW&&issuer.aDelta===BigInt(config.unit)*BigInt(config.cap+config.liquidity))return task('initialize');return null;}
  assert.ok([1n,2n].includes(pool.phase),'curve phase');
  assert.equal(pool.quote_reserve,pool.phase===1n?cumulative(pool.sold_lots,config):0n,'curve backing');
  for(const o of active){
   if(![1n,2n].includes(o.kind)||o.lots<1n||o.lots>BigInt(config.cap)||!positive(o.x))continue;
   const buy=o.kind===1n,amount=o.lots*BigInt(config.unit);
   if((buy?o.bDelta!==o.x:o.aDelta!==amount))continue;
   if(pool.phase===1n&&o.expected_sold===pool.sold_lots&&o.deadline>=BigInt(checkpoint))try{
    const quoted=curveQuote(config,pool.sold_lots,o.lots,buy);
    if(quoted.quoted===o.x)return task(buy?'settle_buy':'settle_sell',o,{x:o.x,y:amount,lots:o.lots});
   }catch(error){if(!(error instanceof RangeError)&&!['lot capacity'].includes(error.message))throw error;}
   return task(buy?'refund_buy':'refund_sell',o,{x:buy?o.x:0n,y:buy?0n:amount,lots:o.lots});
  }
  if(automaticGraduation&&pool.phase===1n&&pool.sold_lots>=BigInt(config.threshold)&&issuer.feeDelta===FEE_ESCROW&&(!config.bootstrap||issuer.bootstrapFee===FEE_ESCROW&&issuer.bootstrapFeeCursor===FEE_ESCROW))return task('graduate',{}, {x:pool.quote_reserve,y:(BigInt(config.cap+config.liquidity)-pool.sold_lots)*BigInt(config.unit)});
 }else throw Error('unknown U124 market');
 return null;
}

export async function loadU124Files(options){
 const [abi,config,policy]=await readTogether([options.abi,options.driverConfig,options.policy].map(async p=>JSON.parse(await readFile(p,'utf8'))));
 validateConfig(config);return {abi,config,policy};
}
export async function scanU124(options,readState=publicState,files){
 const s=await readState(options.rpcConfig);files??=await loadU124Files(options);const {abi,config,policy}=files;
 const fields=new Map(abi.contract.state.map(f=>[f.name,f]));
 const scalar=(u,name,index)=>{const f=fields.get(name);assert.ok(f,`field ${name}`);if(index!==undefined){assert.equal(f.type.item_felt_size,1);assert.ok(index<f.type.length);}return s.slot(u,options.contractId,f.offset+(index??0));};
 const pair=async(u,name,index)=>{const f=fields.get(name);assert.ok(f,`field ${name}`);if(index!==undefined){assert.equal(f.type.item_felt_size,2);assert.ok(index<f.type.length);}else assert.equal(f.felt_size,2);const offset=f.offset+2*(index??0);return decodeAmount(await readTogether([s.slot(u,options.contractId,offset),s.slot(u,options.contractId,offset+1)]));};
 const balance=async(u,asset)=>decodeAmount(await readTogether([s.slot(u,asset,0),s.slot(u,asset,1)]));
 const sent=async(u,asset)=>decodeAmount(await readTogether([s.slot(u,asset,33554453+4*options.vaultId),s.slot(u,asset,33554454+4*options.vaultId)]));
 const funding=async u=>{
  const [fee,cursor,a,b,ca,cb]=await readTogether([s.slot(u,0,3+2*options.vaultId),scalar(options.vaultId,'settled_fee',u),sent(u,config.assetA),sent(u,config.assetB),pair(options.vaultId,'settled_a',u),pair(options.vaultId,'settled_b',u)]);
  return {feeDelta:fee-cursor,aDelta:a-ca,bDelta:b-cb};
 };
 const pool={};
 if(options.kind==='amm')for(const n of ['reserve_a','reserve_b','total_shares'])pool[n]=await pair(options.vaultId,n);
 if(options.kind==='bondingcurve'){pool.phase=await scalar(options.vaultId,'phase');pool.sold_lots=await scalar(options.vaultId,'sold_lots');pool.quote_reserve=await pair(options.vaultId,'quote_reserve');}
 const orders=await mapReads(options.users,async payerId=>{
  const kind=await scalar(payerId,'kind');if(kind===0n)return {payerId,kind,pool:0n,nonce:0n,consumed:0n,feeDelta:0n};
  const names=['pool','side','deadline','nonce',...(options.kind==='bondingcurve'?['lots','expected_sold']:[])];
  const row=Object.fromEntries(await readTogether(names.map(async n=>[n,await scalar(payerId,n)])));
  const [x,y,z,consumed,paid]=await readTogether([pair(payerId,'x'),pair(payerId,'y'),pair(payerId,'z'),scalar(options.vaultId,'consumed',payerId),funding(payerId)]);
  return {payerId,kind,...row,x,y,z,consumed,...paid,...(options.kind==='amm'?{ownedShares:await pair(options.vaultId,'shares',payerId)}:{})};
 });
 const issuer=options.kind==='bondingcurve'?await funding(config.issuer):null;
 if(issuer&&config.bootstrap){const donor=config.bootstrap.funderId;const [sent,claimed,cursor]=await readTogether([s.slot(donor,0,3+2*options.vaultId),s.slot(options.vaultId,0,4+2*donor),scalar(options.vaultId,'settled_fee',donor)]);issuer.bootstrapFee=sent-claimed;issuer.bootstrapFeeCursor=sent-cursor;}
 const balances={a:await balance(options.vaultId,config.assetA),b:await balance(options.vaultId,config.assetB)};
 if(options.kind==='amm'){assert.equal(balances.a,pool.reserve_a,'AMM A backing');assert.equal(balances.b,pool.reserve_b,'AMM B backing');}
 if(options.kind==='bondingcurve'&&pool.phase===1n){assert.equal(balances.a,(BigInt(config.cap+config.liquidity)-pool.sold_lots)*BigInt(config.unit),'curve inventory');assert.equal(balances.b,pool.quote_reserve,'curve quote balance');}
 return {checkpoint:s.checkpoint,pool,balances,orders,action:proposeU124Action({...options,config,policy,pool,orders,issuer,checkpoint:s.checkpoint})};
}
