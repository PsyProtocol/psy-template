// Independent financial action planner. RPC facts propose calls; the funded
// controller + dedicated key/full UPS authenticate them before any submission.
import assert from 'node:assert/strict';
import {readTogether} from '../executor/readConcurrency.mjs';
import {createIntent,validatePlan} from './intent.mjs';
import {ownerFunding,publicKeyFelts} from './funding.mjs';
import {fundsPolicy,fundsRequest} from './contract/policy.mjs';
import {runtimePolicy,COMPOSITION_MAGIC,COMPOSITION_SDK} from './contract/runtimePolicy.mjs';
import {decodeAmount,losslessJson,parseLosslessJson} from '../amm/u124/client.mjs';
const F=1000100000n;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function executionModel(input){
 const intent=createIntent(input.intent.terms);assert.equal(intent.id,input.intent.id);validatePlan(intent,input.plan);
 const t=intent.terms;assert.equal(t.sdkManifestHash,COMPOSITION_SDK);const {controllerAbi,tokenAbi,nativeAbi,marketAbis,controllerBudget,ownerFeeReserve}=input;
 const base=fundsPolicy({controllerId:Number(t.execution.controllerId),controllerAbi,assetA:Number(input.plan.steps[0].inputAsset),assetB:Number(input.plan.steps[0].outputAsset),tokenAbi,nativeAbi,markets:intent.terms.markets.map((id,j)=>({id:Number(id),vault:Number(input.plan.steps[j].vaultId),abi:marketAbis[j]})),registryHash:input.plan.registryHash});
 assert.deepEqual(input.policy,runtimePolicy(base),'complete composition runtime policy');
 const funding=ownerFunding({intent,plan:input.plan,policy:base,controllerAbi,tokenAbi,nativeAbi,marketAbis,networkMagic:COMPOSITION_MAGIC,controllerBudget,ownerFeeReserve});
 return freeze({...input,intent,funding,policy:runtimePolicy(base),assetA:t.input.id,assetB:input.plan.steps[0].outputAsset});
}
export function actionTask(model,name,terms,checkpoint,fee=F){
 assert.ok(Object.keys(terms).every(k=>['amount','minimum','deadline','orderNonce','epoch','cutoff','nativeRefund'].includes(k)),'operation terms cannot override intent identity/fee');
 const t=model.intent.terms,ordinaryExpiry=BigInt(checkpoint)+64n,expiry=/^(open|consent)-/.test(name)&&t.expiresAtCheckpoint<ordinaryExpiry?t.expiresAtCheckpoint:ordinaryExpiry;
 const request=fundsRequest(model.policy,name,{...terms,owner:t.owner,nonce:t.nonce,fee});
 return{kind:'composition',profile:'composition-v1',intentId:model.intent.id,registryHash:model.plan.registryHash,operation:name,terms:losslessJson(terms),validUntilCheckpoint:expiry.toString(),submission:losslessJson(request),atomicScope:'one execution-account UPS only'};
}
export function bindAction(model,task){
 assert.deepEqual(Object.keys(task).sort(),['kind','profile','intentId','registryHash','operation','terms','validUntilCheckpoint','submission','atomicScope'].sort());
 assert.equal(task.intentId,model.intent.id);assert.equal(task.registryHash,model.plan.registryHash);assert.equal(task.kind,'composition');assert.equal(task.profile,'composition-v1');
 assert.equal(task.atomicScope,'one execution-account UPS only');
 const request=parseLosslessJson(task.submission),f=request.software_defined_call.inputs;
 assert.ok(Object.keys(parseLosslessJson(task.terms)).every(k=>['amount','minimum','deadline','orderNonce','epoch','cutoff','nativeRefund'].includes(k)),'operation identity override');
 const expected=fundsRequest(model.policy,task.operation,{...parseLosslessJson(task.terms),owner:model.intent.terms.owner,nonce:model.intent.terms.nonce,fee:f[73]});
 assert.equal(task.submission,losslessJson(expected),'complete financial operation differs');assert.ok(BigInt(task.validUntilCheckpoint)>0n&&BigInt(task.validUntilCheckpoint)<2n**32n);return request;
}
export function withActionFee(model,task,fee){
 const old=bindAction(model,task).software_defined_call.inputs[73],terms=parseLosslessJson(task.terms);
 if(task.operation.startsWith('return-'))terms.nativeRefund+=old-fee;
 const next=actionTask(model,task.operation,terms,0n,fee);next.validUntilCheckpoint=task.validUntilCheckpoint;return next;
}
export async function scanComposition(model,s){
 const t=model.intent.terms,V=Number(t.execution.vaultId),C=Number(t.execution.controllerId),U=Number(t.owner),fields=new Map(model.controllerAbi.contract.state.map(f=>[f.name,f.offset]));
 const at=(user,name,i=0)=>{assert.ok(fields.has(name),'controller ABI field '+name);return s.slot(user,C,fields.get(name)+i);};
 const pair=async(user,name)=>decodeAmount(await readTogether([at(user,name),at(user,name,1)]));
 const [phase,cancelled]=await readTogether([at(V,'phase'),at(U,'request_cancelled')]),checkpoint=BigInt(s.checkpoint),expiry=t.expiresAtCheckpoint,stopped=cancelled===1n||checkpoint>expiry;
 const view={checkpoint:s.checkpoint,phase,intentId:model.intent.id,atomic:false,sourceAuthenticated:false};
 const idle=(reason,extra={})=>({...view,action:null,reason,...extra});
 const task=(name,terms={})=>({...view,action:actionTask(model,name,terms,checkpoint)});
 if(phase===0n){
  if(await at(U,'request_funded')!==1n)return idle('awaiting-atomic-owner-funding');
  const checks=[['request_vault',BigInt(V)],['request_nonce',t.nonce],['request_expiry',expiry],['request_budget',model.controllerBudget]];
  const amounts=[['request_input',t.input.amount],['request_mid',model.plan.steps[0].output],['request_final',t.output.amount]];
  const [values,wide,key,seedLimbs]=await readTogether([
   readTogether(checks.map(([name])=>at(U,name))),readTogether(amounts.map(([name])=>pair(U,name))),
   readTogether([0,1,2,3].map(i=>at(U,'request_key',i))),
   readTogether([0,1].map(j=>s.slot(U,Number(model.assetB),33554453+4*V+j)))
  ]);
  checks.forEach(([name,value],i)=>assert.equal(values[i],value,'owner request '+name));
  amounts.forEach(([name,value],i)=>assert.equal(wide[i],value,'owner signed amount '+name));
  assert.deepEqual(key,publicKeyFelts(t.execution.publicKeyHash));assert.equal(decodeAmount(seedLimbs),1n,'explicit exact refundable initialization seed');
  // Funding is also allowed after cancellation/expiry, solely to claim the
  // already committed owner's assets and then take the controller refund exit.
  return task('fund');
 }
 const [owner,intentNonce,liveExpiry]=await readTogether([at(V,'owner'),at(V,'intent_nonce'),at(V,'expiry')]);assert.equal(owner,t.owner);assert.equal(intentNonce,t.nonce);assert.equal(liveExpiry,expiry);
 assert.ok([2n,3n,4n,5n,6n,7n,99n].includes(phase),'intermediate/unknown controller phase cannot be resumed');
 const [nativeExpected,nativeBalance]=await readTogether([at(V,'native_expected'),s.slot(V,0,0)]);assert.equal(nativeBalance,nativeExpected,'native controller accounting');
 const balance=async id=>decodeAmount(await readTogether([s.slot(V,Number(id),0),s.slot(V,Number(id),1)]));
 if(phase===99n){assert.equal(nativeBalance,0n);const balances=await readTogether([balance(model.assetA),balance(model.assetB)]);assert.deepEqual(balances,[0n,0n]);return idle('controller-terminal-owner-claim-required',{owner:t.owner,scope:'controller is terminal; ordinary owner must claim its exact FT/native Outbox; local terminal is not final receipt'});}
 if(nativeExpected<F)return idle('fee-budget-insufficient',{automaticTopup:false,who:'owner-authorized recovery only; no implicit spend'});
 if([2n,4n,6n,7n].includes(phase)){
  if(phase===6n)return task('return-final',{amount:await pair(V,'final_amount'),nativeRefund:nativeExpected-F});
  if(phase===7n){const asset=await at(V,'return_asset');assert.ok(asset===model.assetA||asset===model.assetB);return task(asset===model.assetA?'return-input':'return-middle',{amount:await pair(V,'return_amount'),nativeRefund:nativeExpected-F});}
  const hop=phase===2n?1:2,amount=hop===1?t.input.amount:await pair(V,'middle');
  if(stopped)return task(hop===1?'return-input':'return-middle',{amount,nativeRefund:nativeExpected-F});
  const m=model.plan.steps[hop-1],abi=model.marketAbis[hop-1],nonceField=abi.contract.state.find(f=>f.name==='nonce');assert.ok(nonceField);
  const nonce=await s.slot(V,Number(m.marketId),nonceField.offset);assert.equal(nonce,0n,'fresh dedicated market order account');
  return task('open-'+hop,{amount,minimum:hop===1?model.funding.midMinimum:t.output.amount,deadline:expiry,orderNonce:nonce+1n});
 }
 const hop=phase===3n?1:2,m=model.plan.steps[hop-1],M=Number(m.marketId),P=Number(m.vaultId),abi=model.marketAbis[hop-1],offset=new Map(abi.contract.state.map(f=>[f.name,f.offset]));
 const market=(user,name,i=0)=>{assert.ok(offset.has(name),'market ABI field '+name);return s.slot(user,M,offset.get(name)+i);};
 const pending=async asset=>{const sent=decodeAmount(await readTogether([s.slot(P,Number(asset),33554453+4*V),s.slot(P,Number(asset),33554454+4*V)])),claimed=decodeAmount(await readTogether([s.slot(V,Number(asset),33554455+4*P),s.slot(V,Number(asset),33554456+4*P)]));assert.ok(sent>=claimed);return sent-claimed;};
 const input=hop===1?model.assetA:model.assetB,output=hop===1?model.assetB:model.assetA,principal=hop===1?t.input.amount:await pair(V,'middle'),orderNonce=await at(V,'order_nonce'),consumed=await market(P,'consumed',V),kind=await market(V,'kind');
 const [outputPending,inputPending,nativeSent,nativeClaimed]=await readTogether([pending(output),pending(input),s.slot(P,0,3+2*V),s.slot(V,0,4+2*P)]),nativePending=nativeSent-nativeClaimed;assert.ok(nativePending>=0n);
 if(consumed===orderNonce&&kind!==0n){
  if(outputPending>0n){assert.equal(inputPending,0n);assert.equal(nativePending,0n);return task('success-'+hop,{amount:outputPending});}
  if(inputPending===principal&&nativePending===F)return task('refund-'+hop,{amount:principal});
  return idle('market-terminal-awaiting-exact-claimable-assets');
 }
 if(kind===0n&&await at(V,'recovery_sent')===1n){if(inputPending===principal&&nativePending===F)return task('recovered-'+hop,{amount:principal});return idle('awaiting-market-sender-bound-recovery');}
 assert.equal(kind,1n);assert.equal(await market(V,'pool'),BigInt(P));assert.equal(await market(V,'nonce'),orderNonce);assert.equal(await market(V,'side'),BigInt(hop-1));
 if(stopped){
  if(await at(V,'cancel_sent')===0n)return task('cancel-'+hop);
  const [q,epoch,consentEpoch,consentNonce]=await readTogether([market(P,'queue_phase'),market(P,'queue_epoch'),market(V,'admission_epoch'),market(V,'admission_nonce')]);
  // An absence from an open queue is NOT permission to unlock consent. The
  // base contract locks immediately until a monotonically terminal/new epoch.
  if(consentNonce!==orderNonce||consentEpoch===0n||epoch>consentEpoch||(epoch===consentEpoch&&q===3n))return task('recover-'+hop);
  return idle('accepted-order-awaiting-market-terminal',{marketId:m.marketId,vaultId:m.vaultId});
 }
 const [q,epoch,cutoff]=await readTogether([market(P,'queue_phase'),market(P,'queue_epoch'),market(P,'queue_cutoff')]);
 if(await at(V,'consent_sent')===0n&&q===1n&&cutoff>checkpoint&&cutoff<=checkpoint+128n&&cutoff<=expiry)return task('consent-'+hop,{epoch,cutoff});
 return idle('awaiting-base-market-executor',{marketId:m.marketId,vaultId:m.vaultId,exit:'owner cancellation or intent expiry; never renew accepted set implicitly'});
}
