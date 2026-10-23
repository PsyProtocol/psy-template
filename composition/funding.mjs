// Independent, reviewable owner funding boundary. It creates ordinary wallet
// calls only; it neither signs, deploys nor submits. Chain authorization is the
// request_route + bind_funding bytecode and dedicated key, not this SHA digest.
import assert from 'node:assert/strict';
import {createIntent,validatePlan,commitment} from './intent.mjs';
import {fundsPolicy} from './contract/policy.mjs';
import {encodeAmount} from '../amm/u124/client.mjs';
const F=1000100000n,P=18446744069414584321n;
const SDK='0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425';
export function publicKeyFelts(hash){
 assert.match(hash,/^[0-9a-f]{64}$/);const words=Array.from({length:4},(_,i)=>BigInt('0x'+hash.slice(i*16,i*16+16))).reverse();
 assert.ok(words.every(n=>n<P),'noncanonical Goldilocks key');return words;
}
function call(id,abi,name,inputs){const m=abi.contract.methods.find(m=>m.name===name);assert.ok(m,'compiled method '+name);assert.equal(inputs.length,m.input_felt_count);return{contract_id:id,method_name:name,method_id:BigInt(m.method_id),inputs};}
export function ownerFunding({intent,plan,policy,controllerAbi,tokenAbi,nativeAbi,marketAbis,networkMagic,controllerBudget,ownerFeeReserve}){
 const i=createIntent(intent.terms);assert.equal(i.id,intent.id);validatePlan(i,plan);const t=i.terms;
 assert.equal(networkMagic,1384803358401154921n,'only the validated isolated proof domain is supported');
 assert.equal(t.sdkManifestHash,SDK,'frozen SDK only; migration is a separate task');
 assert.equal(t.nonce,1n,'one-shot execution account requires nonce 1');
 assert.equal(t.input.id,t.output.id,'current funded profile is A -> B -> A');
 assert.deepEqual(plan.steps.map(s=>s.side),[0,1],'fixed route sides');
 const [first,second]=plan.steps,registry=plan.registry.value;
 assert.equal(first.inputAsset,t.input.id);assert.equal(second.outputAsset,t.input.id);assert.equal(first.outputAsset,second.inputAsset);
 const markets=t.markets.map(id=>{const m=registry.markets.find(m=>m.marketId===id);assert.ok(m);return m;});
 assert.deepEqual(markets[0].assets,markets[1].assets,'same ordered asset pair on distinct pools');
 assert.deepEqual(markets.map(m=>m.assets[0]),[{id:t.input.id,decimals:t.input.decimals},{id:t.input.id,decimals:t.input.decimals}]);
 assert.ok(typeof controllerBudget==='bigint'&&controllerBudget>=20n*F&&controllerBudget<=64n*F);
 assert.ok(typeof ownerFeeReserve==='bigint'&&ownerFeeReserve>=6n*F,'reserve three ordinary UPSs at the reviewed 2F ceiling');
 assert.ok(controllerBudget+ownerFeeReserve<=t.maxNativeFees,'total owner spend ceiling');
 assert.ok(Array.isArray(marketAbis)&&marketAbis.length===2);
 const expected=fundsPolicy({controllerId:Number(t.execution.controllerId),controllerAbi,assetA:Number(first.inputAsset),assetB:Number(first.outputAsset),tokenAbi,nativeAbi,markets:markets.map((m,j)=>({id:Number(m.marketId),vault:Number(m.vaultId),abi:marketAbis[j]})),registryHash:plan.registryHash});
 assert.deepEqual(policy,expected,'policy differs from complete reviewed route');
 const key=publicKeyFelts(t.execution.publicKeyHash),args=[t.execution.vaultId,t.nonce,...encodeAmount(t.input.amount),...encodeAmount(first.output),...encodeAmount(t.output.amount),t.expiresAtCheckpoint,controllerBudget,...key];
 const calls=[call(t.execution.controllerId,controllerAbi,'request_route',args),call(0n,nativeAbi,'simple_transfer',[t.execution.vaultId,controllerBudget]),call(t.input.id,tokenAbi,'transfer',[t.execution.vaultId,...encodeAmount(t.input.amount)]),call(t.execution.controllerId,controllerAbi,'bind_funding',[t.nonce])];
 const authorization={schema:1,profile:'two-amm-owner-funded-v1',intentId:i.id,registryHash:plan.registryHash,networkMagic,owner:t.owner,execution:t.execution,controllerBudget,ownerFeeReserve,maximumOwnerSpend:t.maxNativeFees,midMinimum:first.output,finalMinimum:t.output.amount,calls,atomicScope:'one owner UPS: request, both funding transfers and funding binding',workflowAtomic:false,servicePayerFees:'external market sponsors; reported separately, never debited by this owner authorization',chainIntentIdentity:'controller Poseidon commitment over network/controller/owner/nonce/version, exact terms, execution key and compiled registry hash',sourceAuthenticated:false,requires:'fresh full UPS and frozen code/layout/key/network checks before any broadcast'};
 return{...authorization,reviewHash:commitment('psy-composition-owner-funding-v1',authorization)};
}
export function validateOwnerFunding(authorization,inputs){assert.deepEqual(authorization,ownerFunding(inputs),'funding review changed');return authorization;}
