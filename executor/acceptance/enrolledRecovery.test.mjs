import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {enrolledRecovery} from './enrolledRecovery.mjs';import {losslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
test('empty vault returns funding and NFT with bounded exact grants; restart does not repeat either return or sponsor',async()=>{
 const base=mkdtempSync(join(tmpdir(),'psy-enrolled-recovery-'));mkdirSync(join(base,'public'));
 const fields=['sponsor_pool','sponsor_amount','sponsor_nonce','used_sponsorship','sponsor_purpose','settled_fee'];
 const m={kind:'nftmarket',id:100,vault:77,abi:{contract:{state:fields.map((name,i)=>({name,offset:1000*(i+1)})),methods:[{name:'authorize_sponsor',method_id:1,input_felt_count:4}]}}};
 let gas=0n,pending=0n,claimed=0n,nonce=0n,used=0n,returns=0,sponsored=0,scans=0;
 const h={base,config:'fake',actors:{sponsor:{id:88}},markets:[m],user:async(_actor,label,calls)=>{
  sponsored++;assert.equal(calls.find(c=>c.method_name==='simple_transfer').inputs[1],2n*F);pending+=2n*F;nonce++;
  writeFileSync(join(base,'public',label+'.json'),losslessJson({calls}));
 }};
 const state=async()=>({slot:async(u,c,offset)=>{
  if(c===0)return u===88?claimed+pending:claimed;
  return new Map([[1000,77n],[2000,2n*F],[3000,nonce],[4088,used],[5000,2n],[6088,claimed]]).get(offset)??assert.fail('unexpected slot');
 }});
 const f={journal:{reconcile:async()=>{},unresolved:async()=>[]},adapter:{reconcile:async()=>{},scan:async()=>{
  scans++;if(returns===2)return {reason:'epoch-complete'};
  if(gas<F&&pending===0n)return {reason:'recovery-gas-sponsorship-required',fundingRequest:{requiredTotal:String(2n*F)}};
  const method=pending?'fund_gas':returns===0?'recover_funding':'recover_nft';
  return {action:{submission:losslessJson({contract_calls:[{method_name:method,inputs:[method==='fund_gas'?88n:123n]}]})}};
 }},step:async(label,predicate)=>{
  const op=pending?'fund_gas':returns===0?'recover_funding':'recover_nft',task={kind:'batch_maintenance',submission:losslessJson({contract_calls:[{method_name:op}]})};assert.ok(predicate(task));
  if(op==='fund_gas'){gas+=pending-F;claimed+=pending;pending=0n;used=nonce;}else{assert.ok(gas>=F);gas-=F;returns++;}
  writeFileSync(join(base,'public',label+'-formal-result.json'),'{}');
 }};
 try{
  await enrolledRecovery(h,[f],{prefix:'exit-test',owners:[123]},state);assert.equal(returns,2);assert.equal(sponsored,2);assert.equal(gas,0n);
  const firstScans=scans;await enrolledRecovery(h,[f],{prefix:'exit-test',owners:[123]},state);
  assert.equal(returns,2);assert.equal(sponsored,2);assert.equal(scans,firstScans);
 }finally{rmSync(base,{recursive:true});}
});
test('unknown journal transmission blocks sponsorship before any ordinary UPS',async()=>{
 const base=mkdtempSync(join(tmpdir(),'psy-enrolled-unknown-'));mkdirSync(join(base,'public'));let sends=0;
 const h={base,markets:[{kind:'amm',id:100}],user:async()=>sends++},f={journal:{reconcile:async()=>{},unresolved:async()=>[{}]},adapter:{reconcile:async()=>{},scan:async()=>({reason:'recovery-gas-sponsorship-required',fundingRequest:{requiredTotal:String(2n*F)}})}};
 try{await assert.rejects(()=>enrolledRecovery(h,[f],{prefix:'exit-test',owners:[123]}),/unknown send/);assert.equal(sends,0);}finally{rmSync(base,{recursive:true});}
});
