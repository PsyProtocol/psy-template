import {assertDeterministicOrdering} from '../random-order/sourceGate.mjs';
import assert from 'node:assert/strict';
export const TX_COUNT=40, WITNESS_LENGTH=74, OP_START=21, OP_WIDTH=13, BURN_INDEX=73;
const w=witness=>({witness}),k=constant=>({constant:String(constant)});
const nativeIds={simple_claim:2293029357,simple_transfer:354447671,simple_burn:2923993647};
export function makeBatchPolicy(market,marketId,c,abi,tokenAbi,nftAbi){assertDeterministicOrdering(c);
 const get=(a,name,n)=>{const m=a.contract.methods.find(m=>m.name===name);assert.ok(m,`missing ${name}`);assert.equal(m.input_felt_count,n,`${name} arity`);assert.equal(m.output_felt_count,0,`${name} must have no return values`);assert.ok(m.state_mutability==='external'||(['noop','recover_nft'].includes(name)&&m.state_mutability==='view'),`${name} mutability`);return m;};
 const call=(id,a,name,inputs)=>({contract_id:id,method_id:get(a,name,inputs.length).method_id,method_name:name,inputs});
 const guard=(name,inputs=[])=>call(marketId,abi,name,inputs);
 const native=(name,inputs)=>({contract_id:0,method_id:nativeIds[name],method_name:name,inputs});
 const ft=(id,name,inputs)=>call(id,tokenAbi,name,inputs),nft=(name,inputs)=>call(c.nftId,nftAbi,name,inputs);
 const p=w(1),peer=w(2),x=[w(3),w(4)],y=[w(5),w(6)],z=[w(7),w(8)],lots=w(9),nonce=w(10),pn=w(11);
 const fee=u=>native('simple_claim',[u]),claim=(a,u)=>ft(a,'claim',[u]),transfer=(a,u,n)=>ft(a,'transfer',[u,...n]);
 const operations=[],add=(name,calls,{maintenance=false}={})=>{assert.ok(calls.length<=9);while(calls.length<9)calls.push(guard('noop'));operations.push({branch:operations.length+1,name,maintenance,calls});};
 const a=c.assetA,b=c.assetB;
 if(market==='amm'){
  for(const side of[0,1]){add(`swap_${side}`,[guard(`swap_${side}`,[p,...x,...y,nonce]),fee(p),claim(side===0?a:b,p),transfer(side===0?b:a,p,y)]);add(`refund_swap_${side}`,[guard(`batch_refund_swap_${side}`,[p,...x,...y,nonce]),fee(p),claim(side===0?a:b,p),transfer(side===0?a:b,p,x)]);}
  add('add_liquidity',[guard('add_liquidity',[p,...x,...y,...z,nonce]),fee(p),claim(a,p),claim(b,p)]);
  add('remove_liquidity',[guard('remove_liquidity',[p,...x,...y,...z,nonce]),fee(p),transfer(a,p,y),transfer(b,p,z)]);
  add('refund_add',[guard('batch_refund_add',[p,...x,...y,...z,nonce]),fee(p),claim(a,p),claim(b,p),transfer(a,p,x),transfer(b,p,y)]);
  add('cancel_remove',[guard('batch_cancel_remove',[p,...y,...z,nonce]),fee(p)]);
 }else if(market==='orderbook'){
  add('match_orders',[guard('match_orders',[p,peer,...x,...y,nonce,pn]),fee(p),fee(peer),claim(a,p),claim(b,peer),transfer(a,peer,x),transfer(b,p,y),native('simple_transfer',[peer,k(1000100000)])]);
 }else if(market==='bondingcurve'){
  add('initialize',[guard('initialize'),fee(k(c.issuer)),claim(a,k(c.issuer))],{maintenance:true});
  add('settle_buy',[guard('settle_buy',[p,lots,...x,...y,nonce]),fee(p),claim(b,p),transfer(a,p,y)]);
  add('settle_sell',[guard('settle_sell',[p,lots,...x,...y,nonce]),fee(p),claim(a,p),transfer(b,p,x)]);
  for(const change of[false,true])add(change?'settle_limit_buy_change':'settle_limit_buy_exact',[guard('settle_limit_buy',[p,lots,...x,...y,...(change?z:[k(0),k(0)]),nonce]),fee(p),claim(b,p),transfer(a,p,y),...(change?[transfer(b,p,z)]:[])]);
  add('settle_limit_sell',[guard('settle_limit_sell',[p,lots,...x,...y,nonce]),fee(p),claim(a,p),transfer(b,p,x)]);
  add('refund_buy',[guard('batch_refund_curve_buy',[p,lots,...x,...z,nonce]),fee(p),claim(b,p),transfer(b,p,x)]);
  add('refund_sell',[guard('batch_refund_curve_sell',[p,lots,...y,...z,nonce]),fee(p),claim(a,p),transfer(a,p,y)]);
  assert.ok(!c.bootstrap,'batch curve bootstrap must be separately implemented and verified');
  add('graduate',[guard('graduate',[k(c.target),...x,...y]),fee(k(c.issuer)),transfer(b,k(c.target),x),transfer(a,k(c.target),y)],{maintenance:true});
 }else if(market==='nftmarket'){
  add('settle_sale',[guard('settle_sale',[p,peer,...x,nonce,pn]),fee(p),fee(peer),claim(c.tokenId,peer),nft('claim',[k(0),p]),nft('acknowledge',[peer]),nft('transfer',[k(0),peer]),transfer(c.tokenId,p,x),native('simple_transfer',[p,k(1000100000)])]);
  add('activate',[guard('noop'),fee(p),nft('acknowledge',[p]),claim(c.tokenId,p),guard('activate',[p]),transfer(c.tokenId,p,[k(1),k(0)])],{maintenance:true});
  add('ack_delivery',[guard('ack_delivery',[p]),fee(p),nft('acknowledge',[p])],{maintenance:true});
 }else throw Error('batch market');
 if(market!=='nftmarket')add('activate_batch_vault',[guard('noop'),fee(p),claim(a,p),claim(b,p),guard('activate_batch_vault',[p]),transfer(a,p,[k(1),k(0)]),transfer(b,p,[k(1),k(0)])],{maintenance:true});
 const refundAsset=market==='nftmarket'?c.tokenId:a;
 for(let mask=0;mask<(market==='nftmarket'?16:8);mask++){
  if(market==='nftmarket'&&(mask&2))continue;
  add(`refund_funding_${mask}`,[guard('refund_funding',[p,...x,...y,lots,nonce,k(mask)]),
   ...(mask&4?[fee(p)]:[]),...(mask&1?[claim(refundAsset,p),transfer(refundAsset,p,x)]:[]),
   ...(mask&2?[claim(b,p),transfer(b,p,y)]:[]),...(mask&8?[nft('claim',[k(0),p]),nft('acknowledge',[p]),nft('transfer',[k(0),p])]:[]),...(mask&4?[native('simple_transfer',[p,lots])]:[])]);
 }
 add('fund_gas',[guard('fund_gas',[p,lots]),fee(p)],{maintenance:true});
 for(let mask=1;mask<8;mask++){
  if(market==='nftmarket'&&(mask&2))continue;
  add(`recover_funding_${mask}`,[guard('recover_funding',[p,...x,...y,lots,k(mask)]),
   ...(mask&4?[fee(p)]:[]),...(mask&1?[claim(refundAsset,p),transfer(refundAsset,p,x)]:[]),
   ...(mask&2?[claim(b,p),transfer(b,p,y)]:[]),...(mask&4?[native('simple_transfer',[p,lots])]:[])],{maintenance:true});
 }
 if(market==='nftmarket')add('recover_nft',[guard('recover_nft',[p,nonce]),nft('claim',[k(0),p]),nft('acknowledge',[p]),nft('transfer',[k(0),p])],{maintenance:true});
 assert.ok(operations.length<=32,'bounded operation selector');
 const commit=[guard('commit_batch',[...Array.from({length:4},(_,i)=>w(5+i)),...Array.from({length:4},(_,i)=>w(9+i)),w(2),w(1),w(3),w(4)]),fee(w(4))];
 const begin=guard('begin_batch',[w(1),...Array.from({length:4},(_,i)=>w(13+i)),...(market==='orderbook'?Array.from({length:4},(_,i)=>w(17+i)):[])]);
 return {version:2,market,market_id:marketId,config:c,tx_count:TX_COUNT,witness_length:WITNESS_LENGTH,fee_min:'1000000000',fee_max:'1000100000',
  operations,commit,begin,finish:guard('finish_batch',[w(1)]),expire:guard('expire_batch',[w(1)]),noop:guard('noop'),burn:native('simple_burn',[w(BURN_INDEX)]),
  // Existing submission guards use this coverage list; authorization below
  // uses modes/operations and does not misinterpret it as v1 branch choices.
  branches:[{calls:commit},{calls:[begin,guard('finish_batch',[w(1)])]},...operations.map(o=>({calls:o.calls})),{calls:[native('simple_burn',[w(BURN_INDEX)])]}]};
}
const P=18446744069414584321n;
export function validateFields(policy,fields){
 assert.equal(policy.version,2);assert.equal(policy.tx_count,TX_COUNT);assert.equal(fields.length,WITNESS_LENGTH);
 fields.forEach((n,i)=>assert.ok(typeof n==='bigint'&&n>=0n&&n<(i>=13&&i<17?P:1n<<62n),'canonical batch witness'));
 const mode=Number(fields[0]);assert.ok(mode>=1&&mode<=4,'batch mode');
 assert.ok(fields[BURN_INDEX]>=1000000000n&&fields[BURN_INDEX]<=1000100000n&&fields[BURN_INDEX]%1000n===0n,'burn fee');
 const headerUsed=new Set(mode===1?[0,1,2,3,4,5,6,7,8,9,10,11,12]:mode===2?[0,1,13,14,15,16,...(policy.market==='orderbook'?[17,18,19,20]:[])]:mode===3?[0,1]:[0]);
 for(let i=0;i<OP_START;i++)if(!headerUsed.has(i))assert.equal(fields[i],0n,'unused batch header');
 for(let op=0;op<4;op++){
  const start=OP_START+op*OP_WIDTH,id=Number(fields[start]);
  const active=mode===2||(mode===4&&op===0);
  if(!active||id===0){assert.ok(!(mode===4&&op===0),'maintenance operation required');for(let i=0;i<OP_WIDTH;i++)assert.equal(fields[start+i],0n,'unused operation');continue;}
  const branch=policy.operations.find(x=>x.branch===id);assert.ok(branch&&branch.maintenance===(mode===4),'operation not permitted in phase');
  const used=new Set([0,...branch.calls.flatMap(c=>c.inputs.filter(x=>x.witness!==undefined).map(x=>x.witness))]);
  for(let i=0;i<OP_WIDTH;i++)if(!used.has(i))assert.equal(fields[start+i],0n,'unused operation field');
 }
}
export function operationCalls(policy,fields){validateFields(policy,fields);const convert=(c,start=0)=>({contract_id:BigInt(c.contract_id),method_id:BigInt(c.method_id),method_name:c.method_name,inputs:c.inputs.map(x=>x.witness===undefined?BigInt(x.constant):fields[start+x.witness])});
 const noop=()=>convert(policy.noop),calls=[],mode=Number(fields[0]);
 if(mode===1)calls.push(...policy.commit.map(c=>convert(c)));
 if(mode===2){calls.push(convert(policy.begin));for(let op=0;op<4;op++){const start=OP_START+op*OP_WIDTH,branch=policy.operations.find(x=>BigInt(x.branch)===fields[start]);calls.push(...(branch?branch.calls.map(c=>convert(c,start)):Array.from({length:9},noop)));}calls.push(convert(policy.finish));}
 if(mode===3)calls.push(convert(policy.expire));
 if(mode===4){const start=OP_START,branch=policy.operations.find(x=>BigInt(x.branch)===fields[start]);assert.ok(branch,'maintenance operation required');calls.push(...branch.calls.map(c=>convert(c,start)));}
 assert.ok(calls.length<TX_COUNT);while(calls.length<TX_COUNT-1)calls.push(noop());calls.push(convert(policy.burn));return calls;
}
export function signingRequest(policy,fields){const supplied=[...fields];if(supplied[BURN_INDEX]===0n)supplied[BURN_INDEX]=1000000000n;const calls=operationCalls(policy,supplied);return {contract_calls:calls.slice(0,-1).map(({contract_id,method_name,inputs})=>({contract_id,method_name,inputs})),software_defined_call:{inputs:[...fields]}};}
export function witness({mode,batch=0n,users=[],nonces=[],expiry=0n,sponsor=0n,root=[0n,0n,0n,0n],rank=[0n,0n,0n,0n],operations=[],burn=1000000000n}){const f=Array(WITNESS_LENGTH).fill(0n);f[0]=BigInt(mode);f[1]=batch;f[2]=BigInt(users.length);f[3]=expiry;f[4]=sponsor;users.forEach((u,i)=>f[5+i]=u);nonces.forEach((n,i)=>f[9+i]=n);root.forEach((n,i)=>f[13+i]=n);rank.forEach((n,i)=>f[17+i]=n);operations.forEach((v,i)=>{assert.equal(v.length,13);assert.ok(i<4);v.forEach((n,j)=>f[21+13*i+j]=n);});f[73]=burn;return f;}
