// Distinct, initially offline key; deterministic source/priority semantics retained.
import assert from 'node:assert/strict';
import {makeStreamPolicy} from './build-policy.mjs';
export const FUNDED_VERSION=14;
export const FUNDED_PROFILE='source-covered-deterministic-funded-bootstrap-v1';
export function makeFundedPolicy(market,id,c,artifact,token,nft){
  assert.ok(Number.isSafeInteger(c.feeOwner)&&c.feeOwner>0&&c.feeOwner<2**24&&!([c.issuer,c.target].includes(c.feeOwner)),'separate ordinary fees-only owner');
  const base=makeStreamPolicy(market,id,c,artifact,token,nft);
  const stream={...base.stream};
  for(const[name,count]of [['authorize_fee_budget',7],['apply_fee_grant',8],['account_executor_fee',5]]){
    const m=artifact.abi.contract.methods.find(m=>m.name===name);assert.equal(m?.input_felt_count,count,name);assert.equal(m.output_felt_count,0);assert.equal(m.state_mutability,'external');
    stream[name]={contract_id:id,method_name:name,method_id:m.method_id,input_count:count};
  }
  return {...base,version:FUNDED_VERSION,profile:FUNDED_PROFILE,source_window_checkpoints:32,fee_owner:c.feeOwner,owner_fee_claim:{contract_id:0,method_name:'claim',method_id:3824212239,inputs:[{constant:String(c.feeOwner)}]},stream,live_authorization:false,qualified_randomness:false};
}
