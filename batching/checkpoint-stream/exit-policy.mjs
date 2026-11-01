import assert from 'node:assert/strict';
import {makeFundedPolicy} from './funded-policy.mjs';
import {makeFundedPairPolicy} from './funded-pair.mjs';
export function makeExitPolicy(market,id,c,artifact,token,nft){
 const paired=['orderbook','nftmarket'].includes(market),s=paired?makeFundedPairPolicy(market,id,c,artifact,token,nft):makeFundedPolicy(market,id,c,artifact,token,nft);
 const stream={...s.stream};
 for(const[name,count]of [['authorize_treasury_exit',6],['authorize_exit_fees',8],['apply_exit_grant',8],['account_exit_fee',7],['return_treasury',7],['account_return_fee',5],['return_exit_credit',8]]){
  const m=artifact.abi.contract.methods.find(m=>m.name===name);assert.equal(m?.input_felt_count,count,name);assert.equal(m.output_felt_count,0);assert.equal(m.state_mutability,'external');
  stream[name]={contract_id:id,method_name:name,method_id:m.method_id,input_count:count};
 }
 return {...s,version:paired?19:18,profile:paired?'source-covered-pair-authorized-exit-v1':'source-covered-authorized-exit-v1',stream,exit_policy:{native_transfer:{contract_id:0,method_name:'transfer',method_id:2789897329,input_count:2},auxiliary_fee_field:74,only_original_credit_returns:true,owner_return_fee_separate_from_service_cap:true,owner_return_authority:'exhausted-or-explicit-owner-v1',maximum_grant_window:4096}};
}
