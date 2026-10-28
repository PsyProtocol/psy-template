import assert from 'node:assert/strict';
import {bindNativePolicy,PROFILE} from '../mainnet-beta/native.mjs';
import {makeBatchPolicy,validateFields as validateBaseFields,operationCalls as baseCalls} from '../v2/policy.mjs';
export const WIDTH=80,COUNT=40;
const F=1000100000n,P=18446744069414584321n,w=witness=>({witness}),k=n=>({constant:String(n)});
const names={amm:['swap_0','swap_1','refund_swap_0','refund_swap_1','add_liquidity','remove_liquidity','refund_add','cancel_remove'],bondingcurve:['settle_buy','settle_sell','settle_limit_buy_change','settle_limit_buy_exact','settle_limit_sell','refund_buy','refund_sell']};
export function makeProcessorPolicy(market,marketId,c,abi,tokenAbi,nftAbi){
 assert.ok(names[market]);assert.ok(Number.isSafeInteger(c.rewardReceiver)&&c.rewardReceiver>0&&c.rewardReceiver<16777216);
 const base=makeBatchPolicy(market,marketId,c,abi,tokenAbi,nftAbi);
 const call=(name,inputs)=>{const m=abi.contract.methods.find(m=>m.name===name);assert.ok(m&&m.input_felt_count===inputs.length&&m.output_felt_count===0&&m.state_mutability==='external',name);return {contract_id:marketId,method_id:m.method_id,method_name:name,inputs};};
 const ft=id=>{const m=tokenAbi.contract.methods.find(m=>m.name==='claim');assert.ok(m&&m.input_felt_count===1);return {contract_id:id,method_id:m.method_id,method_name:'claim',inputs:[w(1)]};};
 const outputs=Object.fromEntries(base.operations.filter(o=>names[market].includes(o.name)).map(o=>[String(o.branch),o.calls.filter(call=>call.method_name==='transfer'&&[base.config.assetA,base.config.assetB].includes(call.contract_id))]));
 const claim_masks=Object.fromEntries(base.operations.filter(o=>names[market].includes(o.name)).map(o=>[String(o.branch),o.calls.filter(call=>call.method_name==='claim').reduce((mask,call)=>mask|(call.contract_id===c.assetA?1:call.contract_id===c.assetB?2:0),0)]));
 for(const calls of Object.values(outputs))assert.ok(calls.length<=2);
 const candidate={...base,version:3,witness_length:WIDTH,source_model:'checkpoint-producer-controlled-candidate-v1',live_authorization:false,base,
  begin:call('begin_checkpoint_batch',[w(1),...Array.from({length:4},(_,i)=>w(13+i)),w(3),...Array.from({length:4},(_,i)=>w(74+i)),...Array.from({length:4},(_,i)=>w(17+i)),w(2)]),
  gather:call('claim_batch_member',[w(1),w(10)]),claim_a:ft(c.assetA),claim_b:ft(c.assetB),fee:{contract_id:0,method_id:2293029357,method_name:'simple_claim',inputs:[w(1)]},
  finish:call('finish_checkpoint_batch',[w(1),w(73),w(79)]),reward:{contract_id:0,method_id:354447671,method_name:'simple_transfer',inputs:[k(c.rewardReceiver),w(79)]},
  settlement_branches:base.operations.filter(o=>names[market].includes(o.name)).map(o=>o.branch),outputs,claim_masks};
 const bound=bindNativePolicy(candidate,PROFILE);
 for(const name of ["native_protocol","sdk_commit","client_commit"])bound.base[name]=bound[name];
 return bound;
}
export function validateProcessorFields(spec,f){
 assert.equal(spec.version,3);assert.equal(spec.live_authorization,false);assert.equal(f.length,WIDTH);
 f.forEach((n,i)=>assert.ok(typeof n==='bigint'&&n>=0n&&n<((i>=13&&i<17)||(i>=74&&i<78)?P:1n<<62n),'canonical processor input'));
 if(f[0]!==2n){assert.ok(f.slice(74).every(n=>n===0n));validateBaseFields(spec.base,f.slice(0,74));return;}
 assert.ok(f[1]>0n&&f[2]>=2n&&f[2]<=4n&&f[3]>0n&&f[3]<(1n<<32n));assert.ok(f.slice(4,13).every(n=>n===0n));assert.equal(f[78],0n);
 assert.ok(f[73]>=1000000000n&&f[73]<=F&&f[73]%1000n===0n);assert.equal(f[79]+f[73],f[2]*F);
 const rank=f.slice(17,21);assert.equal(new Set(rank.map(String)).size,4);rank.forEach((r,i)=>assert.ok(r>=0n&&r<4n&&(BigInt(i)<f[2]?r<f[2]:r===BigInt(i))));
 let last=0n;
 for(let row=0;row<4;row++){
  const v=f.slice(21+13*row,34+13*row);
  if(BigInt(row)>=f[2]){assert.ok(v.every(n=>n===0n));continue;}
  assert.ok(spec.settlement_branches.includes(Number(v[0])));assert.ok(v[1]>last&&v[1]<(1n<<24n)&&v[10]>0n);last=v[1];
  const op=spec.operations.find(o=>BigInt(o.branch)===v[0]);const used=new Set([0,...op.calls.flatMap(c=>c.inputs.filter(a=>a.witness!==undefined).map(a=>a.witness))]);
  v.forEach((n,i)=>{if(!used.has(i))assert.equal(n,0n);});
 }
}
export function processorCalls(spec,f){
 validateProcessorFields(spec,f);if(f[0]!==2n)return baseCalls(spec.base,f.slice(0,74));
 const call=(c,v=f)=>({contract_id:BigInt(c.contract_id),method_id:BigInt(c.method_id),method_name:c.method_name,inputs:c.inputs.map(a=>a.witness===undefined?BigInt(a.constant):v[a.witness])});
 const out=[call(spec.begin)],noop=()=>call(spec.noop);
 for(let row=0;row<4;row++){const v=f.slice(21+13*row,34+13*row);if(BigInt(row)>=f[2]){out.push(noop(),noop(),noop());continue;}const mask=spec.claim_masks[String(v[0])];out.push(call(spec.gather,v),mask&1?call(spec.claim_a,v):noop(),mask&2?call(spec.claim_b,v):noop());}
 for(let pos=0;pos<4;pos++){if(BigInt(pos)>=f[2]){out.push(noop(),noop(),noop());continue;}const row=Number(f[17+pos]),v=f.slice(21+13*row,34+13*row),op=spec.operations.find(o=>BigInt(o.branch)===v[0]);const calls=[op.calls[0],...spec.outputs[String(op.branch)]];out.push(...calls.map(c=>call(c,v)));while(out.length<13+3*(pos+1))out.push(noop());}
 for(let row=0;row<4;row++)out.push(BigInt(row)<f[2]?call(spec.fee,f.slice(21+13*row,34+13*row)):noop());
 out.push(call(spec.finish),call(spec.reward));while(out.length<39)out.push(noop());out.push(call(spec.burn));assert.equal(out.length,40);return out;
}
