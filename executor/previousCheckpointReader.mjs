// Producer-controlled checkpoint ordering. RPC observations are proposals;
// the native complete UPS independently verifies source, ordering and prices.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {members} from '../batching/v2/controller.mjs';
import {scanBatch} from '../batching/v2/reader.mjs';
import {planSettlement,validFunding,isLive} from '../batching/v2/planner.mjs';
import {processorRequest,PREVIOUS_TAG} from '../batching/checkpoint-processor/policy.mjs';
import {hashLimbs} from '../batching/random-order/statement.mjs';
import {decodeAmount,losslessJson,parseLosslessJson,FEE_ESCROW} from '../amm/u124/client.mjs';
export function validatePreviousPlan(v){
 assert.deepEqual(Object.keys(v).sort(),['members','type','version']);assert.equal(v.version,1);assert.equal(v.type,'previous-checkpoint-members');
 assert.ok(Array.isArray(v.members)&&v.members.length>=2&&v.members.length<=4);let last=0;
 for(const m of v.members){assert.deepEqual(Object.keys(m).sort(),['nonce','owner']);assert.ok(Number.isSafeInteger(m.owner)&&m.owner>last&&m.owner<16777216);assert.match(m.nonce,/^[1-9]\d*$/);assert.ok(BigInt(m.nonce)<1n<<62n);last=m.owner;}
 return v;
}
export async function loadPreviousFiles(o){const [abi,config,policy]=await Promise.all([o.abi,o.driverConfig,o.policy].map(async p=>JSON.parse(await readFile(p,'utf8'))));assert.equal(policy.version,4);assert.equal(policy.market,o.kind);assert.equal(policy.market_id,o.contractId);return {abi,config,policy};}
export function previousTask(policy,fields,until,extra={}){
 return {kind:['','batch_commit','batch_settle','batch_expire','batch_maintenance'][Number(fields[0])],profile:'compact-v1',batchId:fields[1].toString(),validUntilCheckpoint:String(until),...extra,submission:losslessJson(processorRequest(policy,fields))};
}
export async function scanPrevious(o,readState,files,{deriveOrder,quote}){
 const s=await readState(o.rpcConfig),{abi,config,policy}=files,V=o.vaultId,C=o.contractId;
 const offsets=new Map(abi.contract.state.map(f=>[f.name,f.offset]));const at=(u,n,i=0)=>{assert.ok(offsets.has(n),'missing producer field '+n);return s.slot(u,C,offsets.get(n)+i);};
 const pair=async(u,n,i)=>decodeAmount(await Promise.all([0,1].map(j=>at(u,n,(i===undefined?0:2*i)+j))));
 const [phase,batch,expiry,draw,cutoff]=await Promise.all(['batch_phase','batch_id','batch_expiry','processor_draw','batch_cutoff'].map(n=>at(V,n)));
 const pad=f=>{f=f.map(BigInt);while(f.length<80)f.push(0n);f[78]=PREVIOUS_TAG;return f;};
 const baseResult=async users=>{const result=await scanBatch({...o,users,batchMemberLimit:4},async()=>s,{abi,config,policy:policy.base});if(!result.action)return result;const f=pad(parseLosslessJson(result.action.submission).software_defined_call.inputs);return {...result,action:previousTask(policy,f,f[0]===1n?f[3]:BigInt(s.checkpoint)+64n)};};
 if(phase!==1n&&((await at(V,'batch_ready'))===0n||(o.kind==='bondingcurve'&&(await at(V,'phase'))===0n)))return baseResult([]);
 if(phase!==1n){
  assert.ok([0n,3n,4n].includes(phase),'producer atomic phase');
  const users=files.admissionPlan.members.map(m=>m.owner),rows=[];
  for(const m of files.admissionPlan.members){const owner=m.owner;const nonce=await at(owner,'nonce'),consumed=await at(V,'consumed',owner);if(consumed>=BigInt(m.nonce))continue;
   assert.equal(nonce,BigInt(m.nonce),'operator plan nonce changed');const row={owner:BigInt(owner)};
   for(const[n,w]of Object.entries(members(o.kind)))row[n]=w===2?await pair(owner,n):await at(owner,n);
   const paid=[];for(const[asset,cursor]of[[config.assetA,'settled_a'],[config.assetB,'settled_b']]){const sent=decodeAmount(await Promise.all([0,1].map(j=>s.slot(owner,asset,33554453+4*V+j))));const claimed=decodeAmount(await Promise.all([0,1].map(j=>s.slot(V,asset,33554455+4*owner+j))));const base=await pair(V,cursor,owner);assert.equal(base,claimed,'producer funding cursor drift');paid.push(sent-base);}
   row.paid_a=paid[0];row.paid_b=paid[1];row.fee_delta=(await s.slot(owner,0,3+2*V))-(await at(V,'settled_fee',owner));
   if(row.pool!==BigInt(V)||!isLive(row,BigInt(s.checkpoint))||!validFunding(o.kind,row,config))return {checkpoint:s.checkpoint,action:null,reason:'complete-plan-live-funding-required'};rows.push(row);
  }
  if(rows.length&&rows.length!==users.length)return {checkpoint:s.checkpoint,action:null,reason:'original-plan-must-not-be-partially-reselected'};
  const base=await scanBatch({...o,users,batchMemberLimit:4},async()=>s,{abi,config,policy:policy.base});if(!base.action)return base;
  const f=pad(parseLosslessJson(base.action.submission).software_defined_call.inputs);if(f[0]===1n){assert.equal(Number(f[2]),users.length,'whole declared plan required');assert.deepEqual(f.slice(5,5+users.length),users.map(BigInt));}
  return {...base,action:previousTask(policy,f,f[0]===1n?f[3]:BigInt(s.checkpoint)+64n)};
 }
 if(BigInt(s.checkpoint)>expiry){const f=pad(Array(74).fill(0n));f[0]=3n;f[1]=batch;return {checkpoint:s.checkpoint,action:previousTask(policy,f,BigInt(s.checkpoint)+64n)};}
 if(BigInt(s.checkpoint)<draw)return {checkpoint:s.checkpoint,action:null,reason:'awaiting-fixed-previous-checkpoint'};
 const count=Number(await at(V,'batch_count'));assert.ok(count>=2&&count<=4);
 const root=await Promise.all([0,1,2,3].map(i=>at(V,'batch_root',i))),rows=[];
 for(let i=0;i<4;i++){const row={index:i,owner:await at(V,'frozen_owner',i),done:await at(V,'batch_done',i)};
  for(const[n,w]of Object.entries(members(o.kind)))row[n]=w===2?decodeAmount(await Promise.all(['lo','hi'].map(l=>at(V,`frozen_${n}_${l}`,i)))):await at(V,'frozen_'+n,i);
  for(const n of ['paid_a','paid_b'])row[n]=decodeAmount(await Promise.all(['lo','hi'].map(l=>at(V,`frozen_${n}_${l}`,i))));row.fee_delta=await at(V,'frozen_fee_delta',i);if(o.kind==='amm'&&row.owner>0n)row.ownedShares=await pair(V,'shares',Number(row.owner));rows.push(row);
 }
 const leaf=await s.rpc(s.coordinator,'psy_get_checkpoint_leaf_data',{checkpoint_id:Number(draw)},{exactIntegers:true});const seed=hashLimbs(leaf.stats.random_seed).map(BigInt);
 const rank=await deriveOrder({batch:batch.toString(),checkpoint:draw.toString(),root:root.map(String),seed:seed.map(String),owners:rows.map((r,i)=>i<count?r.owner.toString():'0'),nonces:rows.map((r,i)=>i<count?r.nonce.toString():'0'),count});
 assert.equal(rank.length,4);assert.equal(new Set(rank).size,4);assert.ok(rank.every((n,i)=>Number.isSafeInteger(n)&&n>=0&&n<4&&(i<count?n<count:n===i)),'complete native-derived permutation');
 const pool={};if(o.kind==='amm')for(const n of ['reserve_a','reserve_b','total_shares'])pool[n]=await pair(V,n);else{for(const n of ['phase','sold_lots'])pool[n]=await at(V,n);pool.quote_reserve=await pair(V,'quote_reserve');}
 // Only the quote planner's traversal key is changed. Original frozen terms
 // remain in contract state and are verified by each actual settlement CFC.
 const order=new Map(rank.map((r,i)=>[r,BigInt(i)]));const planned=planSettlement({market:o.kind,policy:policy.base,config,rows:rows.map((r,i)=>({...r,order_checkpoint:order.get(i)})),pool,cutoff});
 const f=pad(Array(74).fill(0n));f[0]=2n;f[1]=batch;f[2]=BigInt(count);f[3]=draw;root.forEach((n,i)=>f[13+i]=n);rank.forEach((n,i)=>f[17+i]=BigInt(n));seed.forEach((n,i)=>f[74+i]=n);
 assert.equal(planned.operations.length,count,'every sealed member must have one disposition');
 for(const op of planned.operations){const i=rows.findIndex(r=>r.owner===op[1]);assert.ok(i>=0&&i<count);f.splice(21+13*i,13,...op);}
 f[73]=FEE_ESCROW;f[79]=BigInt(count)*FEE_ESCROW-f[73];const proposal=previousTask(policy,f,expiry);
 const fee=BigInt(await quote(proposal));assert.ok(fee>=1000000000n&&fee<=FEE_ESCROW&&fee%1000n===0n);f[73]=fee;f[79]=BigInt(count)*FEE_ESCROW-fee;
 return {checkpoint:s.checkpoint,phase,batch,sourceCheckpoint:draw,sourceTrust:'native producer-controlled seed',qualifiedRandomness:false,action:previousTask(policy,f,expiry)};
}
